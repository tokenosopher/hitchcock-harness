// npx tsx scripts/elements-test.ts
// The Character elements step . On a sample film the board said "1 of 3" with a
// spinner while Tobias's was the only new video element: the cast reader did not take "silent" in the script's ID row,
// so the assistant counted as speaking, and Maren, from the library, counted too. Checks, on the sample shaped like
// that film (src/fixtures/elements.ts): one row per character in plain words, the count over the new elements only
// ("1 of 1" while Tobias's is made), no spinner for the silent and the extras, the one go card with the sheet, the face
// and the line, and the reader taking "silent" from the ID row and the brief.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ELEMENT_GO, elementsSampleState } from '../src/fixtures/elements';
import { flowOf } from '../src/components/lib/flow';
import { elementParts } from '../src/components/lib/derive';
import { castBoxLines, castLine } from '../src/components/characters/Cards';
import { askLayout } from '../src/components/feed/askMedia';
import { readCharacters } from '../src/server/films/read/cast';
import { readScript } from '../src/server/films/read/script';
import { Warnings, type FilmCtx } from '../src/server/films/util';
import type { TaskCard } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const making: TaskCard[] = [{ id: 't-e-c02', title: 'Alma › element · C02 480p draft', state: 'running', startedAt: '2026-11-21T16:05:00.000Z', steps: [] }];
const s = elementsSampleState('sample-elements-making')!;
const parts = elementParts(s, making);
const by = (id: string) => parts.find((p) => p.id === id)!;

// one row per character, the people and the group, in plain words
ok('a row for each character, the extras too', parts.map((p) => p.id).join() === 'C01,C02,C03,C04-C04', parts.map((p) => p.id));
ok('C01 from the library: done', by('C01').state === 'done' && by('C01').line === 'Video element · from the library', by('C01'));
ok('C02 being made', by('C02').state === 'running' && by('C02').line === 'Video element · being made', by('C02'));
ok('C03 silent: image element only, done at once', by('C03').state === 'done' && by('C03').line === 'Image element only · no lines, no video element needed', by('C03'));
ok('C04 extras: image element only, done at once', by('C04-C04').state === 'done' && /^Image element only · /.test(by('C04-C04').line), by('C04-C04'));
ok('only Tobias counts as a new element', parts.filter((p) => p.newElement).map((p) => p.id).join() === 'C02', parts.filter((p) => p.newElement).map((p) => p.id));
ok('only the video element rows can spin', parts.filter((p) => p.state === 'running' || p.state === 'queued').every((p) => p.line.startsWith('Video element')));

// the board's box: "Character elements", "1 of 1" while Tobias's is made
const f = flowOf(s, making);
const el = f.nodes.elements;
ok('the box is named Character elements', el.name === 'Character elements', el.name);
ok('"1 of 1" while Tobias\'s is made', el.short === '1 of 1', el.short);
ok('the status names only Tobias', !/C03|C04|C01/.test(el.status) && /C02/.test(el.status), el.status);
ok('the box spins for Tobias\'s job alone', el.state === 'running' && el.aims.every((a) => a.ids.includes('C02')), [el.state, el.aims.map((a) => a.ids)]);

// waiting for the go: one card, nothing spins, "0 of 1"
const g = elementsSampleState('sample-elements')!;
const gp = elementParts(g, []);
ok('C02 waits for your go', gp.find((p) => p.id === 'C02')?.line === 'Video element · waiting for your go' && gp.find((p) => p.id === 'C02')?.state === 'ready', gp.find((p) => p.id === 'C02'));
const gf = flowOf(g, []);
ok('waiting for the go: the box waits for you, no spinner', gf.nodes.elements.short === 'waits' && gf.nodes.elements.state === 'pick', [gf.nodes.elements.short, gf.nodes.elements.state]);
ok('the page line counts the new ones', /^0 of 1 done, 1 from the library/.test(castLine(g, 'elements')), castLine(g, 'elements'));

// done: "1 of 1" final, the cards' words count the new ones
const d = elementsSampleState('sample-elements')!;
d.feed = { counts: {}, asks: [] };
d.characters = d.characters.map((c) => (c.id === 'C02' ? { ...c, element: { path: 'elements/C02/takes/take1/E-C02-take1-1080p.mp4', state: 'final' as const } } : c));
const df = flowOf(d, []);
ok('done: "1 of 1", the step done', df.nodes.elements.short === '1 of 1' && df.nodes.elements.state === 'done', [df.nodes.elements.short, df.nodes.elements.state]);
ok('done: the box line in the cards\' words', castBoxLines(d, df).elements === '1 of 1 done, 1 from the library', castBoxLines(d, df));

// the one go card: the sheet, the face and the line, the quote; the pictures as a row of tiles
ok('the go card holds the sheet, the face and the line', ELEMENT_GO.media.map((m) => m.kind).join() === 'image,image,audio' && ELEMENT_GO.ask?.kind === 'go' && !!ELEMENT_GO.ask.cost);
ok('pictures beside a sound sit as a row of tiles', askLayout(2, true).wide === false && askLayout(2).wide === true);

// the reader: "silent" in the script's ID row, or in the brief's Cast entry, is no lines
async function reader(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'elements-test-'));
  try {
    const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
    const put = async (rel: string, body: string | Buffer = PNG) => { await mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await writeFile(path.join(dir, rel), body); };
    for (const c of ['C02-tobias', 'C03-assistant', 'C05-guard']) await put(`cast/${c}/pick-face.png`, Buffer.concat([PNG, Buffer.from(c)]));
    await put('script.md', [
      '# Test: script', '', '## IDs', '', '| what | ID | in this film |', '|---|---|---|',
      '| character | C02 | TOBIAS, the teacher |', '| character | C03 | THE ASSISTANT, a young man standing beside Tobias; silent |', '| character | C05 | THE GUARD |', '',
    ].join('\n'));
    await put('brief.md', '# Test\n\n## Cast\n- **C05 the guard**, at the door; silent.\n- **C02 Tobias**, the teacher; he speaks.\n');
    const ctx: FilmCtx = { dir, warn: new Warnings() };
    const script = await readScript(ctx);
    const chars = await readCharacters(ctx, script, [], false);
    const c = (id: string) => chars.find((x) => x.id === id);
    ok('reader: "silent" in the ID row is no lines', c('C03')?.silent === true, c('C03'));
    ok('reader: "silent" in the brief\'s Cast entry is no lines', c('C05')?.silent === true, c('C05'));
    ok('reader: a speaking character stays speaking', !c('C02')?.silent, c('C02'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

void reader().then(() => {
  console.log(`${n - bad} of ${n} checks passed`);
  if (bad) process.exit(1);
});
