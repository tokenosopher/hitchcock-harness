// Bookmarks: the
// cut's markers (Timeline.markers, the same ones "Marker here" and the Notes panel make), made quick. M drops one at the
// playhead with no name, [ and ] go to the previous and next one, and each is a flag on the ruler that can be clicked,
// dragged, renamed and deleted. Pure functions on a Timeline; each edit is one step of the cut, as every edit is.
import type { Timeline, TimelineMarker } from '@/server/types';
import { addMarker, toF, type Edit } from './model';

const clone = (tl: Timeline): Timeline => JSON.parse(JSON.stringify(tl)) as Timeline;
const toS = (f: number, fps: number) => Math.round((f / fps) * 1e6) / 1e6;

/** A marker with no words is a bookmark the user dropped with M and has not named yet. */
export const unnamed = (m: TimelineMarker) => !m.text.trim();
/** What a marker is called on the page: its words, or "Bookmark" when it has none. */
export const markerName = (m: TimelineMarker) => m.text.trim() || 'Bookmark';

/** The marker to go to from `frame`: the first one after it (dir 1) or the last one before it (dir -1), by index in
 *  `tl.markers`. It stops at the ends (undefined there): a jump never wraps round to the other end of the film. */
export function nextMarker(tl: { markers: TimelineMarker[]; fps: number }, frame: number, dir: 1 | -1): number | undefined {
  const ms = tl.markers.map((m, i) => ({ f: toF(m.at, tl.fps), i }));
  if (dir > 0) return ms.filter((m) => m.f > frame).sort((a, b) => a.f - b.f || a.i - b.i)[0]?.i;
  return ms.filter((m) => m.f < frame).sort((a, b) => b.f - a.f || a.i - b.i)[0]?.i;
}

/** Sort the markers by time, keeping the order of those at the same time, and answer where `m` ended up. */
const resort = (tl: Timeline, m: TimelineMarker) => {
  tl.markers = tl.markers.map((x, k) => ({ x, k })).sort((a, b) => a.x.at - b.x.at || a.k - b.k).map((y) => y.x);
  return tl.markers.indexOf(m);
};

/** A bookmark at frame `f`: no name (M), or with words (the Notes panel's "+ Marker here" goes through addMarker). */
export function addBookmark(tl0: Timeline, f: number, text = ''): { edit: Edit; i: number } {
  const t = text.trim();
  if (t) {
    const edit = addMarker(tl0, f, t);
    const at = toS(f, tl0.fps);
    // the new one is the last at its time (a stable sort put it after the ones already there)
    let i = -1;
    edit.tl.markers.forEach((m, k) => { if (m.at === at && m.text === t) i = k; });
    return { edit, i };
  }
  const tl = clone(tl0);
  const m: TimelineMarker = { at: toS(Math.max(0, f), tl.fps), text: '', by: 'user' };
  tl.markers.push(m);
  const i = resort(tl, m);
  return { edit: { tl, note: `bookmark at ${f} f` }, i };
}

/** Move marker `i` to frame `f` (whole frames, never before the start). Undefined when it is already there. */
export function moveMarker(tl0: Timeline, i: number, f: number): { edit: Edit; i: number } | undefined {
  const m0 = tl0.markers[i];
  if (!m0) return undefined;
  const to = Math.max(0, Math.round(f));
  const from = toF(m0.at, tl0.fps);
  if (to === from) return undefined;
  const tl = clone(tl0);
  const m = tl.markers[i];
  m.at = toS(to, tl.fps);
  const j = resort(tl, m);
  return { edit: { tl, note: `moved ${unnamed(m0) ? 'a bookmark' : `the marker “${m0.text.trim()}”`} from ${from} f to ${to} f` }, i: j };
}

/** Give marker `i` new words ('' makes it a bookmark with no name again). Undefined when nothing changes. */
export function renameMarker(tl0: Timeline, i: number, text: string): Edit | undefined {
  const m0 = tl0.markers[i];
  const t = text.trim().replace(/\s+/g, ' ');
  if (!m0 || t === m0.text.trim()) return undefined;
  const tl = clone(tl0);
  tl.markers[i].text = t;
  const f = toF(m0.at, tl0.fps);
  return { tl, note: t ? `named the ${unnamed(m0) ? 'bookmark' : 'marker'} at ${f} f: ${t}` : `took the name off the marker at ${f} f` };
}

/** Take marker `i` out of the cut. */
export function deleteMarker(tl0: Timeline, i: number): Edit | undefined {
  const m0 = tl0.markers[i];
  if (!m0) return undefined;
  const tl = clone(tl0);
  tl.markers.splice(i, 1);
  return { tl, note: `deleted the ${unnamed(m0) ? 'bookmark' : `marker “${m0.text.trim()}”`} at ${toF(m0.at, tl0.fps)} f` };
}

export interface FlagPlace { i: number; x: number; row: 0 | 1; label?: string; labelW: number }
/** Where each flag sits on the ruler at `z` px a frame, and how much of its name fits. A flag closer than FLAG_GAP px
 *  to the one before it in its row goes up a row, so two close together are both seen and both can be clicked; a name
 *  runs to the next flag of its row (at most LABEL_MAX px) and is left off when under LABEL_MIN px fit. */
export const FLAG_GAP = 12, LABEL_MAX = 120, LABEL_MIN = 22;
export function flagPlaces(tl: { markers: TimelineMarker[]; fps: number }, z: number): FlagPlace[] {
  const xs = tl.markers.map((m, i) => ({ i, x: toF(m.at, tl.fps) * z })).sort((a, b) => a.x - b.x || a.i - b.i);
  const last: [number, number] = [-Infinity, -Infinity];
  const out: FlagPlace[] = xs.map(({ i, x }) => {
    const row: 0 | 1 = x - last[0] >= FLAG_GAP ? 0 : x - last[1] >= FLAG_GAP ? 1 : 0;
    last[row] = x;
    return { i, x, row, labelW: 0 };
  });
  for (let k = 0; k < out.length; k++) {
    const p = out[k], m = tl.markers[p.i];
    if (unnamed(m)) continue;
    const next = out.slice(k + 1).find((q) => q.row === p.row);
    const room = Math.min(LABEL_MAX, (next ? next.x : Infinity) - p.x - 8);
    if (room >= LABEL_MIN) { p.label = m.text.trim(); p.labelW = room; }
  }
  return out;
}
