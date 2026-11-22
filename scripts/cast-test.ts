// npm run cast:test
// The cast as the board and the character pages read it (ASKS 46, 14 Nov 2026), on synthetic film folders of the shape
// A sample film has: a character taken whole from the library (a face pick file and a sheet, no rounds),
// a character in two looks whose video element is filed under its looks (elements/C04a, elements.json "C04a"), a group,
// a character with no lines, and one still at the face round. Checks the two lines that were false on 14 Nov ("no
// video element, waiting, asks for your go" and "wardrobe waiting for the face pick"), the cards' five parts, the
// character page's order, and the element read from the record, from a folder and from a look.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { elementKeys, readCharacters } from '../src/server/films/read/cast';
import { Warnings, type FilmCtx } from '../src/server/films/util';
import { castLines, facePath } from '../src/components/characters/Cards';
import { blockOrder } from '../src/components/characters/CharacterView';
import { clothingParts, faceDone, elementParts, voiceDone } from '../src/components/lib/derive';
import { flowOf } from '../src/components/lib/flow';
import { waitItemsOf } from '../src/components/flow/waitList';
import type { TastePickX } from '../src/server/films/read/taste';
import type { CharacterRef, FilmState } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const put = async (root: string, rel: string, body: string | Buffer = PNG) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body);
};

async function film(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cast-test-'));
  // C01: from the library, whole: no rounds, the face and the sheet as pick files, the voice brought along
  await put(dir, 'cast/C01-maren/pick-face.png', Buffer.concat([PNG, Buffer.from('a')]));
  await put(dir, 'cast/C01-maren/pick.png', Buffer.concat([PNG, Buffer.from('b')]));
  await put(dir, 'cast/C01-maren/voice/element-line-5s.mp3', 'mp3');
  await put(dir, 'elements/C01/takes/take1/E-C01-take1-1080p.mp4', 'mp4');
  // C04: picked in round 1, two looks; the element is filed under the first look, in elements.json and on disk
  for (let i = 1; i <= 3; i++) await put(dir, `cast/C04-edda/r1-faces/C04-edda-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`x${i}`)]));
  await put(dir, 'cast/C04-edda/pick-face.png', Buffer.concat([PNG, Buffer.from('x2')]));
  await put(dir, 'cast/C04-edda/pick-wardrobe.png', Buffer.concat([PNG, Buffer.from('w')]));
  await put(dir, 'cast/C04-edda/pick.png', Buffer.concat([PNG, Buffer.from('s')]));
  await put(dir, 'cast/C04-edda/pick-C04b.png', Buffer.concat([PNG, Buffer.from('s2')]));
  await put(dir, 'elements/C04a/takes/take1/E-C04a-take1-480p.mp4', 'mp4');
  await put(dir, 'elements/C04a/takes/take1/E-C04a-take1-1080p.mp4', 'mp4');
  await put(dir, 'elements/C04b/E-C04b-v1-5s.prompt.txt', 'a prompt, no clip yet');
  // C05: the element only on disk, under the character's own ID
  for (let i = 1; i <= 2; i++) await put(dir, `cast/C05-neighbour/r1-faces/C05-neighbour-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`n${i}`)]));
  await put(dir, 'cast/C05-neighbour/pick-face.png', Buffer.concat([PNG, Buffer.from('n1')]));
  await put(dir, 'elements/C05/takes/take2/E-C05-take2-480p.mp4', 'mp4');
  // C03: no lines; C06-C07: a group; C08: still at the face round
  await put(dir, 'cast/C03-scirpalus/r1-faces/C03-scirpalus-r1-1.png', Buffer.concat([PNG, Buffer.from('c')]));
  await put(dir, 'cast/C03-scirpalus/pick-face.png', Buffer.concat([PNG, Buffer.from('c')]));
  await put(dir, 'cast/C03-scirpalus/pick.png', Buffer.concat([PNG, Buffer.from('cs')]));
  await put(dir, 'cast/C06-C07-sons/pick.png', Buffer.concat([PNG, Buffer.from('g')]));
  for (let i = 1; i <= 4; i++) await put(dir, `cast/C08-boy/r1-faces/C08-boy-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`b${i}`)]));
  await put(dir, 'elements.json', JSON.stringify({ elements: {
    C03: { id: 'img-c03', source: 'cast/C03-scirpalus/pick.png' },
    C04a: { id: 'img-c04a', source: 'cast/C04-edda/pick.png', video_element: { draft_file: 'elements/C04a/takes/take1/E-C04a-take1-480p.mp4', final_file: 'elements/C04a/takes/take1/E-C04a-take1-1080p.mp4' } },
    C04b: { id: 'img-c04b', source: 'cast/C04-edda/pick-C04b.png' },
    'C06-C07': { id: 'img-sons' },
  } }));
  await put(dir, 'brief.md', '# Test\n\n## Cast\n- **C03 Scirpalus**: the auctioneer\'s man, no lines\n');
  return dir;
}

/** A voice picked on Alma's card and recorded only in taste.md, before pick.py saved it in voices/ (a row that
 *  names option "3" bare once gave no pick, so the voice still showed as waiting). The bare option number is the pick; the picked voice is not on "Waiting for you". */
async function voiceFromTaste(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cast-test-voice-'));
  try {
    for (let i = 1; i <= 3; i++) {
      await put(dir, `cast/C02-tobias/r1-faces/C02-tobias-r1-${i}.png`, Buffer.concat([PNG, Buffer.from(`p${i}`)]));
      await put(dir, `voices/options/C02-tobias-r1-${i}.mp3`, 'mp3');
    }
    await put(dir, 'cast/C02-tobias/pick-face.png', Buffer.concat([PNG, Buffer.from('p1')]));
    await put(dir, 'voices/options.json', JSON.stringify({ C02: { name: 'Tobias', options: [1, 2, 3].map((o) => ({ option: o, round: 'r1', file: `voices/options/C02-tobias-r1-${o}.mp3` })) } }));
    const row = (pick: string): TastePickX => ({ film: 'Test', date: '2026-11-21', what: 'C02 Tobias: which voice (round 1)', prediction: '1', pick, right: false });
    const read = async (rows: TastePickX[]) => (await readCharacters({ dir, warn: new Warnings() }, undefined, rows, false)).find((c) => c.id === 'C02')!;
    const before = await read([]);
    ok('voice: options landed and nothing picked, the voice waits', !voiceDone(before) && before.voice?.rounds[0]?.candidates.length === 3, before.voice);
    const st = (c: CharacterRef) => ({ characters: [c], locations: [], scenes: [], spend: { lines: [] }, film: { status: 'in-progress' } } as unknown as FilmState);
    ok('voice: unpicked, it is a choice on "Waiting for you"', waitItemsOf(flowOf(st(before), [])).some((x) => x.key === 'gate:pick:C02:voice'), waitItemsOf(flowOf(st(before), [])).map((x) => x.key));
    const after = await read([row('3: 3 · 95 Hz, slow and dark, a middle range')]);
    ok('voice: the taste row\'s bare option "3" is the pick', after.voice?.pick?.candidateId === '3' && voiceDone(after), after.voice?.pick);
    ok('voice: the prediction "1" is read too', after.voice?.rounds[0]?.prediction === '1', after.voice?.rounds[0]?.prediction);
    ok('voice: a picked voice is not on "Waiting for you" and counts nothing', !waitItemsOf(flowOf(st(after), [])).length && flowOf(st(after), []).waiting === 0, waitItemsOf(flowOf(st(after), [])).map((x) => x.key));
    ok('voice: a number inside the words is not a pick ("about 3 voices")', !(await read([row('none yet: about 3 voices more')])).voice?.pick);
    // the kit's own record (pick.py): voices/cast.json names the picked preview; with no "chosen" in options.json and no
    // taste row, that entry alone is the pick (Tobias's voice as the film holds it)
    await put(dir, 'voices/cast.json', JSON.stringify({ C02: { name: 'Tobias', source: 'design option 3 (r1 round)', preview: 'voices/options/C02-tobias-r1-3.mp3', note: 'picked on the voice card' } }));
    const kit = await read([]);
    ok('voice: voices/cast.json alone is the pick, option 3 from its preview and source', kit.voice?.pick?.candidateId === '3' && voiceDone(kit), kit.voice?.pick);
    ok('voice: picked in cast.json, not on "Waiting for you"', !waitItemsOf(flowOf(st(kit), [])).length, waitItemsOf(flowOf(st(kit), [])).map((x) => x.key));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
const dir = await film();
try {
  const ctx: FilmCtx = { dir, warn: new Warnings() };
  const chars = await readCharacters(ctx, undefined, [], false);
  const by = (id: string): CharacterRef => chars.find((c) => c.id === id)!;
  ok('every character read', chars.map((c) => c.id).join() === 'C01,C03,C04,C05,C06-C07,C08', chars.map((c) => c.id));

  // elementKeys
  ok('keys: the ID, then its looks, first look first, once each', elementKeys('C04', ['C04b', 'C04a', 'C04', 'C04a', 'C040', 'C05a']).join() === 'C04,C04a,C04b', elementKeys('C04', ['C04b', 'C04a', 'C04', 'C04a', 'C040', 'C05a']));
  ok('keys: a group ID is matched as it is', elementKeys('C06-C07', ['C06-C07']).join() === 'C06-C07');

  // false line 1: Edda has a video element, filed under her first look
  const x = by('C04');
  ok('C04: the element is final, from the look C04a', x.element?.state === 'final' && x.element.path === 'elements/C04a/takes/take1/E-C04a-take1-1080p.mp4', x.element);
  ok('C04: registered as an image element through his looks', x.imageElement === true);
  ok('C04: the card says Video element done', castLines(x).find((l) => l.key === 'elements')?.mark === 'done', castLines(x));
  ok('C04: the flow counts his element final', elementParts({ characters: chars, film: { status: 'in-progress' } } as unknown as FilmState, []).find((p) => p.id === 'C04')?.line === 'Video element · done');
  ok('C04: his page opens on the video element', blockOrder(x)[0] === 'element', blockOrder(x));
  // the same from a folder alone, under the character's own ID
  ok('C05: a draft found on disk under elements/C05', by('C05').element?.state === 'draft' && by('C05').element?.path === 'elements/C05/takes/take2/E-C05-take2-480p.mp4', by('C05').element);
  ok('C01: a final found on disk under elements/C01', by('C01').element?.state === 'final');

  // false line 2: Maren, taken from the library, has her face and clothing
  const d = by('C01');
  ok('C01: reused (pick files, no rounds)', d.reused === true && !d.face, d);
  ok('C01: the face counts as picked', faceDone(d));
  ok('C01: her face shows from the pick file', facePath(d) === 'cast/C01-maren/pick-face.png', facePath(d));
  const cloth = clothingParts({ characters: chars, film: { status: 'in-progress' } } as unknown as FilmState, []).find((p) => p.id === 'C01');
  ok('C01: clothing is not "waiting for the face pick"', cloth?.state === 'done' && !/face pick/.test(cloth.line), cloth);
  ok('C01: the card says Face and Clothing done', ['faces', 'clothing'].every((k) => castLines(d).find((l) => l.key === k)?.mark === 'done'), castLines(d));
  ok('C01: the voice brought along counts', castLines(d).find((l) => l.key === 'voices')?.mark === 'done');

  // the others, so the cards fill in as picks are made
  ok('C03: no lines, so no voice and no video element needed', castLines(by('C03')).filter((l) => l.mark === 'none').map((l) => l.key).join() === 'voices,elements', castLines(by('C03')));
  ok('C03: his page is the sheet then the face, no element or voice', blockOrder(by('C03')).join() === 'sheet,face', blockOrder(by('C03')));
  ok('C06-C07: a group needs no face of its own', castLines(by('C06-C07'))[0].mark === 'none');
  ok('C06-C07: the page is the group sheet alone', blockOrder(by('C06-C07')).join() === 'sheet', blockOrder(by('C06-C07')));
  const boy = by('C08');
  ok('C08: still at the face round: nothing done', castLines(boy).every((l) => l.mark === 'todo'), castLines(boy));
  ok('C08: his page shows the sheet first while there is no element', blockOrder(boy).join() === 'sheet,element,face,voice', blockOrder(boy));
  ok('C08: clothing waits for the face pick, truly', clothingParts({ characters: chars, film: { status: 'in-progress' } } as unknown as FilmState, []).find((p) => p.id === 'C08')?.line === 'waiting for the face pick');
} finally {
  await rm(dir, { recursive: true, force: true });
}
await voiceFromTaste();
console.log(`${n - bad} of ${n} checks passed`);
if (bad) process.exit(1);
}

void main();
