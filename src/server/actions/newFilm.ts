// Starting a film from the Idea page: the flow's own new_film.py makes
// the folder and adds it to films.txt, the write goes into harness/writes.log, the registry is rebuilt, and the
// film's Alma gets her first message. The harness writes nothing in the film folder itself.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { harnessConfig, pythonBin } from '../config';
import { helperEnv } from '../env';
import { getRegistry, invalidateRegistry, type FilmRefX } from '../films/registry';
import type { AlmaModel } from '../types';
import { isAlmaModel, setAlmaModel } from '../claude/model';
import { CODE_RE, RATIOS, RESERVED_SLUGS, setupLine, slugOf, SETUP_DEFAULTS, type NewFilmSetup, type Ratio } from '@/lib/newFilm';
import { DRIVE_MISSING, driveConnected, showPathFor } from './film';
import { Writer } from './writes';
import { asTyped } from '../claude/typed';

export class NewFilmError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface NewFilmInput {
  title: string;
  idea: string;
  ratio: Ratio;
  code: string;
  budgetCredits: number | null;
  voices?: string;
  elements?: string;
  upscale?: string;
  /** The model the new film's Alma starts on ('' or absent: Claude Code's own setting). */
  model?: AlmaModel;
}

export interface NewFilmResult {
  slug: string;
  title: string;
  code: string;
  cmd: string;                  // the command as the flow writes it (paths relative to the film repo)
  output: string;               // new_film.py's stdout (and stderr, when it wrote any)
  film?: FilmRefX;              // the registry entry, for the sidebar
  message: string;              // what Alma was sent
}

export interface TakenNames {
  drive: 'connected' | 'not connected';
  /** The film repo's films folder exists (the assets link resolves). */
  filmsDir: boolean;
  slugs: string[];
  codes: { code: string; film: string }[];
}

const filmsDirOf = (repo: string): string => path.join(repo, 'assets', 'films');

/** Every folder under assets/films and every short code an earlier film uses: brief.md's "- Code:" line,
 *  higgsfield.json's code, and the prefix of its element names in elements.json (The Lighthouse's TL-). */
export async function takenNames(repo = harnessConfig().filmRepo): Promise<TakenNames> {
  const drive = (await driveConnected()) ? 'connected' : 'not connected';
  const out: TakenNames = { drive, filmsDir: false, slugs: [], codes: [] };
  if (drive !== 'connected') return out;
  let names: string[];
  try {
    names = (await fs.readdir(filmsDirOf(repo), { withFileTypes: true })).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
    out.filmsDir = true;
  } catch {
    return out;
  }
  out.slugs = names.sort();
  const seen = new Set<string>();
  const add = (code: string | undefined, film: string) => {
    if (!code || !CODE_RE.test(code) || seen.has(code)) return;
    seen.add(code);
    out.codes.push({ code, film });
  };
  await Promise.all(names.map(async (slug) => {
    const dir = path.join(filmsDirOf(repo), slug);
    const read = (rel: string) => fs.readFile(path.join(dir, rel), 'utf8').catch(() => '');
    const [brief, hf, el] = await Promise.all([read('brief.md'), read('higgsfield.json'), read('elements.json')]);
    add(/^- Code: ([A-Z0-9]{2,6})\b/m.exec(brief)?.[1], slug);
    add(/"code":\s*"([A-Z0-9]{2,6})"/.exec(hf)?.[1], slug);
    add(/"name":\s*"([A-Z0-9]{2,6})-/.exec(el)?.[1], slug);
  }));
  out.codes.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

/** Checks a POST body; throws NewFilmError(400) with the first problem. */
export function parseNewFilm(body: Record<string, unknown>): NewFilmInput {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const title = str(body.title).replace(/\s+/g, ' ');
  if (!title) throw new NewFilmError('the title is empty');
  if (title.length > 120) throw new NewFilmError('the title is longer than 120 characters');
  if (title.includes('/')) throw new NewFilmError('the title cannot hold "/": it names the final-cuts folder');
  const idea = typeof body.idea === 'string' ? body.idea.replace(/\r\n/g, '\n').trim() : '';
  if (idea.length > 50_000) throw new NewFilmError('the idea is longer than 50,000 characters; give Alma a file instead');
  const ratio = str(body.ratio) as Ratio;
  if (!RATIOS.includes(ratio)) throw new NewFilmError('ratio must be 9:16 or 16:9');
  const code = str(body.code).toUpperCase();
  if (!CODE_RE.test(code)) throw new NewFilmError('the code must be 2 to 6 capitals or digits');
  let budgetCredits: number | null = null;
  if (body.budgetCredits !== undefined && body.budgetCredits !== null && body.budgetCredits !== '') {
    const n = Number(body.budgetCredits);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new NewFilmError('the budget must be a whole number of credits');
    budgetCredits = n;
  }
  const opt = (v: unknown, max = 120) => {
    const s = str(v).replace(/\s+/g, ' ');
    return s ? s.slice(0, max) : undefined;
  };
  return { title, idea, ratio, code, budgetCredits, voices: opt(body.voices), elements: opt(body.elements), upscale: opt(body.upscale), model: isAlmaModel(body.model) ? body.model : undefined };
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, env: helperEnv({ PYTHONDONTWRITEBYTECODE: '1' }), maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      const e = err as (Error & { code?: unknown; signal?: NodeJS.Signals | null }) | null;
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, signal: e?.signal ?? null, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const q = (s: string) => (/^[\w./:+-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);

/** One film at a time per slug: a double press never runs new_film.py twice. */
const g = globalThis as unknown as { __newFilmsInFlight?: Set<string> };
const inFlight: Set<string> = (g.__newFilmsInFlight ??= new Set());

export async function startFilm(input: NewFilmInput, opts: { repo?: string } = {}): Promise<NewFilmResult> {
  const repo = opts.repo ?? harnessConfig().filmRepo;
  if (!(await driveConnected())) throw new NewFilmError(DRIVE_MISSING, 503);
  const filmsDir = filmsDirOf(repo);
  try {
    if (!(await fs.stat(filmsDir)).isDirectory()) throw new Error();
  } catch {
    throw new NewFilmError('assets/films is missing from the studio folder (run ./setup.sh)', 503);
  }

  const slug = slugOf(input.title);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new NewFilmError('the title makes no folder name: it needs letters or digits');
  if (RESERVED_SLUGS.has(slug)) throw new NewFilmError(`"${slug}" is a name the harness uses itself; give the film another title`);
  const dir = path.join(filmsDir, slug);
  const shown = `assets/films/${slug}`;
  if (inFlight.has(slug)) throw new NewFilmError(`${shown} is being made right now`, 409);
  try {
    await fs.lstat(dir);
    throw new NewFilmError(`${shown} already exists; new_film.py never overwrites a film, so give this one another title`, 409);
  } catch (e) {
    if (e instanceof NewFilmError) throw e;
  }
  const taken = await takenNames(repo);
  const owner = taken.codes.find((c) => c.code === input.code);
  if (owner) throw new NewFilmError(`the code ${input.code} is already ${owner.film}'s; pick another`, 409);

  inFlight.add(slug);
  try {
    // exactly the flow's command (Flow v3 - 1 step 3): $PY $T/film/new_film.py $FILM --title … --code … --ratio … [--budget-credits N]
    const script = path.join(repo, 'tools', 'film', 'new_film.py');
    const args = [dir, '--title', input.title, '--code', input.code, '--ratio', input.ratio];
    if (input.budgetCredits) args.push('--budget-credits', String(input.budgetCredits));
    const py = pythonBin();
    const cmd = `${py === path.join(/*turbopackIgnore: true*/ repo, '.venv', 'bin', 'python') ? '.venv/bin/python' : py} tools/film/new_film.py ${shown} ${args.slice(1).map(q).join(' ')}`;
    const writer = new Writer(`new film ${slug}`, showPathFor(repo, dir));
    // macOS has no `timeout`: perl's alarm puts the 60 s limit on it
    const r = await run('perl', ['-e', 'alarm 60; exec @ARGV', py, script, ...args], repo);
    const output = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join('\n').slice(0, 8000);
    if (r.signal === 'SIGALRM') {
      await writer.ran(cmd, shown, 'stopped after 60 s');
      throw new NewFilmError('new_film.py did not finish within 60 s (macOS may be waiting on a permission prompt)', 504);
    }
    if (r.code !== 0) {
      await writer.ran(cmd, shown, `failed (exit ${r.code ?? r.signal}): ${output.split('\n').pop() ?? ''}`);
      throw new NewFilmError(`new_film.py refused: ${output || `exit ${r.code}`}`, r.code === 2 || r.code === 1 ? 422 : 500);
    }
    const made = /^\s*made: (.*)$/m.exec(r.stdout)?.[1] ?? '';
    await writer.ran(cmd, shown, `made ${made.split(', ').length} folders and files; films.txt: ${/^\s*(.*films\.txt.*)$/m.exec(r.stdout)?.[1] ?? '?'}`);

    invalidateRegistry();
    const reg = await getRegistry(0);
    const film = reg.films.find((f) => f.slug === slug);

    const setup: NewFilmSetup = {
      ratio: input.ratio,
      code: input.code,
      budgetCredits: input.budgetCredits,
      voices: input.voices ?? SETUP_DEFAULTS.voices,
      elements: input.elements ?? SETUP_DEFAULTS.elements,
      upscale: input.upscale ?? SETUP_DEFAULTS.upscale,
    };
    const message =
      `<harness-action kind="new-film" slug="${slug}"/> ` +
      `A new film: ${asTyped(input.title)}. The folder was made with new_film.py (output below). Start stage 1 with the studio-film skill (the one in this studio's .claude/skills; never a skill named plain film); the story comes first, as story/v1.md, for the user to read and edit before any script. ` +
      `Setup defaults are taken at face value: ${setupLine(setup)}. The idea, in the user's words:\n\n` +
      `${asTyped(input.idea || '(the user gave no idea text yet)')}\n\n${output}`;
    if (input.model) await setAlmaModel(slug, input.model);
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(slug, message);

    return { slug, title: input.title, code: input.code, cmd, output, film, message };
  } finally {
    inFlight.delete(slug);
  }
}
