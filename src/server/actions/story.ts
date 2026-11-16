// The Story page's two writes. Saving the story the user edited by hand makes the next story/v<n>.md (never over
// an old one) and notes in story/by.json that it is the user's. Settling a version writes story/settled.json and
// tells Alma to write the script from it. dryRun returns what would be written and sent, and touches nothing.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { filmTarget } from './film';
import { PickError } from './pick';
import { Writer, type WriteRecord } from './writes';
import { readStory, STORY_FILE } from '../films/read/story';
import { Warnings } from '../films/util';
import { pokeFilm } from '../films/watcher';
import { isMock, mockPoke, mockPost } from '@/fixtures/mock';
import { storyMemory } from '@/fixtures/story';

const MAX = 200_000;
const clean = (t: string) => t.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim() + '\n';

async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.harness-tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(tmp, file);
}

export interface SaveStoryResult { ok: true; dryRun: boolean; film: string; version: string; unchanged?: boolean; writes: WriteRecord[] }

/** `base` is the version the user's text started from. If a newer one exists (Alma wrote it meanwhile), the save
 *  is refused with 409 unless `force`: nothing would be lost either way, but the user should see her version first. */
export async function saveStory(input: { text: string; base?: string; force?: boolean }, film: string, opts: { dryRun?: boolean } = {}): Promise<SaveStoryResult> {
  if (isMock()) return mockSaveStory(input, film, opts);
  const ft = await filmTarget(film);
  if (!ft) throw new PickError(`no film folder for "${film}" in the film repo`, 404);
  if (typeof input.text !== 'string' || !input.text.trim()) throw new PickError('the story is empty');
  if (input.text.length > MAX) throw new PickError('the story is longer than 200,000 characters');
  const text = clean(input.text);
  const now = await readStory({ dir: ft.dir, warn: new Warnings() });
  const w = new Writer(`story save ${film}`, ft.show, !!opts.dryRun);
  if (now && clean(now.text) === text) return { ok: true, dryRun: !!opts.dryRun, film, version: now.current, unchanged: true, writes: [] };
  if (now && input.base !== now.current && !input.force) {
    throw new PickError(`${now.current} was written after the version you started from${input.base ? ` (${input.base})` : ''}; look at it first, or save yours as the newest anyway`, 409);
  }
  const dir = path.join(ft.dir, 'story');
  const taken = (await fs.readdir(dir).catch(() => [] as string[])).map((n) => Number(STORY_FILE.exec(n)?.[1] ?? 0));
  const version = `v${Math.max(0, ...taken) + 1}`;
  await w.writeNew(path.join(dir, `${version}.md`), text, `${text.split(/\s+/).filter(Boolean).length} words, saved on the Story page`);
  if (!opts.dryRun) {
    let by: Record<string, string> = {};
    try { by = JSON.parse(await fs.readFile(path.join(dir, 'by.json'), 'utf8')) as Record<string, string>; } catch { /* first save */ }
    by[version] = 'you';
    await writeJson(path.join(dir, 'by.json'), by);
    pokeFilm(film);
  }
  await w.wrote(ft.show(path.join(dir, 'by.json')), `${version}: you`);
  return { ok: true, dryRun: !!opts.dryRun, film, version, writes: w.records };
}

export interface SettleStoryResult { ok: true; dryRun: boolean; film: string; version: string; message: string; notified: boolean; writes: WriteRecord[] }

export async function settleStory(version: string, film: string, opts: { dryRun?: boolean; notify?: boolean } = {}): Promise<SettleStoryResult> {
  if (isMock()) return mockSettle(version, film, opts);
  const ft = await filmTarget(film);
  if (!ft) throw new PickError(`no film folder for "${film}" in the film repo`, 404);
  const now = await readStory({ dir: ft.dir, warn: new Warnings() });
  if (!now) throw new PickError('there is no story yet', 409);
  if (version !== now.current) throw new PickError(`${now.current} is the newest story; settle that one, or save again`, 409);
  const w = new Writer(`story settle ${film}`, ft.show, !!opts.dryRun);
  const file = path.join(ft.dir, 'story', 'settled.json');
  if (!opts.dryRun) await writeJson(file, { version, at: new Date().toISOString() });
  await w.wrote(ft.show(file), version);
  const rel = ft.show(path.join(ft.dir, 'story', `${version}.md`));
  const message = [
    `<harness-action kind="story-settled" version="${version}"/> The user settled the story at ${version} on the Story page: ${rel}. Write the script from it now, as the stage 1 note says.`,
    '',
    `The harness wrote: story/settled.json. Yours: put that story word for word under "## Story" in script.md (it is the user's text), then the script, its cut into generations and its timings, and send the first numbered draft. The lock is still the user's.`,
  ].join('\n');
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  if (!opts.dryRun) pokeFilm(film);
  return { ok: true, dryRun: !!opts.dryRun, film, version, message, notified, writes: w.records };
}

// ---- sample data (MOCK=boards): the sample films' story lives in memory (src/fixtures/story.ts); the same rules,
// nothing written to disk, nothing sent to Alma. Any other film is refused under sample data.
function sample(film: string) {
  const m = storyMemory(film);
  if (!m) throw new PickError(`"${film}" is not a sample film: under sample data only the samples can be saved`, 403);
  return m;
}
function mockSaveStory(input: { text: string; base?: string; force?: boolean }, film: string, opts: { dryRun?: boolean }): SaveStoryResult {
  const m = sample(film);
  if (typeof input.text !== 'string' || !input.text.trim()) throw new PickError('the story is empty');
  if (input.text.length > MAX) throw new PickError('the story is longer than 200,000 characters');
  const text = clean(input.text);
  const now = m.story[m.story.length - 1];
  if (now && clean(now.text) === text) return { ok: true, dryRun: !!opts.dryRun, film, version: now.version, unchanged: true, writes: [] };
  if (now && input.base !== now.version && !input.force) throw new PickError(`${now.version} was written after the version you started from${input.base ? ` (${input.base})` : ''}; look at it first, or save yours as the newest anyway`, 409);
  const version = `v${m.story.length + 1}`;
  if (!opts.dryRun) { m.story.push({ version, text, by: 'you', at: new Date().toISOString() }); mockPoke(film); }
  return { ok: true, dryRun: !!opts.dryRun, film, version, writes: [] };
}
function mockSettle(version: string, film: string, opts: { dryRun?: boolean; notify?: boolean }): SettleStoryResult {
  const m = sample(film);
  const now = m.story[m.story.length - 1];
  if (!now) throw new PickError('there is no story yet', 409);
  if (version !== now.version) throw new PickError(`${now.version} is the newest story; settle that one, or save again`, 409);
  const message = `<harness-action kind="story-settled" version="${version}"/> The user settled the story at ${version} on the Story page (sample film; nothing is sent).`;
  if (!opts.dryRun) { m.settled = version; if (opts.notify !== false) mockPost(film, message); mockPoke(film); }
  return { ok: true, dryRun: !!opts.dryRun, film, version, message, notified: false, writes: [] };
}

/** One story version's text, for the page's earlier-version view (a sample's from memory). */
export async function storyVersionText(film: string, v: string): Promise<string | undefined> {
  if (isMock()) return storyMemory(film)?.story.find((x) => x.version === v)?.text;
  const ft = await filmTarget(film);
  if (!ft) return undefined;
  return fs.readFile(path.join(ft.dir, 'story', `${v}.md`), 'utf8').catch(() => undefined);
}
