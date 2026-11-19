// npm run pages:test
// The page readers that read a first whole test film wrongly (19 Nov 2026), on a small made-up film of the same shape
// (a keeper, a narrator heard over the picture, one room, a 480p-only video element), in a temp folder deleted after:
// an element whose record leaves final_file "" still shows its draft; a voice option's note never shows a raw id;
// the ID table's names split on ";" as well as ","; a yes on the cut's own card (ASK-cut-v3) counts wherever it is
// placed; a place's picked picture is its main image before a master is painted, and the loose candidates are its
// round; misses on a card that is not about a take are not a reading problem; a voice-over line that no previz take
// speaks is not a mismatch; the taste row's words name the app once; the thread info says whether a turn runs.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const put = async (root: string, rel: string, body: string | Buffer = PNG) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body);
};

const SCRIPT = `# The Jar: script

## IDs

| what | ID | in this film |
|---|---|---|
| character | C01, C02… | C01 Ida, the ferry keeper; C02 the Narrator (voice only, never seen) |
| location | L01, L02… | L01 the jetty |
| prop | P01, P02… | P01 the jar; P02 the note |
| generation | S1, S2… | S1 the find; S2 the reply |

## Script

*v1, LOCKED by the user on 2026-11-19. The first draft.*

### S1 · the find · L01 the jetty
\`[4 s]\` Ida lifts a jar from the water.
**NARRATOR** *(over the picture)*: "It had come a long way."

| generation | lines | words | action s | ≈ s | ends at |
|---|---|---|---|---|---|
| S1 | 1 | 5 | 4 | 6 | 0:06 |

### S2 · the reply · L01 the jetty
**IDA:** "Then I answer."
\`[3 s]\` She rings the bell.

| generation | lines | words | action s | ≈ s | ends at |
|---|---|---|---|---|---|
| S2 | 1 | 3 | 3 | 5 | 0:11 |
`;

const UUID = 'b483a172-2776-559b-b138-8853559b20ee';

async function film(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pages-test-'));
  await put(dir, 'script.md', SCRIPT);
  // C01: picked face, sheet, voice round, and a 480p element kept on purpose: the record's final_file left blank
  for (let i = 1; i <= 2; i++) await put(dir, `cast/C01-ida/r1-faces/C01-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`f${i}`)]));
  await put(dir, 'cast/C01-ida/pick-face.png', Buffer.concat([PNG, Buffer.from('f1')]));
  await put(dir, 'cast/C01-ida/pick.png', Buffer.concat([PNG, Buffer.from('s')]));
  await put(dir, 'elements/C01/takes/take1/E-C01-take1-480p.mp4', 'mp4');
  await put(dir, 'elements.json', JSON.stringify({ elements: { C01: { id: null, video_element: {
    draft_file: 'elements/C01/takes/take1/E-C01-take1-480p.mp4', final_file: '', final_job: '', note: '480p draft only' } } } }));
  await put(dir, 'voices/options/C01-ida-r1-1.mp3', 'mp3');
  await put(dir, 'voices/options/C01-ida-r1-2.mp3', 'mp3');
  await put(dir, 'voices/options.json', JSON.stringify({ C01: { name: 'Ida', options: [
    { option: 1, round: 'r1', file: 'voices/options/C01-ida-r1-1.mp3', f0: 127, brief: `preset voice (${UUID})`, kind: 'preset' },
    { option: 2, round: 'r1', file: 'voices/options/C01-ida-r1-2.mp3', f0: 150, brief: `a variant of a preset (${UUID})`, kind: 'variant' },
  ], chosen: { option: 2 } } }));
  // L01: the flow's own filing (Flow 4, Outputs): loose candidates and "<L>-<name>-pick.png" at the root, no master yet
  await put(dir, 'locations/L01-jetty/L01-jetty-cand-A.png', Buffer.concat([PNG, Buffer.from('A')]));
  await put(dir, 'locations/L01-jetty/L01-jetty-cand-B.png', Buffer.concat([PNG, Buffer.from('BB')]));
  await put(dir, 'locations/L01-jetty/L01-jetty-pick.png', Buffer.concat([PNG, Buffer.from('BB')]));
  await put(dir, 'locations/L01-jetty/L01-jetty-plan-v1.png');
  // the review record: misses on a clothing candidate, a take check's misses, misses on a scene with no take named,
  // and the cut approved on its own card, placed at the Sound step
  await put(dir, 'review/cards.json', JSON.stringify({ title: 'The Jar', sections: [
    { heading: 'Clothing', cards: [{ type: 'images', id: 'ASK-C01-look-r1', title: 'C01 Ida: which clothing (round 1)', at: 'clothing', for: 'C01', ask: 'pick',
      items: [{ id: 'A', label: 'A', file: 'cast/C01-ida/pick.png', text: 'A coat. Miss: two buttons came out misshapen.' }], answer: { option: 'A', at: '2026-11-19T12:00:00Z' } }] },
    { heading: 'Takes', cards: [
      { type: 'video', title: 'S2 · the reply: take 1 (480p draft)', at: 'scenes', for: 'S2', text: 'Checked. Misses: one ring, not two; her face in profile.' },
      { type: 'video', title: 'S1 · the find: a note', at: 'scenes', for: 'S1', text: 'Miss: the jar is too big.' },
    ] },
    { heading: 'Cut', cards: [
      { type: 'video', id: 'ASK-cut-v3', title: 'The Jar, cut v3 at 480p: approve as the finished film', at: 'sound', ask: 'yes', file: 'cut/renders/v3-proxy.mp4',
        answer: { note: 'yes on the card', at: '2026-11-19T14:30:00Z' } },
      { type: 'audio', id: 'ASK-music', title: 'Music for cut v3: approve', at: 'sound', ask: 'yes', answer: { note: 'yes', at: '2026-11-19T14:20:00Z' } },
    ] },
  ] }));
  return dir;
}

async function main(): Promise<void> {
  process.env.HARNESS_ALMA_DRYRUN = '1';
  const { readCharacters } = await import('../src/server/films/read/cast');
  const { readScriptText } = await import('../src/server/films/read/script');
  const { readLocations } = await import('../src/server/films/read/locations');
  const { readReview } = await import('../src/server/films/read/review');
  const { readFeed } = await import('../src/server/films/read/feed');
  const { Warnings } = await import('../src/server/films/util');
  const { approvalOf } = await import('../src/components/edit/left');
  const { parseScript } = await import('../src/server/edit/plan');
  const { buildScene, READING_PACE } = await import('../src/components/edit/planned');
  const { pickedWhere } = await import('../src/server/actions/taste');
  const dir = await film();
  const root = await mkdtemp(path.join(os.tmpdir(), 'pages-test-harness-'));
  try {
    // 3. the names of the ID table
    const script = readScriptText(SCRIPT);
    ok('names: "C01 Ida, the ferry keeper; C02 …" gives Ida', script.names.get('C01') === 'Ida', [...script.names]);
    ok('names: the narrator is a name of his own', script.names.get('C02') === 'the Narrator (voice only, never seen)', script.names.get('C02'));
    ok('names: what follows the comma is her role', script.roles.get('C01') === 'the ferry keeper', script.roles.get('C01'));
    ok('names: props split on ";" too', script.names.get('P01') === 'the jar' && script.names.get('P02') === 'the note', [...script.names]);
    const plain = readScriptText(SCRIPT.replace('C01 Ida, the ferry keeper; C02 the Narrator (voice only, never seen)', 'C01 Ida, C02 Bo'));
    ok('names: the comma list still reads as before', plain.names.get('C01') === 'Ida' && plain.names.get('C02') === 'Bo', [...plain.names]);

    // 1 and 7. the element and the voice notes
    const ctx = { dir, warn: new Warnings() };
    const chars = await readCharacters(ctx, script, [], false);
    const ida = chars.find((c) => c.id === 'C01');
    ok('C01: her name is Ida, not two characters run together', ida?.name === 'Ida', ida?.name);
    ok('element: final_file "" leaves the draft as the clip shown', ida?.element?.state === 'draft' && ida.element.path === 'elements/C01/takes/take1/E-C01-take1-480p.mp4', ida?.element);
    const notes = ida?.voice?.rounds.flatMap((r) => r.candidates.map((c) => c.note)) ?? [];
    ok('voice notes: no raw id', notes.join('|') === 'preset voice|a variant of a preset', notes);

    // 5. the place: the pick is the main image until a master is painted
    const locs = await readLocations(ctx, script.names, new Map(), new Map(), new Map(), []);
    const l = locs[0];
    ok('place: the pick is the main image before any master', l?.master?.path === 'locations/L01-jetty/L01-jetty-pick.png' && l.master.picked === true, l?.master);
    ok('place: the loose candidates are its round, the pick matched', l?.styleImages?.[0]?.candidates.map((c) => c.id).join() === 'A,B' && l.styleImages[0].pick === 'B', l?.styleImages);
    await put(dir, 'locations/L01-jetty/L01-jetty-master-v1.png', Buffer.concat([PNG, Buffer.from('M')]));
    const later = (await readLocations({ dir, warn: new Warnings() }, script.names, new Map(), new Map(), new Map(), []))[0];
    ok('place: once painted, the master is the main image', later?.master?.path === 'locations/L01-jetty/L01-jetty-master-v1.png', later?.master);

    // 9. misses that are not a take's
    const rctx = { dir, warn: new Warnings() };
    const review = await readReview(rctx, []);
    ok('misses: a take check\'s are read under its take', review?.misses.some((m) => m.scene === 'S2' && m.take === 'take1' && m.misses.length === 2) === true, review?.misses);
    ok('misses: none said about the clothing card', !rctx.warn.list.some((w) => /Clothing/.test(w)), rctx.warn.list);
    ok('misses: a scene\'s with no take named is still said', rctx.warn.list.some((w) => /S1 · the find/.test(w)), rctx.warn.list);

    // 2. the cut's yes on its own card, placed at Sound
    const feed = await readFeed({ dir, warn: new Warnings() }, 'the-jar');
    ok('cut approved: the yes on ASK-cut-v3 at Sound is read', approvalOf(feed.cards, ['v1', 'v2', 'v3'])?.version === 'v3', approvalOf(feed.cards, ['v1', 'v2', 'v3']));
    ok('cut approved: a yes on music that names the cut is not it', approvalOf(feed.cards.filter((c) => c.id !== 'ASK-cut-v3'), ['v1', 'v2', 'v3']) === undefined);

    // 8. a narrator's line over the picture is in no previz take
    const plan = parseScript(SCRIPT)!;
    const s1 = plan.scenes.find((s) => s.id === 'S1')!;
    ok('plan: the narrator\'s line is a voice-over', s1.items.some((x) => x.who === 'NARRATOR' && x.vo === true), s1.items);
    const b1 = buildScene({ ...s1, previz: { take: 3, lines: [] } }, READING_PACE, 24);
    ok('plan: no mismatch said for a voice-over the previz does not speak', !b1.timing.why && b1.lines.some((c) => c.who === 'NARRATOR'), b1.timing);
    const s2 = plan.scenes.find((s) => s.id === 'S2')!;
    const b2 = buildScene({ ...s2, previz: { take: 2, lines: [] } }, READING_PACE, 24);
    ok('plan: a spoken line the previz lacks is still a mismatch', !!b2.timing.why, b2.timing);

    // 10. the taste row's words
    ok('taste: Done picking', pickedWhere('the Done picking button') === 'with the Done picking button in Hitchcock Harness', pickedWhere('the Done picking button'));
    ok('taste: an older place that named the app', pickedWhere('Done picking, in Hitchcock Harness') === 'on Done picking in Hitchcock Harness', pickedWhere('Done picking, in Hitchcock Harness'));
    ok('taste: a page', pickedWhere('the Voices page') === 'on the Voices page in Hitchcock Harness');
    ok('taste: nothing known', pickedWhere(undefined) === 'in Hitchcock Harness' && pickedWhere('Hitchcock Harness') === 'in Hitchcock Harness');

    // 11. the thread info says whether a turn runs (a dry run: nothing reaches claude)
    process.env.HARNESS_DIR = path.join(root, 'harness');
    process.env.HARNESS_FILM_REPO = root;
    process.env.HARNESS_ALMA_DRYRUN_FILE = path.join(root, 'dryrun.jsonl');
    const { getAlma } = await import('../src/server/claude/process');
    const alma = getAlma('pages-test-film');
    ok('info: idle before any message', alma.info().turn?.working === false && alma.info().turn?.queued === 0, alma.info().turn);
    await alma.send('one');
    const busy = alma.info().turn;
    ok('info: working while the turn runs, with when it started', busy?.working === true && typeof busy.since === 'string', busy);
    for (let i = 0; i < 100 && alma.busy; i++) await new Promise((r) => setTimeout(r, 20));
    ok('info: idle again after the turn\'s result', alma.info().turn?.working === false && !alma.info().turn?.since, alma.info().turn);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
  console.log(`${n - bad} of ${n} checks passed`);
  process.exit(bad ? 1 : 0);
}

void main();
