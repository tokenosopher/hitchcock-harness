'use client';
// The Edit page's things for the message: a clip on the timeline, a storyboard panel, a shot of a take in
// the Takes view, and the playhead's moment, each frozen as it is put in (the cut version, whether it had edits since,
// the working cut's step, the time, the file). It also gives the @ list the cut's clips and panels with their frames,
// and goes to a clip or a moment when a chip is clicked.
import { useEffect, useRef } from 'react';
import type { Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { refTimecode, type InlineRef } from '@/lib/refs';
import { registerRefSource, type RefItem } from '@/components/lib/refPick';
import { mediaUrl } from '@/components/media/Media';
import { clipName, findClip, lenF, pictureAt, speedOf, startF, type ClipRef } from './model';
import { sceneOf, shotNo, shotOf, type BySrc } from './shots';

export interface EditRefInput {
  tl?: Timeline;
  fps: number;
  frame: number;
  /** The version the page shows ("v33"), and whether the working cut has edits since it. */
  version?: string;
  edited: boolean;
  rev?: number;
  by: BySrc;
  names: Map<string, string>;
  setFrame: (f: number) => void;
  select: (r: ClipRef) => void;
}

const r1 = (n: number) => Math.round(n * 1000) / 1000;

/** A clip as a reference: a panel when it is a storyboard panel, else a clip. */
function clipRef(o: EditRefInput, t: TimelineTrack, c: TimelineClip): InlineRef {
  const { fps } = o;
  const scene = sceneOf(c, o.by);
  const shot = c.shot ?? shotNo(c, o.by);
  const panel = c.plan === 'board';
  const label = panel
    ? `${scene ?? c.scene ?? ''} · shot ${shot ?? '?'} · board ${c.panel?.k ?? 1}`.replace(/^ · /, '')
    : c.plan === 'shot' ? `${scene ?? ''} · shot ${shot ?? '?'} · planned`.replace(/^ · /, '')
      // a take's clip says its shot, as the cut's own names do ("S6 · take 1 · shot 3")
      : shot && c.src && !/\bshot\b/i.test(clipName(c)) ? `${clipName(c)} · shot ${shot}` : clipName(c);
  return {
    kind: panel ? 'panel' : 'clip', label,
    ...(scene ? { scene } : {}), ...(shot ? { shot } : {}), ...(c.takeRef?.take ? { take: c.takeRef.take } : {}),
    track: t.id, clip: c.id,
    ...(o.version ? { cut: o.version } : {}), ...(o.edited ? { edited: true } : {}), ...(o.rev !== undefined ? { rev: o.rev } : {}),
    at: refTimecode(c.at, fps), sec: r1(c.at), frame: startF(c, fps), length: r1(lenF(c, fps) / fps),
    ...(c.src ? { file: c.src } : {}), ...(c.src && !panel ? { from: r1(c.in), to: r1(c.out) } : {}),
    ...(c.text && c.plan ? { title: c.text.length > 140 ? `${c.text.slice(0, 139)}…` : c.text } : {}),
  };
}

function moment(o: EditRefInput): InlineRef | undefined {
  if (!o.tl) return undefined;
  const { fps, frame } = o;
  const tc = refTimecode(frame / fps, fps);
  const pic = pictureAt(o.tl, frame);
  const c = pic?.clip;
  const into = c ? c.in + ((frame - startF(c, fps)) / fps) * speedOf(c) : undefined;
  return {
    kind: 'moment', label: o.version ? `${tc} · ${o.version}` : tc,
    ...(o.version ? { cut: o.version } : {}), ...(o.edited ? { edited: true } : {}), ...(o.rev !== undefined ? { rev: o.rev } : {}),
    at: tc, sec: r1(frame / fps), frame,
    ...(pic && c ? { track: pic.track.id, clip: c.id, title: clipName(c), ...(c.src ? { file: c.src, from: r1(into!) } : {}) } : {}),
    ...(c ? { scene: sceneOf(c, o.by), ...(shotNo(c, o.by) ? { shot: shotNo(c, o.by) } : {}) } : {}),
  };
}

/** A shot of a take in the Takes view ("<src>#<n>"). */
function takeShotRef(o: EditRefInput, key: string): InlineRef | undefined {
  const i = key.lastIndexOf('#');
  if (i < 0) return undefined;
  const src = key.slice(0, i), n = Number(key.slice(i + 1));
  const t = o.by.get(src);
  const s = shotOf(t, n);
  if (!t || !s) return undefined;
  const name = (o.names.get(src) ?? t.name).replace(/\bTake\b/g, 'take');
  return {
    kind: 'shot', label: `${name.includes(t.scene) ? name : `${t.scene} · ${name}`} · shot ${n}`,
    scene: t.scene, shot: n, take: name, length: r1(s.out - s.in), file: src, from: r1(s.in), to: r1(s.out),
  };
}

function items(o: EditRefInput): RefItem[] {
  if (!o.tl) return [];
  const out: RefItem[] = [];
  const v = o.version ? ` · ${o.version}` : '';
  for (const t of o.tl.tracks) {
    if (t.kind !== 'video') continue;
    for (const c of [...t.clips].sort((a, b) => a.at - b.at)) {
      if (c.plan === 'shot') continue;
      const r = clipRef(o, t, c);
      const mid = c.src ? (c.in + c.out) / 2 : undefined;
      out.push({
        ref: r, group: r.kind === 'panel' ? `Storyboard panels${v}` : `Clips on the timeline${v}`,
        sub: `${t.id} · ${r.at} · ${r.length} s`,
        image: c.src ? mediaUrl(c.src, { w: 80, ...(mid !== undefined && r.kind === 'clip' ? { t: Math.round(mid * 100) / 100 } : {}) }) : undefined,
      });
    }
  }
  return out;
}

/** Registers the page's source while it is on screen; it always reads the page as it is now. */
export function useEditRefSource(input: EditRefInput): void {
  const now = useRef(input);
  useEffect(() => { now.current = input; });
  useEffect(() => registerRefSource({
    resolve: (el) => {
      const o = now.current;
      // a clip on the timeline, or on the phone's strip
      const clip = el.getAttribute('data-clip') ?? el.getAttribute('data-phone-clip');
      if (clip && o.tl) {
        const [trackId, ...rest] = clip.split(':');
        const f = findClip(o.tl, { trackId, clipId: rest.join(':') });
        return f ? clipRef(o, f.track, f.clip) : undefined;
      }
      const shot = el.getAttribute('data-shot');
      return shot ? takeShotRef(o, shot) : undefined;
    },
    moment: () => moment(now.current),
    items: () => items(now.current),
    go: (r) => {
      const o = now.current;
      if (!o.tl || !(r.kind === 'clip' || r.kind === 'panel' || r.kind === 'moment')) return false;
      const f = r.track && r.clip ? findClip(o.tl, { trackId: r.track, clipId: r.clip }) : undefined;
      if (f && r.kind !== 'moment') {
        o.select({ trackId: f.track.id, clipId: f.clip.id });
        o.setFrame(startF(f.clip, o.fps));
      } else if (r.frame !== undefined) {
        o.setFrame(r.frame);
      } else return false;
      return true;
    },
  }), []);
}
