// A pick-up's own check as its scene's current one . The user, of S1's boards card still
// reading "round 3 of 3" while the pick-up FIX-S1-sit was being re-boarded and checked: "Can we update what it says
// on the previous page when you do this, when you redo previses?". When a pick-up of a scene (FilmState.pickups, read
// by src/server/films/read/pickups.ts: its scenes come from its name, else from the scene its folder sits under) has
// its own boards check (qc/previz-FIX-<name>-r<n>.json) or prompt check (qc/prompt-FIX-<name>-r<n>.json), the
// scene's card shows that check, and the scene's first check stays below it as the earlier record. With several
// pick-ups the one checked last is current; a dropped pick-up never is. A scene with none is unchanged. Pure.
import type { FilmState, QCEntry } from '@/server/types';
import type { QCTarget } from '@/components/qc/QCPanel';

export type PickupStage = 'previz' | 'prompt';

/** "FIX-S1-sit" → "sit", "FIX-sword-S9" → "sword", "FIX-S2S3-reel" → "reel"; a name that is only scenes → undefined. */
export function pickupWord(name: string): string | undefined {
  const parts = name.replace(/^FIX-/, '').split('-').filter((p) => p && !/^(?:S\d+)+[a-z]?$/.test(p));
  return parts.length ? parts.join(' ') : undefined;
}

/** The scene's pick-up whose check of this stage is current: the pick-up checked last of those that name the scene. */
export function pickupCheck(s: FilmState | undefined, stage: PickupStage, scene: string): { pickup: string; entry: QCEntry } | undefined {
  const found = (s?.pickups ?? [])
    .map((p, i) => ({ p, i, entry: s?.qc?.[`${stage}-${p.name}`] }))
    .filter((x): x is typeof x & { entry: QCEntry } => !!x.entry && !x.p.dropped && x.p.scenes.includes(scene));
  if (!found.length) return undefined;
  // checked last: the newest round's time, then the reader's order (by name) when the times say nothing
  found.sort((a, b) => (a.entry.latest.at || '').localeCompare(b.entry.latest.at || '') || a.i - b.i);
  const last = found[found.length - 1];
  return { pickup: last.p.name, entry: last.entry };
}

/** How the card names a pick-up's check: "S1 pick-up “sit” boards v3" (from the report's "FIX-S1-sit boards v3"). */
export function pickupLabel(scene: string, pickup: string, stage: PickupStage, reportLabel?: string): string {
  const rest = (reportLabel ?? '').replace(pickup, '').replace(/\(\s*\)/g, '').replace(new RegExp(`^\\s*${scene}\\b`), '')
    .replace(/^[\s·:,-]+|[\s·:,-]+$/g, '').replace(/\s+/g, ' ') || (stage === 'previz' ? 'boards' : 'prompt');
  const word = pickupWord(pickup);
  return `${scene} pick-up ${word ? `“${word}”` : pickup} ${rest}`;
}

/** The scene's target as its card shows it: the pick-up's check current when there is one, the scene's own check
 *  kept as `earlier`; else the target unchanged. `t.target` stays the scene (the tabs are scenes); `pickup` names
 *  the pick-up, so the panel's requests name qc/<stage>-FIX-<name>-r<n>.json. */
export function withPickupCheck(s: FilmState | undefined, stage: PickupStage, t: QCTarget): QCTarget {
  const c = pickupCheck(s, stage, t.target);
  if (!c) return t;
  return {
    ...t,
    label: pickupLabel(t.target, c.pickup, stage, c.entry.latest.label),
    entry: c.entry,
    ready: true,
    waitsFor: `the ${c.pickup} ${stage === 'previz' ? 'boards' : 'prompt'}`,
    pickup: c.pickup,
    ...(t.entry ? { earlier: { label: t.label, entry: t.entry } } : {}),
  };
}
