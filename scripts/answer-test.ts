// npm run answer:test [-- <empty test root>]
// Builds a small film of its own under <root> (a repo with taste.md and one film whose review/cards.json holds
// cards that ask), then runs the feed reader and the answer action against it. Nothing is sent to Alma and no
// real film is read or written. Refuses a root that is not empty or that sits inside the real film repo. Without a
// root it makes one in the temp folder (so a runner can run it) and deletes it after.
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const own = !process.argv[2];
const root = own ? mkdtempSync(path.join(os.tmpdir(), 'answer-test-')) : path.resolve(process.argv[2]);
process.env.HARNESS_FILM_REPO = path.join(root, 'repo');
process.env.HARNESS_DIR = path.join(root, 'harness');
// never a message to the real Alma, even from a call that is meant to be refused
process.env.HARNESS_ALMA_DRYRUN = '1';
process.env.HARNESS_ALMA_DRYRUN_FILE = path.join(root, 'alma-dryrun.jsonl');

let bad = 0;
const check = (what: string, ok: boolean, got?: unknown): void => {
  if (!ok) { bad++; process.exitCode = 1; }
  console.log(`${ok ? 'ok  ' : 'FAIL'} · ${what}${ok || got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 300)}`}`);
};

const FILM = 'test-film';
const CARDS = {
  title: 'Test Film',
  sections: [
    { heading: 'Sound · 11 Nov 2026', cards: [
      { type: 'audio', id: 'word-r3', title: '"Maren" · six readings', at: 'sound', for: 'S2', ask: 'pick', prediction: '4', updated: '2026-11-11T10:00',
        items: [1, 2, 3, 4, 5, 6].map((n) => ({ file: `audio/words/r3-${n}.mp3`, label: `reading ${n}` })) },
      { type: 'audio', id: 'music-r1', title: 'The music · round 1', at: 'sound', ask: 'pick', options: [{ id: 'FILM', label: 'your brief', file: 'audio/score/FILM-take1.mp3' }, { id: 'MELODY', label: 'my brief', file: 'audio/score/MELODY-take1.mp3' }] },
      { type: 'card', id: 'pickup-s3-go', title: 'FIX-S3-shot3 · set-up v1', at: 'scenes', for: ['S3', 'FIX-S3-shot3'], ask: 'go', cost: '32 credits', text: 'One 8 s shot at 480p.' },
      { type: 'video', id: 'title-card', title: 'The title card', at: 'edit', ask: 'yes', file: 'edits/title/card.mp4' },
      { type: 'audio', id: 'speed-r1', title: 'Four speeds', at: 'sound', ask: 'pick', answer: { option: '2', at: '2026-11-10' }, items: [{ file: 'a/1.mp3' }, { file: 'a/2.mp3' }] },
      { type: 'video', title: 'No id but asks', ask: 'yes', file: 'cut/x.mp4' },
      { type: 'card', id: 'bad-at', title: 'Sent to a place that is not one', at: 'post', text: 'x' },
      { type: 'video', title: 'S2 · take 3 · 480p draft', file: 'generations/S2/take3.mp4' },
    ] },
  ],
};
const TASTE = '# Taste\n\n## The record\n\n| Date | Film | Choice | The candidates | The pick | The user\'s words | Predicted | Right? | What it says |\n|---|---|---|---|---|---|---|---|---|\n| 2026-11-01 | Old | x | a, b (2) | **a** | – | a | yes | – |\n\n## The score\n\n1 of 1.\n';

async function main(): Promise<void> {
  if (root.startsWith('/path/to/hitchcock-harness/studio') || root.startsWith('/Volumes/')) throw new Error('refusing: the test root must be a scratch folder');
  await fs.mkdir(root, { recursive: true });
  if ((await fs.readdir(root)).length) throw new Error(`refusing: ${root} is not empty`);
  const repo = process.env.HARNESS_FILM_REPO!;
  const dir = path.join(repo, 'assets', 'films', FILM);
  await fs.mkdir(path.join(dir, 'review'), { recursive: true });
  await fs.mkdir(process.env.HARNESS_DIR!, { recursive: true });
  await fs.writeFile(path.join(dir, 'review', 'cards.json'), JSON.stringify(CARDS, null, 1));
  await fs.writeFile(path.join(dir, 'brief.md'), '# Test Film\n');
  await fs.writeFile(path.join(repo, 'taste.md'), TASTE);

  const { readFeed, feedSummary, feedFor } = await import('../src/server/films/read/feed');
  const { answerCard } = await import('../src/server/actions/answer');
  const { Warnings } = await import('../src/server/films/util');
  const ctx = { dir, warn: new Warnings() };
  const show = async (label: string): Promise<void> => {
    const feed = await readFeed(ctx, FILM);
    console.log(`\n--- ${label}`);
    for (const c of feed.cards) console.log(`  ${c.key.padEnd(13)} ${c.place.padEnd(7)} ${c.placed.padEnd(5)} [${c.ids.join(',')}] ${c.ask ? `${c.ask.kind}(${c.ask.options.map((o) => o.id).join('/')})${c.ask.answer ? ` answered ${c.ask.answer.option ?? 'yes'} by ${c.ask.answer.by}` : ' OPEN'}` : ''}  ${c.title}`);
    console.log('  warnings:', feed.warnings);
    const sum = feedSummary(feed);
    console.log('  counts:', JSON.stringify(sum.counts), '· open asks:', sum.asks.map((a) => a.key).join(', '));
    console.log('  S3 page:', feedFor(feed, { id: 'S3' }).map((c) => c.key).join(', '), '· sound page:', feedFor(feed, { places: ['sound'] }).map((c) => c.key).join(', '));
  };
  {
    // several picks with one button: one message, a taste row each; a bad one stops them all before any write
    const { answerCards } = await import('../src/server/actions/answer');
    const before = await fs.readFile(path.join(repo, 'taste.md'), 'utf8');
    const refusedMany = await answerCards([{ card: 'word-r3', option: '4' }, { card: 'music-r1', option: 'NOPE' }], FILM).then(() => 'taken', (e: { status?: number }) => `refused ${e.status}`);
    console.log('\n--- several answers');
    check('several answers with one bad option: refused before any write', refusedMany.startsWith('refused') && (await fs.readFile(path.join(repo, 'taste.md'), 'utf8')) === before, refusedMany);
    const dry = await answerCards([{ card: 'word-r3', option: '4', from: 'the gate on Main' }, { card: 'music-r1', option: 'FILM', from: 'the gate on Main' }], FILM, { dryRun: true });
    check('several answers, dry: nothing written', (await fs.readFile(path.join(repo, 'taste.md'), 'utf8')) === before, dry.notified);
    console.log(dry.message.split('\n').map((l) => '  | ' + l).join('\n'));
    // "Done picking": a pick, a yes and a go together, one message
    const { sendChoices } = await import('../src/server/actions/answer');
    const all = await sendChoices({ answers: [{ card: 'word-r3', option: '2' }, { card: 'title-card' }, { card: 'pickup-s3-go' }], picks: [] }, FILM, { dryRun: true });
    check('done picking, dry: one message, nothing written', !!all.message && (await fs.readFile(path.join(repo, 'taste.md'), 'utf8')) === before, all.notified);
    console.log(all.message.split('\n').map((l) => '  | ' + l).join('\n'));
    const none = await sendChoices({ answers: [], picks: [] }, FILM).then(() => 'taken', (e: { status?: number }) => `refused ${e.status}`);
    check('nothing chosen: refused', none.startsWith('refused'), none);
  }
  await show('as written');

  const fails = async (label: string, input: Parameters<typeof answerCard>[0]): Promise<void> => {
    try { await answerCard(input, FILM, { notify: false }); check(`refused: ${label}`, false, 'taken'); }
    catch (e) { check(`refused: ${label}`, true); console.log(`       ${(e as Error).message}`); }
  };
  console.log('\n--- refusals');
  await fails('no such card', { card: 'nope' });
  await fails('option not on the card', { card: 'word-r3', option: '9' });
  await fails('already answered', { card: 'speed-r1', option: '1' });
  await fails('a card that does not ask', { card: 'bad-at' });

  const before = await fs.readFile(path.join(repo, 'taste.md'), 'utf8');
  const dry = await answerCard({ card: 'word-r3', option: '3', from: 'the gate page' }, FILM, { dryRun: true });
  console.log('\n--- dry run: word-r3 → 3');
  for (const w of dry.writes) console.log(`  ${w.op.padEnd(6)} ${w.where}`);
  console.log(`  taste row: ${dry.tasteRow}`);
  check('a dry run writes neither taste.md nor answers.json', (await fs.readFile(path.join(repo, 'taste.md'), 'utf8')) === before && !(await fs.stat(path.join(process.env.HARNESS_DIR!, 'answers.json')).then(() => true, () => false)));

  for (const input of [
    { card: 'word-r3', option: '3', note: 'the third, it is firmer', from: 'the gate page' },
    { card: 'music-r1', option: 'MELODY', from: 'the Sound page' },
    { card: 'pickup-s3-go', from: 'the gate page' },
    { card: 'title-card', from: 'the Edit page' },
  ]) {
    const res = await answerCard(input, FILM, { notify: false });
    console.log(`\n--- ${res.kind}: ${res.card}${res.option ? ` → ${res.option}` : ''}`);
    for (const w of res.writes) console.log(`  ${w.op.padEnd(6)} ${w.where}`);
    if (res.tasteRow) console.log(`  taste row: ${res.tasteRow}`);
    console.log(`  to Alma (not sent):\n    ${res.message.split('\n').join('\n    ')}`);
  }
  const after = await fs.readFile(path.join(repo, 'taste.md'), 'utf8');
  check('taste.md: a row for each pick, the score section kept last', after.split('\n').length - before.split('\n').length === 2 && after.trimEnd().endsWith('1 of 1.'), after.split('\n').length - before.split('\n').length);
  const kept = Object.keys(JSON.parse(await fs.readFile(path.join(process.env.HARNESS_DIR!, 'answers.json'), 'utf8'))[FILM] ?? {});
  check('answers.json holds the four answers', kept.sort().join() === 'music-r1,pickup-s3-go,title-card,word-r3', kept);
  console.log('answers.json:', await fs.readFile(path.join(process.env.HARNESS_DIR!, 'answers.json'), 'utf8'));
  await show('after the answers');
}

main().then(() => {
  console.log(bad ? `${bad} checks failed` : 'answer:test · every check passed');
}, (e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}).finally(() => { if (own) rmSync(root, { recursive: true, force: true }); });
