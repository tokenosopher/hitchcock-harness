// MOCK=boards: a sample film with a full cast and two places, for the board's steps and the Characters view.
// Its pictures are plain placeholders kept beside the fixtures (src/fixtures/media/cast/), so a face's shape can be
// measured. Server-only; nothing is written.
//   C01 Maren      taken whole from the library: a face pick file and a sheet, no rounds, her voice brought along
//   C02 Tobias     a face round with his pick, clothing, sheet, voice and video element all done
//   C03 the Ferryman  no lines: face and sheet, no voice or video element needed
//   C04 Edda       everything done, her video element filed under her first look (C04a)
//   C06-C07 Fishermen  a group: the group picture is the sheet
//   C08 the Neighbour  a face round landed and not picked yet: one pick waits for you
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CharacterRef, FilmRef, FilmState, LocationRef, Round } from '@/server/types';
import boardFilm from './boards/the-lighthouse.json';
import { approvalBlock, type Approval } from '@/components/lib/approve';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
export const CAST_SLUG = 'sample-cast';
const REF: FilmRef = { slug: CAST_SLUG, title: 'Sample · the cast and the places', folder: `${repo}/assets/films/${CAST_SLUG}`, repo, flow: 'video-driven', status: 'in-progress', stage: 3, aspect: '9:16' };

const faceRound = (cid: string, slug: string, n: number, pick?: number, date = '2026-11-11'): Round => ({
  id: 'r1-faces', date, pick: pick ? `${slug}-r1-${pick}` : undefined,
  candidates: Array.from({ length: n }, (_, i) => ({ id: `${slug}-r1-${i + 1}`, path: `cast/${cid}-${slug}/r1-faces/${cid}-${slug}-r1-${i + 1}.png` })),
});
const voiceRound = (cid: string, slug: string, id: string, brief: string): Round => ({
  id: 'r1', candidates: [1, 2, 3].map((k) => ({ id: String(k), path: `voices/options/${cid}-${slug}-r1-${k}.mp3`, note: k === Number(id) ? brief : 'r1', hz: 100 + k * 10, seconds: 9 })),
  pick: id,
});

function characters(): CharacterRef[] {
  return [
    { id: 'C01', name: 'Maren', folder: 'cast/C01-maren', reused: true, imageElement: true,
      picks: { face: 'cast/C01-maren/pick-face.png' }, sheet: { path: 'cast/C01-maren/pick.png', approved: true },
      voice: { rounds: [], elementLine: { path: 'cast/C01-maren/voice/element-line-5s.mp3' } },
      element: { path: 'elements/C01/takes/take1/E-C01-take1-1080p.mp4', state: 'final' } },
    { id: 'C02', name: 'Tobias', folder: 'cast/C02-tobias', imageElement: true,
      face: { rounds: [faceRound('C02', 'tobias', 4, 4)], pick: { candidateId: 'tobias-r1-4', date: '2026-11-11' } },
      picks: { face: 'cast/C02-tobias/pick-face.png', wardrobe: 'cast/C02-tobias/pick-wardrobe.png' },
      sheet: { path: 'cast/C02-tobias/pick.png', approved: true },
      voice: { rounds: [voiceRound('C02', 'tobias', '2', 'Bright and quick, a young tenor')], pick: { candidateId: '2', date: '2026-11-12' }, elementLine: { path: 'cast/C02-tobias/voice/element-line-5s.mp3' } },
      element: { path: 'elements/C02/takes/take1/E-C02-take1-1080p.mp4', state: 'final' } },
    { id: 'C03', name: 'the Ferryman', folder: 'cast/C03-ferryman', silent: true, imageElement: true, role: 'silent',
      face: { rounds: [faceRound('C03', 'ferryman', 4, 2)], pick: { candidateId: 'ferryman-r1-2' } },
      picks: { face: 'cast/C03-ferryman/pick-face.png' }, sheet: { path: 'cast/C03-ferryman/pick.png', approved: true }, element: { state: 'none' } },
    { id: 'C04', name: 'Edda', folder: 'cast/C04-edda', imageElement: true,
      face: { rounds: [faceRound('C04', 'edda', 4, 3)], pick: { candidateId: 'edda-r1-3', date: '2026-11-11' } },
      picks: { face: 'cast/C04-edda/pick-face.png', wardrobe: 'cast/C04-edda/pick-wardrobe.png' },
      sheet: { path: 'cast/C04-edda/pick.png', approved: true },
      voice: { rounds: [voiceRound('C04', 'edda', '3', 'Warm and low, unhurried')], pick: { candidateId: '3', date: '2026-11-12' } },
      element: { path: 'elements/C04a/takes/take1/E-C04a-take1-1080p.mp4', state: 'final' } },
    { id: 'C06-C07', name: 'Fishermen', folder: 'cast/C06-C07-fishermen', extra: true, imageElement: true, sheet: { path: 'cast/C06-C07-fishermen/pick.png', approved: true }, element: { state: 'none' } },
    { id: 'C08', name: 'the Neighbour', folder: 'cast/C08-neighbour', face: { rounds: [{ ...faceRound('C08', 'neighbour', 4), prediction: 'neighbour-r1-2' }] }, element: { state: 'none' } },
  ];
}

const views = (lid: string, slug: string, n: number) => Array.from({ length: n }, (_, i) => ({ camera: `view ${i + 1}`, path: `locations/${lid}-${slug}/views/${lid}-view-${i + 1}.png` }));
function locations(): LocationRef[] {
  return [
    { id: 'L01', name: 'The shore below the lighthouse', folder: 'locations/L01-shore',
      styleImages: [{ id: 'r1', date: '2026-11-11', pick: 'r1-2', candidates: [1, 2, 3].map((k) => ({ id: `r1-${k}`, path: `locations/L01-shore/r1/L01-r1-${k}.png` })) }],
      master: { path: 'locations/L01-shore/L01-shore-pick-r1-2.png', picked: true }, views: views('L01', 'shore', 12),
      props: [{ id: 'P01', name: 'the bottle', path: 'props/P01-bottle/pick.png', pick: 'p1' }, { id: 'P02', name: 'the post bag', path: 'props/P02-post-bag/pick.png', pick: 'p2' }] },
    { id: 'L02', name: 'The lamp room', folder: 'locations/L02-lamp-room',
      styleImages: [{ id: 'r1', date: '2026-11-12', pick: 'r1-1', candidates: [1, 2, 3].map((k) => ({ id: `r1-${k}`, path: `locations/L02-lamp-room/r1/L02-r1-${k}.png` })) }],
      master: { path: 'locations/L02-lamp-room/L02-lamp-room-pick-r1-1.png', picked: true }, views: views('L02', 'lamp-room', 3) },
  ];
}

// sample-sheet-yes: the same cast with one more, C05 the Harbourmaster (no lines), whose sheet is made and
// waits for the user's yes in "Waiting for you"; and C08's face picked, so that sheet is the one thing waiting. The yes
// is set aside in one tap and sent with "Done picking"; here the send only marks the sheet approved in memory (as Alma
// would record it) and answers the message the real send would give her.
export const SHEET_SLUG = 'sample-sheet-yes';
const SHEET_REF: FilmRef = { ...REF, slug: SHEET_SLUG, title: 'Sample · a sheet waiting for your yes', folder: `${repo}/assets/films/${SHEET_SLUG}` };
const SHEET_PATH = 'cast/C05-harbourmaster/pick.png';
const g = globalThis as unknown as { __hhSheetYes?: Set<string> };
const sheetApproved = (g.__hhSheetYes ??= new Set());

export const castSampleFilms = (): FilmRef[] => [REF, SHEET_REF];
export function castSampleState(slug: string): FilmState | undefined {
  if (slug !== CAST_SLUG && slug !== SHEET_SLUG) return undefined;
  const scenes = lighthouse.scenes.map((sc, i) => ({ ...sc, location: i < 1 ? 'L01 the shore' : 'L02 the lamp room' }));
  const base: FilmState = {
    ...lighthouse, film: REF, characters: characters(), locations: locations(), scenes, master: undefined, cut: undefined,
    post: { cuts: [], masters: [], captions: [] }, feed: { counts: {}, asks: [] }, qc: {}, warnings: [],
  };
  if (slug === CAST_SLUG) return base;
  const cast = base.characters.map((c) => (c.id === 'C08' ? { ...c, face: { rounds: c.face!.rounds, pick: { candidateId: 'neighbour-r1-2', date: '2026-11-12' } }, picks: { face: 'cast/C08-neighbour/pick-face.png' }, sheet: { path: 'cast/C08-neighbour/pick.png', approved: true } } : c));
  const servant: CharacterRef = { id: 'C05', name: 'the Harbourmaster (no lines)', folder: 'cast/C05-harbourmaster', silent: true, imageElement: true, role: 'silent',
    face: { rounds: [faceRound('C05', 'harbourmaster', 4, 1)], pick: { candidateId: 'harbourmaster-r1-1', date: '2026-11-22' } },
    picks: { face: 'cast/C05-harbourmaster/pick-face.png' }, sheet: { path: SHEET_PATH, approved: sheetApproved.has('C05') }, element: { state: 'none' } };
  const at = cast.findIndex((c) => c.id === 'C06-C07');
  return { ...base, film: SHEET_REF, characters: [...cast.slice(0, at), servant, ...cast.slice(at)] };
}

/** POST …/done on sample-sheet-yes: the sheet approved in memory and the message the real send would give Alma, with
 *  nothing written. Any other film: undefined. */
export function sheetMockDone(slug: string, answers: unknown[], picks: unknown[], approvals: Approval[]): Response | undefined {
  if (slug !== SHEET_SLUG) return undefined;
  if (answers.length || picks.length) return Response.json({ error: 'sample-sheet-yes takes only the sheet\'s yes' }, { status: 400 });
  if (!approvals.length) return Response.json({ error: 'no choices given' }, { status: 400 });
  for (const a of approvals) if (a.id !== 'C05' || a.path !== SHEET_PATH) return Response.json({ error: `no sheet ${a.path} for ${a.id}` }, { status: 404 });
  for (const a of approvals) sheetApproved.add(a.id);
  const n = approvals.length;
  const message = [
    `<harness-action kind="answers" count="${n}"/> The user is done choosing and sent ${n === 1 ? 'one choice' : `${n} choices`} with one button, in Hitchcock Harness. Each item below is one answer, one pick or one sheet approved, exactly as it would say by itself. Apply them all in this turn, then continue the flow once.`,
    ...approvalBlock(approvals),
  ].join('\n');
  return Response.json({ ok: true, dryRun: true, film: slug, answers: [], picks: [], approvals, message, notified: false });
}

/** The sample's pictures: every image path of the film is one of the drawings, by what it is. */
const DRAWINGS = path.join(process.cwd(), 'src/fixtures/media/cast');
export function drawingFor(rel: string): string | undefined {
  if (!/\.png$/i.test(rel)) return undefined;
  if (/C06-C07/.test(rel)) return 'group.png';
  if (/\/pick\.png$/.test(rel) && /^cast\//.test(rel)) return 'sheet.png';
  if (/^cast\//.test(rel)) { const n = (Number(/r1-(\d+)\.png$/.exec(rel)?.[1] ?? 0) + Number(/C0(\d)/.exec(rel)?.[1] ?? 1)) % 6; return `face-${n + 1}.png`; }
  if (/\/views\//.test(rel)) return 'view.png';
  if (/^locations\/L02/.test(rel)) return 'place-2.png';
  if (/^locations\//.test(rel)) return 'place-1.png';
  if (/^props\//.test(rel)) return 'prop.png';
  return undefined;
}
export async function castMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const prefix = [CAST_SLUG, SHEET_SLUG].map((x) => `assets/films/${x}/`).find((x) => p?.startsWith(x));
  if (!p || !prefix) return undefined;
  const d = drawingFor(p.slice(prefix.length));
  if (!d) return undefined;
  const real = path.join(DRAWINGS, d);
  try { return { abs: p, real, stat: await fs.stat(real), type: 'image/png' }; } catch { return undefined; }
}
