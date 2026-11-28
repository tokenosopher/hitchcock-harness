// The options of a sound (13 Nov 2026: "now I made an effect. That effect isn't the right one … what's going
// to happen to the previous one?"). Every try of an effect is kept: the options of a sound clip are the sound
// files in the folder of the clip's file. Read here with their lengths, their shapes for the page to draw,
// and the words each was made from when the folder holds a prompts.json.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import { FFMPEG, probe } from './probe';

export interface SoundOption {
  src: string;                  // "assets/films/<film>/…", the form a clip uses; the .wav when a try has both
  files: string[];              // every file of this try (the same name with another ending)
  name: string;                 // "try 2", "try 3 tight"
  seconds?: number;
  words?: string;               // what it was made from, when the folder's prompts.json says
  peaks?: number[];             // its loudness along its length, 0…1, for the drawing
}
export interface OptionGroup { dir: string; options: SoundOption[] }

const SOUND = /\.(wav|mp3|m4a|aac|aiff?|flac|ogg)$/i;
const BEST = ['.wav', '.aiff', '.aif', '.flac', '.m4a', '.aac', '.mp3', '.ogg'];
const PEAKS = 96;

const g = globalThis as unknown as { __soundPeaks?: Map<string, { mtime: number; peaks: number[] }> };
const kept = (g.__soundPeaks ??= new Map());

/** The loudest sample in each of 96 slices, read by ffmpeg as mono at 4 kHz: enough for a drawing. */
export async function peaksOf(abs: string): Promise<number[] | undefined> {
  const st = await fs.stat(abs).catch(() => undefined);
  if (!st) return undefined;
  const hit = kept.get(abs);
  if (hit && hit.mtime === st.mtimeMs) return hit.peaks;
  const raw = await new Promise<Buffer | undefined>((resolve) => {
    execFile(FFMPEG, ['-v', 'error', '-i', abs, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-'],
      { signal: AbortSignal.timeout(20000), maxBuffer: 16 << 20, encoding: 'buffer' }, (err, out) => resolve(err ? undefined : (out as Buffer)));
  });
  if (!raw || raw.length < 2) return undefined;
  const n = Math.floor(raw.length / 2);
  const peaks = new Array<number>(PEAKS).fill(0);
  for (let i = 0; i < n; i++) {
    const v = Math.abs(raw.readInt16LE(i * 2)) / 32768;
    const k = Math.min(PEAKS - 1, Math.floor((i / n) * PEAKS));
    if (v > peaks[k]) peaks[k] = v;
  }
  const out = peaks.map((v) => Math.round(v * 1000) / 1000);
  kept.set(abs, { mtime: st.mtimeMs, peaks: out });
  return out;
}

/** "hooray-try3-tight" among "hooray-try1", "hooray-try2" → "try 3 tight". */
function names(stems: string[]): Map<string, string> {
  let pre = stems.length > 1 ? stems[0] : '';
  for (const s of stems) while (pre && !s.startsWith(pre)) pre = pre.slice(0, -1);
  // cut the shared start back to a word break, so "try1"/"try2" keep their "try"
  pre = pre.replace(/[A-Za-z]+\d*$/, '').replace(/\d+$/, '');
  const say = (s: string) => s.replace(/[-_]+/g, ' ').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/\s+/g, ' ').trim();
  return new Map(stems.map((s) => [s, say(s.slice(pre.length)) || say(s)]));
}

export async function soundOptions(film: FilmTarget, dirs: string[]): Promise<OptionGroup[]> {
  const shown = film.show(film.dir);
  const out: OptionGroup[] = [];
  for (const dir of [...new Set(dirs)].slice(0, 60)) {
    // only folders of this film, named the way its clips name them
    if (!dir.startsWith(`${shown}/`) || dir.split('/').includes('..')) continue;
    // files the user put on the timeline by hand land together in ".../added": they are not tries of one effect
    if (dir.endsWith('/added')) continue;
    const abs = path.join(film.dir, dir.slice(shown.length + 1));
    const ents = (await fs.readdir(abs).catch(() => [] as string[])).filter((n) => SOUND.test(n) && !n.startsWith('.'));
    if (!ents.length) continue;
    const byStem = new Map<string, string[]>();
    for (const n of ents) { const stem = n.replace(SOUND, ''); byStem.set(stem, [...(byStem.get(stem) ?? []), n]); }
    let words: string[] = [];
    try {
      const j = JSON.parse(await fs.readFile(path.join(abs, 'prompts.json'), 'utf8')) as { prompts?: unknown };
      if (Array.isArray(j.prompts)) words = j.prompts.map((x) => (typeof x === 'string' ? x : ''));
    } catch { /* no words kept for this folder */ }
    const stems = [...byStem.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const called = names(stems);
    const options: SoundOption[] = [];
    for (const stem of stems) {
      const files = byStem.get(stem)!.sort((a, b) => BEST.indexOf(path.extname(a).toLowerCase()) - BEST.indexOf(path.extname(b).toLowerCase()));
      const file = path.join(abs, files[0]);
      const [pr, peaks] = await Promise.all([probe(file), peaksOf(file)]);
      const n = Number(/try[-_ ]?(\d+)/i.exec(stem)?.[1]);
      options.push({ src: `${dir}/${files[0]}`, files: files.map((f) => `${dir}/${f}`), name: called.get(stem) ?? stem, seconds: pr?.duration, words: n ? words[n - 1] || undefined : undefined, peaks });
    }
    out.push({ dir, options });
  }
  return out;
}
