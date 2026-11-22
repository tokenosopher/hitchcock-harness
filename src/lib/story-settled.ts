// Which story version is settled . The one place that decides it: the server's film state and
// the Story page's samples both run the story through `withSettled`, so the Story tab, the board's Story box, the flow
// and the Story page's settle button all read the same `story.settled`.
//
// A version is settled when
//   - story/settled.json says so (the Story page's "Settle" button writes it), or
//   - the user settled it in words in the chat: then Alma wrote the script from it and the user locked the script.
//     The script's "## Story" heading names the version ("## Story (the settled story, story/v9.md, …)"); that is the
//     settled one. A locked script whose Story heading names no version settles the newest story ("with the script lock").
// When both say something, the later version wins (a settle on the page after the lock, or a chat settle after an
// older settled.json).
import type { StoryInfo } from '@/server/types';
import { storyVersionOf } from './script-edit';

export type Settled = NonNullable<StoryInfo['settled']>;
interface ScriptLike { versions: { locked?: boolean }[]; markdown?: string }

const num = (v: string): number => Number(/^v(\d+)$/.exec(v)?.[1] ?? 0);

/** The settled version as the script shows it: undefined unless the script is locked. */
export function settledByScript(story: Pick<StoryInfo, 'versions' | 'current'>, script?: ScriptLike): Settled | undefined {
  if (!script || !script.versions.some((v) => v.locked)) return undefined;
  const named = storyVersionOf(script.markdown);
  if (named && story.versions.some((v) => v.version === named)) return { version: named, via: 'script' };
  if (named) return undefined;  // it names a story that is not in story/: say nothing rather than guess
  return { version: story.current, via: 'lock' };
}

/** The story with `settled` filled from story/settled.json (already on it) or the locked script. */
export function withSettled(story: StoryInfo | undefined, script?: ScriptLike): StoryInfo | undefined {
  if (!story) return story;
  const file: Settled | undefined = story.settled ? { ...story.settled, via: story.settled.via ?? 'file' } : undefined;
  const byScript = settledByScript(story, script);
  const settled = file && byScript ? (num(byScript.version) > num(file.version) ? byScript : file) : file ?? byScript;
  return settled ? { ...story, settled } : story;
}

/** How the settle is said after "settled" on the page: "" for the page's button, the lock or the script otherwise. */
export function settledHow(s?: Settled): string {
  return s?.via === 'lock' ? ' with the script lock' : '';
}
