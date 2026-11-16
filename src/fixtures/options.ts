// MOCK=boards: the options of the sample film's effect, so the Edit page's list of options (Options.tsx) can be
// used and tested without a real film. `GET /api/films/<film>/options`
// answers this in sample-data mode. The folder of the effect the sample cut uses (A2 `m1`, audio/sfx/
// title-boom-9.wav) holds three tries: the one in the film, a shorter one and a longer one. Their files do not
// exist: nothing plays, the list and the swap can be tested. Pure and free of randomness.
import type { OptionGroup } from '@/server/edit/options';

const peaks = (n: number, k: number) => Array.from({ length: 96 }, (_, i) => Math.round(Math.abs(Math.sin((i + k) / n)) * 100) / 100);

const SFX = 'assets/films/the-lighthouse/audio/sfx';
const GROUPS: Record<string, OptionGroup[]> = {
  'the-lighthouse': [{
    dir: SFX,
    options: [
      { src: `${SFX}/title-boom-9.wav`, files: [`${SFX}/title-boom-9.wav`], name: 'title boom 9', seconds: 1.375, words: 'a low boom under the title', peaks: peaks(9, 0) },
      { src: `${SFX}/title-boom-10.wav`, files: [`${SFX}/title-boom-10.wav`, `${SFX}/title-boom-10.mp3`], name: 'title boom 10', seconds: 0.75, words: 'shorter, tighter', peaks: peaks(5, 3) },
      { src: `${SFX}/title-boom-11.wav`, files: [`${SFX}/title-boom-11.wav`], name: 'title boom 11', seconds: 3.5, words: 'longer tail', peaks: peaks(14, 7) },
    ],
  }],
};

/** The groups asked for (by folder) of the sample film; none for any other film or folder. */
export function mockOptions(film: string, dirs: string[]): OptionGroup[] {
  return (GROUPS[film] ?? []).filter((g) => dirs.includes(g.dir));
}
