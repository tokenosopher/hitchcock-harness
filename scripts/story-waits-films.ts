// npx tsx scripts/story-waits-films.ts [base]
// Read-only check: runs the "Waiting for you" rule for the story and the script (derive.ts storyWait,
// waitingKeys) over every film in the registry, read from a running harness (GET /api/films and GET
// /api/films/<slug>/state; both only read), and lists which films get a story or script item and what the flow's
// Story step says. Default base $HARNESS_URL, else http://127.0.0.1:8800. Writes nothing.
import { atStoryStage, storyWait, waitingKeys } from '../src/components/lib/derive';
import { flowOf } from '../src/components/lib/flow';
import { waitItemsOf } from '../src/components/flow/waitList';
import type { FilmRef, FilmState } from '../src/server/types';

const base = process.argv[2] ?? process.env.HARNESS_URL ?? 'http://127.0.0.1:8800';

async function main(): Promise<void> {
  const films = (await (await fetch(`${base}/api/films`)).json()) as FilmRef[];
  const rows: string[] = [];
  let withItem = 0;
  for (const f of films) {
    const r = await fetch(`${base}/api/films/${f.slug}/state`);
    if (!r.ok) { rows.push(`${f.slug}: state ${r.status}`); continue; }
    const s = (await r.json()) as FilmState;
    const w = storyWait(s, []);
    const flow = flowOf(s, []);
    const keys = waitingKeys(s, []).filter((k) => k.startsWith('story:'));
    const first = waitItemsOf(flow)[0]?.key;
    if (keys.length) withItem++;
    const why = w ? '' : !s.script && !s.story ? 'no story, no script' : !atStoryStage(s) ? `past the story (stage ${s.film.stage ?? '?'}, ${s.film.status})` : s.script?.versions.some((v) => v.locked) ? 'script locked' : s.story?.settled?.version === s.story?.current && !s.script ? 'story settled, the script is Alma\'s' : 'other';
    rows.push([
      f.slug.padEnd(52),
      keys.length ? `ITEM ${keys.join(' ')}${first === keys[0] ? ' (first)' : ''}` : `none (${why})`,
      `| Story step: ${flow.nodes.story.state} · ${flow.nodes.story.status}`,
      w ? `\n${' '.repeat(54)}${w.title} · ${w.line}` : '',
    ].join(' '));
  }
  console.log(rows.join('\n'));
  console.log(`\n${films.length} films, ${withItem} with a story or script item`);
}
void main();
