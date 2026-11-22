// The words and the strip of a sound on its pick card. Pure: scripts/soundpick-test.ts checks them.
import type { FeedSound } from '@/server/types';

const KINDS: Record<string, string> = { bed: 'bed', reaction: 'reaction', accent: 'accent', 'carry-over': 'carry-over' };
export const kindWord = (k?: string): string | undefined => (k ? KINDS[k] ?? k : undefined);

/** "00:00:08:02" → "00:08:02" when the hour is zero: shorter on the phone, the same place. */
export const shortTc = (tc: string): string => tc.replace(/^00:/, '');
const db = (n: number): string => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(Math.abs(n) % 1 ? 1 : 0)} dB`;

/** Where it sits and how it is set: "S1 · 00:08:02 to 00:10:12 · 2.4 s · −12 dB · fades 4 and 18 frames". */
export function placeLine(s: FeedSound): string {
  const e = s.effect;
  if (!e) return s.scene ? `${s.scene} · its place is not in the plan` : 'Its place is not in the plan';
  const span = e.startTc && e.endTc ? `${shortTc(e.startTc)} to ${shortTc(e.endTc)}` : e.startTc ? `from ${shortTc(e.startTc)}` : '';
  const secs = e.seconds !== undefined ? `${e.seconds.toFixed(1)} s` : '';
  const fades = e.fadeIn !== undefined || e.fadeOut !== undefined ? `fades ${e.fadeIn ?? 0} and ${e.fadeOut ?? 0} frames` : '';
  return [s.scene, span, secs, e.levelDb !== undefined ? db(e.levelDb) : '', fades].filter(Boolean).join(' · ');
}

/** The strip: the sound's place and the scene joins, as percentages of the film. Undefined without the frames. */
export function stripOf(s: FeedSound): { left: number; width: number; scenes: { left: number }[] } | undefined {
  const total = s.filmFrames;
  const a = s.effect?.startFrame, b = s.effect?.endFrame;
  if (!total || a === undefined) return undefined;
  const end = b !== undefined && b > a ? b : a + Math.round((s.effect?.seconds ?? 1) * (s.fps ?? 24));
  const pct = (f: number) => Math.min(100, Math.max(0, (f / total) * 100));
  return { left: pct(a), width: pct(end) - pct(a), scenes: [] };
}

/** "try 2 · natural, close". */
export const tryLabel = (t: FeedSound['tries'][number]): string => `try ${t.n}${t.style ? ` · ${t.style}` : ''}`;
