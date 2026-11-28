// The New takes page's sample film: the-lighthouse's cut and takes, five of which came back on one morning, each at
// its own time (fixtures/shots.ts reads this; fixtures/takesinbox.ts says what is known of each). Kept apart from
// takesinbox.ts so shots.ts imports nothing that imports it.
import type { TakeShots } from '@/server/edit/shots';

export const INBOX_SAMPLE = 'sample-takes-inbox';
const H = 3600000;
const DAYS10 = 10 * 86400000;
/** How long after the sample's day each take landed (ms); undefined: on the day, before the list of takes looked at began. */
export function inboxLanded(t: TakeShots): number | undefined {
  if (t.name === 'FIX-cork-S2 · take 1') return DAYS10 + 3 * H;             // a pick-up, Alma's record
  if (t.scene === 'S1' && t.name === 'sample take A') return DAYS10 + 2.5 * H; // a retake, a Seedance draft, Alma's record
  if (t.scene === 'S2' && t.name === 'sample take A') return DAYS10 + 2 * H;   // a retake, its check only: words missing
  if (t.scene === 'S3' && t.name === 'sample take A variation 1') return DAYS10 + 1 * H; // a variation, findings.md
  if (t.scene === 'S3' && t.name === 'sample take B') return DAYS10 + 0.5 * H; // nothing known of it at all
  return undefined;
}
