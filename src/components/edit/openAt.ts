// The Edit page opened at the thing a decision is about. A card's button or one of Alma's links carries the place in the page's address:
//   page:edit?clip=<clip id>                 that clip selected, the playhead a second before it
//   page:edit?t=<seconds>  /  ?at=<frame>    the playhead there
//   page:edit?take=<take>[&shot=S4:7]        the take in its shot's place, shown and not in the film (the Takes view's
//                                            selection, `picks`), the playhead a second before it
//   page:edit?sound=<name>&try=<n>           the sound's clip selected and that try heard in its place (the options'
//                                            listening view), the playhead a second before it
// Nothing is saved: the user keeps a take with "Use in the film" and a try with Enter, as always. What is not found
// leaves the page as it is, and the toolbar's line says so. This file reads the address and finds the place; the page
// applies it. Pure: scripts/openat-test.ts.
// Also here: the takes that landed after the one a shot of the cut uses, never looked at (`newTakes`), for the clip's
// quiet "1 new take" mark.
import type { Timeline, TimelineClip } from '@/server/types';
import { OPEN_KEYS } from './cutLink';
import { startF, endF, type ClipRef } from './model';
import { inFilm, mainTracks, ownShotOf, pickKey, samePlace, sceneOf, shotKey, shotNo, shotOf, shotsOf, subTag, withPicks, type BySrc, type Pick, type Shot, type TakeShots } from './shots';
import { parseShotId } from './shotCols';
import { layoutInCut, layoutOfTake, layoutShotOfTake, sameShotIn, type Layout } from './layouts';
import type { SoundOption } from './Options';

// ---- the address

export { OPEN_KEYS };

/** A scene's shot as a link names it: "S4:7", "S4:7b", "S4 shot 7", "S4#7". */
export interface ShotAt { scene: string; n: number; tag?: string }
export function parseShotAt(raw: string | null | undefined): ShotAt | undefined {
  const m = raw ? /^\s*(S\d+)\s*(?::|#|·|\s)\s*(?:shot\s*)?(\d+[a-z]?)\s*$/i.exec(raw) : null;
  const id = m ? parseShotId(m[2]) : undefined;
  if (!m || !id) return undefined;
  return { scene: m[1].toUpperCase(), n: id.n, ...(id.tag !== String(id.n) ? { tag: id.tag } : {}) };
}

export interface OpenAt { clip?: string; t?: number; at?: number; take?: string; shot?: ShotAt; sound?: string; try?: number }

const text = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
const num = (v: string | null, int = false) => {
  if (v === null || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && (!int || Number.isInteger(n)) ? n : undefined;
};

/** Whether the address asks for a place (any of OPEN_KEYS). */
export const hasOpenAt = (q: URLSearchParams): boolean => OPEN_KEYS.some((k) => q.has(k));

/** What the address asks for; undefined when it asks for nothing this file knows. */
export function readOpenAt(q: URLSearchParams): OpenAt | undefined {
  const o: OpenAt = {};
  const clip = text(q.get('clip')), take = text(q.get('take')), sound = text(q.get('sound'));
  const t = num(q.get('t')), at = num(q.get('at'), true), tr = num(q.get('try'), true), shot = parseShotAt(q.get('shot'));
  if (clip) o.clip = clip;
  if (t !== undefined) o.t = t;
  if (at !== undefined) o.at = at;
  if (take) o.take = take;
  if (shot) o.shot = shot;
  if (sound) o.sound = sound;
  if (tr !== undefined && tr >= 1) o.try = tr;
  return Object.keys(o).length ? o : undefined;
}

/** The address without the keys of this file (the others, `?tab=` among them, stay). */
export function withoutOpenAt(href: string): string {
  const u = new URL(href);
  for (const k of OPEN_KEYS) u.searchParams.delete(k);
  return u.href;
}

// ---- finding the place

/** What the page needs to find a place: the cut as shown (cut into shots), the takes, the options of its sounds. */
export interface OpenCtx {
  tl: Timeline;
  by: BySrc;
  takes: TakeShots[];
  names: Map<string, string>;
  order?: string[];
  options: Map<string, SoundOption[]>;
  layouts?: Map<string, Layout[]>;
  /** The page waited long enough: what is still missing is not found (the takes and the options load after the cut). */
  final: boolean;
}

/** Where the page goes. `frame`: the playhead; `span`: the frames to bring into view; `say`: the toolbar's line. */
export type Opened =
  | { kind: 'wait' }
  | { kind: 'frame'; frame: number; say?: string }
  | { kind: 'clip'; ref: ClipRef; frame: number; span: [number, number]; say?: string }
  | { kind: 'sound'; ref: ClipRef; frame: number; span: [number, number]; hear?: string; say: string }
  | { kind: 'take'; picks: Pick[]; frame: number; span: [number, number]; say: string }
  | { kind: 'none'; frame?: number; say: string };

/** A second before a frame, never before the film's start. */
const lead = (f: number, fps: number) => Math.max(0, f - fps);
const SOUND = /\.(wav|mp3|m4a|aac|aiff?|flac|ogg)$/i;
const dirOf = (src = '') => src.slice(0, Math.max(0, src.lastIndexOf('/')));
const baseOf = (src = '') => src.slice(src.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
/** sfx.py's slug: lower case, every run of other characters one hyphen. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/** A sound file's name without its try: "crowd-laugh-long-try3-tight" → "crowd-laugh-long", "title-boom-9" → "title-boom". */
const soundStem = (src: string) => slug(baseOf(src).replace(/[-_ ]*try[-_ ]?\d+.*$/i, '').replace(/[-_ ]+\d+$/, ''));
/** The try number of an option: "try3", "try 3 tight", else the number its name ends in ("title boom 10"). */
export function tryOf(o: { name: string; src: string }): number | undefined {
  for (const s of [o.name, baseOf(o.src)]) {
    const m = /try[-_ ]?(\d+)/i.exec(s) ?? /(?:^|[-_ ])(\d+)$/.exec(s);
    if (m) return Number(m[1]);
  }
  return undefined;
}
const own = (o: SoundOption, src?: string) => !!src && (o.src === src || o.files.includes(src));
const clipSpan = (c: TimelineClip, fps: number): [number, number] => [startF(c, fps), endF(c, fps)];

/** Every clip of the cut with its track, in the order of the tracks. */
function* allClips(tl: Timeline) { for (const t of tl.tracks) for (const c of t.clips) yield { t, c }; }

function moment(o: OpenAt, fps: number): number | undefined {
  return o.at !== undefined ? Math.round(o.at) : o.t !== undefined ? Math.round(o.t * fps) : undefined;
}

/** The take a link names: its file (whole, or the end of its path), "S4-take2", "S4 take 2", "FIX-S4-tap · take 3",
 *  or its name in the Takes view. A take of the scene `shot` names first; one ready before one still being read. */
export function findTake(takes: TakeShots[], raw: string, scene?: string): TakeShots | undefined {
  const s = raw.trim().replace(/^\.?\//, '');
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const want = norm(s.replace(/\.[a-z0-9]+$/i, '').replace(/-\d{3,4}p$/i, ''));
  const keys = (t: TakeShots): string[] => {
    const m = /(?:^|\/)(?:generations|blocks)\/([^/]+)\/takes\/(take[^/]*?)(?:\/|$)/.exec(t.src);
    const file = baseOf(t.src).replace(/-\d{3,4}p$/i, '');
    return [m ? norm(`${m[1]}${m[2]}`) : '', norm(file), norm(t.name), norm(`${t.scene} ${t.name}`)].filter(Boolean);
  };
  const hits = takes.filter((t) => t.src === s || t.src.endsWith(`/${s}`) || (want && keys(t).includes(want)));
  const rank = (t: TakeShots) => (scene && t.scene === scene ? 0 : 2) + (t.state === 'ready' ? 0 : 1);
  return [...hits].sort((a, b) => rank(a) - rank(b))[0];
}

/** Where shot `n` of take `t` goes when the take is of another layout than the one its scene uses in the cut (as the
 *  Takes view's click puts it, EditPage swapOf): undefined for a take of the layout in use. */
export function intoOf(tl: Timeline, layouts: Map<string, Layout[]> | undefined, t: TakeShots, n: number, tag?: string): Pick['into'] {
  const ls = layouts?.get(t.scene);
  const into = ls ? layoutInCut(tl, t.scene, ls) : undefined;
  const from = ls ? layoutOfTake(ls, t.src) : undefined;
  const sh = shotOf(t, n, tag);
  if (!into || !from || !sh || from.key === into.key) return undefined;
  const ls1 = layoutShotOfTake(from, shotsOf(t), sh.i);
  const same = ls1 ? sameShotIn(ls1, into) : undefined;
  return { to: same?.n ?? Math.min(n, into.shots.length), layout: into.key };
}

const shotWords = (scene: string, ss: Shot[]) => `${scene} ${ss.length === 1 ? 'shot' : 'shots'} ${ss.map((s) => subTag(s) ?? String(s.n)).join(', ')}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Where the page goes for what the address asks. "wait": something it needs has not loaded yet (and `final` is not set). */
export function resolveOpenAt(o: OpenAt, x: OpenCtx): Opened {
  const { tl, by } = x;
  const fps = tl.fps;
  const at = moment(o, fps);
  const missing = (say: string): Opened => ({ kind: 'none', say, ...(at !== undefined ? { frame: lead(at, fps) } : {}) });

  if (o.sound) {
    const name = slug(o.sound);
    const hits = [...allClips(tl)].filter(({ t, c }) => t.kind === 'audio' && !!c.src && SOUND.test(c.src) && (slug(dirOf(c.src).split('/').pop() ?? '') === name || soundStem(c.src) === name));
    // the one nearest the moment the link gives, else the first
    const hit = at !== undefined ? [...hits].sort((a, b) => Math.abs(startF(a.c, fps) - at) - Math.abs(startF(b.c, fps) - at))[0] : hits.sort((a, b) => startF(a.c, fps) - startF(b.c, fps))[0];
    if (!hit) return missing(`The sound “${o.sound}” is not on the timeline yet${at !== undefined ? ': the playhead is at its planned place' : ''}.`);
    const ref = { trackId: hit.t.id, clipId: hit.c.id };
    const base = { kind: 'sound' as const, ref, frame: lead(startF(hit.c, fps), fps), span: clipSpan(hit.c, fps) };
    if (o.try === undefined) return { ...base, say: `${cap(o.sound)} is selected on ${hit.t.id} ${hit.t.name}. Press play to hear it in the cut.` };
    const opts = x.options.get(dirOf(hit.c.src));
    if (!opts && !x.final) return { kind: 'wait' };
    const opt = opts?.find((k) => tryOf(k) === o.try);
    if (!opt) return { ...base, say: `Try ${o.try} of ${o.sound} was not found; the sound is selected at its place.` };
    if (own(opt, hit.c.src)) return { ...base, say: `Try ${o.try} of ${o.sound} is the one in the cut. Press play to hear it.` };
    return { ...base, hear: opt.src, say: `Try ${o.try} of ${o.sound} is in its place, not in the cut yet. Press play to hear it; Enter uses it, Esc goes back.` };
  }

  if (o.take) {
    if (!x.takes.length && !x.final) return { kind: 'wait' };
    const take = findTake(x.takes, o.take, o.shot?.scene);
    if (!take) return missing(`The take “${o.take}” was not found among the film's takes.`);
    if (take.state !== 'ready') {
      if (take.state === 'waiting' && !x.final) return { kind: 'wait' };
      return missing(`${take.scene} · ${take.name} ${take.state === 'waiting' ? 'is still being cut into its shots' : take.state === 'making' ? 'is still being made' : 'could not be read'}: try again in a moment.`);
    }
    const name = x.names.get(take.src) ?? take.name;
    const all = shotsOf(take);
    const want = o.shot ? all.filter((s) => s.n === o.shot!.n && (!o.shot!.tag || (s.tag ?? String(s.n)) === o.shot!.tag)) : all;
    if (!want.length) return missing(`${take.scene} · ${name} has no shot ${o.shot ? (o.shot.tag ?? o.shot.n) : ''}.`.replace(' .', '.'));
    const used = inFilm(tl, by);
    const fresh = want.filter((s) => !used.has(shotKey(take.src, s)));
    if (!fresh.length) {
      // the film uses it already: its clip, selected
      const v = mainTracks(tl).v;
      const c = v?.clips.find((k) => k.src === take.src && want.some((s) => ownShotOf(k, by)?.i === s.i));
      if (v && c) return { kind: 'clip', ref: { trackId: v.id, clipId: c.id }, frame: lead(startF(c, fps), fps), span: clipSpan(c, fps), say: `${shotWords(take.scene, want)} of ${name} is in the cut already.` };
      return missing(`${shotWords(take.scene, want)} of ${name} is in the cut already.`);
    }
    const picks: Pick[] = fresh.map((s) => {
      const tag = subTag(s);
      const into = intoOf(tl, x.layouts, take, s.n, tag);
      return { scene: take.scene, n: s.n, src: take.src, ...(into ? { into } : {}), ...(tag ? { tag } : {}) };
    });
    const e = withPicks(tl, picks, by, x.names, 'try', x.order);
    if (!e) return missing(`${shotWords(take.scene, fresh)} of ${name} could not be put in its place (a locked track?).`);
    const from = Math.min(...e.placed.map((p) => p.at)), to = Math.max(...e.placed.map((p) => p.at + p.frames));
    return { kind: 'take', picks, frame: lead(from, fps), span: [from, to], say: `${shotWords(take.scene, fresh)} of ${name} ${fresh.length === 1 ? 'is' : 'are'} in place, not in the film yet. Press play to see it; Use in the film keeps it, Back to the film drops it.` };
  }

  if (o.clip) {
    // "A4:s-laugh2" (a track and a clip, as the page's own words name one) or the clip's id alone
    const [tid, cid] = o.clip.includes(':') ? o.clip.split(':', 2) : [undefined, o.clip];
    const hit = [...allClips(tl)].find(({ t, c }) => c.id === cid && (!tid || t.id === tid));
    if (!hit) return missing(`The clip “${o.clip}” is not on the timeline.`);
    return { kind: 'clip', ref: { trackId: hit.t.id, clipId: hit.c.id }, frame: lead(startF(hit.c, fps), fps), span: clipSpan(hit.c, fps) };
  }

  if (at !== undefined) return { kind: 'frame', frame: at };
  return { kind: 'none', say: 'The link names no place on the cut.' };
}

// ---- a take newer than the cut's, never looked at

/** A shot of the cut with takes that landed after the one it uses and were never looked at: the newest of them. */
export interface NewTake { trackId: string; clipId: string; count: number; pick: Pick; name: string }

/** Per picture clip of the cut, by clip id: the takes of its scene that have its shot, landed after its own take (their
 *  `made`), are not in the film and were never tried here (`seen`, pickKeys). One clip a shot (a shot cut in two is
 *  marked on its first piece). Takes with no `made` are never counted. */
export function newTakes(tl: Timeline, by: BySrc, takes: TakeShots[], seen: Set<string>): Map<string, NewTake> {
  const out = new Map<string, NewTake>();
  const v = mainTracks(tl).v;
  if (!v) return out;
  const used = inFilm(tl, by);
  const done = new Set<string>();
  for (const c of [...v.clips].sort((a, b) => a.at - b.at)) {
    if (c.plan || c.muted || !c.src) continue;
    const cur = by.get(c.src), scene = sceneOf(c, by), s = ownShotOf(c, by), n = shotNo(c, by);
    if (!cur?.made || !scene || !s || !n) continue;
    const here: Pick = { scene, n, src: c.src, ...(subTag(s) ? { tag: subTag(s) } : {}) };
    const place = `${scene}#${subTag(s) ?? n}`;
    if (done.has(place)) continue;
    done.add(place);
    const found: { t: TakeShots; p: Pick }[] = [];
    for (const t of takes) {
      if (t.state !== 'ready' || t.scene !== scene || t.src === c.src || !t.made || t.made <= cur.made) continue;
      const sh = shotsOf(t).find((x) => { const tag = subTag(x); return samePlace({ scene, n: x.n, src: t.src, ...(tag ? { tag } : {}) }, here); });
      if (!sh) continue;
      const p: Pick = { scene, n: sh.n, src: t.src, ...(subTag(sh) ? { tag: subTag(sh) } : {}) };
      if (seen.has(pickKey(p)) || used.has(shotKey(t.src, sh))) continue;
      found.push({ t, p });
    }
    if (!found.length) continue;
    found.sort((a, b) => (b.t.made ?? 0) - (a.t.made ?? 0));
    out.set(c.id, { trackId: v.id, clipId: c.id, count: found.length, pick: found[0].p, name: found[0].t.name });
  }
  return out;
}
