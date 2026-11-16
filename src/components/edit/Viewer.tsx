'use client';
// The viewer. The Edit page's player always plays the cut live (14 Nov, ASKS 44: the 480p is no
// longer rendered after every change, and the player no longer swaps to a file when one lands): two <video> elements,
// the next stretch loaded ahead on the one not shown, a dissolve drawn by showing both over its frames, under the live
// mix of the sound tracks. In the 1080p view (13 Nov 2026, ASKS 37) the same two elements play the full-size pieces
// (fullsize.ts: a take's own 1080p file, the cut's upscaled base, else the 480p). A rendered file is played whole
// (FileViewer) only on the phone, which decodes one file far better than many takes with a live mix.
// The page owns the playhead (in frames) and the rate (J/K/L: −4…4, 0 = paused); the viewer follows them
// and reports where playback has got to.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Timeline, TimelineClip } from '@/server/types';
import { mediaUrl } from '@/components/media/Media';
import { endF, pictureSegments, speedOf, startF } from './model';
import { dissolveJoins, placeClip, picturePieces, videoLayout, type FullBase, type FullInfo, type Piece, type Placed } from './fullsize';
import { levelAt } from './controls';

interface Props {
  tl: Timeline;
  frame: number;
  rate: number;
  total: number;
  /** A rendered file to play whole instead of the cut (the phone's 480p), relative to the film repo. */
  file?: string;
  onFrame: (f: number) => void;
  onEnd: () => void;
  className?: string;
  /** Tracks the user is listening to alone (the S buttons): a way of listening, never saved in the cut. */
  solo?: Set<string>;
  /** The 1080p view: where the full-size picture is (fullsize.ts); the picture plays as picturePieces of `tl`. */
  full?: { info: FullInfo; base?: { b: FullBase; tl: Timeline } };
  /** Told while the file at the playhead is still loading (true) and once it plays (false). */
  onLoading?: (loading: boolean) => void;
}

interface Voice { el: HTMLAudioElement; gain?: GainNode; src?: string; wired?: boolean }
/** The element has loaded everything from where it is to the end of its file (at a file's end there is no more data to
 *  wait for, so it never reports that it can play on). */
const loadedToEnd = (el: HTMLMediaElement): boolean => {
  const t = el.currentTime, end = el.duration;
  if (!Number.isFinite(end)) return false;
  if (t >= end - 0.05) return true;
  for (let k = 0; k < el.buffered.length; k++) if (el.buffered.start(k) <= t + 0.05 && el.buffered.end(k) >= end - 0.05) return true;
  return false;
};
interface Heard { c: TimelineClip; from: number; to: number }
/** A cross-fade at a join of a sound track (the later clip's `dissolve`, render.ts): from frame `a` to `b`, the clip
 *  before fading out and the one after fading in, both linear over the same D frames. */
interface Cross { a: number; b: number; D: number; out: Heard; inn: Heard }
/** The sound of the cut, mixed here from its sound tracks (13 Nov 2026: "If I press the S button where there
 *  are effects, I can still hear … the voice"). Played from the takes, the picture's own sound used to be all
 *  that was heard, whatever the tracks said. Now the picture is silent and every sound track plays its own
 *  clips at their level and fades; a muted track is silent, and with a track soloed only the soloed ones are
 *  heard. Each track has two players, so the next clip of another file is ready before it starts, and at a join with a
 *  cross-fade both play, as the render mixes them (14 Nov); a join without one cuts straight, as in the render. */
function useAudioMix(tl: Timeline, solo?: Set<string>) {
  const fps = tl.fps;
  // `levels`: each track's level (0…, linear) at the last frame mixed, the clip's level points and fades included, both
  // clips of a cross-fade added; `parts`: the clips heard on each track and their levels. Read by the browser tests
  // through window.__hhMix
  const st = useRef<{ ctx?: AudioContext; voices: Map<string, { pair: [Voice, Voice]; front: 0 | 1 }>; levels: Record<string, number>; parts: Record<string, { clip: string; level: number }[]> }>({ voices: new Map(), levels: {}, parts: {} });
  const tracks = useMemo(() => {
    const audio = tl.tracks.filter((t) => t.kind === 'audio');
    const mine = solo && solo.size ? audio.filter((t) => solo.has(t.id)) : [];
    const saved = audio.filter((t) => t.solo && !t.muted);
    const heard = new Set((mine.length ? mine : saved.length ? saved : audio.filter((t) => !t.muted)).map((t) => t.id));
    return audio.map((t) => {
      // the lines of the script on the Dialogue track (the timeline from day one) have no sound to play
      const clips: Heard[] = t.clips.filter((c) => !c.muted && !!c.src && !c.plan).map((c) => ({ c, from: startF(c, fps), to: endF(c, fps) })).sort((x, y) => x.from - y.from);
      // the joins as the render reads them (fullsize.ts dissolveJoins, on the clips placed by frame)
      const placed: Placed[] = clips.map((x, k) => placeClip(x.c, k, fps));
      const { joins } = dissolveJoins(placed, fps);
      const cross: Cross[] = joins.flatMap((j, i) => (j ? [{ a: placed[i].start - j.h1, b: placed[i].start + j.h2, D: j.D, out: clips[i - 1], inn: clips[i] }] : []));
      return { id: t.id, heard: heard.has(t.id), clips, cross };
    });
  }, [tl, solo, fps]);

  useEffect(() => {
    const s = st.current;
    return () => {
      for (const v of s.voices.values()) for (const x of v.pair) { x.el.pause(); x.el.removeAttribute('src'); x.el.load(); }
      s.voices.clear();
      void s.ctx?.close().catch(() => undefined);
      s.ctx = undefined;
    };
  }, []);

  // paused, the sounds heard at the playhead are parked there once it settles (17 Nov: they used to be made and moved
  // only when play was pressed, so play waited a third of a second for them; a scrub moves them once, not every frame)
  const park = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(park.current), []);
  const self = useRef<(f: number, playing: boolean, rate: number, settle?: boolean) => { ready: boolean; lag: number }>(undefined);

  /** Mixes frame f; answers whether every sound heard there can play now (`ready`) and how far the furthest one lags
   *  behind the frame, in seconds (`lag`), so the clock waits for the sound as it does for the picture (16 Nov).
   *  `settle` (paused): the levels now, the sounds parked at f once the playhead has stayed there PARK_MS. */
  const run = useCallback((f: number, playing: boolean, rate: number, settle = false): { ready: boolean; lag: number } => {
    const s = st.current;
    let ready = true, lag = 0;
    clearTimeout(park.current);
    const parkLater = settle && !playing;
    if (parkLater) park.current = setTimeout(() => self.current?.(f, false, rate), PARK_MS);
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __hhMix?: unknown }).__hhMix = s;
    if (playing && !s.ctx) { try { s.ctx = new AudioContext(); } catch { /* the players' own volume is used */ } }
    if (playing && s.ctx?.state === 'suspended') void s.ctx.resume().catch(() => undefined);
    const make = (): Voice => {
      const el = new Audio();
      el.preload = 'auto';
      const v: Voice = { el };
      wire(v);
      return v;
    };
    // through the mix's own gain once there is an audio context (made on the first play: a voice parked before that is
    // wired then)
    const wire = (v: Voice) => {
      if (!s.ctx || v.wired) return;
      v.wired = true;
      try { v.gain = s.ctx.createGain(); s.ctx.createMediaElementSource(v.el).connect(v.gain); v.gain.connect(s.ctx.destination); } catch { v.gain = undefined; }
    };
    // the source second under frame f (beyond the clip's ends too, for a cross-fade)
    const srcAt = (e: Heard) => e.c.in + ((f - e.from) * speedOf(e.c)) / fps;
    /** A clip's level at this frame: its gain and level points (at the source second under the frame, its speed
     *  counted), under its own fades (silent outside them, as ffmpeg's afade) and its share of a cross-fade. */
    const levelOf = (e: Heard, share: number) => {
      const len = e.to - e.from, pos = f - e.from;
      const fi = (e.c.fadeIn ?? 0) * fps, fo = (e.c.fadeOut ?? 0) * fps;
      const fade = Math.max(0, Math.min(1, fi > 0 ? pos / fi : 1, fo > 0 ? (len - pos) / fo : 1));
      return Math.pow(10, levelAt(e.c, srcAt(e)) / 20) * fade * share;
    };
    const drive = (v: Voice, e: Heard, level: number) => {
      wire(v);
      const url = mediaUrl(e.c.src ?? '');
      if (v.src !== url) { v.el.src = url; v.src = url; }
      const want = srcAt(e);
      // before the file's first second there is no sound (the render pads it with silence)
      const before = want < 0;
      const t = Math.max(0, want);
      if (Math.abs(v.el.currentTime - t) > (playing && !before ? 0.14 : 0.03)) { try { v.el.currentTime = t; } catch { /* not loaded yet */ } }
      const lv = before ? 0 : level;
      if (v.gain) v.gain.gain.value = lv; else v.el.volume = Math.max(0, Math.min(1, lv));
      if (playing && !before) { v.el.playbackRate = Math.max(0.25, Math.min(4, rate * speedOf(e.c))); if (v.el.paused) void v.el.play().catch(() => undefined); } else v.el.pause();
      // what the clock waits for: a sound that will come (no error) and is not there yet, or one playing behind
      if (!before && !v.el.error) {
        if (v.el.seeking || (v.el.readyState < 3 && !(v.el.readyState >= 2 && loadedToEnd(v.el)))) ready = false;
        else if (playing && !v.el.paused) lag = Math.max(lag, t - v.el.currentTime);
      }
    };
    for (const t of tracks) {
      const x = t.heard ? t.cross.find((d) => d.a <= f && d.b > f) : undefined;
      const k = x ? Math.max(0, Math.min(1, (f - x.a + 0.5) / x.D)) : 0;
      const cur = t.heard ? t.clips.find((c) => c.from <= f && c.to > f) : undefined;
      const main = x ? (cur === x.out || (!cur && f < x.inn.from) ? x.out : x.inn) : cur;
      const partner = x ? (main === x.out ? x.inn : x.out) : undefined;
      const shareOf = (e: Heard) => (!x ? 1 : e === x.inn ? k : 1 - k);
      const lm = main ? levelOf(main, shareOf(main)) : 0, lp = partner ? levelOf(partner, shareOf(partner)) : 0;
      s.levels[t.id] = lm + lp;
      s.parts[t.id] = [...(main ? [{ clip: main.c.id, level: lm }] : []), ...(partner ? [{ clip: partner.c.id, level: lp }] : [])];
      let slot = s.voices.get(t.id);
      if (parkLater) continue;
      if (!slot) { if (!playing && !main && !partner) continue; slot = { pair: [make(), make()], front: 0 }; s.voices.set(t.id, slot); }
      let fr = slot.pair[slot.front], bk = slot.pair[1 - slot.front];
      if (main) {
        const url = mediaUrl(main.c.src ?? '');
        if (fr.src !== url && bk.src === url) { slot.front = (1 - slot.front) as 0 | 1; [fr, bk] = [bk, fr]; }
        drive(fr, main, lm);
      } else fr.el.pause();
      if (partner) { drive(bk, partner, lp); continue; }
      bk.el.pause();
      // the next clip of this track, when it is another file: loaded and parked at its first frame
      const next = t.heard ? t.clips.find((c) => c.from > f) : undefined;
      if (playing && next && next.from - f < 4 * fps) {
        const nurl = mediaUrl((next.c.src ?? ''));
        if (fr.src !== nurl || !main) {
          if (bk.src !== nurl && fr.src !== nurl) { bk.el.src = nurl; bk.src = nurl; }
          if (bk.src === nurl && bk.el.readyState >= 1 && Math.abs(bk.el.currentTime - next.c.in) > 0.05) { try { bk.el.currentTime = next.c.in; } catch { /* loading */ } }
        }
      }
    }
    return { ready, lag };
  }, [tracks, fps]);
  useEffect(() => { self.current = run; }, [run]);
  return run;
}
const PARK_MS = 150;

export function Viewer(p: Props) {
  return p.file && !p.full ? <FileViewer {...p} file={p.file} /> : <CutViewer {...p} />;
}

/** One file (the phone's 480p): the video's own clock while playing forward, seeks otherwise. */
function FileViewer({ tl, frame, rate, total, file, onFrame, onEnd, className }: Props & { file: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const fps = tl.fps;
  const cb = useRef({ onFrame, onEnd, frame, rate });
  useEffect(() => { cb.current = { onFrame, onEnd, frame, rate }; });
  // The file is not at the playhead until it has loaded and been moved there. Until then the player must not
  // drive the playhead: a file that landed while the cut was playing used to report its own start, frame 0,
  // and the film jumped back to the beginning (the user, 13 Nov).
  const ready = useRef(false);

  // forward: the video plays and drives the playhead; reverse: the playhead walks back and the video seeks
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (rate > 0) {
      v.playbackRate = rate;
      if (ready.current) void v.play().catch(() => undefined);
    } else v.pause();
    if (rate === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!ready.current) { raf = requestAnimationFrame(tick); return; }
      let f: number;
      if (rate > 0) f = Math.round(v.currentTime * fps);
      else {
        f = Math.max(0, cb.current.frame + rate * dt * fps);
        v.currentTime = f / fps;
      }
      cb.current.onFrame(f);
      if ((rate > 0 && (v.ended || f >= total)) || (rate < 0 && f <= 0)) { cb.current.onEnd(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate, fps, total]);

  // paused: the playhead moved by a click, a key or a drag
  useEffect(() => {
    const v = ref.current;
    if (!v || rate !== 0) return;
    if (Math.abs(v.currentTime * fps - frame) >= 0.5) v.currentTime = frame / fps;
  }, [frame, rate, fps]);

  return (
    <video ref={ref} src={mediaUrl(file)} playsInline preload="auto" data-file={file} className={className} onEnded={() => onEnd()}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        v.currentTime = cb.current.frame / fps;
        ready.current = true;
        if (cb.current.rate > 0) { v.playbackRate = cb.current.rate; void v.play().catch(() => undefined); }
      }} />
  );
}

/** What the player has at a frame: the stretch (`at`), whether its picture is on screen and can play, how far it runs
 *  behind, whether the sounds there can play and how far they run behind, how much of the picture is loaded ahead. */
interface Shown { at: number; frame: boolean; pic: boolean; picLag: number; snd: boolean; sndLag: number; ahead: number }
/** The longest a hold waits for a sound (the picture ready), and for a picture, before playing on without it. */
const HOLD_SOUND = 8000, HOLD_PICTURE = 15000, GRACE = 120;

/** The cut played from its sources. Two elements; the one not on screen holds the next stretch, or, over a dissolve,
 *  the other picture of it. */
function CutViewer({ tl, frame, rate, total, onFrame, onEnd, className, solo, full, onLoading }: Props) {
  const fps = tl.fps;
  const mix = useAudioMix(tl, solo);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const front = useRef<0 | 1>(0);
  // the stretches to play: the 1080p view's pieces, else each picture clip from its own file
  const pieces = useMemo(() => (full ? picturePieces(tl, full.info, full.base) : undefined), [tl, full]);
  // a planned shot or a board is drawn over the player (PlannedView), never played as a file
  const live = useMemo(() => (tl.tracks.some((t) => t.clips.some((c) => c.plan)) ? { ...tl, tracks: tl.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !c.plan) })) } : tl), [tl]);
  const segs = useMemo<Piece[]>(() => pieces ?? pictureSegments(live).map((g) => ({ from: g.from, to: g.to, src: g.clip.src ?? '', clip: g.clip,
    t0: g.clip.in + ((g.from - startF(g.clip, fps)) * speedOf(g.clip)) / fps, rate: speedOf(g.clip), kind: 'small' as const, drawn: true, label: '' })), [pieces, live, fps]);
  // the dissolves the render draws (fullsize.ts videoLayout): their frames [a, b), the clip before and the clip after
  const dissolves = useMemo(() => videoLayout(live).flatMap((L) => L.joins.flatMap((j, i) => (j ? [{ a: L.clips[i].start - j.h1, b: L.clips[i].start + j.h2, D: j.D, out: L.clips[i - 1].c, inn: L.clips[i].c, at: L.clips[i].start }] : []))), [live]);
  const cb = useRef({ onFrame, onEnd, frame });
  const rateRef = useRef(rate);
  const exact = useRef<number>(undefined);
  useEffect(() => { cb.current = { onFrame, onEnd, frame }; rateRef.current = rate; });

  const segAt = (f: number) => segs.findIndex((s) => s.from <= f && s.to > f);
  const els = () => [a.current, b.current] as const;
  const srcOf = (p: Piece) => mediaUrl(p.src);
  // the file's time under timeline frame f: the stretch's own start in its file, at its rate (before or after the
  // stretch too, for the other picture of a dissolve)
  const timeIn = (seg: Piece, f: number) => seg.t0 + ((f - seg.from) * seg.rate) / fps;
  /** A clip's picture level at frame f under its own fades, as the render draws them (black outside a fade, so a
   *  clip with a fade in shows nothing before it starts, even in a dissolve). */
  const dimOf = (c: TimelineClip, f: number, fading: boolean) => {
    const pos = f - startF(c, fps), len = endF(c, fps) - startF(c, fps);
    const fi = fading ? (c.fadeIn ?? 0) * fps : 0, fo = fading ? (c.fadeOut ?? 0) * fps : 0;
    return Math.max(0, Math.min(1, fi > 0 ? (pos + 0.5) / fi : 1, fo > 0 ? (len - pos - 0.5) / fo : 1));
  };
  const look = (el: HTMLVideoElement, seg: Piece) => {
    const flip = seg.drawn && seg.clip.flip;
    el.style.transform = flip ? 'scaleX(-1)' : '';
    el.dataset.flip = flip ? 'h' : '';
    el.dataset.kind = seg.kind;
    el.dataset.clip = seg.clip.id;
  };
  /** Moves an element to its stretch's time at frame f, and plays or holds it. Before the file's first frame it holds
   *  that frame (the render holds it too). */
  const drive = (el: HTMLVideoElement, seg: Piece, f: number, playing: boolean) => {
    const want = timeIn(seg, f);
    const t = Math.max(0, want);
    if (playing) el.playbackRate = Math.max(0.0625, Math.min(16, Math.abs(rateRef.current) * seg.rate));
    if (!playing || want < 0 || Math.abs(el.currentTime - t) > 0.12) { try { if (Math.abs(el.currentTime - t) > 0.01) el.currentTime = t; } catch { /* not loaded yet */ } }
    if (playing && want >= 0) { if (el.paused) void el.play().catch(() => undefined); } else el.pause();
  };
  // Waiting for the file (16 Nov 2026, the user on a slow link: "every once in a while it just goes dark"). An element
  // has its picture when it holds a frame at its own time; it can play when it has data beyond it. A file that failed
  // is not waited for (nothing will come). How far an element playing runs behind the frame, in seconds.
  const hasFrame = (el: HTMLVideoElement) => !!el.error || (el.readyState >= 2 && !el.seeking);
  const canPlay = (el: HTMLVideoElement) => !!el.error || (!el.seeking && (el.readyState >= 3 || (el.readyState >= 2 && loadedToEnd(el))));
  const lagOf = (el: HTMLVideoElement, seg: Piece, f: number, playing: boolean) => (playing && !el.paused && !el.error ? Math.max(0, timeIn(seg, f) - el.currentTime) : 0);
  /** Seconds the element has loaded past where it is, up to the end of its stretch (all of it when it failed). */
  const aheadOf = (el: HTMLVideoElement, seg: Piece) => {
    if (el.error) return Infinity;
    const t = el.currentTime, left = ((seg.to - seg.from) * seg.rate) / fps - (t - seg.t0);
    for (let k = 0; k < el.buffered.length; k++) if (el.buffered.start(k) <= t + 0.05 && el.buffered.end(k) > t) return el.buffered.end(k) - t >= left - 0.05 ? Infinity : el.buffered.end(k) - t;
    return 0;
  };
  /** The next stretch the element on screen does not play into by itself: another file, or a jump in the same one (in
   *  the 1080p view most stretches follow on in the one upscaled file, which a second element would load twice). */
  const nextApart = (i: number) => {
    for (let k = i + 1; k < segs.length; k++) {
      const p = segs[k - 1], q = segs[k];
      if (q.src !== p.src || q.rate !== p.rate || Math.abs(timeIn(p, p.to) - q.t0) > 1.5 / fps || q.from !== p.to) return segs[k];
    }
    return undefined;
  };

  /** Show the stretch under frame f on the front element and load the one after it on the back one; over a dissolve,
   *  the other picture on the back one, the two mixed by their opacities (driven from the player's own clock: nothing
   *  of the page is drawn again for it). A file not ready is never shown as black: the picture on screen stays (the
   *  other element's last frame, or this one's own until its seek lands) until it has its frame. Answers whether the
   *  picture is there (`frame`), whether it and the sound can play (`play`), how far they lag and how much is loaded. */
  const show = (f: number, playing: boolean, settle = false): Shown => {
    const [ea, eb] = els();
    if (!ea || !eb) return { at: -1, frame: true, pic: true, picLag: 0, snd: true, sndLag: 0, ahead: Infinity };
    // the sound comes from the sound tracks; backwards there is none
    // paused (`settle`): the sounds are parked once the playhead stays (useAudioMix)
    const sound = mix(f, playing && rateRef.current > 0, Math.abs(rateRef.current) || 1, settle && !playing);
    const i = segAt(f);
    const pair = [ea, eb];
    let fr = pair[front.current];
    let back = pair[1 - front.current];
    if (i < 0) {
      fr.style.opacity = '0'; back.style.opacity = '0';
      fr.pause(); back.pause();
      // a gap in the cut is black, as rendered; the stretch after it is loaded meanwhile, so it starts with its picture
      const after = segs.find((x) => x.from > f);
      if (after && back.dataset.src !== srcOf(after) && fr.dataset.src !== srcOf(after)) { back.src = srcOf(after); back.dataset.src = srcOf(after); back.preload = 'auto'; }
      const pk = after ? [fr, back].find((x) => x.dataset.src === srcOf(after)) : undefined;
      const a0 = after ? Math.max(0, timeIn(after, after.from)) : 0;
      if (pk && pk.readyState >= 1 && Math.abs(pk.currentTime - a0) > 0.02) { try { pk.currentTime = a0; } catch { /* loading */ } }
      return { at: -1, frame: true, pic: true, picLag: 0, snd: sound.ready, sndLag: sound.lag, ahead: Infinity };
    }
    const seg = segs[i];
    const want = srcOf(seg);
    // a new file goes on the element not on screen (16 Nov: it used to replace the picture shown, black until it loaded);
    // a jump in the same file takes the back element too when it is parked there already
    const t0 = Math.max(0, timeIn(seg, f));
    const parked = back.dataset.src === want && Math.abs(back.currentTime - t0) < 0.3;
    if (fr.dataset.src !== want || (parked && Math.abs(fr.currentTime - t0) > 0.3)) {
      if (back.dataset.src !== want) { back.src = want; back.dataset.src = want; back.preload = 'auto'; }
      front.current = (1 - front.current) as 0 | 1;
      [fr, back] = [back, fr];
    }
    // the picture as the render makes it (13 Nov): mirrored when its clip says so, dimmed to black over its own fades
    // (over the black behind it: on an upper track the render fades to the picture under it, this player to black).
    // A full-size base file has the mirror and the fades in it already (seg.drawn false), except a fade to black the
    // cut added since (seg.fades: drawn over it, as the master does; fullsize.ts says the rule)
    const c = seg.clip;
    const dim = dimOf(c, f, seg.drawn || !!seg.fades);
    fr.muted = true;
    back.muted = true;
    drive(fr, seg, f, playing);
    // a dissolve at this frame between the clip shown and its neighbour (14 Nov, ASKS 44): the other picture on the back
    // element, from its own file, beyond its cut point; the later clip's share rising from 1/(D+1) to D/(D+1) as the
    // render's blend does. Not over a stretch the upscaled base gives (its file has the dissolve in it).
    const d = seg.drawn ? dissolves.find((x) => x.a <= f && x.b > f && (x.out === c || x.inn === c)) : undefined;
    const other = d ? (c === d.out ? segs.find((x) => x.clip === d.inn && x.from === d.at) : segs.find((x) => x.clip === d.out && x.to === d.at)) : undefined;
    if (d && other && other.drawn) {
      const osrc = srcOf(other);
      if (back.dataset.src !== osrc) { back.src = osrc; back.dataset.src = osrc; back.preload = 'auto'; }
      drive(back, other, f, playing);
      if (!hasFrame(fr) || !hasFrame(back)) return { at: i, frame: false, pic: false, picLag: 0, snd: sound.ready, sndLag: sound.lag, ahead: 0 };
      look(fr, seg);
      look(back, other);
      const k = (f - d.a + 1) / (d.D + 1);
      const odim = dimOf(other.clip, f, true);
      const [inEl, outEl] = c === d.inn ? [fr, back] : [back, fr];
      const [inDim, outDim] = c === d.inn ? [dim, odim] : [odim, dim];
      // the upper element (b) at its share over the lower one: lower·(1 − share) + upper·share
      const top = eb === inEl ? { el: inEl, o: k * inDim, under: outEl, uo: outDim } : { el: outEl, o: (1 - k) * outDim, under: inEl, uo: inDim };
      top.el.style.opacity = String(Math.round(top.o * 1000) / 1000);
      top.under.style.opacity = String(Math.round(top.uo * 1000) / 1000);
      inEl.dataset.share = String(Math.round(k * 1000) / 1000);
      outEl.dataset.share = String(Math.round((1 - k) * 1000) / 1000);
      return { at: i, frame: true, pic: canPlay(fr) && canPlay(back), picLag: Math.max(lagOf(fr, seg, f, playing), lagOf(back, other, f, playing)), snd: sound.ready, sndLag: sound.lag, ahead: Math.min(aheadOf(fr, seg), aheadOf(back, other)) };
    }
    if (!hasFrame(fr)) {
      // the picture on screen stays, held, until this one has its frame
      back.pause();
      return { at: i, frame: false, pic: false, picLag: 0, snd: sound.ready, sndLag: sound.lag, ahead: 0 };
    }
    look(fr, seg);
    fr.style.opacity = String(Math.round(dim * 1000) / 1000);
    fr.dataset.share = '1';
    back.style.opacity = '0';
    back.dataset.share = '0';
    back.pause();
    // the next stretch on the back element, loaded and parked at its first frame (moved only when it is elsewhere: setting
    // the time on every frame made it seek again and again)
    const next = nextApart(i);
    if (next) {
      const nsrc = srcOf(next);
      if (back.dataset.src !== nsrc) { back.src = nsrc; back.dataset.src = nsrc; back.preload = 'auto'; }
      const n0 = Math.max(0, timeIn(next, next.from));
      if (back.readyState >= 1 && Math.abs(back.currentTime - n0) > 0.02) { try { back.currentTime = n0; } catch { /* loading */ } }
    }
    return { at: i, frame: true, pic: canPlay(fr), picLag: lagOf(fr, seg, f, playing), snd: sound.ready, sndLag: sound.lag, ahead: aheadOf(fr, seg) };
  };

  // the loading sign (the dot by the picture size): only for a wait longer than a blink, so a file that is there at once
  // draws nothing on the page
  const sign = useRef<{ on: boolean; timer?: ReturnType<typeof setTimeout> }>({ on: false });
  const loading = useCallback((on: boolean) => {
    const s = sign.current;
    if (on) {
      if (!s.on && !s.timer) s.timer = setTimeout(() => { s.timer = undefined; s.on = true; onLoading?.(true); }, 250);
      return;
    }
    if (s.timer) { clearTimeout(s.timer); s.timer = undefined; }
    if (s.on) { s.on = false; onLoading?.(false); }
  }, [onLoading]);
  useEffect(() => () => loading(false), [loading]);

  useEffect(() => {
    if (rate !== 0) return;
    loading(!show(frame, false, true).frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show reads the current segments; it is redefined each render
  }, [frame, rate, segs]);

  useEffect(() => {
    if (rate === 0) return;
    const [ea, eb] = els();
    for (const e of [ea, eb]) if (e) e.playbackRate = Math.abs(rate);
    let raf = 0;
    let last = performance.now();
    // the clock's exact place, kept when it starts again on the same frame (a new cut object while playing used to drop
    // the part of a frame already played, a little each time)
    let f = exact.current !== undefined && Math.floor(exact.current) === cb.current.frame ? exact.current : cb.current.frame;
    // Forward, the clock waits for the picture and the sound (16 Nov): when a file at the playhead is not ready, or plays
    // behind, everything holds on the frame shown (the picture, the sound, the playhead) and starts again together once
    // a little is loaded. It used to run on, the files seeking after it and the picture going black.
    // A hold never lasts for ever (16 Nov): after HOLD_SOUND the sounds still not ready are not waited for over the rest
    // of this stretch, once the picture can play (they join by their own re-seek when they load); after HOLD_PICTURE a
    // picture that never loads is not waited for either, over the rest of its stretch: the clock runs on as it used to,
    // the picture before it stays on screen and the dot stays on.
    let held = false, heldAt = 0, since = 0, deaf = -2, blind = -2;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let go = true;
      if (rate > 0) {
        const fit = (r: Shown) => {
          if (deaf !== r.at) deaf = -2;
          if (blind !== r.at) blind = -2;
          const pic = blind === r.at || r.pic, snd = deaf === r.at || blind === r.at || r.snd;
          const lag = Math.max(blind === r.at ? 0 : r.picLag, deaf === r.at || blind === r.at ? 0 : r.sndLag);
          return { play: pic && snd, lag, ahead: blind === r.at ? Infinity : r.ahead };
        };
        let r = show(Math.floor(f), !held);
        let k = fit(r);
        // a blink (a re-seek of a few frames, a file starting at a change of clip) is not a hold: the clock keeps wall time
        // through it, and holds only once a wait has lasted GRACE
        const short = !k.play || k.lag > 0.25;
        if (!held && short && !since) since = now;
        if (!short) since = 0;
        if (!held && short && now - since >= GRACE) { held = true; heldAt = since; since = 0; r = show(Math.floor(f), false); k = fit(r); }
        if (held && !k.play) {
          if (now - heldAt > HOLD_SOUND && r.frame && r.pic && !r.snd) deaf = r.at;
          else if (now - heldAt > HOLD_PICTURE && !r.pic) blind = r.at;
          k = fit(r);
        }
        if (held && k.play && (k.ahead >= 1 || now - heldAt > 4000 || deaf === r.at || blind === r.at)) { held = false; r = show(Math.floor(f), true); k = fit(r); }
        loading(held || (blind === r.at && !r.pic));
        // a small lag (a file starting at a change of clip) is caught up by the element's own re-seek, as before: the
        // clock keeps wall time and holds only for a real wait
        go = !held;
      } else loading(!show(Math.floor(f), false, true).frame);
      if (go) f = Math.max(0, Math.min(total, f + rate * dt * fps));
      exact.current = f;
      cb.current.onFrame(Math.floor(f));
      if (go && ((rate > 0 && f >= total) || (rate < 0 && f <= 0))) { cb.current.onEnd(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); for (const e of els()) e?.pause(); mix(Math.floor(f), false, 1); loading(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the clock restarts only when the rate or the cut changes
  }, [rate, segs, fps, total]);

  const first = segs[0];
  // paused: a file that lands after the playhead moved is shown then (the picture before it stays until it does)
  const again = () => { if (rateRef.current === 0) loading(!show(cb.current.frame, false, true).frame); };
  // the 1080p view: where the picture at the playhead comes from
  const here = pieces ? segs.find((x) => x.from <= frame && x.to > frame) : undefined;
  const ev = { onLoadedMetadata: again, onLoadedData: again, onSeeked: again, onCanPlay: again, onError: again };
  return (
    <span className={className} style={{ position: 'absolute', inset: 0 }}>
      <video ref={a} playsInline muted preload="auto" className="absolute inset-0 size-full bg-black object-contain" style={{ opacity: first ? 1 : 0 }} {...ev} />
      <video ref={b} playsInline muted preload="auto" className="absolute inset-0 size-full bg-black object-contain" style={{ opacity: 0 }} {...ev} />
      {pieces && (
        <span data-source={here?.kind} className={`pointer-events-none absolute bottom-2 left-2 whitespace-nowrap rounded-[4px] bg-black/60 px-1.5 py-px font-mono text-[10px] transition-colors duration-200 ${here?.kind === 'small' ? 'text-warn' : 'text-sub'}`}>
          {here ? (here.kind === 'small' ? '480p · not upscaled' : `1080p · ${here.label}`) : 'no picture'}
        </span>
      )}
    </span>
  );
}

