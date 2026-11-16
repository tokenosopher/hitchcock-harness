// Stage 11's sound work, by folder only: the recorded lines, the voice fixes and clones, the music, the effects,
// the mixes, the table reads and the stems. Nothing here is a rule or a verdict; the page plays what the folders
// hold, newest first, so a round of readings or music takes has a place to be heard. The voice options
// (voices/options/) stay on the Voices page. Read-only; one walk per folder, three levels deep at most.
import path from 'node:path';
import type { SoundFile, SoundGroup, SoundInfo, SoundSummary } from '../../types';
import { AUDIO_RE, Warnings, abs, list, natCmp, type FilmCtx } from '../util';
import { fileFact } from './record';

interface Spec { key: string; title: string; note: string; dirs: string[]; top?: { dir: string; re: RegExp }[] }

/** The folders the flow writes sound into, in the order the page shows them. */
const GROUPS: Spec[] = [
  { key: 'mix', title: 'Mixes', note: 'The mixed film sound and its loudness passes.', dirs: ['audio/master'] },
  { key: 'music', title: 'Music', note: 'The score takes, their plans and the seeds they grew from.', dirs: ['audio/score', 'audio/music'] },
  { key: 'sfx', title: 'Effects', note: 'Sound effects made for the film.', dirs: ['audio/sfx'] },
  { key: 'lines', title: 'Recorded lines', note: 'The lines recorded in each character’s voice, and their takes.', dirs: ['audio/lines', 'audio/takes', 'voices/lines'] },
  { key: 'fixes', title: 'Voice fixes', note: 'Words and names re-voiced or cloned to patch a take.', dirs: ['voices/names'], top: [{ dir: 'voices', re: /^(clone|fix|word)/i }] },
  { key: 'reads', title: 'Table reads', note: 'The whole script read aloud, version by version.', dirs: ['audio/table-reads'], top: [{ dir: 'audio', re: /^table-read/i }] },
  { key: 'stems', title: 'Stems', note: 'Voices and beds pulled apart from takes and cuts.', dirs: ['audio/clean-voices', 'audio/stems', 'cut/stems.nosync'], top: [{ dir: 'social', re: /stem/i }] },
];
const KNOWN_AUDIO = new Set(['master', 'score', 'music', 'sfx', 'lines', 'takes', 'table-reads', 'clean-voices', 'stems', 'history']);
const CAP = 60;

async function walk(dir: string, rel: string, depth: number, out: string[]): Promise<void> {
  for (const e of await list(dir)) {
    if (e.name.startsWith('.')) continue;
    if (e.dir) { if (depth > 0) await walk(path.join(dir, e.name), `${rel}/${e.name}`, depth - 1, out); }
    else if (AUDIO_RE.test(e.name)) out.push(`${rel}/${e.name}`);
  }
}

async function facts(ctx: FilmCtx, rels: string[]): Promise<SoundFile[]> {
  const files = await Promise.all(rels.map(async (rel): Promise<SoundFile> => {
    const f = await fileFact(abs(ctx, rel));
    return { path: rel, name: rel.split('/').pop()!, bytes: f?.bytes, date: f?.date };
  }));
  // newest day first, then by name within a day (take 2 after take 1)
  return files.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || natCmp(a.path, b.path));
}

interface Found { key: string; title: string; note: string; folder: string; rels: string[] }

/** The walk alone: which sound files each group holds, without a stat. Cheap enough for every state build. */
async function collect(ctx: FilmCtx): Promise<Found[]> {
  const found: Found[] = [];
  const push = (key: string, title: string, note: string, folder: string, rels: string[]): void => {
    if (!rels.length) return;
    // the same sound as .wav and .mp3 side by side is one row: the .mp3 plays (lighter to stream)
    const all = [...new Set(rels)];
    const mp3 = new Set(all.filter((r) => /\.mp3$/i.test(r)).map((r) => r.replace(/\.mp3$/i, '').toLowerCase()));
    found.push({ key, title, note, folder, rels: all.filter((r) => /\.mp3$/i.test(r) || !mp3.has(r.replace(/\.[^.]+$/, '').toLowerCase())) });
  };

  for (const g of GROUPS) {
    const rels: string[] = [];
    const seen: string[] = [];
    for (const d of g.dirs) {
      const before = rels.length;
      await walk(abs(ctx, d), d, 2, rels);
      if (rels.length > before) seen.push(d);
    }
    for (const t of g.top ?? []) {
      for (const e of await list(abs(ctx, t.dir))) {
        if (!t.re.test(e.name)) continue;
        const before = rels.length;
        if (e.dir) await walk(abs(ctx, `${t.dir}/${e.name}`), `${t.dir}/${e.name}`, 2, rels);
        else if (AUDIO_RE.test(e.name)) rels.push(`${t.dir}/${e.name}`);
        if (rels.length > before && !seen.includes(t.dir)) seen.push(e.dir ? `${t.dir}/${e.name}` : t.dir);
      }
    }
    push(g.key, g.title, g.note, seen.join(', '), rels);
  }
  // a folder under audio/ this reader has no name for still gets heard, under its own name
  for (const e of await list(abs(ctx, 'audio'))) {
    if (!e.dir || e.name.startsWith('.') || KNOWN_AUDIO.has(e.name)) continue;
    const rels: string[] = [];
    await walk(abs(ctx, `audio/${e.name}`), `audio/${e.name}`, 2, rels);
    push(`other:${e.name}`, e.name, 'A sound folder the harness has no name for yet.', `audio/${e.name}`, rels);
  }
  return found;
}

/** How many sound files each group holds, for the flow board's Sound node. Undefined when there are none. */
export async function soundCounts(ctx: FilmCtx): Promise<SoundSummary | undefined> {
  const found = await collect(ctx);
  if (!found.length) return undefined;
  return { counts: Object.fromEntries(found.map((f) => [f.key, f.rels.length])) };
}

/** The Sound page's list: every group with its files, newest first. */
export async function readSound(folder: string): Promise<SoundInfo> {
  const warn = new Warnings();
  const ctx: FilmCtx = { dir: folder, warn };
  const groups: SoundGroup[] = [];
  for (const f of await collect(ctx)) {
    const files = await facts(ctx, f.rels);
    groups.push({ key: f.key, title: f.title, note: f.note, folder: f.folder, files: files.slice(0, CAP), more: files.length > CAP ? files.length - CAP : undefined });
  }
  return { groups, warnings: warn.list };
}
