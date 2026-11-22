// npm run sent:test
// The record of what was sent to the model for a take: builds a small film in the temp folder with two takes
// of S1, one with its <G>-take<N>-sent.json (in the shape tools/takes/record_sent.py writes) and one without, and
// checks that the scene reader finds the record for the first only, that the record reads with its settings, its
// references in order with their words from the media list and a mark on a file not on disk, and that a broken
// record or a path outside the takes is refused. No real film is read or written.
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readScenes } from '../src/server/films/read/scenes';
import { parseSent, readSent, sentPathOk } from '../src/server/films/read/sent';
import { Warnings } from '../src/server/films/util';

const root = mkdtempSync(path.join(os.tmpdir(), 'sent-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}`); };

const PROMPT = 'SCENE\n[MAREN] VIDEO REFERENCE 1: the keeper.\n[LAMP ROOM] IMAGE REFERENCE 1: the lamp room. Her voice is AUDIO REFERENCE 1.';
const RECORD = {
  take: 'S1-take1', kind: 'take', id: 'S1', take_number: 1, job_id: 'abcdef12-3456', submitted: '2026-11-19T10:00:00Z', model: 'seedance_2_5',
  settings: { mode: 'omni_reference', aspect_ratio: '9:16', resolution: '480p', duration: 12, draft: true, generate_audio: true, seed: null, count: 1, use_unlim: false, folder_id: 'f-1' },
  settings_from: 'the files and step 7',
  prompt: { file: 'generations/S1/prompt/S1-prompt-v2.txt', version: 'v2', text: PROMPT, sha1: 'x', chars: PROMPT.length, same_as_file: true },
  references: [
    { order: 1, role: 'video_references', kind: 'VIDEO', n: 1, label: 'VIDEO REFERENCE 1', tag: 'MAREN', media_id: 'm1', file: 'elements/C01/E-C01.mp4', view: false },
    { order: 2, role: 'image_references', kind: 'IMAGE', n: 1, label: 'IMAGE REFERENCE 1', tag: 'HALL', media_id: 'm2', file: 'locations/L01/hall.png', view: true },
    { order: 3, role: 'audio_references', kind: 'AUDIO', n: 1, label: 'AUDIO REFERENCE 1', tag: 'HALL VOICE', media_id: 'm3', file: 'cast/C05/voice.mp3' },
  ],
  layout: { previz_take: 'previz/S1/S1-previz-take-4.json', previz_take_number: 4, storyboard: 'previz/S1/storyboard/v3', storyboard_version: 'v3' },
  lists: { media_list: 'generations/S1/prompt/S1-media-v2.json', take_medias: 'generations/S1/prompt/S1-take-medias-v2.json' },
  spend: { row: true, cost: '36' },
  differences: [],
};
const MEDIA = { media: [
  { kind: 'VIDEO', tag: 'MAREN', file: 'elements/C01/E-C01.mp4', desc: 'Maren, exactly as in this reference.' },
  { kind: 'IMAGE', tag: 'HALL', file: 'locations/L01/hall.png', desc: 'The hall. A voice is {AUDIO:HALL VOICE}.' },
  { kind: 'AUDIO', tag: 'HALL VOICE', file: 'cast/C05/voice.mp3' },
] };

async function main(): Promise<void> {
  const dir = path.join(root, 'film');
  const w = async (rel: string, body: string) => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), body); };
  await w('generations/S1/takes/take1/S1-take1.jobid', 'abcdef12-3456\n');
  await w('generations/S1/takes/take1/S1-take1-sent.json', JSON.stringify(RECORD));
  await w('generations/S1/takes/take2/S1-take2.jobid', 'abcdef12-9999\n');
  await w('generations/S1/prompt/S1-media-v2.json', JSON.stringify(MEDIA));
  await w('elements/C01/E-C01.mp4', 'x');
  await w('locations/L01/hall.png', 'x');
  // cast/C05/voice.mp3 is left out: the record marks it missing

  const ctx = { dir, warn: new Warnings() };
  const { scenes } = await readScenes(ctx, [], []);
  const takes = scenes.find((s) => s.id === 'S1')?.takes ?? [];
  check(takes.find((t) => t.id === 'take1')?.sent === 'generations/S1/takes/take1/S1-take1-sent.json', 'the scene reader finds take 1’s record beside it');
  check(takes.some((t) => t.id === 'take2') && takes.find((t) => t.id === 'take2')?.sent === undefined, 'take 2 has none, and says so by having no path');

  const rec = await readSent(ctx, 'generations/S1/takes/take1/S1-take1-sent.json');
  check(!!rec && rec.prompt.text === PROMPT && rec.prompt.version === 'v2' && rec.jobId === 'abcdef12-3456', 'the record reads with the prompt exactly as sent');
  check(!!rec && rec.model === 'seedance_2_5' && rec.settings.duration === 12 && rec.settings.draft === true && rec.settings.audio === true && rec.settings.seed === null && rec.settings.aspect === '9:16', 'the model and every setting read');
  check(!!rec && rec.settings.more.some(([k, v]) => k === 'folder_id' && v === 'f-1'), 'a setting the view has no place for is kept as text');
  check(rec?.refs.map((r) => r.name).join(',') === 'Video 1,Image 1,Audio 1', 'the references, in the order sent, named as the prompt numbers them');
  check(rec?.refs[0].what === 'C01 element' && rec?.refs[1].view === true && rec?.refs[0].desc === 'Maren, exactly as in this reference.', 'each with what it is and the media list’s words');
  check(rec?.refs[1].desc === 'The hall. A voice is AUDIO REFERENCE 1.', 'the media list’s {AUDIO:…} reads as the prompt sent it');
  check(rec?.refs[2].missing === true && !rec?.refs[0].missing, 'a file no longer on disk is marked missing');
  check(rec?.layout?.previzTakeNumber === 4 && rec?.layout?.storyboardVersion === 'v3' && rec?.spend?.cost === '36', 'the layout and the spend row read');

  check(parseSent({ take: 'x' }, 'generations/S1/takes/take1/S1-take1-sent.json') === undefined, 'a file with no prompt text is not a record');
  await w('generations/S1/takes/take1/S1-take3-sent.json', '{ broken');
  check((await readSent(ctx, 'generations/S1/takes/take1/S1-take3-sent.json')) === undefined, 'a broken file reads as no record');
  check(!sentPathOk('generations/../../etc/S1-take1-sent.json') && !sentPathOk('/etc/x-sent.json') && !sentPathOk('generations/S1/takes/take1/S1-take1.jobid') && sentPathOk('generations/FIX-door-S4/takes/take2/FIX-door-S4-take2-sent.json'), 'only a -sent.json under the film’s takes is read');

  console.log(bad ? `\n${bad} failed` : '\nall passed');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
