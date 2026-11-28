// MOCK=boards: the records of what was sent to the model for the takes of sample-day1-takes written in the
// shape tools/takes/record_sent.py writes and read through the same parser as a real film. S1's take 1 (landed) and
// S4's take 1 (being made: the record is written at submission) have one; S2 and S3's takes have none, so their page
// says so. Every file they name is one of the drawings beside the fixtures, a test video or a spoken line. Nothing is
// written.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { SentRecord } from '@/server/types';
import type { ShotDetailsExtra } from '@/server/films/read/previzTake';
import { parseSent } from '@/server/films/read/sent';
import { shotViewsOf } from '@/server/films/read/shotViews';

const SLUG = 'sample-day1-takes';
export const SENT_S1 = 'generations/S1/takes/take1/S1-take1-sent.json';
export const SENT_S4 = 'generations/S4/takes/take1/S4-take1-sent.json';

const PROMPT_S1 = `SCENE CONTEXT
Photoreal live-action cinema, 35mm film, 9:16. A pebble shore under a lighthouse, 1890, late dusk light. Quiet and tender.

A bottle rolls in on the surf. A young woman on the shore picks it up. 13 seconds. 4 shots, 3 HARD CUTS.

ACTIVE REFERENCES
[MAREN] video character sheet, VIDEO REFERENCE 1: Maren, exactly as in this reference. VOICE: the voice heard in this reference, low and unhurried. Here she crouches at the water's edge, the [BOTTLE] in her hands.
[TOBIAS] video character sheet, VIDEO REFERENCE 2: Tobias, exactly as in this reference. VOICE: the voice heard in this reference.
[NEIGHBOUR] IMAGE REFERENCE 1: the Neighbour: face and clothes exactly as on this sheet, not its grey studio. Their voice is AUDIO REFERENCE 1. They stand up the shore, a lantern in one hand.
[BOTTLE] IMAGE REFERENCE 2: the bottle with the letter inside, exactly as in this picture.
[SHORE NORTH] IMAGE REFERENCE 3: the shore seen from the water, toward the lighthouse.
[SHORE ROCKS] IMAGE REFERENCE 4: the rocks at the water's edge, from the path.
[PAGE 1] IMAGE REFERENCE 5: storyboard page 1, the four shots in order. The framing of each shot follows its panel.

SHOT 1 (0.0 to 3.4 s), wide, IMAGE REFERENCE 4 framing. The surf draws back. At the water's edge MAREN crouches by the bottle. HARD CUT.
SHOT 2 (3.4 to 7.6 s), medium on TOBIAS, IMAGE REFERENCE 3 behind him. TOBIAS: "Leave it, Maren. The sea brings in all sorts." HARD CUT.
SHOT 3 (7.6 to 10.75 s), close on MAREN, looking up. MAREN: "Not like this. Someone wrote to us." HARD CUT.
SHOT 4 (10.75 to 13.0 s), wide again. The lamp turns above them. NEIGHBOUR lifts the lantern to see.

AUDIO
Surf on pebbles under everything. The wind rises a little in shot 4. No music.`;

const MEDIA_S1 = [
  ['VIDEO', 'MAREN', 'elements/C01/takes/take2/E-C01-take2-1080p.mp4', 'Maren, exactly as in this reference. VOICE: the voice heard in this reference, low and unhurried. Here she crouches at the water\'s edge.'],
  ['VIDEO', 'TOBIAS', 'elements/C02/takes/take2/E-C02-take2-1080p.mp4', 'Tobias, exactly as in this reference. VOICE: the voice heard in this reference.'],
  ['IMAGE', 'NEIGHBOUR', 'cast/C08-neighbour/sheet/C08-sheet-v2.png', 'The Neighbour: face and clothes exactly as on this sheet, not its grey studio. Their voice is {AUDIO:NEIGHBOUR VOICE}.'],
  ['IMAGE', 'BOTTLE', 'props/P01-bottle/P01-bottle-v1.png', 'The bottle with the letter inside, exactly as in this picture.'],
  ['IMAGE', 'SHORE NORTH', 'locations/L01-shore/L01-shore-north-v2.png', 'The shore seen from the water, toward the lighthouse.'],
  ['IMAGE', 'SHORE ROCKS', 'locations/L01-shore/L01-shore-rocks-v2.png', 'The rocks at the water\'s edge, from the path.'],
  ['IMAGE', 'PAGE 1', 'previz/S1/storyboard/v1/page-1.png', 'Storyboard page 1, the four shots in order.'],
  ['AUDIO', 'NEIGHBOUR VOICE', 'cast/C08-neighbour/voice/C08-voice-line-v1.mp3', 'The voice of the Neighbour.'],
] as const;

function record(scene: string, take: number, job: string, prompt: string, media: readonly (readonly [string, string, string, string])[], o: { params?: boolean; seconds: number; cost?: string; diffs?: string[] }) {
  const per: Record<string, number> = {};
  const roles: Record<string, string> = { VIDEO: 'video_references', IMAGE: 'image_references', AUDIO: 'audio_references' };
  const refs = media.map(([kind, tag, file], i) => {
    per[kind] = (per[kind] ?? 0) + 1;
    return { order: i + 1, role: roles[kind], kind, n: per[kind], label: `${kind} REFERENCE ${per[kind]}`, tag, media_id: `0000000${i}-sample-media-id`, file,
      ...(/locations\//.test(file) ? { view: true } : { view: false }), ...(/page-(\d+)/.test(file) ? { page: Number(/page-(\d+)/.exec(file)![1]) } : {}), uploaded: '2026-11-14' };
  });
  return {
    about: 'What was sent to the model for this take, written at submission (Flow v3.3 - 7 Takes, step 8).',
    written_by: 'tools/takes/record_sent.py', written: '2026-11-14T09:12:40Z',
    take: `${scene}-take${take}`, kind: 'take', id: scene, take_number: take, job_id: job, submitted: '2026-11-14T09:12:31Z',
    model: 'seedance_2_5',
    settings: { mode: 'omni_reference', aspect_ratio: '9:16', resolution: '480p', duration: o.seconds, draft: true, generate_audio: true, seed: null, count: 1, use_unlim: false, folder_id: 'sample-folder-id' },
    settings_from: o.params ? 'the generate_video arguments as sent' : 'the files and step 7',
    prompt: { file: `generations/${scene}/prompt/${scene}-prompt-v1.txt`, version: 'v1', text: prompt, sha1: 'sample', chars: prompt.length, same_as_file: true },
    references: refs,
    layout: { previz_take: `previz/${scene}/${scene}-previz-take-3.json`, previz_take_number: 3, storyboard: `previz/${scene}/storyboard/v1`, storyboard_version: 'v1' },
    lists: { media_list: `generations/${scene}/prompt/${scene}-media-v1.json`, take_medias: `generations/${scene}/prompt/${scene}-take-medias-v1.json` },
    spend: o.cost ? { row: true, cost: o.cost } : { row: false },
    differences: o.diffs ?? [],
  };
}
const mediaList = (media: readonly (readonly [string, string, string, string])[]) => ({ media: media.map(([kind, tag, file, desc]) => ({ kind, tag, file, desc })) });

const PROMPT_S4 = PROMPT_S1.split('\n\nSHOT 1')[0].replace('A bottle rolls in on the surf. A young woman on the shore picks it up. 13 seconds. 4 shots, 3 HARD CUTS.', 'Maren reads the letter aloud. 17 seconds. 3 shots, 2 HARD CUTS.')
  + `\n\nSHOT 1 (0 to 5 s), medium on TOBIAS. TOBIAS: "Well? Who is it from?" HARD CUT.
SHOT 2 (5 to 13 s), close on MAREN. MAREN: "From the boat that went down off the point. Forty years ago. He says the lamp was the last thing he saw." HARD CUT.
SHOT 3 (13 to 17 s), wide. They both look up at the lamp.`;

const RAW: Record<string, { raw: unknown; list: unknown }> = {
  [SENT_S1]: { raw: record('S1', 1, 'a3c91e07-5b2d-4f8e-9c1a-7d2e4b6f8a90', PROMPT_S1, MEDIA_S1, { seconds: 13, cost: '39 credits' }), list: mediaList(MEDIA_S1) },
  [SENT_S4]: { raw: record('S4', 1, 'job-S4', PROMPT_S4, MEDIA_S1.slice(0, 2), { params: true, seconds: 17, diffs: ['no spend.md row with this job id yet (step 8 writes it at submission)'] }), list: mediaList(MEDIA_S1.slice(0, 2)) },
};

/** The view behind each shot of S1, worked out from its prompt and media list as for a real film: shots 1 and
 *  2 name a view of the market, shots 3 and 4 none, so the page says nothing for them. */
export const SAMPLE_VIEWS_S1 = shotViewsOf(PROMPT_S1, { media: MEDIA_S1.map(([kind, tag, file]) => ({ kind, tag, file, view: /^locations\//.test(file) })) }, 'v1');

/** GET …/sent for the samples: the record at that path, or undefined. */
export function mockSent(film: string, rel: string): SentRecord | undefined {
  if (film !== SLUG || !RAW[rel]) return undefined;
  return parseSent(RAW[rel].raw, rel, RAW[rel].list);
}

/** GET …/shotdetails for the samples (the Shot details page): S1's take 1 was drawn from previz take 3, whose four
 *  shots run as its prompt times them (0 to 3.4 s, 3.4 to 7.6, 7.6 to 10.75, 10.75 to 13); its clip is the test video.
 *  S1's storyboard has no panels file, so the page shows its page whole. S4's previz is not there: the page says so. */
export const PREVIZ_S1 = 'previz/S1/S1-previz-take-3.json';
export function mockShotDetails(film: string, previz: string, _board: string, from: 'take' | 'scene'): ShotDetailsExtra | undefined {
  if (film !== SLUG) return undefined;
  if (previz !== PREVIZ_S1 && previz !== PREVIZ_S1.replace(/\.json$/, '.mp4')) return {};
  const cuts = [0, 3.4, 7.6, 10.75, 13];
  return { previz: { json: PREVIZ_S1, clip: PREVIZ_S1.replace(/\.json$/, '.mp4'), take: 3, seconds: 13, shots: cuts.slice(0, -1).map((t0, i) => ({ id: String(i + 1), t0, t1: cuts[i + 1] })), from } };
}

/** /api/media for the files the records name: the drawings, the test video and a spoken line; and S1's previz clip. */
const HERE = path.join(process.cwd(), 'src/fixtures/media');
const FILES: Record<string, [string, string]> = Object.fromEntries([...MEDIA_S1.map(([, , file]) => file), PREVIZ_S1.replace(/\.json$/, '.mp4')].map((file) => [file,
  /\.mp4$/.test(file) ? ['sample-render.mp4', 'video/mp4'] : /\.mp3$/.test(file) ? ['day1/voice-1.mp3', 'audio/mpeg']
    : /^cast\//.test(file) ? ['cast/sheet.png', 'image/png'] : /^props\//.test(file) ? ['cast/prop.png', 'image/png']
      : /north/.test(file) ? ['cast/place-1.png', 'image/png'] : /^locations\//.test(file) ? ['cast/view.png', 'image/png'] : ['day1/board-1.png', 'image/png']]));
export async function sentMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const prefix = `assets/films/${SLUG}/`;
  const f = p?.startsWith(prefix) ? FILES[p.slice(prefix.length)] : undefined;
  if (!f || !p) return undefined;
  const real = path.join(HERE, f[0]);
  try { return { abs: p, real, stat: await fs.stat(real), type: f[1] }; } catch { return undefined; }
}
