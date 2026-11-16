// Subtitle lines in the cut (14 Nov 2026, ASKS 40: "a track for the subtitle that we can add … I want to be able to
// just say, 'Create subtitles'"). A line is a clip on a captions track with `text` and no `src`: {id, text, at, in 0,
// out its length}. The older form, one clip whose `src` is an .srt file, keeps working beside it. Pure: SRT in and
// out, the text split at a word, the line under a frame, and what a change of the film does to the lines.
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';

// ---- SRT

export interface Cue { a: number; b: number; lines: string[] }
const srtTime = (s: string): number => {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000 : NaN;
};
/** The cues of an .srt file: start and end in seconds and the words, tags taken out. */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/^﻿/, '').replace(/\r/g, '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->').map(srtTime);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    cues.push({ a, b, lines: lines.slice(ti + 1).map((l) => l.replace(/<\/?[a-zA-Z][^>]*>/g, '').trim()).filter(Boolean) });
  }
  return cues;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fr = (sec: number, fps: number) => Math.round(sec * fps);
const toS = (f: number, fps: number) => r6(f / fps);

/** "00:00:12,500" for SRT. */
export function srtStamp(f: number, fps: number): string {
  const ms = Math.round((f / fps) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

// ---- a line

/** A subtitle line: a clip with words of its own and no file. */
export const isLine = (c: TimelineClip): boolean => typeof c.text === 'string' && !c.src;
/** A clip that is an .srt file (the older form). */
export const isSrtClip = (c: TimelineClip): boolean => !!c.src && /\.srt$/i.test(c.src);
const lenOf = (c: TimelineClip, fps: number) => Math.max(1, fr(c.out - c.in, fps));

/**
 * The words as a line keeps them: each row trimmed and its spaces made single, empty rows dropped, at most two rows
 * (a third and more join the second). Undefined when nothing is left.
 */
export function cleanText(raw: string): string | undefined {
  let rows = raw.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!rows.length) return undefined;
  if (rows.length > 2) rows = [rows[0], rows.slice(1).join(' ')];
  return rows.join('\n');
}
/** The words on one row, for a block on the timeline. */
export const oneRow = (text: string) => text.replace(/\s*\n\s*/g, ' / ');

/**
 * The words split at the word boundary nearest to `frac` of them (counted in letters), for the blade: the row
 * break, when it is the boundary, is kept on neither side. Undefined for a single word.
 */
export function splitText(text: string, frac: number): [string, string] | undefined {
  const parts = text.split(/(\s+)/).filter((x) => x !== '');
  const words: string[] = [], gaps: string[] = [];
  for (const p of parts) {
    if (/^\s+$/.test(p)) { if (words.length) gaps[words.length - 1] = p.includes('\n') ? '\n' : ' '; }
    else words.push(p);
  }
  if (words.length < 2) return undefined;
  const total = words.reduce((n, w) => n + w.length, 0);
  const want = Math.max(0, Math.min(1, frac)) * total;
  let best = 1, bestD = Infinity, seen = 0;
  for (let k = 1; k < words.length; k++) {
    seen += words[k - 1].length;
    const d = Math.abs(seen - want);
    if (d < bestD) { best = k; bestD = d; }
  }
  const join = (a: number, b: number) => words.slice(a, b).map((w, i) => (i ? (gaps[a + i - 1] ?? ' ') + w : w)).join('');
  return [join(0, best), join(best, words.length)];
}

// ---- lines from and to SRT

let seq = 0;
/** A new line id: "s" and a stamp, unique on this page. */
export const lineId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Text lines from cues on the film's clock (`offset` seconds added), each on whole frames, at least a frame long. A
 * cue that starts before the one before it ends shortens that one (two lines never overlap on a track); a cue with no
 * words is left out.
 */
export function cuesToLines(cues: Cue[], fps: number, offset = 0, id: () => string = lineId): TimelineClip[] {
  const out: TimelineClip[] = [];
  const sorted = [...cues].sort((x, y) => x.a - y.a);
  for (const q of sorted) {
    const text = cleanText(q.lines.join('\n'));
    if (!text) continue;
    const a = Math.max(0, fr(q.a + offset, fps));
    const b = Math.max(a + 1, fr(q.b + offset, fps));
    const prev = out[out.length - 1];
    if (prev) {
      const ps = fr(prev.at, fps), pe = ps + lenOf(prev, fps);
      if (pe > a) {
        if (a - ps < 1) out.pop();
        else prev.out = toS(a - ps, fps);
      }
    }
    out.push({ id: id(), text, in: 0, out: toS(b - a, fps), at: toS(a, fps) });
  }
  return out;
}

/** The cues an .srt clip shows on the film's clock: its file's cues inside its in and out, moved to where it sits. */
export function srtClipCues(c: TimelineClip, srt: string): Cue[] {
  const out: Cue[] = [];
  for (const q of parseSrt(srt)) {
    const a = Math.max(q.a, c.in), b = Math.min(q.b, c.out);
    if (b > a) out.push({ a: c.at + a - c.in, b: c.at + b - c.in, lines: q.lines });
  }
  return out;
}

/** The text lines of a track as an .srt file, numbered in time order, times from the cut. Muted lines are left out. */
export function linesToSrt(clips: TimelineClip[], fps: number): string {
  const lines = clips.filter((c) => isLine(c) && !c.muted).sort((a, b) => a.at - b.at);
  return lines.map((c, i) => {
    const s = fr(c.at, fps), e = s + lenOf(c, fps);
    return `${i + 1}\n${srtStamp(s, fps)} --> ${srtStamp(e, fps)}\n${c.text}\n`;
  }).join('\n');
}

// ---- the line under a frame

export interface Shown { id: string; from: number; to: number; text: string }

/** The lines the player and the render show: every text line of every captions track that is not muted, in time
 *  order. (An .srt clip's cues are added by whoever has read its file.) */
export function shownLines(tl: Timeline): Shown[] {
  const fps = tl.fps;
  const out: Shown[] = [];
  for (const t of tl.tracks) {
    if (t.kind !== 'captions' || t.muted) continue;
    for (const c of t.clips) if (isLine(c) && !c.muted) { const s = fr(c.at, fps); out.push({ id: c.id, from: s, to: s + lenOf(c, fps), text: c.text! }); }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The line at frame f, found by halving (the list is in time order and lines do not overlap on a track). */
export function lineAt(lines: Shown[], f: number): Shown | undefined {
  let lo = 0, hi = lines.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].from <= f) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  // two tracks of lines can overlap: the latest that started and still runs
  for (let i = hit; i >= 0 && i > hit - 4; i--) if (lines[i].from <= f && lines[i].to > f) return lines[i];
  return undefined;
}

// ---- when the film changes under the lines

/**
 * What a change of the picture does to the film's clock, in frames:
 *   cut     the stretch [from, to) is gone and what follows closes up (a delete, a shorter shot, a head trimmed);
 *   open    `d` frames are put in at `at` and what follows moves on (a longer shot, a head grown back);
 *   scale   the stretch [from, to) now lasts to `newTo` (a shot played faster or slower) and what follows moves by
 *           the difference.
 */
export type FilmChange = { kind: 'cut'; from: number; to: number } | { kind: 'open'; at: number; d: number } | { kind: 'scale'; from: number; to: number; newTo: number };

/** The change a ripple of `d` frames from frame `from` stands for (d < 0: the stretch before `from` went). */
export const rippleChange = (from: number, d: number): FilmChange => (d < 0 ? { kind: 'cut', from: from + d, to: from } : { kind: 'open', at: from, d });

/**
 * The lines of a captions track follow the film (ARCHITECTURE.md "Subtitle lines"): a line after the change moves with
 * what follows; a line wholly inside a stretch that went goes with it; one that straddles a cut is shortened to what
 * is left (an .srt clip over the cut is split in two, so its words stay on the lips); inside a shot played faster or
 * slower a line keeps its place in the shot. Mutates the track.
 */
export function followFilm(t: TimelineTrack, ch: FilmChange, fps: number): void {
  const next: TimelineClip[] = [];
  for (const c of t.clips) {
    const s = fr(c.at, fps), e = s + lenOf(c, fps);
    const text = isLine(c);
    const put = (at: number, len: number, inPlus = 0) => {
      if (len < 1) return;
      const k: TimelineClip = { ...c, at: toS(at, fps) };
      if (text) { k.in = 0; k.out = toS(len, fps); }
      else { k.in = r6(c.in + inPlus / fps); k.out = r6(k.in + len / fps); }
      next.push(k);
    };
    if (ch.kind === 'open') {
      next.push(s >= ch.at ? { ...c, at: toS(s + ch.d, fps) } : c);
      continue;
    }
    if (ch.kind === 'scale') {
      const { from, to, newTo } = ch;
      const map = (x: number) => (x <= from ? x : x <= to ? from + Math.round(((x - from) * (newTo - from)) / Math.max(1, to - from)) : x + newTo - to);
      if (s >= to) next.push({ ...c, at: toS(s + newTo - to, fps) });
      else if (e <= from || !text) next.push(c);
      else { const a = map(s), b = Math.max(a + 1, map(e)); put(a, b - a); }
      continue;
    }
    const { from: r0, to: r1 } = ch, gone = r1 - r0;
    if (gone <= 0 || e <= r0) next.push(c);
    else if (s >= r1) next.push({ ...c, at: toS(s - gone, fps) });
    else if (s >= r0 && e <= r1) continue;                       // wholly inside what went
    else if (s < r0 && e > r1) {                                 // over the whole stretch
      if (text) put(s, e - s - gone);
      else { put(s, r0 - s); const right = next.length; put(r0, e - r1, r1 - s); if (next[right]) next[right] = { ...next[right], id: `${c.id}~${r1}` }; }
    } else if (s < r0) put(s, r0 - s);                            // its end went
    else put(r0, e - r1, r1 - s);                                 // its start went
  }
  t.clips = next.sort((a, b) => a.at - b.at);
}
