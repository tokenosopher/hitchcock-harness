// The Story page's sample films (MOCK=boards). Their story versions and script.md live in this server's
// memory: a save on the page runs the same code as on a real film (src/lib/script-edit.ts, the story's next version)
// and changes only this memory. Nothing is written to disk and nothing reaches Alma.
//   sample-story-new      no story, no script
//   sample-story-draft    story v1 to v3 by Alma and you, not settled, no script
//   sample-story-script   story settled at v3, script v1 (draft) written from it
//   sample-story-newer    the same, with a story v4 saved after the script was written
//   sample-story-locked   the script locked at v2
//   sample-story-card     script v2 (draft): the title card moved from before S1 to after it, its words changed;
//                         v1 kept under "Earlier drafts" (the Script page's cards)
//   sample-story-asks     the same script v2 draft, with two of Alma's cards waiting at story: the lock of script v2
//                         and a question on story v2's wording, each with only words ("Read the script ›")
import type { FeedCard, FilmRef, FilmState, ScriptLine, StoryInfo } from '@/server/types';
import { castSampleState } from './cast';
import { SAMPLE_SCRIPT, SAMPLE_STORY } from './story-text';
import { readScriptText } from '@/server/films/read/script';
import { withSettled } from '@/lib/story-settled';

type Id = 'sample-story-new' | 'sample-story-draft' | 'sample-story-script' | 'sample-story-newer' | 'sample-story-locked' | 'sample-story-card' | 'sample-story-asks';
const cast = castSampleState('sample-cast')!;
const repo = cast.film.repo;
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const STORY_SAMPLES: Record<Id, FilmRef> = {
  'sample-story-new': ref('sample-story-new', 'Sample · story: nothing yet', 1),
  'sample-story-draft': ref('sample-story-draft', 'Sample · story: being written', 1),
  'sample-story-script': ref('sample-story-script', 'Sample · story: the script draft', 1),
  'sample-story-newer': ref('sample-story-newer', 'Sample · story: a newer story', 1),
  'sample-story-locked': ref('sample-story-locked', 'Sample · story: the script locked', 2),
  'sample-story-card': ref('sample-story-card', 'Sample · story: a title card changed', 1),
  'sample-story-asks': ref('sample-story-asks', 'Sample · story: the lock and a story question waiting', 1),
};
export const isStorySample = (slug: string): slug is Id => slug in STORY_SAMPLES;
export const storySampleFilms = (): FilmRef[] => Object.values(STORY_SAMPLES);

const BRIEF = `# The Lighthouse

Started 11 Nov 2026. Folder \`the-lighthouse\`.

- Title: The Lighthouse
- Code: TL (Higgsfield element and upload names start with \`TL-\`)
- Aspect ratio: 9:16
- Budget: 5000 credits

## Premise
A lighthouse keeper finds a letter in a bottle asking her to flash the lamp twice, and that night she does.

## Decisions (the user, 11 Nov 2026)
- **Aspect ratio 9:16.**
- **Voices: Higgsfield voices.** The reference lines for the video elements come from them.
- **Drafts: one generation per block, 480p with the draft flag, no batches.** A second take only after the user's notes.
- **Budget:** about 5000 credits.
`;

const LOCKED = SAMPLE_SCRIPT.replace(/^\*v1, draft\. 2026-11-16: /m, '*v2, LOCKED by the user on 2026-11-16 ("Lock script v2."). 2026-11-16: the letter kept in Edda\'s own voice. v1, draft. 2026-11-16: ');

// script v2: the title card after S1 in the cards' own shape, with new words; v1 word for word under "Earlier drafts"
const CARD_V1 = /^\*\*Title card, before S1\*\*.*\n\n/m;
const V1_BODY = SAMPLE_SCRIPT.split('\n## Script\n')[1].split('\n## Audit')[0].trim();
const CARD = SAMPLE_SCRIPT
  .replace(CARD_V1, '')
  .replace(/^### S2 /m, '**Title card** (3 s, after S1): **THE POINT · 1890** · then: *The lighthouse keeper*.\n\n### S2 ')
  .replace(/^\*v1, draft\. 2026-11-16: /m, '*v2, draft. 2026-11-19: the user\'s ask in the thread: the title card reads "THE POINT · 1890" and comes after S1. v1, draft. 2026-11-16: ')
  .replace(/^None yet\.$/m, `### v1 (2026-11-16, as sent)\n\n${V1_BODY}`);

interface Memory { story: { version: string; text: string; by: 'you' | 'alma'; at: string }[]; settled?: string; script?: string }
const g = globalThis as unknown as { __hhStoryMock?: Partial<Record<Id, Memory>> };
const mem = (g.__hhStoryMock ??= {});
const v = (version: string, text: string, by: 'you' | 'alma', at: string) => ({ version, text, by, at });
function seed(slug: Id): Memory {
  const [s1, s2, s3] = SAMPLE_STORY;
  switch (slug) {
    case 'sample-story-new': return { story: [] };
    case 'sample-story-draft': return { story: [v('v1', s1, 'alma', '2026-11-11T15:38:00Z'), v('v2', s2, 'you', '2026-11-16T15:28:00Z'), v('v3', s3, 'alma', '2026-11-16T15:59:00Z')] };
    case 'sample-story-script': return { story: [v('v1', s1, 'alma', '2026-11-11T15:38:00Z'), v('v2', s2, 'you', '2026-11-16T15:28:00Z'), v('v3', s3, 'alma', '2026-11-16T15:59:00Z')], settled: 'v3', script: SAMPLE_SCRIPT };
    case 'sample-story-newer': return { story: [v('v1', s1, 'alma', '2026-11-11T15:38:00Z'), v('v2', s2, 'you', '2026-11-16T15:28:00Z'), v('v3', s3, 'alma', '2026-11-16T15:59:00Z'), v('v4', s3.replace('says Tobias.', 'says Tobias, very quietly.'), 'you', '2026-11-16T17:10:00Z')], settled: 'v3', script: SAMPLE_SCRIPT };
    case 'sample-story-asks':
    case 'sample-story-card': return { story: [v('v1', s1, 'alma', '2026-11-11T15:38:00Z'), v('v2', s2, 'you', '2026-11-16T15:28:00Z'), v('v3', s3, 'alma', '2026-11-16T15:59:00Z')], settled: 'v3', script: CARD };
    case 'sample-story-locked': return { story: [v('v1', s1, 'alma', '2026-11-11T15:38:00Z'), v('v2', s2, 'you', '2026-11-16T15:28:00Z'), v('v3', s3, 'alma', '2026-11-16T15:59:00Z')], settled: 'v3', script: LOCKED };
  }
}
/** The sample's memory, made on first use (a test can put it back with `resetStorySample`). */
export function storyMemory(slug: string): Memory | undefined {
  if (!isStorySample(slug)) return undefined;
  return (mem[slug] ??= seed(slug));
}
export function resetStorySample(slug: string): boolean {
  if (!isStorySample(slug)) return false;
  mem[slug] = seed(slug);
  void import('./mock').then((m) => m.mockPoke(slug));
  return true;
}

function storyInfo(m: Memory): StoryInfo | undefined {
  if (!m.story.length) return undefined;
  const last = m.story[m.story.length - 1];
  return {
    versions: m.story.map((x) => ({ version: x.version, path: `story/${x.version}.md`, date: x.at, by: x.by })),
    current: last.version, text: last.text, settled: m.settled ? { version: m.settled } : undefined,
  };
}

export function storySampleState(slug: string): FilmState | undefined {
  const m = storyMemory(slug);
  if (!m) return undefined;
  const film = STORY_SAMPLES[slug as Id];
  const base: FilmState = { ...cast, film, cut: undefined, master: undefined, post: { cuts: [], masters: [], captions: [] }, feed: { counts: {}, asks: [] }, qc: {}, warnings: [], updatedAt: new Date().toISOString(),
    brief: { path: 'brief.md', markdown: BRIEF }, characters: slug === 'sample-story-new' || slug === 'sample-story-draft' ? [] : cast.characters, locations: [], scenes: [], research: undefined };
  const script = m.script ? readScriptText(m.script) : undefined;
  return {
    ...base,
    ...(slug === 'sample-story-asks' ? { feed: { counts: { story: STORY_ASKS.length }, asks: STORY_ASKS } } : {}),
    story: withSettled(storyInfo(m), script),
    script: script ? { versions: script.versions, current: script.current, lines: script.lines as ScriptLine[], markdown: script.markdown } : undefined,
  };
}

// the asks sample's cards, as Alma writes them on a real film: words only, no file; the card links the Story page at the version it names
const ask = (c: Omit<FeedCard, 'section' | 'placed' | 'key' | 'place' | 'media'> & { id: string }): FeedCard => ({ key: c.id, section: 'Story', placed: 'card', place: 'story', media: [], ...c });
const STORY_ASKS: FeedCard[] = [
  ask({ id: 'ASK-script-lock-v2', title: 'Script v2: lock it?', ids: [], date: '2026-11-21T09:00:00Z',
    text: ['The title card now comes after S1 and reads "THE POINT · 1890". Re-timed: 0:50. Your yes locks v2, and the first round of assets starts from it.'],
    ask: { kind: 'yes', options: [] } }),
  ask({ id: 'ASK-story-v2-tobias', title: "Story v2: keep your wording of Tobias's line?", ids: [], date: '2026-11-20T18:00:00Z',
    text: ['You wrote Tobias\'s line in v2; v3 put it back in two sentences. Keep yours?'],
    ask: { kind: 'yes', options: [] } }),
];
/** The asks sample's cards for the feed route. */
export const storySampleFeed = (slug: string): FeedCard[] | undefined => (slug === 'sample-story-asks' ? STORY_ASKS : undefined);
