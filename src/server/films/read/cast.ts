// cast/<CID>-<name>/ → characters: face and wardrobe rounds, the picks (pick-face.png etc. matched to
// the candidate they copy), the sheet (pick-v*.png), voices (voices/*.json) and the video element.
import type { Candidate, CharacterRef, Pick, Round } from '../../types';
import type { ScriptInfo } from './script';
import type { TastePickX } from './taste';
import {
  abs, asNumber, asRecord, asString, AUDIO_RE, exists, IMAGE_RE, isoDay, list, natCmp, readJson, sameFile, statOf, titleCase,
  readText, type FilmCtx,
} from '../util';

type Kind = 'face' | 'wardrobe' | 'sheet' | 'other';

export interface CharacterExtra {
  sheetRounds: Round[];               // sheet tries and skin passes (the contract has no rounds for the sheet)
  otherRounds: Round[];               // anything else under the character (an emblem, a prop)
  pickFiles: string[];                // pick*.png at the character's root
  elementFiles?: { draft?: string; final?: string };
}
/** The side channel is `more` here: the contract's `extra` already means "an extra (no voice)". */
export type CharacterRefX = CharacterRef & { more: CharacterExtra };

/** A raw Higgsfield id in brackets ("preset voice (b483a172-…)", as tools/voices/hf_candidates.py writes a brief it
 *  was not given): a person reads the words, never the id. */
const UUID_NOTE = /\s*\((?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

const CAST_DIR = /^(C\d+[a-z]?(?:-C\d+[a-z]?)*)-(.+)$/;

function kindOf(roundName: string): Kind {
  const s = roundName.toLowerCase();
  if (/sheet|skin|q7|seedream/.test(s)) return 'sheet';
  if (/wardrobe|cloth|costume|armou?r/.test(s)) return 'wardrobe';
  if (/face|soul|gpt|portrait/.test(s) || /^r\d+[a-z]?$/.test(s)) return 'face';
  return 'other';
}

/** "C01-r1-7.png" → "r1-7"; "C03b-W-A.png" → "W-A"; "F1.png" → "F1". */
function candidateId(file: string, cid: string): string {
  const base = file.replace(/\.[^.]+$/, '');
  return base.startsWith(`${cid}-`) ? base.slice(cid.length + 1) : base;
}

async function readRound(ctx: FilmCtx, rel: string, name: string, cid: string): Promise<Round> {
  const files = await list(abs(ctx, rel));
  const imgs = files.filter((f) => !f.dir && IMAGE_RE.test(f.name));
  const candidates: Candidate[] = imgs.map((f) => ({ id: candidateId(f.name, cid), path: `${rel}/${f.name}` }));
  let date: string | undefined;
  const pj = asRecord(await readJson(ctx, `${rel}/prompts.json`));
  if (pj) {
    date = asString(pj.date) ?? asString(asRecord(pj.cost)?.quoted);
    const notes = new Map<string, string>();
    const listed: string[] = [];
    if (Array.isArray(pj.candidates))
      for (const c of pj.candidates) {
        const r = asRecord(c);
        const id = asString(r?.id)?.replace(/^C\d+[a-z]?(?:-C\d+)?\s+/, '');
        if (!id) continue;
        listed.push(id);
        const what = asString(r?.what);
        if (what) notes.set(id, what);
      }
    const looks = asRecord(pj.looks);
    if (looks) for (const [k, v] of Object.entries(looks)) if (typeof v === 'string') notes.set(k, v);
    // a file may carry the character's name between the ID and the round ("C03-scirpalus-r1-1.png" for "C03 r1-1"):
    // it is that listed candidate, not a second one still to land (11 Nov: such a round read as running for ever)
    const same = (fileId: string, listedId: string) => fileId === listedId || fileId.endsWith(`-${listedId}`);
    for (const c of candidates) {
      const n = notes.get(c.id) ?? notes.get(c.id.replace(/^.*?-(?=W\d)/, '')) ?? [...notes].find(([k]) => same(c.id, k))?.[1];
      if (n) c.note = n;
    }
    for (const id of listed)
      if (!candidates.some((c) => same(c.id, id))) candidates.push({ id, note: `no image${notes.get(id) ? ` · ${notes.get(id)}` : ''}` });
  }
  if (!date && imgs.length) {
    const st = await statOf(abs(ctx, `${rel}/${imgs[0].name}`));
    if (st) date = isoDay(st.mtime);
  }
  candidates.sort((a, b) => natCmp(a.id, b.id));
  return { id: name, date, candidates };
}

/** Which candidate a pick file copies: same bytes, newest round first. */
async function matchPick(ctx: FilmCtx, pickRel: string, rounds: Round[]): Promise<string | undefined> {
  const size = (await statOf(abs(ctx, pickRel)))?.size;
  if (size === undefined) return undefined;
  for (const r of [...rounds].reverse())
    for (const c of r.candidates)
      if (c.path && (await sameFile(abs(ctx, pickRel), abs(ctx, c.path), size))) return c.id;
  return undefined;
}

const tasteKind = (what: string): Kind | 'voice' | undefined => {
  const s = what.toLowerCase();
  if (/voice|element line/.test(s)) return 'voice';
  if (/sheet|skin|backdrop|lock/.test(s)) return 'sheet';
  if (/wardrobe|armou?r|cloak/.test(s)) return 'wardrobe';
  if (/face/.test(s)) return 'face';
  return undefined;
};

/** Candidate ids named in a taste cell ("**r1-7**: stern…", "W2, then W1", "option 3"). */
function idsIn(text: string | undefined, known: Set<string>): string[] {
  if (!text) return [];
  const out: string[] = [];
  // the cell's own first word, when it is a candidate: a voice option is a bare number ("**3**: 3 · 95 Hz, slow and
  // dark"), which the patterns below do not take, so the pick went unread
  const lead = /^\s*\**\s*([\w-]+)\s*\**\s*(?:[:·,(]|$)/.exec(text)?.[1];
  if (lead && known.has(lead)) out.push(lead);
  for (const m of text.matchAll(/\b(r\d+[a-z]?-\d+|W-?[A-Z0-9]+|option \d+|[A-Z]\d+)\b/g)) {
    const id = m[1].replace(/^option /, '');
    if (known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Applies the taste rows of one kind to rounds: predictions onto rounds, the latest named pick as the pick. */
function applyTaste(rounds: Round[], rows: TastePickX[], filePick?: string): Pick | undefined {
  const known = new Set(rounds.flatMap((r) => r.candidates.map((c) => c.id)));
  let pick: Pick | undefined;
  for (const row of rows) {
    const predicted = idsIn(row.prediction, known)[0];
    if (predicted) {
      const r = rounds.find((x) => x.candidates.some((c) => c.id === predicted));
      if (r && !r.prediction) r.prediction = predicted;
    }
    const picked = idsIn(row.pick, known)[0];
    if (picked) pick = { candidateId: picked, date: row.date || undefined, words: row.words?.replace(/^"|"$/g, ''), predictionRight: row.right };
  }
  if (filePick && (!pick || pick.candidateId !== filePick)) return { candidateId: filePick, ...(pick?.candidateId === filePick ? pick : {}) };
  return pick;
}

interface VoiceFiles {
  options?: Record<string, unknown>;
  cast?: Record<string, unknown>;
  lines?: unknown;
}

function voiceFor(ctx: FilmCtx, cid: string, vf: VoiceFiles, rows: TastePickX[], present: Set<string>, hasVoiceDir: boolean): CharacterRef['voice'] {
  // "C03b" may share "C03"'s voice files, but only when it has a voice of its own (a voice/ folder or an element line)
  const own = hasVoiceDir || !!lineFor(vf.lines, cid);
  const keys = own ? [cid, cid.replace(/[a-z]$/, '')] : [cid];
  const keyIn = (rec: unknown): string | undefined => keys.find((k) => (Array.isArray(rec) ? lineFor(rec, k) : asRecord(rec)?.[k]));
  const oKey = keyIn(vf.options);
  const cKey = keyIn(vf.cast);
  const lKey = keyIn(vf.lines);
  if (!oKey && !cKey && !lKey) return undefined;
  const key = oKey ?? cKey ?? lKey!;
  const o = asRecord(oKey ? vf.options?.[oKey] : undefined);
  const rounds: Round[] = [];
  const opts = Array.isArray(o?.options) ? o!.options : [];
  opts.forEach((raw, i) => {
    const r = asRecord(raw);
    if (!r) return;
    const rn = r.round;
    const rid = typeof rn === 'number' ? `r${rn}` : asString(rn) ?? 'r1';
    let round = rounds.find((x) => x.id === rid);
    if (!round) rounds.push((round = { id: rid, candidates: [] }));
    const file = asString(r.file);
    if (file && !present.has(file)) ctx.warn.add('voices/options.json', `${key} option ${asNumber(r.option) ?? i + 1}: ${file} not found`);
    round.candidates.push({
      id: String(asNumber(r.option) ?? asNumber(r.n) ?? i + 1),
      path: file && present.has(file) ? file : undefined,
      hz: asNumber(r.f0),
      seconds: asNumber(r.seconds),
      note: (asString(r.brief) ?? asString(r.round))?.replace(UUID_NOTE, '') || undefined,
    });
  });
  const known = new Set(rounds.flatMap((r) => r.candidates.map((c) => c.id)));
  const el = asRecord(lKey ? lineFor(vf.lines, lKey) : undefined);
  const chosen = asRecord(o?.chosen);
  const castRow = asRecord(cKey ? vf.cast?.[cKey] : undefined);
  const castPreview = asString(castRow?.preview) ?? asString(chosen?.file);
  const foreign = !!castPreview && !opts.some((x) => asString(asRecord(x)?.file) === castPreview);
  let filePick = chosen ? String(asNumber(chosen.option) ?? '') : '';
  if (!filePick && castRow && !foreign) filePick = /option (\d+)/.exec(asString(castRow.source) ?? '')?.[1] ?? '';
  if (!filePick && el && asNumber(el.option) !== undefined) filePick = String(asNumber(el.option));
  // Since Flow v3.3 a pick has no voice id: the picked preview file is the voice (3 step 5). A preview that is not one of
  // this character's options (another character's, a library voice's) is shown as a round of its own, before the design
  // rounds so the newest round stays last, and is the pick.
  if (!filePick && foreign) {
    if (!present.has(castPreview!)) ctx.warn.add('voices/cast.json', `${key} preview: ${castPreview} not found`);
    rounds.unshift({ id: 'picked', candidates: [{ id: 'preview', path: present.has(castPreview!) ? castPreview : undefined, note: asString(castRow?.source) }] });
    filePick = 'preview';
    known.add(filePick);
  }
  let pick = applyTaste(rounds, rows, known.has(filePick) ? filePick : undefined);
  if (!pick && filePick) pick = { candidateId: filePick };
  if (pick && !pick.words) pick.words = asString(chosen?.note) ?? asString(castRow?.note);
  const elFile = asString(el?.file);
  const elementLine = elFile ? { path: elFile, seconds: asNumber(el?.seconds), hz: asNumber(el?.f0) } : undefined;
  return { rounds, pick, elementLine };
}

/** A library entry's meta.json, as far as the cast needs it: the film it came from, the element line's file and its
 *  measures, the video element's file (src/server/library/store.ts writes it). */
export function libraryMeta(raw: unknown): { title?: string; slug?: string; entry?: string; line?: string; seconds?: number; hz?: number; element?: string } | undefined {
  const m = asRecord(raw);
  if (!m) return undefined;
  const film = asRecord(m.film);
  const v = asRecord(m.voice);
  const files = Array.isArray(m.files) ? m.files.map(asRecord).filter((x): x is Record<string, unknown> => !!x) : [];
  const file = (role: string) => asString(files.find((f) => asString(f.role) === role)?.file);
  return { title: asString(film?.title), slug: asString(film?.slug), entry: asString(m.id), line: file('element line'), seconds: asNumber(v?.seconds), hz: asNumber(v?.hz), element: file('element') };
}

function lineFor(lines: unknown, cid: string): unknown {
  if (Array.isArray(lines)) return lines.find((l) => asRecord(l)?.character === cid);
  return asRecord(lines)?.[cid];
}

/** Every file path the voice JSON names that exists, checked once. */
async function presentFiles(ctx: FilmCtx, vf: VoiceFiles): Promise<Set<string>> {
  const names = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string' && AUDIO_RE.test(v) && !v.includes('://')) names.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(vf.options);
  walk(vf.cast);
  walk(vf.lines);
  const out = new Set<string>();
  await Promise.all([...names].map(async (n) => (await exists(abs(ctx, n))) && out.add(n)));
  return out;
}

/** The keys a character's element can be filed under: its own ID, then its looks' (C04a, C04b: one character in two
 *  looks keeps an element per look, ASKS 46), the first look first. Folders and elements.json use the same keys. */
export function elementKeys(cid: string, keys: string[]): string[] {
  const look = new RegExp(`^${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]$`);
  return [cid, ...[...new Set(keys.filter((k) => look.test(k)))].sort()];
}

async function elementFor(ctx: FilmCtx, cid: string, dirName: string, elements: Record<string, unknown> | undefined): Promise<{ element: CharacterRef['element']; files: CharacterExtra['elementFiles'] }> {
  const dirs = (await list(abs(ctx, 'elements'))).filter((e) => e.dir);
  const keys = elementKeys(cid, [...Object.keys(elements ?? {}), ...dirs.map((d) => d.name.split('-')[0])]);
  let final: string | undefined;
  let draft: string | undefined;
  // the record first: elements.json's video_element of the character, else of its first look that has a file
  for (const k of keys) {
    const fromJson = asRecord(asRecord(elements?.[k])?.video_element);
    // an empty string is a field left blank ("final_file": "" on a film with no 1080p): no file, not a file named ""
    let f = asString(fromJson?.final_file) || undefined;
    let d = asString(fromJson?.draft_file) || undefined;
    if (f && !(await exists(abs(ctx, f)))) f = undefined;
    if (d && !(await exists(abs(ctx, d)))) d = undefined;
    if (f || d) { final = f; draft = d; break; }
  }
  if (!final && !draft) {
    for (const k of keys) {
      const root = dirs.find((e) => e.name === k || (k === cid && e.name === dirName) || e.name.startsWith(`${k}-`));
      if (!root) continue;
      const found: string[] = [];
      const walk = async (rel: string, depth: number): Promise<void> => {
        for (const e of await list(abs(ctx, rel))) {
          if (e.dir && depth < 3) await walk(`${rel}/${e.name}`, depth + 1);
          else if (/\.mp4$/i.test(e.name)) found.push(`${rel}/${e.name}`);
        }
      };
      await walk(`elements/${root.name}`, 0);
      const clean = found.filter((f) => !/first3s|muted|cleanline/i.test(f)).sort(natCmp);
      final = clean.filter((f) => /1080p/.test(f)).pop();
      draft = clean.filter((f) => /480p/.test(f)).pop();
      if (final || draft) break;
    }
  }
  const state = final ? 'final' : draft ? 'draft' : 'none';
  return { element: { path: final ?? draft, state }, files: final || draft ? { draft, final } : undefined };
}

export async function readCharacters(ctx: FilmCtx, script: ScriptInfo | undefined, taste: TastePickX[], delivered: boolean): Promise<CharacterRefX[]> {
  const castDirs = (await list(abs(ctx, 'cast'))).filter((e) => e.dir && CAST_DIR.test(e.name));
  if (!castDirs.length) return [];
  const vf: VoiceFiles = {
    options: asRecord(await readJson(ctx, 'voices/options.json')),
    cast: asRecord(await readJson(ctx, 'voices/cast.json')),
    lines: await readJson(ctx, 'voices/element-lines-5s.json'),
  };
  const present = await presentFiles(ctx, vf);
  // elements.json is keyed by ID, at the top or under "elements" (the flow's template since Film Flow v3.1)
  const elementsFile = asRecord(await readJson(ctx, 'elements.json'));
  const elementsJson = asRecord(elementsFile?.elements) ?? elementsFile;
  const briefMd = (await readText(abs(ctx, 'brief.md'))) ?? '';
  const out: CharacterRefX[] = [];

  for (const d of castDirs) {
    const [, cid, slug] = CAST_DIR.exec(d.name)!;
    const folder = `cast/${d.name}`;
    const entries = await list(abs(ctx, folder));
    const byKind: Record<Kind, Round[]> = { face: [], wardrobe: [], sheet: [], other: [] };
    for (const e of entries.filter((x) => x.dir && (/^r\d+/.test(x.name) || x.name === 'sheet'))) {
      const round = await readRound(ctx, `${folder}/${e.name}`, e.name, cid);
      if (round.candidates.length) byKind[kindOf(e.name)].push(round);
    }
    const pickFiles = entries.filter((e) => !e.dir && /^pick.*\.(png|jpe?g|webp)$/i.test(e.name)).map((e) => e.name);
    const rows = taste.filter((t) => new RegExp(`^${cid}\\b`).test(t.what));
    const rowsOf = (k: Kind | 'voice'): TastePickX[] => rows.filter((r) => tasteKind(r.what) === k);

    // a later pick is the next version beside the first (pick-face-v2.png, written by the harness's pick action)
    const newest = (base: string): string | undefined => {
      const re = new RegExp(`^${base}(?:-v(\\d+))?\\.(png|jpe?g|webp)$`, 'i');
      return pickFiles.filter((n) => re.test(n)).sort((a, b) => Number(re.exec(a)?.[1] ?? 1) - Number(re.exec(b)?.[1] ?? 1)).pop();
    };
    const faceFile = newest('pick-face');
    const wardFile = newest('pick-wardrobe');
    const facePickFile = faceFile ? await matchPick(ctx, `${folder}/${faceFile}`, byKind.face) : undefined;
    const wardPickFile = wardFile ? await matchPick(ctx, `${folder}/${wardFile}`, byKind.wardrobe) : undefined;
    if (faceFile && byKind.face.length && !facePickFile)
      ctx.warn.add(`${folder}/${faceFile}`, 'matches no face candidate byte for byte (edited after the pick?)');
    const facePick = byKind.face.length ? applyTaste(byKind.face, rowsOf('face'), facePickFile) : undefined;
    const wardPick = byKind.wardrobe.length ? applyTaste(byKind.wardrobe, rowsOf('wardrobe'), wardPickFile) : undefined;

    // the sheet: the newest pick-vN.png, else pick.png
    const sheetFile = pickFiles.filter((n) => /^pick(-v\d+)?\.(png|jpe?g|webp)$/i.test(n)).sort(natCmp).pop();
    const sheetRows = rowsOf('sheet');
    const approved =
      sheetRows.some((r) => /lock|approved/i.test(r.pick)) || rows.some((r) => /\block\b/i.test(r.what) && !/none|waiting/i.test(r.pick)) || (delivered && !!sheetFile) || (!cid.includes('-') && !!sheetFile && !!faceFile && !byKind.face.length && !byKind.wardrobe.length && !byKind.sheet.length)
        ? true
        : sheetRows.length
          ? false
          : undefined;
    if (byKind.sheet.length) applyTaste(byKind.sheet, sheetRows);

    const isExtra = cid.includes('-');
    // "no lines": the script's ID table row or the brief's Cast entry of this character says so, as "no lines" or
    // "silent" (a sample film's ID row says "silent": its assistant counted as speaking), or the
    // script's cast note calls them silent
    const cidRe = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const noLines = new RegExp(`^\\|[^\\n]*\\b${cidRe}\\b[^\\n]*\\b(no lines|silent)\\b`, 'im').test(script?.markdown ?? '')
      || new RegExp(`^\\s*[-*]\\s*\\*\\*${cidRe}\\b[^\\n]*\\b(no lines|silent)\\b`, 'im').test(briefMd)
      || /\b(silent|no lines)\b/i.test(script?.roles.get(cid) ?? '');
    const noRounds = !byKind.face.length && !byKind.wardrobe.length && !byKind.sheet.length;
    const reused = !isExtra && !!sheetFile && !!faceFile && noRounds;
    let voice = isExtra ? undefined : voiceFor(ctx, cid, vf, rowsOf('voice'), present, entries.some((e) => e.dir && e.name === 'voice'));
    // a character taken from the library brings their voice as files in cast/<folder>/voice/, with no round here
    if (!isExtra && !voice?.elementLine && entries.some((e) => e.dir && e.name === 'voice')) {
      const line = (await list(abs(ctx, `${folder}/voice`))).find((e) => !e.dir && /^element-line.*\.(mp3|wav|m4a)$/i.test(e.name));
      if (line) voice = { rounds: voice?.rounds ?? [], pick: voice?.pick, elementLine: { path: `${folder}/voice/${line.name}` } };
    }
    // the library entry it was taken from (meta.json beside the copied files): the film it was made for,
    // its voice's element line (the file the entry names, at the folder's root where the library copies it) with the
    // length and pitch measured when it was made, and its video element
    const lib = reused ? libraryMeta(await readJson(ctx, `${folder}/meta.json`)) : undefined;
    if (!isExtra && lib) {
      const at = async (f?: string) => {
        for (const rel of f ? [`${folder}/${f}`, `${folder}/voice/${f}`] : []) if (await exists(abs(ctx, rel))) return rel;
        return undefined;
      };
      const rootLine = entries.find((e) => !e.dir && /^element-line.*\.(mp3|wav|m4a)$/i.test(e.name))?.name;
      const linePath = voice?.elementLine?.path ?? (await at(lib.line)) ?? (await at(rootLine));
      if (linePath) voice = { rounds: voice?.rounds ?? [], pick: voice?.pick, elementLine: { path: linePath, seconds: voice?.elementLine?.seconds ?? lib.seconds, hz: voice?.elementLine?.hz ?? lib.hz } };
    }
    let { element, files } = await elementFor(ctx, cid, d.name, elementsJson);
    if (lib && element?.state === 'none') {
      const f = lib.element && (await exists(abs(ctx, `${folder}/${lib.element}`))) ? `${folder}/${lib.element}` : undefined;
      if (f) { element = { path: f, state: /1080p/.test(f) ? 'final' : 'draft' }; files = /1080p/.test(f) ? { final: f } : { draft: f }; }
    }

    const name =
      script?.names.get(cid) ??
      asString(asRecord(vf.cast?.[cid])?.name) ??
      asString(asRecord(lineFor(vf.lines, cid))?.name) ??
      asString(asRecord(vf.options?.[cid])?.name) ??
      titleCase(slug);

    out.push({
      id: cid,
      name,
      role: script?.roles.get(cid),
      folder,
      face: byKind.face.length ? { rounds: byKind.face, pick: facePick } : undefined,
      wardrobe: byKind.wardrobe.length ? { rounds: byKind.wardrobe, pick: wardPick } : undefined,
      sheet: sheetFile || byKind.sheet.length ? { path: sheetFile ? `${folder}/${sheetFile}` : undefined, approved } : undefined,
      voice,
      element,
      extra: isExtra || undefined,
      silent: (!isExtra && noLines) || undefined,
      imageElement: elementKeys(cid, Object.keys(elementsJson ?? {})).some((k) => !!asString(asRecord(elementsJson?.[k])?.id)) || undefined,
      reused: reused || undefined,
      ...(lib?.title ? { reusedFrom: { title: lib.title, ...(lib.slug ? { slug: lib.slug } : {}), ...(lib.entry ? { entry: lib.entry } : {}) } } : {}),
      picks: faceFile || wardFile ? { face: faceFile ? `${folder}/${faceFile}` : undefined, wardrobe: wardFile ? `${folder}/${wardFile}` : undefined } : undefined,
      more: { sheetRounds: byKind.sheet, otherRounds: byKind.other, pickFiles, elementFiles: files },
    });
  }
  return out;
}
