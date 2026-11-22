// npx tsx scripts/shot-views-test.ts
// Which painted view stands behind each shot: builds a small film in the temp folder with S1's prompt (one
// shot block a shot, a Placement line naming a view by its [TAG]) and its media list (VIEW lines and an image marked
// as a view), and checks that the view of each shot is the one its Placement line names, that a shot naming no view
// is left out, that "IMAGE REFERENCE <n>" finds a view too, that the newest prompt with a media list is the one read,
// and that a view whose file is gone is left out. No real film is read or written.
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readScenes } from '../src/server/films/read/scenes';
import { shotBlocks, shotViewsOf, viewsOfMedia } from '../src/server/films/read/shotViews';
import { Warnings } from '../src/server/films/util';
import { shortViewNames } from '../src/components/media/ViewThumb';

const root = mkdtempSync(path.join(os.tmpdir(), 'shot-views-test-'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));
let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}`); };

// the shape of a real prompt (a scene of four shots): the views listed under ACTIVE REFERENCES, then one block a shot
const PROMPT = `SCENE CONTEXT
A beach in 1890.

ACTIVE REFERENCES
[MAREN] video character sheet, VIDEO REFERENCE 1: the keeper.
[ROWBOAT] IMAGE REFERENCE 1: the rowboat.
[SHORE FRONT] IMAGE REFERENCE 2: the shore looking north.
[SHORE BACK] IMAGE REFERENCE 3: the shore looking south, out to sea.
[SHORE WEST] IMAGE REFERENCE 4: the beach looking west.

SHOT 1: THE HAND TO THE WATER (CAM FACING: NE) (PANELS 1 TO 3)
Size: medium.
Placement: In front of the [ROWBOAT], looking north-east at the keeper; the lighthouse soft up the beach, of [SHORE FRONT].

SHOT 2: THE SEA KEEPS COMING (CAM FACING: S)
Placement: Behind her shoulder, looking down at the [ROWBOAT]'s back and the sea of [SHORE BACK].
She looks at [SHORE FRONT] in his mind.

SHOT 3: THE WAVE (CAM FACING: W)
Placement: On the sand east of the rowboat, looking west.

SHOT 4: AGAIN (CAM FACING: W)
Placement: The same as IMAGE REFERENCE 4, a step lower.

DIALOGUE ORDER
1. Shot 1, MAREN: "You always come back." Like [SHORE BACK].`;

const MEDIA = { media: [
  { kind: 'VIDEO', tag: 'MAREN', file: 'elements/C01/E-C01.mp4', view: false, n: 1 },
  { kind: 'IMAGE', tag: 'ROWBOAT', file: 'props/P01-rowboat/pick.png', view: false, n: 1 },
  { kind: 'VIEW', tag: 'SHORE FRONT', file: 'locations/L02-shore/L02-shore-front-v4.png', view: true, n: 2 },
  { kind: 'VIEW', tag: 'SHORE BACK', file: 'locations/L02-shore/L02-shore-back-v2.png', view: true, n: 3 },
  { kind: 'IMAGE', tag: 'SHORE WEST', file: 'locations/L02-shore/L02-shore-west-v1.png', view: true },
] };

async function main(): Promise<void> {
  // ---- the pure parts
  const views = viewsOfMedia(MEDIA);
  check(views.map((v) => `${v.tag}:${v.n}`).join(',') === 'SHORE FRONT:2,SHORE BACK:3,SHORE WEST:4', 'the media list’s views: the VIEW lines and the image marked a view, each with its image number');
  const blocks = shotBlocks(PROMPT);
  check([...blocks.keys()].join(',') === '1,2,3,4' && !blocks.get(4)!.includes('DIALOGUE'), 'one block a shot, the last ending at the next section');
  const got = shotViewsOf(PROMPT, MEDIA, 'v3');
  const say = got.map((v) => `${v.shot}:${v.tag}`).join(',');
  check(say.startsWith('1:SHORE FRONT,2:SHORE BACK'), 'each shot’s view is the one its Placement line names, not a prop or a view named later in the block');
  check(!got.some((v) => v.shot === 3), 'a shot that names no view is left out');
  check(got.find((v) => v.shot === 4)?.tag === 'SHORE WEST', '"IMAGE REFERENCE 4" finds the view at that number');
  check(got[0].path === 'locations/L02-shore/L02-shore-front-v4.png' && got[0].from === 'v3', 'the view’s file and the prompt version it was read from');
  check(shotViewsOf(PROMPT, { media: [] }).length === 0 && shotViewsOf('no shots here', MEDIA).length === 0, 'no views or no shots: nothing');
  check(shotViewsOf(PROMPT.replace('[SHORE FRONT].', '[shore_front].'), MEDIA)[0]?.tag === 'SHORE FRONT', 'a tag is matched whatever its case and its underscores');

  const short = shortViewNames(got);
  check(short.get('SHORE FRONT') === 'Front' && short.get('SHORE WEST') === 'West', 'the names on the small pictures drop the place all the scene’s views share');
  check(shortViewNames([{ shot: 1, tag: 'HALL', path: 'a' }, { shot: 2, tag: 'HALL DAIS', path: 'b' }]).get('HALL DAIS') === 'Hall dais', 'and keep it whole when one view is the place alone');

  // ---- through the scene reader, on a film in the temp folder
  const dir = path.join(root, 'film');
  const w = async (rel: string, body: string) => { await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.writeFile(path.join(dir, rel), body); };
  await w('generations/S1/S1-shots.json', JSON.stringify({ duration: 20, shots: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] }));
  await w('generations/S1/prompt/S1-prompt-v2.txt', PROMPT);
  await w('generations/S1/prompt/S1-media-v2.json', JSON.stringify(MEDIA));
  // a newer prompt with no media list yet: v2 is the one read
  await w('generations/S1/prompt/S1-prompt-v3.txt', PROMPT.replace('[SHORE BACK].', '[SHORE FRONT].'));
  await w('locations/L02-shore/L02-shore-front-v4.png', 'x');
  await w('locations/L02-shore/L02-shore-back-v2.png', 'x');
  // L02-shore-west-v1.png is left out: shot 4's view is gone, so it says nothing
  await w('generations/S2/S2-shots.json', JSON.stringify({ duration: 5, shots: [{ id: '1' }] }));

  const { scenes } = await readScenes({ dir, warn: new Warnings() }, [], []);
  const s1 = scenes.find((s) => s.id === 'S1');
  check(s1?.shotViews?.map((v) => `${v.shot}:${v.tag}@${v.from}`).join(',') === '1:SHORE FRONT@v2,2:SHORE BACK@v2', 'the scene reader: the newest prompt with a media list, and only views whose file is there');
  check(scenes.find((s) => s.id === 'S2')?.shotViews === undefined, 'a scene with no prompt has no views');

  console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
  process.exit(bad ? 1 : 0);
}
void main();
