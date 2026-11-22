// A pick made on a page: the film flow's own pick writes for that kind, the taste.md row, the library entry,
// then one line into the film's thread so Alma carries on.
// What each kind writes, and where the convention comes from:
//   face      cast/<CID>-<name>/pick-face.png, a byte copy of the candidate (Flow v3 - 2 step 46; on disk in every film)
//   wardrobe  cast/<CID>-<name>/pick-wardrobe.png (for example C03, C04)
//   sheet     cast/<CID>-<name>/pick.png (Flow v3 - 2 step 46; a later version pick-v2.png, as on an older film)
//   voice     tools/voices/pick.py <CID> <N> --note '…': voices/cast.json and options.json "chosen" (Flow v3 - 3 step 5)
//   location  locations/<LID>-<name>/<LID>-<name>-pick-<candidate>.png (for example L01, pick-w1 and pick-u5b-2)
//   prop      props/<PID>-<name>/pick.png (for example P01, P02)
//   take      nothing in the film folder: the taste row and the message only
//   sfx       tools/sound/sfx.py "$FILM" <sound> --pick N --note '…' [--predicted M], when the studio has it: the sound's
//             pick.json and prompts.json "picked", and the taste.md row with the tries not picked (Flow v3.3 - 11 step
//             34); without it the message asks Alma to record them. "none" runs nothing: Alma makes more tries.
//             The target is the sound's folder name under audio/sfx/; `card` is the pick card it was made on.
// A file that is already there is never overwritten: the new pick takes the next version (pick-face-v2.png).
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defuse, defuseFields } from '../../lib/defuse';
import { childEnv } from '../childEnv';
import { claudeConfig } from '../claude/config';
import { pythonBin } from '../config';
import { natCmp, titleCase } from '../films/util';
import { pokeFilm } from '../films/watcher';
import { getEntry, saveEntry, type LibraryKind, type SaveResult } from '../library/store';
import { candidateIdOf, characterDraft, faceDraft, findCandidate, idFolder, locationDraft, roundFolders, voiceDraft, type FilmInfo } from '../library/sources';
import { filmTarget, type FilmTarget } from './film';
import { appendTasteRow, candidatesCell, pickedWhere, type TasteRow } from './taste';
import { isFile, nextVersion, Writer, type WriteRecord } from './writes';
import { sfxPickArgs, soundAnswerKey } from '../films/read/sfx';

export type PickKind = 'face' | 'wardrobe' | 'sheet' | 'voice' | 'location' | 'prop' | 'take' | 'sfx';
export const PICK_KINDS: PickKind[] = ['face', 'wardrobe', 'sheet', 'voice', 'location', 'prop', 'take', 'sfx'];

export interface PickInput {
  kind: PickKind;
  target: string;              // "C01", "L01", "P01", "S2"
  round?: string;              // "r2" (matches the round folder r2-faces)
  candidate?: string;          // "r2-7", "W2", "3" or "r1-3" (voice option), "u5b-2", "take2"
  prediction?: string;
  note?: string;               // the user's words, when they typed some
  source?: 'round' | 'library';
  libraryId?: string;
  libraryKind?: LibraryKind;
  from?: string;               // where the pick was made: "the gate page", "the Character page"
  card?: string;               // sfx: the key of the pick card it was made on
}

export interface PickOptions {
  dryRun?: boolean;            // plan only: nothing written, nothing run, nothing sent
  notify?: boolean;            // send the system line to Alma (default true)
  repo?: string;               // the film repo (tests point it at a copy)
}

export interface PickResult {
  ok: true;
  dryRun: boolean;
  film: string;
  kind: PickKind;
  target: string;
  candidate: string;
  writes: WriteRecord[];
  tasteRow: string;
  library?: { id: string; kind: LibraryKind; created: boolean };
  message: string;
  notified: boolean;
  script?: { cmd: string; out: string };
}

export class PickError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);
const day = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
const IMG = /\.(png|jpe?g|webp)$/i;

async function roundIds(roundDir: string, id: string): Promise<string[]> {
  return (await fs.readdir(roundDir).catch(() => [] as string[])).filter((n) => IMG.test(n)).map((n) => candidateIdOf(n, id)).sort(natCmp);
}

async function charName(film: FilmTarget, cid: string, slug: string): Promise<string> {
  try {
    const c = JSON.parse(await fs.readFile(path.join(film.dir, 'voices', 'cast.json'), 'utf8')) as Record<string, { name?: string }>;
    if (c[cid]?.name) return c[cid].name!;
  } catch { /* no cast.json yet */ }
  return titleCase(slug);
}

/** The candidate's one-line description from its round's prompts.json ("what", or "looks" for wardrobe), for the taste row. */
async function candidateNote(roundDir: string, cand: string): Promise<string | undefined> {
  try {
    const pj = JSON.parse(await fs.readFile(path.join(roundDir, 'prompts.json'), 'utf8')) as { candidates?: { id?: string; what?: string }[]; looks?: Record<string, string> };
    const hit = pj.candidates?.find((c) => c.id?.replace(/^\S+\s+/, '') === cand)?.what ?? pj.looks?.[cand];
    return hit ? hit.replace(/\s*\([^)]*pick\)\s*$/i, '').slice(0, 160) : undefined;
  } catch {
    return undefined;
  }
}

/** The next round folder number of a character or a location: "r8-library" after r7-alt-face. */
async function nextRound(dir: string): Promise<number> {
  let n = 0;
  for (const r of await roundFolders(dir)) n = Math.max(n, Number(/^r(\d+)/.exec(r)?.[1] ?? 0));
  return n + 1;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env, cwd, timeout: 90_000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, out: `${stdout}${stderr ? `\n${stderr}` : ''}`.trim().slice(0, 2000) });
    });
  });
}

/** pick.py rewrites voices/cast.json and options.json itself (the flow's convention); the harness keeps a copy first. */
async function backupVoiceFiles(film: FilmTarget, w: Writer): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(claudeConfig().harnessDir, 'backups', `${stamp}-${film.slug}`, 'voices');
  for (const n of ['cast.json', 'options.json']) {
    const src = path.join(film.dir, 'voices', n);
    if (await isFile(src)) await w.copyNew(src, path.join(dest, n), 'kept before pick.py rewrites it');
  }
}

async function runVoicePick(film: FilmTarget, w: Writer, args: string[]): Promise<{ cmd: string; out: string }> {
  const script = path.join(film.repo, 'tools', 'voices', 'pick.py');
  const py = pythonBin();
  const shown = `FILM=${film.show(film.dir)} ${py === path.join(/*turbopackIgnore: true*/ film.repo, '.venv', 'bin', 'python') ? '.venv/bin/python' : py} tools/voices/pick.py ${args.map((a) => (/[\s'"]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a)).join(' ')}`;
  if (!(await isFile(script))) throw new PickError(`tools/voices/pick.py not found in ${film.repo}`, 500);
  await backupVoiceFiles(film, w);
  await w.ran(shown, film.show(path.join(film.dir, 'voices', 'cast.json')), 'pick.py writes cast.json and options.json "chosen"');
  if (w.dryRun) return { cmd: shown, out: '(dry run: not run)' };
  const env = childEnv({ FILM: film.dir, PYTHONDONTWRITEBYTECODE: '1' });
  const r = await run(py, [script, ...args], env, film.repo);
  if (r.code !== 0) throw new PickError(`pick.py failed (exit ${r.code}): ${r.out.split('\n').slice(-3).join(' · ')}`, 502);
  return { cmd: shown, out: r.out };
}

/** Copies a library file into the film as a candidate of a new round "r<n>-library", with source.json beside it,
 *  so the page's readers see it like any candidate and the pick file copies it byte for byte. */
async function libraryRoundCopy(dir: string, id: string, files: { abs: string; role: string }[], entry: { id: string; film: string; name: string }, w: Writer): Promise<{ round: string; candidates: Map<string, string> }> {
  const round = `r${await nextRound(dir)}-library`;
  const rdir = path.join(dir, round);
  const out = new Map<string, string>();
  let k = 0;
  for (const f of files) {
    k += 1;
    const to = path.join(rdir, `${id}-library-${k}${path.extname(f.abs).toLowerCase()}`);
    await w.copyNew(f.abs, to, `${f.role} from the library entry ${entry.id}`);
    out.set(f.role, to);
  }
  await w.writeNew(path.join(rdir, 'source.json'), JSON.stringify({
    from: 'library', library_id: entry.id, film: entry.film, name: entry.name, date: today(),
    files: [...out].map(([role, p]) => ({ role, file: path.basename(p), source: files.find((f) => f.role === role)?.abs })),
  }, null, 1) + '\n');
  return { round, candidates: out };
}

/** Does the pick. Throws PickError with an HTTP status for anything the request got wrong. */
export async function makePick(raw: PickInput, film: string, opts: PickOptions = {}): Promise<PickResult> {
  const input = defuseFields(raw); // the user's words, the page name and the candidate reach Alma: a typed <harness-action> is defused
  const kind = input.kind;
  if (!PICK_KINDS.includes(kind)) throw new PickError(`kind must be one of ${PICK_KINDS.join(', ')}`);
  const target = (input.target ?? '').trim();
  if (kind === 'sfx') return pickSound(input, film, opts);
  if (!/^[A-Z]\d+[a-z]?(?:-[A-Z]\d+[a-z]?)*$/.test(target)) throw new PickError('target must be an ID such as C01, L01, P01 or S2');
  const ft = await filmTarget(film, opts.repo);
  if (!ft) throw new PickError(`no film folder assets/films/${film}`, 404);
  const fromLibrary = input.source === 'library';
  if (!fromLibrary && !input.candidate) throw new PickError('candidate is missing');
  const w = new Writer(`pick ${kind} ${target} ${fromLibrary ? `library:${input.libraryId}` : input.candidate}`, ft.show, !!opts.dryRun);
  const info: FilmInfo = { slug: ft.slug, title: ft.title, dir: ft.dir };
  const date = today();
  const where = defuse(input.from ?? 'the gate page');
  let candidate = input.candidate ?? '';
  let choice = target;
  let candidatesText = '–';
  let pickNote: string | undefined;
  let lib: SaveResult | undefined;
  let script: { cmd: string; out: string } | undefined;
  const wrote: string[] = [];
  const next: string[] = [];

  const libEntry = fromLibrary ? await getEntry(input.libraryKind ?? (kind === 'voice' ? 'voice' : kind === 'location' ? 'location' : kind === 'sheet' ? 'character' : 'face'), input.libraryId ?? '') : undefined;
  if (fromLibrary && !libEntry) throw new PickError(`no library entry ${input.libraryId ?? '(none given)'}`, 404);

  if (kind === 'face' || kind === 'wardrobe' || kind === 'sheet') {
    const folder = await idFolder(info, 'cast', target);
    if (!folder) throw new PickError(`no cast/${target}-… folder`, 404);
    const name = await charName(ft, target, folder.slug);
    choice = `${target} ${name} ${kind}`;
    const base = kind === 'face' ? 'pick-face' : kind === 'wardrobe' ? 'pick-wardrobe' : 'pick';
    let src: string;
    let round: string;
    if (libEntry) {
      const roleWanted = kind === 'face' ? 'face' : kind === 'wardrobe' ? 'wardrobe' : 'sheet';
      const files = libEntry.meta.files.filter((f) => f.role === roleWanted || (libEntry.meta.kind === 'character' && ['face', 'wardrobe', 'sheet', 'element', 'element line'].includes(f.role)));
      if (!files.some((f) => f.role === roleWanted)) throw new PickError(`library entry ${libEntry.meta.id} has no ${roleWanted}`, 409);
      const copied = await libraryRoundCopy(folder.dir, target, files.map((f) => ({ abs: path.join(libEntry.dir, f.file), role: f.role })), { id: libEntry.meta.id, film: libEntry.meta.film.title, name: libEntry.meta.name }, w);
      round = copied.round;
      src = copied.candidates.get(roleWanted)!;
      candidate = candidateIdOf(path.basename(src), target);
      candidatesText = `from the library: ${libEntry.meta.name}, ${libEntry.meta.film.title}${libEntry.meta.candidate ? ` ${libEntry.meta.candidate}` : ''}`;
      if (libEntry.meta.kind === 'character') {
        // a whole character: the face and the sheet both come in; the sheet check is the next step (flow-fixes 22)
        for (const role of ['face', 'wardrobe', 'sheet'] as const) {
          const p = copied.candidates.get(role);
          if (!p || role === roleWanted) continue;
          const b = role === 'face' ? 'pick-face' : role === 'wardrobe' ? 'pick-wardrobe' : 'pick';
          const to = await nextVersion(folder.dir, b, path.extname(p).toLowerCase());
          await w.copyNew(p, to, `${role} of the library character ${libEntry.meta.id}`);
          wrote.push(ft.show(to));
        }
        if (copied.candidates.get('element')) next.push(`the library character carries its video element (${ft.show(copied.candidates.get('element')!)}): check it against this film before it goes into elements.json`);
      }
    } else {
      const hit = await findCandidate(folder.dir, target, candidate, input.round);
      if (!hit) throw new PickError(`no candidate ${candidate} in cast/${folder.name}/${input.round ? `${input.round}…` : 'r*'}`, 404);
      src = hit.abs;
      round = hit.round;
      candidatesText = candidatesCell(round, await roundIds(path.dirname(src), target));
      pickNote = await candidateNote(path.dirname(src), candidate);
    }
    const to = await nextVersion(folder.dir, base, path.extname(src).toLowerCase());
    await w.copyNew(src, to, `the ${kind} pick, ${candidate}`);
    wrote.unshift(ft.show(to));
    if (kind === 'face') {
      next.push('clothing and the sheet follow without asking (SPEC principle 7)');
      // the library keeps the candidate's own file (its prompt sits beside it); a face from the library is there already
      const d = libEntry ? undefined : await faceDraft(info, target, src, 'picked', { round, candidate });
      if (d) lib = await saveEntry(d, w);
    } else if (kind === 'wardrobe') {
      next.push('the sheet follows from the face and this look');
    } else {
      next.push('run the sheet checks; the lock and the element follow on the user\'s word');
      const d = w.dryRun ? undefined : await characterDraft(info, target, 'picked');
      if (d) lib = await saveEntry(d, w);
    }
  } else if (kind === 'voice') {
    const folder = await idFolder(info, 'cast', target);
    const name = folder ? await charName(ft, target, folder.slug) : target;
    choice = `${target} ${name} voice`;
    const words = input.note ? `The user, ${day(date)}: "${input.note}"` : `The user, ${day(date)}, picked ${pickedWhere(where)}`;
    if (libEntry) {
      const v = libEntry.meta.voice;
      if (!v?.voiceId || v.voiceIdKind !== 'saved voice') throw new PickError(`library voice ${libEntry.meta.id} is a design preview, not a saved Higgsfield voice: ask Alma to save it first`, 409);
      candidate = `library ${libEntry.meta.name}`;
      candidatesText = `from the library: ${libEntry.meta.name}'s voice, ${libEntry.meta.film.title}`;
      script = await runVoicePick(ft, w, [target, '--voice-id', v.voiceId, '--source', `library: ${libEntry.meta.film.title} ${libEntry.meta.character?.id ?? ''} ${libEntry.meta.name} (${v.source ?? 'saved voice'})`.replace(/\s+/g, ' '), '--note', words]);
      next.push('the voice is reused, so the design round is skipped (flow-fixes 22): speak the sample lines with that Higgsfield voice and cut the element line');
    } else {
      const n = Number(/(\d+)$/.exec(candidate)?.[1]);
      if (!Number.isInteger(n)) throw new PickError('a voice candidate is an option number ("3" or "r1-3")');
      candidate = `option ${n}`;
      try {
        const O = JSON.parse(await fs.readFile(path.join(ft.dir, 'voices', 'options.json'), 'utf8')) as Record<string, { options?: { option: number; round?: string; f0_element_line?: number }[] }>;
        const opts2 = O[target]?.options ?? [];
        const o = opts2.find((x) => x.option === n);
        if (!o) throw new PickError(`voices/options.json has no option ${n} for ${target}`, 404);
        const same = opts2.filter((x) => x.round === o.round).map((x) => `option ${x.option}${x.f0_element_line ? ` (${x.f0_element_line} Hz)` : ''}`);
        candidatesText = `${o.round ?? 'round'}: ${same.join(', ')}`;
      } catch (e) {
        if (e instanceof PickError) throw e;
        throw new PickError('voices/options.json not found or not valid', 404);
      }
      script = await runVoicePick(ft, w, [target, String(n), '--note', words]);
      next.push(`pick.py recorded the pick in voices/cast.json and called no service. Speak no sample lines; make the voice reusable if it is not a preset and cut the element line from the picked preview, as the voices note says (step 5 on); the line asks for no yes of its own: it goes to the user inside the character's one element go card, with the sheet and the face (the show recipe)`);
    }
    wrote.push(ft.show(path.join(ft.dir, 'voices', 'cast.json')), ft.show(path.join(ft.dir, 'voices', 'options.json')));
    if (!libEntry) {
      const d = await voiceDraft(info, target, Number(/(\d+)$/.exec(candidate)?.[1]), 'picked');
      if (d && !w.dryRun) lib = await saveEntry(d, w);
    }
  } else if (kind === 'location') {
    const folder = await idFolder(info, 'locations', target);
    if (!folder) throw new PickError(`no locations/${target}-… folder`, 404);
    const lname = `the ${titleCase(folder.slug)}`;
    let src: string;
    let round: string;
    if (libEntry) {
      const main = libEntry.meta.files.find((f) => ['master', 'pick', 'candidate'].includes(f.role));
      if (!main) throw new PickError(`library entry ${libEntry.meta.id} has no master image`, 409);
      const files = libEntry.meta.files.filter((f) => f === main || f.role === 'view' || f.role === 'plan' || f.role === 'lighting').map((f) => ({ abs: path.join(libEntry.dir, f.file), role: f === main ? 'master' : `${f.role}${f.label ? ` ${f.label}` : ''}` }));
      const copied = await libraryRoundCopy(folder.dir, target, files, { id: libEntry.meta.id, film: libEntry.meta.film.title, name: libEntry.meta.name }, w);
      round = copied.round;
      src = copied.candidates.get('master')!;
      candidate = candidateIdOf(path.basename(src), target);
      candidatesText = `from the library: ${libEntry.meta.name}, ${libEntry.meta.film.title}`;
      next.push('a reused place: the master, its plan and views came in with it; check them against this script before the previz');
    } else {
      const hit = await findCandidate(folder.dir, target, candidate, input.round);
      if (!hit) throw new PickError(`no candidate ${candidate} in locations/${folder.name}/${input.round ? `${input.round}…` : 'r*'}`, 404);
      src = hit.abs;
      round = hit.round;
      candidatesText = candidatesCell(round, await roundIds(path.dirname(src), target));
    }
    choice = `${target} ${lname}, round ${/^r(\w+?)(?:-|$)/.exec(round)?.[1] ?? round}`;
    const to = await nextVersion(folder.dir, `${folder.name}-pick-${candidate}`, path.extname(src).toLowerCase());
    await w.copyNew(src, to, `the location pick, ${candidate}`);
    wrote.unshift(ft.show(to));
    next.push('make the master from the pick (Flow v3 - 4 step 3), then the plan; the previz follows on the picked place');
    const d = libEntry ? undefined : await locationDraft(info, target, 'picked', { candidateAbs: src, candidate, round, name: lname });
    if (d) lib = await saveEntry(d, w);
  } else if (kind === 'prop') {
    const folder = await idFolder(info, 'props', target);
    if (!folder) throw new PickError(`no props/${target}-… folder`, 404);
    choice = `${target} the ${titleCase(folder.slug).toLowerCase()}`;
    const hit = await findCandidate(folder.dir, target, candidate, input.round);
    if (!hit) throw new PickError(`no candidate ${candidate} in props/${folder.name}/`, 404);
    candidatesText = candidatesCell(hit.round, await roundIds(path.dirname(hit.abs), target));
    const to = await nextVersion(folder.dir, 'pick', path.extname(hit.abs).toLowerCase());
    await w.copyNew(hit.abs, to, `the prop pick, ${candidate}`);
    wrote.unshift(ft.show(to));
    next.push('put the prop in the previz at its true scale');
  } else {
    choice = `${target} take`;
    candidatesText = input.round ? `${input.round}` : '–';
    next.push('the take is the one for the cut; nothing was written in the film folder');
  }

  // a voice prediction reads like its pick: "r1-3" and "3" are both "option 3"
  const predicted = kind === 'voice' && input.prediction && /(\d+)$/.test(input.prediction) ? `option ${/(\d+)$/.exec(input.prediction)![1]}` : input.prediction;
  const prediction = predicted?.replace(/^option /, '');
  const pickId = candidate.replace(/^option /, '');
  const row: TasteRow = {
    date, film: ft.title, choice, candidates: candidatesText, pick: candidate, pickNote,
    words: input.note ? `"${input.note}"` : `– (picked ${pickedWhere(where)})`,
    predicted,
    right: prediction !== undefined ? prediction === pickId || prediction === candidate : undefined,
  };
  const taste = await appendTasteRow(ft.repo, row, w);

  const attrs = [
    ['kind', 'pick'], ['what', kind], ['target', target],
    ...(input.round ? [['round', input.round]] : []), ['candidate', candidate],
    ...(input.prediction ? [['prediction', input.prediction]] : []),
    ...(fromLibrary ? [['source', 'library'], ['library-id', input.libraryId ?? '']] : []),
  ].map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
  const whose = kind === 'take' ? `${target}` : `${target}'s ${kind === 'location' ? 'master' : kind}`;
  const message = [
    `<harness-action ${attrs}/> The user picked ${fromLibrary ? `${libEntry!.meta.name} from the library (${libEntry!.meta.film.title})` : defuse(candidate)} for ${whose} on ${where}. Continue the flow from there.`,
    '',
    `The harness already wrote: ${[...wrote, 'the taste.md row', ...(lib ? [`the library entry ${lib.kind}s/${lib.id}`] : [])].join('; ')}.`,
    `Yours: the review card for this pick, the row's "What it says" cell and the score in taste.md${next.length ? `; ${next.join('; ')}` : ''}.`,
  ].join('\n');

  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  // the pages hear of it now, not when the folder watcher sees the files (a pick card stayed on the phone)
  if (!opts.dryRun) pokeFilm(ft.slug);
  return {
    ok: true, dryRun: !!opts.dryRun, film: ft.slug, kind, target, candidate,
    writes: w.records, tasteRow: taste.line,
    ...(lib ? { library: { id: lib.id, kind: lib.kind, created: lib.created } } : {}),
    message, notified, ...(script ? { script } : {}),
  };
}

/** A sound of the sound designer picked on its card (Flow v3.3 - 11 Sound and music, steps 33 and 34): sfx.py
 *  records the pick (pick.json, prompts.json "picked", the taste.md row with the tries not picked); the harness keeps
 *  the answer by the card, so the card stops asking once every sound on it has one. "none": none of these. */
async function pickSound(input: PickInput, film: string, opts: PickOptions): Promise<PickResult> {
  const name = (input.target ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) throw new PickError('target must be the sound\'s folder name under audio/sfx/ ("cheer-toast")');
  const ft = await filmTarget(film, opts.repo);
  if (!ft) throw new PickError(`no film folder assets/films/${film}`, 404);
  const none = input.candidate === 'none';
  const n = Number(/^(?:try\s*)?(\d+)$/i.exec(input.candidate ?? '')?.[1]);
  if (!none && !(Number.isInteger(n) && n > 0)) throw new PickError('candidate must be a try number ("2") or "none"');
  const dir = path.join(ft.dir, 'audio', 'sfx', name);
  let tries: number[] = [];
  try {
    const pj = JSON.parse(await fs.readFile(path.join(dir, 'prompts.json'), 'utf8')) as { tries?: { try?: number }[]; prompts?: unknown[] };
    tries = [...new Set([...(pj.tries ?? []).map((t) => Number(t.try)), ...(pj.prompts ?? []).map((_, i) => i + 1)])].filter((x) => x > 0).sort((a, b) => a - b);
  } catch {
    throw new PickError(`no audio/sfx/${name}/prompts.json`, 404);
  }
  if (!none && !tries.includes(n)) throw new PickError(`${name} has no try ${n} (tries: ${tries.join(', ')})`, 404);
  const predicted = Number(/(\d+)$/.exec(input.prediction ?? '')?.[1]) || undefined;
  const w = new Writer(`pick sfx ${name} ${none ? 'none' : `try ${n}`}`, ft.show, !!opts.dryRun);
  const where = input.from ?? 'the sound pick card';
  let script: { cmd: string; out: string } | undefined;
  let tasteRow = '';
  // the studio's tools/sound/sfx.py records the pick when the studio has it; without it the harness writes nothing in
  // the film folder and Alma records the pick herself
  const tool = path.join(ft.repo, 'tools', 'sound', 'sfx.py');
  const hasTool = !none && (await isFile(tool));
  if (hasTool) {
    const py = pythonBin();
    const args = sfxPickArgs(ft.dir, name, n, input.note, predicted);
    const shown = `${py === path.join(/*turbopackIgnore: true*/ ft.repo, '.venv', 'bin', 'python') ? '.venv/bin/python' : py} tools/sound/sfx.py ${['"$FILM"', ...args.slice(1)].map((a) => (/[\s'"]/.test(a) && a !== '"$FILM"' ? `'${a.replace(/'/g, "'\\''")}'` : a)).join(' ')}`;
    await w.ran(shown, ft.show(path.join(dir, 'pick.json')), 'sfx.py writes pick.json, prompts.json "picked" and the taste.md row');
    if (!w.dryRun) {
      const r = await run(py, [tool, ...args], childEnv({ FILM: ft.dir, PYTHONDONTWRITEBYTECODE: '1' }), ft.repo);
      if (r.code !== 0) throw new PickError(`sfx.py failed (exit ${r.code}): ${r.out.split('\n').slice(-3).join(' · ')}`, 502);
      script = { cmd: shown, out: r.out };
      tasteRow = /taste\.md row added/.test(r.out) ? 'written by sfx.py' : '';
    } else script = { cmd: shown, out: '(dry run: not run)' };
  }
  const at = new Date().toISOString();
  if (input.card && !opts.dryRun) {
    const { saveAnswer } = await import('./answers');
    await saveAnswer(ft.slug, soundAnswerKey(input.card, name), { option: none ? 'none' : String(n), at, note: input.note, kind: 'sfx' });
    await w.wrote('harness/answers.json', `${ft.slug} · ${soundAnswerKey(input.card, name)}`);
  }
  const attrs = [['kind', 'pick'], ['what', 'sfx'], ['target', name], ['candidate', none ? 'none' : String(n)], ...(predicted ? [['prediction', String(predicted)]] : []), ...(input.card ? [['card', input.card]] : [])]
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
  const words = input.note ? ` Their words: "${input.note}".` : '';
  const message = none ? [
    `<harness-action ${attrs}/> The user heard every try of ${name} and took none of them, on ${where}.${words} Continue the flow from there.`,
    '',
    'The harness wrote nothing in the film folder.',
    `Yours: ${input.note ? 'make the next tries from their words' : 'make 3 more tries of it'}, numbered after the last one, then a new pick card for it.`,
  ].join('\n') : [
    `<harness-action ${attrs}/> The user picked try ${n} of ${name}, on ${where}.${words} Continue the flow from there.`,
    '',
    hasTool
      ? `The harness already wrote: ${ft.show(path.join(dir, 'pick.json'))}; prompts.json "picked"; the taste.md row (by sfx.py).`
      : `The harness wrote nothing in the film folder: record the pick yourself (${ft.show(path.join(dir, 'pick.json'))}, "picked" in its prompts.json, the taste.md row with the tries not picked).`,
    'Yours: lay the picked try as its own clip on the effects track at its planned place, level and fades (one drop per scene, once every sound of the scene is answered); the row\'s "What it says" cell and the score in taste.md.',
  ].join('\n');
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  // the pages hear of it now, not when the folder watcher sees the files (a pick card stayed on the phone)
  if (!opts.dryRun) pokeFilm(ft.slug);
  return { ok: true, dryRun: !!opts.dryRun, film: ft.slug, kind: 'sfx', target: name, candidate: none ? 'none' : String(n), writes: w.records, tasteRow, message, notified, ...(script ? { script } : {}) };
}
