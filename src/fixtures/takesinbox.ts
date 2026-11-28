// MOCK=boards: what the New takes page knows of the sample's takes that came back (GET …/landed). The takes
// themselves and when they landed: fixtures/shots.ts and takesinbox-takes.ts. One of each kind: a pick-up with Alma's
// findings record (FIX-cork-S2), a retake that is a Seedance draft with her record (S1), a retake with only its check
// (S2: words missing) and a card that says not usable, a variation with a findings.md (S3), and one with nothing (S3's
// take B).
import type { LandedMap } from '@/components/takes/landed';
import { INBOX_SAMPLE } from './takesinbox-takes';

const F = `assets/films/${INBOX_SAMPLE}`;
const LANDED: LandedMap = {
  [`${F}/generations/FIX-cork-S2/takes/take1`]: {
    folder: `${F}/generations/FIX-cork-S2/takes/take1`, gen: 'FIX-cork-S2', take: 'take1', job: '6f0b9e2a-1c55-4d0b-9a77-2f4c1d1b0e11',
    card: { title: 'S2 pick-up: the cork, closer (Seedance 2.5)', sub: 'job 6f0b9e2a · 25 credits · 13.5 s · 854x480', text: ['Checks running; this text gets the findings.'] },
    readme: { title: 'FIX-cork-S2 · S2 shot 2 (the cork, closer)', lines: ['The user: "Closer on the bottle when she pulls the cork; I want her hands."', 'One shot, 13.5 s, the same line, from across the table.', 'Stands for S2 shot 2.'] },
    spend: { model: 'Seedance 2.5', res: '480p', draft: false, seconds: 13.5, credits: 25, costText: '25 credits (made)', from: 'spend.md' },
    alma: { summary: 'Her line word for word; closer, her hands as asked. Tobias looks away once, mid-line.', verdict: 'watch',
      lines: [{ said: 'It was sealed with wax.', heard: 'It was sealed with wax.', ok: true }],
      findings: ['13.5 s, 854x480, with sound.', 'Tobias looks away at 6.2 s; watch whether it reads as doubt or boredom.', 'The light matches S2 shot 1.'], at: '2026-11-20T15:02:00Z', by: 'alma' },
  },
  [`${F}/blocks/S1/takes/S1-sample-takeA-480p.mp4`]: {
    folder: `${F}/blocks/S1/takes/S1-sample-takeA-480p.mp4`, gen: 'S1', take: 'S1-sample-takeA-480p.mp4', job: '0d4c2b7e-8f3a-4a1e-b6c2-5e9d7a3f1b20',
    card: { title: 'S1 again, slower (Seedance draft)', sub: 'job 0d4c2b7e · 18 credits · 24.0 s · 854x480 draft', text: ['Good: every line word for word, the walk in slower as you asked. Made on Seedance at 480p.'] },
    spend: { model: 'Seedance 2.5', res: '480p', draft: true, seconds: 24, credits: 18, costText: '18 credits (made)', from: 'spend.md' },
    alma: { summary: 'Every line word for word; the walk in is slower, as asked.', verdict: 'use',
      lines: [{ said: 'The tide is turning.', heard: 'The tide is turning.', ok: true }, { said: 'Then we wait.', heard: 'Then we wait', ok: true }],
      findings: ['24 s, 854x480, with sound.', 'Cuts where the prompt asked, within a frame.'], at: '2026-11-20T14:31:00Z', by: 'alma' },
  },
  [`${F}/blocks/S2/takes/S2-sample-takeA-480p.mp4`]: {
    folder: `${F}/blocks/S2/takes/S2-sample-takeA-480p.mp4`, gen: 'S2', take: 'S2-sample-takeA-480p.mp4',
    card: { title: 'S2 take A (Seedance draft)', sub: 'job 3a9e · 15 credits · 13.0 s · 854x480 draft', text: ['Not usable: she says "the bottle" twice and drops "at low tide". The look is right.'] },
    spend: { model: 'Seedance 2.5', res: '480p', draft: true, seconds: 13, credits: 15, costText: '15 credits (made)', from: 'spend.md' },
    check: { heard: 'I found it on the rocks, the bottle, the bottle.', missing: ['at low tide'], extra: ['the bottle'], wordsMatch: false, tailOk: true, seconds: 13 },
  },
  [`${F}/blocks/S3/takes/S3-sample-takeA-variation1`]: {
    folder: `${F}/blocks/S3/takes/S3-sample-takeA-variation1`, gen: 'S3', take: 'S3-sample-takeA-variation1',
    note: { verdict: 'good — Maren looks up at the end, the rest as it was', points: ['Checked by eye on the contact sheet.', 'Not yet checked by ear: the voices.'] },
  },
};

export function mockLanded(film: string): LandedMap {
  return film === INBOX_SAMPLE ? LANDED : {};
}
