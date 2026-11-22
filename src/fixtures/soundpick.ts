// MOCK=boards: sample films for the sound pick card, the why card and the debrief. In
// memory only: a pick, an answer, a reason or a debrief answer changes the sample until the server restarts (or a
// test resets it), and nothing is written to disk or sent to Alma (the line goes to the sample's mock thread).
//   sample-sound-picks  the sound designer's pick card for S1 (a surf bed, a gull, a bottle, a carry-over across the join,
//                       3 to 5 tries each, two picks predicted) and a why card about a trim, both waiting
//   sample-debrief      a released film's debrief: eight questions (cutting, sound, previz, prompts), one answered
// The sounds are five short noises beside the fixtures (src/fixtures/media/sound/try-1.mp3 to try-5.mp3); the
// debrief's pictures are the day-one sample's drawings.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FeedCard, FeedSound, FilmRef, FilmState, SoundInfo } from '@/server/types';
import { soundsOf, type SfxFolder, type SfxPlan } from '@/server/films/read/sfx';
import { debriefFeedCard } from '@/server/films/read/feed';
import { checkAnswers, countsOf, setAnswer, type Debrief, type DebriefAnswers } from '@/components/lib/debrief';
import { setReason, type ReasonsFile } from '@/components/edit/reasons';
import boardFilm from './boards/the-lighthouse.json';

const lighthouse = boardFilm as unknown as FilmState;
const repo = lighthouse.film.repo;
type Id = 'sample-sound-picks' | 'sample-debrief';
const ref = (slug: Id, title: string, stage: FilmRef['stage']): FilmRef => ({ slug, title, folder: `${repo}/assets/films/${slug}`, repo, flow: 'video-driven', status: 'in-progress', stage, aspect: '9:16' });
export const SOUND_SAMPLES: Record<Id, FilmRef> = {
  'sample-sound-picks': ref('sample-sound-picks', 'Sample · the sound picks of S1', 11),
  'sample-debrief': ref('sample-debrief', 'Sample · the debrief', 12),
};
const isSound = (slug: string): slug is Id => slug in SOUND_SAMPLES;
export const soundSampleFilms = (): FilmRef[] => Object.values(SOUND_SAMPLES);

// ---- the sound designer's plan and tries (the shape of audio/sfx/plan.json and each sound's prompts.json)

const PLAN: SfxPlan = {
  fps: 24,
  scenes: [{ scene: 'S1', frames: [0, 629] }, { scene: 'S2', frames: [629, 1268] }, { scene: 'S3', frames: [1268, 1900] }],
  effects: [
    { id: 'HB1', name: 'surf-bed', kind: 'bed', start: { tc: '00:00:00:02', frame: 2 }, end: { tc: '00:00:27:14', frame: 662 }, seconds: 27.5, level_db: -22.5, fade_in_frames: 24, fade_out_frames: 36,
      what: 'Low surf on a pebble shore at dusk, small waves breaking and drawing back, a light wind',
      reason: 'The shore takes are quiet between lines: one bed of surf for the whole scene.' },
    { id: 'R1', name: 'gull-cry', kind: 'reaction', start: { tc: '00:00:08:02', frame: 194 }, end: { tc: '00:00:10:12', frame: 252 }, seconds: 2.4, level_db: -12, fade_in_frames: 4, fade_out_frames: 18,
      what: 'A single gull crying overhead, a little distant',
      reason: 'Maren looks up from the water and nothing answers her: a gull does.' },
    { id: 'R2', name: 'bottle-clink', kind: 'accent', start: { tc: '00:00:19:20', frame: 476 }, end: { tc: '00:00:21:10', frame: 514 }, seconds: 1.6, level_db: -13, fade_in_frames: 3, fade_out_frames: 14,
      what: 'A glass bottle knocking against wet pebbles, close and dry',
      reason: 'The bottle reaches her feet: one small knock of glass on stone.' },
    { id: 'C1', name: 'wind-carry', kind: 'carry-over', start: { tc: '00:00:25:20', frame: 620 }, end: { tc: '00:00:28:04', frame: 676 }, seconds: 2.3, level_db: -18, fade_in_frames: 6, fade_out_frames: 40,
      what: 'The wind off the sea carrying on across the cut to the lamp room, fading out',
      reason: 'The sound drops to nothing at the join into the lamp room: carry the wind across it.' },
  ],
};
const TRIES: Record<string, { style: string; prompt: string; seconds: number; lufs: number }[]> = {
  'surf-bed': [
    { style: 'literal', prompt: 'Steady low surf on a pebble beach at dusk, small waves breaking and drawing back over stones, a light wind, no music', seconds: 28, lufs: -31.2 },
    { style: 'natural, close', prompt: 'Small waves on pebbles, close and dry, the stones rolling back after each one, no music', seconds: 28, lufs: -29.8 },
    { style: 'quieter', prompt: 'A distant, soft wash of the sea on a shore, even, no music', seconds: 28, lufs: -34.5 },
  ],
  'gull-cry': [
    { style: 'literal', prompt: 'A single herring gull crying twice high over a pebble shore at dusk, a little distant, light wind, no music', seconds: 4.4, lufs: -18.4 },
    { style: 'natural, close', prompt: 'One gull calling overhead, natural, close and dry, no music', seconds: 4.4, lufs: -19.1 },
    { style: 'quieter', prompt: 'A faint gull cry far off over the water, soft, no music', seconds: 4.4, lufs: -24.0 },
    { style: 'in between', prompt: 'A gull calling once, between near and far, never loud, no music', seconds: 4.4, lufs: -20.7 },
    { style: 'fuller', prompt: 'Two gulls calling to each other over the shore, still natural, no music', seconds: 4.4, lufs: -17.2 },
  ],
  'bottle-clink': [
    { style: 'literal', prompt: 'A small glass bottle rolled by a wave knocking against wet pebbles, one clear knock, no music', seconds: 3.6, lufs: -21.0 },
    { style: 'natural, close', prompt: 'Glass touching stone, close and dry, a short knock, no music', seconds: 3.6, lufs: -22.3 },
    { style: 'quieter', prompt: 'A soft tap of glass on a wet stone, no music', seconds: 3.6, lufs: -26.4 },
    { style: 'in between', prompt: 'A bottle settling on pebbles, never loud, no music', seconds: 3.6, lufs: -23.9 },
  ],
  'wind-carry': [
    { style: 'literal', prompt: 'Wind off the sea gusting past a stone tower, fading out slowly, no music', seconds: 4.3, lufs: -25.0 },
    { style: 'natural, close', prompt: 'A gust of wind against a window, close and dry, dying away, no music', seconds: 4.3, lufs: -26.2 },
    { style: 'quieter', prompt: 'A soft wind fading into silence, no music', seconds: 4.3, lufs: -29.1 },
  ],
};
const PREDICT: Record<string, number> = { 'gull-cry': 3, 'bottle-clink': 2 };
const SFX_CARD = 'ASK-S1-sounds';
const WHY_CARD = 'WHY-S1-shot2-head';
const triesOf = (name: string): SfxFolder => ({
  prompts: { tries: TRIES[name].map((t, i) => ({ try: i + 1, file: `audio/sfx/${name}/${name}-try${i + 1}.wav`, ...t })) },
  files: [],
});

// ---- what the user did on the samples, in memory

interface Mem { sounds: Record<string, { option: string; note?: string; at: string }>; why?: { option?: string; note?: string; at: string }; debrief: DebriefAnswers; reasons: Record<string, ReasonsFile> }
const g = globalThis as unknown as { __hhSoundMem?: Record<string, Mem> };
const MEM = (g.__hhSoundMem ??= {});
const fresh = (slug: string): Mem => ({ sounds: {}, debrief: slug === 'sample-debrief' ? DEBRIEF_SEED() : { answers: {} }, reasons: {} });
const mem = (slug: string): Mem => (MEM[slug] ??= fresh(slug));
/** The test hook's reset: the sample as the fixtures have it. */
export function resetSoundSample(slug: string): boolean {
  if (!isSound(slug) && slug !== 'the-lighthouse') return false;
  MEM[slug] = fresh(slug);
  return true;
}

function sounds(slug: string): FeedSound[] {
  const refs = PLAN.effects!.map((e) => ({ name: String(e.name), ...(PREDICT[String(e.name)] ? { prediction: PREDICT[String(e.name)] } : {}) }));
  const folders = Object.fromEntries(refs.map((r) => [r.name, triesOf(r.name)]));
  const m = mem(slug);
  return soundsOf(refs, PLAN, folders).map((s) => (m.sounds[s.name] ? { ...s, answer: m.sounds[s.name] } : s));
}

function cards(slug: Id): FeedCard[] {
  const m = mem(slug);
  if (slug === 'sample-debrief') {
    const k = countsOf(DEBRIEF, m.debrief);
    return [debriefFeedCard(DEBRIEF.questions.length, k, DEBRIEF.made, m.debrief.sent)];
  }
  const ss = sounds(slug);
  const all = ss.every((s) => s.answer);
  const sfx: FeedCard = {
    key: SFX_CARD, id: SFX_CARD, title: 'S1 on the shore: pick each sound', date: '2026-11-19T15:10:00Z', section: 'Sound', place: 'sound', ids: ['S1'], placed: 'card', media: [],
    sub: 'Four sounds the sound designer planned on the AI editor’s first cut, each made in 3 to 5 tries. Hear each, pick one, or none of these.',
    sounds: ss,
    ask: { kind: 'pick', options: [], ...(all ? { answer: { by: 'harness' as const, at: ss.map((s) => s.answer!.at).sort().pop(), option: ss.map((s) => `${s.name} ${s.answer!.option}`).join(', ') } } : {}) },
  };
  const why: FeedCard = {
    key: WHY_CARD, id: WHY_CARD, title: 'Why did S1 shot 2 lose 30 frames at its head?', date: '2026-11-19T14:40:00Z', section: 'Edit', place: 'edit', ids: ['S1'], placed: 'card', media: [],
    sub: 'Your trim at 00:00:06:10, in v12. Skip it if the reason is plain.',
    ask: { kind: 'why', options: [{ id: '1', label: 'The movement started too slowly' }, { id: '2', label: 'Bad frames at the start' }, { id: '3', label: 'Pacing' }],
      ...(m.why ? { answer: { ...m.why, by: 'harness' as const } } : {}) },
  };
  return [sfx, why];
}

export function soundSampleFeed(slug: string): FeedCard[] | undefined {
  return isSound(slug) ? cards(slug) : undefined;
}

export function soundSampleState(slug: string): FilmState | undefined {
  if (!isSound(slug)) return undefined;
  const cs = cards(slug);
  const asks = cs.filter((c) => c.ask && !c.ask.answer);
  const counts: Record<string, number> = {};
  for (const c of cs) counts[c.place] = (counts[c.place] ?? 0) + 1;
  return { ...lighthouse, film: SOUND_SAMPLES[slug], master: undefined, post: { cuts: [], masters: [], captions: [] }, feed: { counts, asks } };
}

/** GET …/sound on a sample: the tries, as the Sound page lists the sfx folder. */
export function soundSampleSound(slug: string): SoundInfo | undefined {
  if (!isSound(slug)) return undefined;
  const files = Object.entries(TRIES).flatMap(([name, ts]) => ts.map((_, i) => ({ path: `audio/sfx/${name}/${name}-try${i + 1}.wav`, name: `${name}-try${i + 1}.wav`, date: '2026-11-19' })));
  return { groups: [{ key: 'sfx', title: 'Sound effects', note: 'The sound designer\u2019s tries, by sound', folder: 'audio/sfx', files }], warnings: [] };
}

// ---- the sample's sounds and pictures

const DIR = path.join(process.cwd(), 'src/fixtures/media');
export async function soundMedia(p: string | null): Promise<{ abs: string; real: string; stat: import('node:fs').Stats; type: string } | undefined> {
  const m = p ? /^assets\/films\/sample-(?:sound-picks|debrief)\/audio\/sfx\/([a-z-]+)\/\1-try(\d)\.(?:wav|mp3)$/.exec(p) : null;
  const f = p ? /^assets\/films\/sample-debrief\/review\/debrief\/q(\d+)-(?:before|after|frame)\.png$/.exec(p) : null;
  const real = m ? path.join(DIR, 'sound', `try-${((Number(m[2]) + m[1].length) % 5) + 1}.mp3`) : f ? path.join(DIR, 'day1', `board-${(Number(f[1]) % 6) + 1}.png`) : undefined;
  if (!real || !p) return undefined;
  try { return { abs: p, real, stat: await fs.stat(real), type: m ? 'audio/mpeg' : 'image/png' }; } catch { return undefined; }
}

// ---- answers on the samples

const line = (slug: string, text: string) => import('./mock').then(({ mockPost, mockPoke }) => { mockPost(slug, text); mockPoke(slug); });

/** POST …/pick and the sfx picks of POST …/done on a sample: kept in memory. Undefined for any other film or kind. */
export function soundMockPicks(slug: string, picks: { kind?: string; target?: string; candidate?: string; note?: string; card?: string }[]): Response | undefined {
  if (!isSound(slug) || !picks.length || picks.some((p) => p.kind !== 'sfx')) return undefined;
  const known = new Set(Object.keys(TRIES));
  for (const p of picks) {
    if (!p.target || !known.has(p.target)) return Response.json({ error: `no audio/sfx/${p.target}/prompts.json` }, { status: 404 });
    const n = p.candidate === 'none' ? 0 : Number(p.candidate);
    if (p.candidate !== 'none' && !(n >= 1 && n <= TRIES[p.target].length)) return Response.json({ error: `${p.target} has no try ${p.candidate}` }, { status: 404 });
  }
  const at = new Date().toISOString();
  for (const p of picks) mem(slug).sounds[p.target!] = { option: p.candidate!, ...(p.note ? { note: p.note } : {}), at };
  void line(slug, `<harness-action kind="${picks.length > 1 ? 'answers' : 'pick'}" what="sfx"/> ${picks.map((p) => (p.candidate === 'none' ? `none of the tries of ${p.target}` : `try ${p.candidate} of ${p.target}`)).join('; ')} (sample: nothing written, nothing sent).`);
  return Response.json({ ok: true, dryRun: false, film: slug, picks: picks.map((p) => ({ kind: 'sfx', target: p.target, candidate: p.candidate })), answers: [], message: '', notified: true });
}

/** POST …/answer on the sample's why card. */
export function soundMockAnswer(slug: string, b: { card?: string; option?: string; note?: string }): Response | undefined {
  if (slug !== 'sample-sound-picks' || b.card !== WHY_CARD) return undefined;
  const m = mem(slug);
  if (m.why) return Response.json({ error: 'the card is already answered' }, { status: 409 });
  if (!b.option && !b.note) return Response.json({ error: 'a why answer needs the user\'s words, a likely answer, or skip' }, { status: 400 });
  m.why = { option: b.option, note: b.note, at: new Date().toISOString() };
  void line(slug, `<harness-action kind="answer" ask="why" card="${WHY_CARD}"${b.option ? ` option="${b.option}"` : ''}/> ${b.option === 'skip' ? 'skipped' : `the user's reason: "${b.note ?? b.option}"`} (sample).`);
  return Response.json({ ok: true, dryRun: false, film: slug, card: WHY_CARD, kind: 'why', option: b.option, writes: [], message: '', notified: true });
}

/** POST …/done on a sample: its sfx picks and its why answer, in memory. */
export function soundMockDone(slug: string, answers: { card: string; option?: string; note?: string }[], picks: { kind?: string; target?: string; candidate?: string; note?: string; card?: string }[]): Response | undefined {
  if (!isSound(slug)) return undefined;
  for (const a of answers) { const r = soundMockAnswer(slug, a); if (r && !r.ok) return r; }
  if (picks.length) { const r = soundMockPicks(slug, picks); if (r && !r.ok) return r; }
  return Response.json({ ok: true, dryRun: false, film: slug, answers: [], picks: [], message: '', notified: true });
}

// ---- the History tab's reasons on a sample cut (the-lighthouse and the other cut samples)

export const mockReasons = (slug: string): ReasonsFile => mem(slug).reasons.cut ?? { format: 1, reasons: [] };
export function mockSetReason(slug: string, step: { rev: number; words: string; at?: string; by?: string }, reason: string): ReasonsFile {
  const m = mem(slug);
  m.reasons.cut = setReason(mockReasons(slug), step, reason, new Date().toISOString());
  return m.reasons.cut;
}

// ---- the debrief sample (the questions as Alma would write review/debrief.json)

export const DEBRIEF: Debrief = {
  film: 'sample-debrief', made: '2026-11-19T18:00:00Z',
  intro: 'The film is out. These are the changes of yours whose reason I could not read from the cut. Tap an answer, write your own, or skip.',
  counts: [{ label: 'Your changes to my first cut', value: '61' }, { label: 'Time the edit took', value: '1 h 35 min' }, { label: 'Sounds picked again', value: '2' }, { label: 'Redos', value: '3' }],
  questions: [
    { id: 'q1', kind: 'cutting', question: 'Why did S3 shot 2 lose 72 frames at its head?', change: '72 frames (3.0 s) cut at the head, at 00:00:52:10', at: '00:00:52:10',
      media: [{ file: 'review/debrief/q1-before.png', label: 'my first frame' }, { file: 'review/debrief/q1-after.png', label: 'your first frame' }],
      answers: ['The movement started too slowly', 'Bad frames at the start', 'Pacing'] },
    { id: 'q2', kind: 'cutting', question: 'Why did you speed S2 shot 2 up to 125%?', change: 'S2 shot 2 at 125%, 00:00:31:04 to 00:00:34:20',
      media: [{ file: 'review/debrief/q2-frame.png', label: 'S2 shot 2' }], answers: ['She read slower than she does elsewhere', 'The head turn was slow', 'To land the line sooner'] },
    { id: 'q3', kind: 'cutting', question: 'Why did Tobias’s line carry over Maren’s picture in S3?', change: 'the line unlinked and moved to A2, the picture trimmed by 18 frames',
      media: [], answers: ['To see her react', 'To bring her shot in sooner'] },
    { id: 'q4', kind: 'sound', question: 'Why did you take the faint gull over the close one?', change: 'gull-cry: try 3 picked, I predicted try 1',
      before: 'A single herring gull crying twice high over a pebble shore at dusk, a little distant, light wind',
      after: 'A faint gull cry far off over the water, soft',
      media: [{ file: 'audio/sfx/gull-cry/gull-cry-try1.wav', label: 'try 1, mine' }, { file: 'audio/sfx/gull-cry/gull-cry-try3.wav', label: 'try 3, yours' }],
      answers: ['The close one was too loud for the moment', 'It sounded fake', 'The faint one sat under the next line'] },
    { id: 'q5', kind: 'sound', question: 'Why did you cut the surf out under the letter?', change: 'surf-bed muted from 00:00:12:00 to 00:00:18:10',
      media: [], answers: ['The letter must be heard alone', 'The bed clashed with the take’s own sound'] },
    { id: 'q6', kind: 'previz', question: 'Why did you ask for the bottle to stand upright on S2’s board 3?', change: 'storyboard v2 to v3: the bottle stood upright',
      media: [{ file: 'review/debrief/q6-before.png', label: 'v2' }, { file: 'review/debrief/q6-after.png', label: 'v3' }], answers: ['It looked like it was spilling', 'The take copied the tilt'] },
    { id: 'q7', kind: 'prompts', question: 'Why did you rewrite Tobias’s line in S3?', change: 'script v2.7 to v2.8, S3 line 2',
      before: 'Maren, look, the boat is coming back to the point!', after: 'The boat. It’s back.', media: [], answers: ['Shorter lands harder', 'He would not shout here'] },
    { id: 'q8', kind: 'prompts', question: 'Why was S1 redone with the camera lower?', change: 'S1 take 2: "low angle, from the pebbles" added to the prompt',
      before: 'Medium shot of Maren on the shore', after: 'Low angle from the pebbles: Maren on the shore, the lighthouse above her', media: [], answers: ['She needed the tower behind her', 'The background was empty'] },
  ],
};
function DEBRIEF_SEED(): DebriefAnswers {
  return setAnswer(checkAnswers({}), 'q1', { picked: ['The movement started too slowly'], words: 'Tobias stands at the window for a whole second before anything happens.' }, '2026-11-19T18:20:00Z');
}
export const mockDebrief = (slug: string): { debrief: Debrief; answers: DebriefAnswers } | undefined =>
  slug === 'sample-debrief' ? { debrief: DEBRIEF, answers: mem(slug).debrief } : undefined;
export function mockDebriefSave(slug: string, f: (a: DebriefAnswers) => DebriefAnswers): DebriefAnswers | undefined {
  if (slug !== 'sample-debrief') return undefined;
  const m = mem(slug);
  m.debrief = f(m.debrief);
  void import('./mock').then(({ mockPoke }) => mockPoke(slug));
  return m.debrief;
}
export const mockDebriefLine = (slug: string, text: string): void => { void line(slug, text); };
