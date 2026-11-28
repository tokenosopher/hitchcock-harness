// npx tsx scripts/release-waits-films.ts [base]
// Read-only check: runs the "Waiting for you" rule for posting the film (derive.ts releaseWait) over every
// film in the registry. Each film's state is read from a running harness (GET /api/films and GET
// /api/films/<slug>/state; both only read); its release in brief is laid over it from the film's own
// social/release.json and harness/left.json, read here as the server's reader does (read/post.ts postBrief), so a
// harness built before this change can be used. Default base $HARNESS_URL, else http://127.0.0.1:8800. Writes nothing.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanLeft, postBrief } from '../src/components/edit/left';
import { releaseWait, waitingKeys } from '../src/components/lib/derive';
import type { FilmRef, FilmState } from '../src/server/types';

const base = process.argv[2] ?? process.env.HARNESS_URL ?? 'http://127.0.0.1:8800';
const json = async (p: string): Promise<unknown> => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return undefined; } };

async function main(): Promise<void> {
  const films = (await (await fetch(`${base}/api/films`)).json()) as FilmRef[];
  const rows: string[] = [];
  let withItem = 0;
  for (const f of films) {
    const r = await fetch(`${base}/api/films/${f.slug}/state`);
    if (!r.ok) { rows.push(`${f.slug.padEnd(52)} state ${r.status}`); continue; }
    const s = (await r.json()) as FilmState;
    const [rel, left] = await Promise.all([json(path.join(s.film.folder, 'social/release.json')), json(path.join(s.film.folder, 'harness/left.json'))]);
    const brief = postBrief(rel, cleanLeft(left)?.ticks);
    if (brief) s.post = { ...(s.post ?? { cuts: [], masters: [], captions: [] }), release: { path: 'social/release.json', ...brief } };
    const w = releaseWait(s);
    if (w) withItem++;
    const why = w ? '' : !brief ? 'no release file' : s.film.status === 'delivered' ? 'delivered' : !brief.final ? 'no final' : !brief.platforms ? 'no texts yet' : brief.done ? 'ticked done' : 'everything posted';
    rows.push(`${f.slug.padEnd(52)} ${w ? `ITEM ${w.title} (${waitingKeys(s, []).includes(w.key) ? 'in waitingKeys' : 'NOT in waitingKeys'})` : `none (${why})`}${brief ? ` | release: final ${brief.final?.version ?? '-'}, ${brief.posted} of ${brief.platforms} posted, ${s.film.status}` : ''}`);
  }
  console.log(rows.join('\n'));
  console.log(`\n${films.length} films, ${withItem} with the posting item`);
}
void main();
