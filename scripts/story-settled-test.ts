// npm run story-settled:test
// Which story version reads as settled (src/lib/story-settled.ts): story/settled.json, or a
// locked script whose "## Story" heading names the version (a settle the user gave in words), or the lock alone.
// Fixtures only.
import { settledHow, withSettled } from '../src/lib/story-settled';
import type { StoryInfo } from '../src/server/types';

let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}`); };

const story = (n: number, settled?: StoryInfo['settled']): StoryInfo => ({
  versions: Array.from({ length: n }, (_, i) => ({ version: `v${i + 1}`, path: `story/v${i + 1}.md`, by: 'alma' as const })),
  current: `v${n}`, text: 'A story.', settled,
});
const md = (head: string): string => `# Film: script\n\n${head}\n\nThe story.\n\n## Script\n\n*v3, LOCKED by the user.*\n`;
const NAMED = md('## Story (the settled story, story/v9.md, 2026-11-21, word for word)');
const locked = (markdown: string) => ({ versions: [{ locked: false }, { locked: false }, { locked: true }], markdown });
const draft = (markdown: string) => ({ versions: [{ locked: false }, { locked: false }], markdown });

async function main(): Promise<void> {
  let s = withSettled(story(9), locked(NAMED));
  check(s?.settled?.version === 'v9' && s.settled.via === 'script' && settledHow(s.settled) === '', 'a locked script naming story/v9.md, no settled.json: settled at v9');
  s = withSettled(story(9), draft(NAMED));
  check(!s?.settled, 'the same script not locked: not settled');
  s = withSettled(story(9, { version: 'v9', at: '2026-11-21T10:00:00Z' }), draft(NAMED));
  check(s?.settled?.version === 'v9' && s.settled.via === 'file' && s.settled.at === '2026-11-21T10:00:00Z', 'settled.json present: as today');
  s = withSettled(story(3, { version: 'v3' }), undefined);
  check(s?.settled?.version === 'v3', 'settled.json with no script: as today');
  s = withSettled(story(4), locked(md('## Story')));
  check(s?.settled?.version === 'v4' && s.settled.via === 'lock' && settledHow(s.settled) === ' with the script lock', 'a locked script naming no version: the newest, "with the script lock"');
  s = withSettled(story(9, { version: 'v7' }), locked(NAMED));
  check(s?.settled?.version === 'v9', 'settled.json at v7, the locked script names v9: v9 (the later)');
  s = withSettled(story(10, { version: 'v10' }), locked(NAMED));
  check(s?.settled?.version === 'v10' && s.settled.via === 'file', 'settled v10 on the page after the lock on v9: v10');
  s = withSettled(story(10), locked(NAMED));
  check(s?.settled?.version === 'v9' && s.current === 'v10', 'a v10 written after the lock on v9: v9 settled, v10 is not');
  s = withSettled(story(5), locked(NAMED));
  check(!s?.settled, 'the script names a story that is not in story/: not settled');
  check(withSettled(undefined, locked(NAMED)) === undefined, 'no story: none');

}

main().then(() => { console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0); }, (e) => { console.error(e); process.exit(1); });
