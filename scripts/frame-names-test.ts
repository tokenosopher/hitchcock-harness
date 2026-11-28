// npx tsx scripts/frame-names-test.ts
// a start or end image (sent with kind START / END, role start_image / end_image, label "END REFERENCE 1") is
// named in the prompt as "the END IMAGE", "START IMAGE", "the first frame", "LAST FRAME", never by a number. Checks
// that the record reads it as that frame (not as IMAGE REFERENCE 1), that the shared naming rule counts those words in
// the part of the prompt they are in (Shot details page) and marks them in the prompt (Scene page "what was sent"
// panel), and that an IMAGE REFERENCE 1 sent beside it stays its own. The main case is a pick-up's record in the shape
// the films write it (FIX-boat-S2 take 2, made up; no film is read or written).
import { mentionCtx, namedBySection, namedCounts, promptParts, promptSections, type RefLite } from '../src/components/lib/shotDetails';
import { parseSent } from '../src/server/films/read/sent';

let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '\u2713' : '\u2717'} ${what}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- the main case: FIX-boat-S2 take 2, four videos and an end image
const CAR = {
 "take": "FIX-boat-S2-take2",
 "model": "seedance_2_5",
 "settings": {
  "mode": "omni_reference",
  "aspect_ratio": "16:9",
  "resolution": "480p",
  "duration": 5,
  "draft": true,
  "generate_audio": true,
  "seed": null
 },
 "prompt": {
  "file": "generations/FIX-boat-S2/prompt/FIX-boat-S2-prompt-take2.txt",
  "version": "vtake2",
  "text": "Photoreal live-action cinema, 35mm film, anamorphic, 16:9. 5 seconds, one shot, no cuts. A small rowing boat bumps hard against the lighthouse jetty, late morning. A gentle comedy; nobody is hurt.\n\nREFERENCES\nThe END IMAGE is the last frame of this shot: the jetty, the boat against the bottom step and the four people in it, the camera, framing, light and look. Match it exactly when the boat comes to rest. The boat is a real, physical object: weathered blue planks, a white stripe, worn oars; never cartoonish or toy-like.\nVIDEO REFERENCES 1 to 3 are each a reference for one person's face, build and clothing only; their split screen, grey studio and spoken sentence never appear. 1 is Maren, at the stern, in the oilskin coat. 2 is Tobias, in the middle, grey wool jumper. 3 is Edda, at the bow, in the red scarf. The Ferryman sits at the oars, dark cap, a white beard.\nVIDEO REFERENCE 4 is a turnaround of this exact boat, moored, with these exact four people in it: it fixes who sits where and what each of the four looks like (faces, hair, clothes). The four people in this shot are exactly the four in VIDEO REFERENCE 4 and in the END IMAGE, never anyone else.\n\nSHOT (one shot, 5 s), the camera of the END IMAGE, locked off, 6 m from the jetty, a three-quarter front view. The boat glides into frame from the left, too fast, and knocks against the bottom step; it rocks, scrapes along the stones and settles exactly as in the END IMAGE by the third second. Spray flicks up; a gull lifts off the rail. On the impact all four jolt together, Maren grabbing the gunwale, Tobias catching his cap, Edda clutching her scarf, the Ferryman gripping the oars. Then they settle, breathing out, the Ferryman staring ahead, very pleased with himself. The camera jolts once on the impact.\n\nACTING: Maren: eyes shut on the impact, then wide open, blinking. Tobias and Edda: a quick wince, then they sit up as if nothing happened. The Ferryman: proud, a small satisfied nod. Faces alive, never frozen; natural blinking.\n\nAUDIO: the slap of water, a heavy wooden knock on the impact, a short scrape on stone, the wind across the jetty. No one speaks. No music, no narration, no subtitles.\n\nLOOK: the look and light of the END IMAGE: low sun from the left behind the boat, the sea glittering, soft open daylight, deep focus. One boat only, these four people only, no one else on the jetty. No readable text anywhere."
 },
 "references": [
  {
   "order": 1,
   "role": "video_references",
   "kind": "VIDEO",
   "n": 1,
   "label": "VIDEO REFERENCE 1",
   "tag": null,
   "media_id": "00000000-0000-4000-8000-000000000001",
   "file": "elements/C01/takes/take1/E-C01-take1-480p.mp4"
  },
  {
   "order": 2,
   "role": "video_references",
   "kind": "VIDEO",
   "n": 2,
   "label": "VIDEO REFERENCE 2",
   "tag": null,
   "media_id": "00000000-0000-4000-8000-000000000002",
   "file": "elements/C04/takes/take1/E-C04-take1-480p.mp4"
  },
  {
   "order": 3,
   "role": "video_references",
   "kind": "VIDEO",
   "n": 3,
   "label": "VIDEO REFERENCE 3",
   "tag": null,
   "media_id": "00000000-0000-4000-8000-000000000003",
   "file": "elements/C05/takes/take1/E-C05-take1-480p.mp4"
  },
  {
   "order": 4,
   "role": "video_references",
   "kind": "VIDEO",
   "n": 4,
   "label": "VIDEO REFERENCE 4",
   "tag": null,
   "media_id": "00000000-0000-4000-8000-000000000004",
   "file": "generations/FIX-boat-S2/ref/S2-boat-sheet-v1.mp4"
  },
  {
   "order": 5,
   "role": "end_image",
   "kind": "END",
   "n": 1,
   "label": "END REFERENCE 1",
   "tag": null,
   "media_id": "00000000-0000-4000-8000-000000000005",
   "file": "generations/FIX-boat-S2/ref/S2-boat-with-cast-v1.png"
  }
 ]
};
const boat = parseSent(CAR, 'generations/FIX-boat-S2/takes/take2/FIX-boat-S2-take2-sent.json')!;
const end = boat.refs.find((r) => r.order === 5)!;
check(end.kind === 'IMAGE' && end.frame === 'END' && end.label === 'END IMAGE' && end.name === 'End image', 'the END reference reads as the end image, not IMAGE REFERENCE 1');
const counts = namedCounts(boat.prompt.text, boat.refs);
check(eq([...counts.entries()], [[1, 1], [2, 1], [3, 1], [4, 2], [5, 6]]), 'every input of FIX-boat-S2 take 2 is named; the end image 6 times (5 END IMAGE, 1 last frame)');
const secs = promptSections(boat.prompt.text);
const { bySec } = namedBySection(secs, mentionCtx(boat.prompt.text, boat.refs));
// its shot part is headed "SHOT (one shot, 5 s)", with no number, so it reads as part of the REFERENCES part
const part = secs.find((s) => s.lines.some((l) => l.includes('the camera of the END IMAGE')))!;
check(!!part && bySec.get(part.id)!.has(5), 'the part with "the camera of the END IMAGE" names the end image');
const marked = promptParts(boat.prompt.text).filter((p) => p.label === 'END IMAGE').map((p) => p.text);
check(marked.length === 6 && marked.includes('END IMAGE') && marked.includes('last frame'), 'the Scene page panel marks each name of the end image');

// ---- a sample with an end image only, named in lower case after "the"
const END_ONLY = parseSent({ prompt: { text: 'REFERENCES\nIMAGE REFERENCE 1 is the room.\n\nSHOT 1 (0 to 5 s)\nShe walks to the door and stops as in the end image.' },
  references: [{ order: 1, role: 'image_references', kind: 'IMAGE', n: 1, file: 'locations/L01/a.png' }, { order: 2, role: 'end_image', kind: 'END', n: 1, label: 'END REFERENCE 1', file: 'x/end.png' }] }, 'generations/S1/takes/take1/S1-take1-sent.json')!;
check(eq(END_ONLY.refs.map((r) => r.label), ['IMAGE REFERENCE 1', 'END IMAGE']), 'end only: labels kept apart');
check(eq([...namedCounts(END_ONLY.prompt.text, END_ONLY.refs).entries()], [[1, 1], [2, 1]]), 'end only: "the end image" names it, IMAGE REFERENCE 1 names only the room');
const s1 = promptSections(END_ONLY.prompt.text);
const nb = namedBySection(s1, mentionCtx(END_ONLY.prompt.text, END_ONLY.refs));
check(eq([...nb.bySec.get(s1.find((s) => s.kind === 'shot')!.id)!], [2]), 'end only: the shot names the end image, not the room');

// ---- a start and end pair, named both ways
const PAIR: RefLite[] = [
  { order: 1, kind: 'IMAGE', n: 1, label: 'IMAGE REFERENCE 1' },
  { order: 2, kind: 'IMAGE', n: 1, label: 'START IMAGE', frame: 'START' },
  { order: 3, kind: 'IMAGE', n: 1, label: 'END IMAGE', frame: 'END' },
];
const PT = 'The START IMAGE is the first frame; the End Frame is where it lands.\n\nSHOT 1\nFrom the start image to the LAST FRAME, past IMAGE REFERENCE 1.';
check(eq([...namedCounts(PT, PAIR).entries()], [[1, 1], [2, 3], [3, 2]]), 'pair: START IMAGE / first frame name the start, End Frame / LAST FRAME the end, any case');
const sp = promptSections(PT);
const np = namedBySection(sp, mentionCtx(PT, PAIR));
check(eq([...np.bySec.get(sp.find((s) => s.kind === 'shot')!.id)!].sort(), [1, 2, 3]), 'pair: the shot names both frames and the picture, in its own part');
check(eq([...namedCounts('The first frame is dark.', [PAIR[0]]).entries()], [[1, 0]]), 'with no frame sent, "the first frame" names nothing');
const pp = PAIR.slice(1).map((r) => parseSent({ prompt: { text: 'x' }, references: [{ order: 1, role: r.frame === 'START' ? 'start_image' : 'end_image', file: 'a.png' }, { order: 2, role: 'image_references', file: 'b.png' }] }, 'generations/S1/takes/take1/S1-take1-sent.json')!.refs);
check(pp.every((rs) => rs[0].frame && rs[1].label === 'IMAGE REFERENCE 1'), 'a frame known by its role only does not take an image\'s number');

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
