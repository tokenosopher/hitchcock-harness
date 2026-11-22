// The script edited in place on the Story page (ASKS 64). One save is the whole sitting: the server re-reads
// script.md, checks it is the text the page started from (else 409 with the newer text and where each edit lands in
// it), applies the words of its lines, directions and cards (src/lib/script-edit.ts: the version it replaces kept word for word under "## Earlier drafts",
// the new note in front of the old one, the rows' count, order and speakers checked unchanged), writes the file in one
// step (a temporary file, then a rename), and tells Alma what changed so she re-times and checks it. A locked script is
// refused. Under MOCK=boards the sample films' script lives in memory (src/fixtures/story.ts) and nothing reaches Alma.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { filmTarget } from './film';
import { PickError } from './pick';
import { Writer, type WriteRecord } from './writes';
import { applyEdits, checkEdits, currentVersion, fingerprint, scriptEditedMessage, ScriptEditError, type EditCheck, type ScriptEdit } from '@/lib/script-edit';
import { pokeFilm } from '../films/watcher';
import { isMock, mockPoke } from '@/fixtures/mock';
import { storyMemory } from '@/fixtures/story';

export interface ScriptBase { version?: string; fingerprint: string }
export interface SaveScriptResult { ok: true; dryRun: boolean; film: string; from: string; version: string; changes: EditCheck[]; message: string; notified: boolean; writes: WriteRecord[] }
/** A refusal because script.md changed since the page read it: the newer text, and each edit's place in it. */
export class ScriptClash extends PickError {
  constructor(readonly clash: { version?: string; markdown: string; fingerprint: string; edits: EditCheck[] }) {
    super(`script.md changed while you were editing${clash.version ? `: it is ${clash.version} now` : ''}`, 409);
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

function parseEdits(raw: unknown): ScriptEdit[] {
  if (!Array.isArray(raw)) throw new PickError('edits must be a list');
  return raw.map((e, i) => {
    const x = e as Partial<ScriptEdit>;
    if (typeof x?.scene !== 'string' || !/^S\d+$/.test(x.scene) || typeof x.index !== 'number' || !Number.isInteger(x.index) || x.index < 0
      || (x.kind !== 'line' && x.kind !== 'action' && x.kind !== 'card') || typeof x.old !== 'string' || typeof x.new !== 'string'
      || (x.kind === 'card' && x.part !== 0 && x.part !== 1)) throw new PickError(`edit ${i + 1} is not a scene, a place, a kind and old and new words`);
    return { scene: x.scene, index: x.index, kind: x.kind, ...(x.kind === 'card' ? { part: x.part } : {}), old: x.old, new: x.new };
  });
}

/** Where the text is kept: the film's script.md on disk, or a sample's memory. */
interface Store { read(): Promise<string | undefined>; write(text: string, before: string): Promise<void>; rel: string; show: (p: string) => string; file: string; mock: boolean; poke(): void; slug: string }

async function storeFor(film: string): Promise<Store> {
  if (isMock()) {
    const m = storyMemory(film);
    if (!m) throw new PickError(`"${film}" is not a sample film: under sample data only the samples can be saved`, 403);
    return {
      mock: true, slug: film, rel: `assets/films/${film}/script.md`, file: 'script.md', show: (p) => p,
      read: async () => m.script,
      write: async (text, before) => { if (m.script !== before) throw new PickError('script.md changed while the harness was writing it; nothing written', 409); m.script = text; },
      poke: () => mockPoke(film),
    };
  }
  const ft = await filmTarget(film);
  if (!ft) throw new PickError(`no film folder for "${film}" in the film repo`, 404);
  const file = path.join(ft.dir, 'script.md');
  return {
    mock: false, slug: ft.slug, rel: ft.show(file), file, show: ft.show,
    read: async () => fs.readFile(file, 'utf8').catch(() => undefined),
    write: async (text, before) => {
      // one step: the whole new text in a temporary file beside it, checked against what was read, then renamed over
      const tmp = `${file}.harness-tmp`;
      await fs.writeFile(tmp, text, { flag: 'w' });
      try {
        if ((await fs.readFile(file, 'utf8')) !== before) throw new PickError('script.md changed while the harness was writing it; nothing written', 409);
        await fs.rename(tmp, file);
      } finally {
        await fs.rm(tmp, { force: true });
      }
    },
    poke: () => pokeFilm(film),
  };
}

export async function saveScript(input: { edits: unknown; base: ScriptBase }, film: string, opts: { dryRun?: boolean; notify?: boolean } = {}): Promise<SaveScriptResult> {
  const edits = parseEdits(input.edits);
  if (!edits.length) throw new PickError('nothing to save');
  if (typeof input.base?.fingerprint !== 'string') throw new PickError('the save must say which text it started from');
  const st = await storeFor(film);
  const md = await st.read();
  if (md === undefined) throw new PickError('there is no script.md yet', 409);
  const cur = currentVersion(md);
  if (cur?.locked) throw new PickError(`script ${cur.version} is locked; to change a line, unlock it through Alma first`, 409);
  if (fingerprint(md) !== input.base.fingerprint) throw new ScriptClash({ version: cur?.version, markdown: md, fingerprint: fingerprint(md), edits: checkEdits(md, edits) });
  let applied;
  try {
    applied = applyEdits(md, edits, { date: today() });
  } catch (e) {
    if (e instanceof ScriptEditError) throw new PickError(e.message, e.status);
    throw e;
  }
  const w = new Writer(`script save ${film}`, st.show, !!opts.dryRun);
  if (!opts.dryRun) await st.write(applied.markdown, md);
  await w.wrote(st.rel, `${applied.version}: your edit, ${applied.changes.length} ${applied.changes.length === 1 ? 'change' : 'changes'}; ${applied.from} kept under Earlier drafts`);
  const message = scriptEditedMessage(applied, st.rel);
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    if (st.mock) {
      const { mockPost } = await import('@/fixtures/mock');
      mockPost(film, message);
    } else {
      const { sendToAlma } = await import('../claude/thread');
      await sendToAlma(st.slug, message);
    }
    notified = true;
  }
  if (!opts.dryRun) st.poke();
  return { ok: true, dryRun: !!opts.dryRun, film, from: applied.from, version: applied.version, changes: applied.changes, message, notified, writes: w.records };
}

export const SCRIPT_LOCK_KIND = 'script-lock';
export interface LockScriptResult { ok: true; dryRun: boolean; film: string; version: string; message: string; notified: boolean }

/** The user pressed "Lock vN" on the Story page (ASKS 65): the press is the user's yes naming the version, and it goes
 *  to Alma at once. The harness writes nothing: Alma records the lock in script.md and starts what the lock starts, as
 *  she did when the same words came through the message box. Refused when that version is not the newest, or is
 *  locked already. */
export async function lockScript(version: string, film: string, opts: { dryRun?: boolean; notify?: boolean } = {}): Promise<LockScriptResult> {
  if (!/^v\d+(\.\d+)*$/.test(version)) throw new PickError('lock must name a version like v4');
  const st = await storeFor(film);
  const md = await st.read();
  if (md === undefined) throw new PickError('there is no script.md yet', 409);
  const cur = currentVersion(md);
  if (!cur) throw new PickError('script.md has no version note yet', 409);
  if (cur.version !== version) throw new PickError(`the script is ${cur.version} now; lock that one`, 409);
  if (cur.locked) throw new PickError(`script ${version} is locked already`, 409);
  const message = [
    `<harness-action kind="${SCRIPT_LOCK_KIND}" version="${version}"/> The user pressed "Lock ${version}" on the Story page: ${st.rel}. That press is the user's yes naming the version, in these words: "Lock script ${version}."`,
    '',
    `Yours, as the stage 1 note says: check that ${version} is ready to lock (re-timed after any edit of the user's), record the lock in the version note with those words and the date, and start what the lock starts. If something stops the lock, say what in the thread.`,
  ].join('\n');
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    if (st.mock) {
      const { mockPost } = await import('@/fixtures/mock');
      mockPost(film, message);
    } else {
      const { sendToAlma } = await import('../claude/thread');
      await sendToAlma(st.slug, message);
    }
    notified = true;
  }
  return { ok: true, dryRun: !!opts.dryRun, film, version, message, notified };
}
