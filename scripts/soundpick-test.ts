// npm run soundpick:test
// The pure parts of the sound pick card, the why card and the debrief: the sound pick card's sounds (src/server/films/read/sfx.ts) and
// their words (src/components/feed/soundPick.ts), the kit's pick command, the reasons beside the History tab's steps
// (src/components/edit/reasons.ts) and the debrief (src/components/lib/debrief.ts). The answer to a why card goes
// through answer.ts with dryRun on a temp copy of a film. No server, no browser, nothing paid.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { effectName, sfxPickArgs, sfxRefs, soundAnswerKey, soundsOf, type SfxPlan } from '../src/server/films/read/sfx';
import { placeLine, stripOf, tryLabel } from '../src/components/feed/soundPick';
import { checkReasons, setReason, reasonsByRev } from '../src/components/edit/reasons';
import { checkAnswers, checkDebrief, countsOf, debriefMessage, groupsOf, isAnswered, setAnswer } from '../src/components/lib/debrief';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

// ---- the sounds of a pick card

const plan: SfxPlan = {
  fps: 24,
  scenes: [{ scene: 'S1', frames: [0, 629] }, { scene: 'S2', frames: [629, 1268] }],
  effects: [
    { id: 'HB1', kind: 'bed', file: 'sfx/hb1-surf-bed-a', start: { tc: '00:00:00:02', frame: 2 }, end: { tc: '00:00:27:14', frame: 662 }, seconds: 27.5, level_db: -22.5, fade_in_frames: 24, fade_out_frames: 24, reason: 'one bed for the shore' },
    { id: 'R1', name: 'Gull Cry', kind: 'reaction', start: { tc: '00:00:08:02', frame: 194 }, end: { tc: '00:00:10:12', frame: 252 }, seconds: 2.4, level_db: -12, fade_in_frames: 4, fade_out_frames: 18 },
    { id: 'C1', kind: 'carry-over', start: { frame: 700 } },
  ],
};
ok('effectName: name, else the last part of file, else id-kind (sfx.py effect_name)',
  effectName(plan.effects![1]) === 'gull-cry' && effectName(plan.effects![0]) === 'hb1-surf-bed-a' && effectName(plan.effects![2]) === 'c1-carry-over');
const refs = sfxRefs(['hb1-surf-bed-a', { sound: 'Gull Cry', prediction: 3 }, { name: 'c1-carry-over', prediction: 'x' }, 'hb1-surf-bed-a', 7]);
ok('sfxRefs: names and {sound, prediction}, slugged, once each', JSON.stringify(refs) === JSON.stringify([{ name: 'hb1-surf-bed-a' }, { name: 'gull-cry', prediction: 3 }, { name: 'c1-carry-over' }]), refs);
const sounds = soundsOf(refs, plan, {
  'hb1-surf-bed-a': { files: ['audio/sfx/hb1-surf-bed-a/hb1-surf-bed-a-try2.wav', 'audio/sfx/hb1-surf-bed-a/hb1-surf-bed-a-try1.wav'], prompts: { prompts: ['a literal bed', 'a close bed'] } },
  'gull-cry': { files: [], prompts: { tries: [{ try: 2, file: 'audio/sfx/gull-cry/gull-cry-try2.wav', style: 'natural, close', prompt: 'close', seconds: 4.4 }, { try: 1, file: 'audio/sfx/gull-cry/gull-cry-try1.wav', style: 'literal', prompt: 'lit' }], picked: { try: 2, date: '2026-11-19', note: 'warmer' } } },
});
const [bed, gull, carry] = sounds;
ok('older folders: prompts with the try files beside them', bed.tries.length === 2 && bed.tries[0].n === 1 && bed.tries[0].file?.endsWith('try1.wav') === true && bed.tries[0].prompt === 'a literal bed', bed.tries);
ok('the place from the plan, the scene from its frames', bed.effect?.startTc === '00:00:00:02' && bed.effect?.levelDb === -22.5 && bed.scene === 'S1' && bed.filmFrames === 1268 && bed.fps === 24, bed);
ok('prompts.json tries, in order, with style and length', gull.tries.map((t) => t.n).join() === '1,2' && gull.tries[1].style === 'natural, close' && gull.tries[1].seconds === 4.4);
ok('the prediction and the kit\'s own pick', gull.prediction === 3 && gull.picked?.n === 2 && gull.picked.note === 'warmer');
ok('a sound with no folder still shows its place', carry.tries.length === 0 && carry.effect?.kind === 'carry-over' && carry.scene === 'S2');
ok('the effect sfx.py kept in prompts.json when the plan lacks it', soundsOf([{ name: 'x' }], undefined, { x: { files: [], prompts: { effect: { id: 'X1', kind: 'accent', start: { tc: '00:00:01:00', frame: 24 } } } } })[0].effect?.id === 'X1');
ok('placeLine: scene, times without the zero hour, length, level, fades',
  placeLine(gull) === 'S1 · 00:08:02 to 00:10:12 · 2.4 s · −12 dB · fades 4 and 18 frames' && placeLine(bed).includes('−22.5 dB'), placeLine(gull));
ok('placeLine: without a plan', placeLine({ name: 'x', tries: [] }) === 'Its place is not in the plan');
const strip = stripOf(gull)!;
ok('the strip: the place as a share of the film', Math.abs(strip.left - (194 / 1268) * 100) < 1e-9 && Math.abs(strip.width - ((252 - 194) / 1268) * 100) < 1e-9 && stripOf({ name: 'y', tries: [] }) === undefined);
ok('a try\'s label', tryLabel(gull.tries[1]) === 'try 2 · natural, close' && tryLabel({ n: 3 }) === 'try 3');
ok('the kit\'s pick command, with the words and the prediction only when given',
  JSON.stringify(sfxPickArgs('/f', 'gull-cry', 2, 'warmer', 3)) === JSON.stringify(['/f', 'gull-cry', '--pick', '2', '--note', 'warmer', '--predicted', '3'])
  && JSON.stringify(sfxPickArgs('/f', 'a', 1)) === JSON.stringify(['/f', 'a', '--pick', '1']));
ok('one answer per sound of a card', soundAnswerKey('ASK-S1-sounds', 'gull-cry') === 'ASK-S1-sounds#sfx:gull-cry');

// ---- reasons beside the History tab's steps

let rf = checkReasons({ format: 1, reasons: [{ rev: 4, step: 'trimmed', reason: 'too slow', at: '2026-11-19T10:00:00Z' }, { rev: 'x', reason: 'bad' }, { rev: 5, reason: '' }] });
ok('checkReasons keeps the good entries only', rf.reasons.length === 1 && rf.reasons[0].rev === 4, rf);
rf = setReason(rf, { rev: 9, words: 'moved S3', by: 'user', at: '2026-11-19T10:05:00Z' }, '  the wave\n lands  on the cut ', '2026-11-19T10:06:00Z');
ok('setReason: the step\'s words and time copied in, the reason on one line', reasonsByRev(rf).get(9)?.reason === 'the wave lands on the cut' && reasonsByRev(rf).get(9)?.step === 'moved S3' && reasonsByRev(rf).get(9)?.stepAt === '2026-11-19T10:05:00Z');
rf = setReason(rf, { rev: 4, words: 'trimmed' }, 'faces blurred', '2026-11-19T10:07:00Z');
ok('setReason: one per step, the new one wins, in rev order', rf.reasons.map((r) => `${r.rev}:${r.reason}`).join() === '4:faces blurred,9:the wave lands on the cut');
rf = setReason(rf, { rev: 9, words: 'moved S3' }, '   ', '2026-11-19T10:08:00Z');
ok('empty words take the reason away', rf.reasons.length === 1 && !reasonsByRev(rf).has(9));
ok('a long reason is cut to 500 characters', setReason(rf, { rev: 1, words: '' }, 'x'.repeat(900), 'now').reasons.find((r) => r.rev === 1)?.reason.length === 500);

// ---- the debrief

const raw = {
  film: 'f', made: '2026-11-19T18:00:00Z', counts: [{ label: 'Changes', value: 61 }, { label: 'x' }],
  questions: [
    { id: 'q1', kind: 'cutting', question: 'Why 72 frames?', change: '72 frames', answers: ['slow', 'bad frames', ''], frame: 'review/debrief/q1.png' },
    { id: 'q2', kind: 'sound', question: 'Why the faint gull?', before: 'loud', after: 'quiet', media: [{ file: 'audio/sfx/a/a-try1.wav', label: 'mine' }, { file: '/etc/passwd' }, { file: '../x' }] },
    { id: 'q3', kind: 'cutting', question: 'Why the speed-up?' },
    { kind: 'prompts', question: 'Why the new line?' },
    { id: 'q5', kind: 'music', question: 'Why?' },
    { id: 'q1', kind: 'sound', question: 'twice' },
    { id: 'q6', kind: 'previz' },
  ],
};
const { debrief, problems } = checkDebrief(raw);
ok('checkDebrief: good questions kept, the rest named', debrief?.questions.map((q) => q.id).join() === 'q1,q2,q3,q4' && problems.length === 3, { ids: debrief?.questions.map((q) => q.id), problems });
ok('checkDebrief: media from the film only, a frame field taken as a picture', debrief!.questions[0].media[0].file === 'review/debrief/q1.png' && debrief!.questions[1].media.length === 1 && debrief!.questions[0].answers.length === 2);
ok('checkDebrief: the counts with a value', debrief!.counts?.length === 1 && debrief!.counts[0].value === '61');
ok('checkDebrief: not a list', checkDebrief({ questions: 3 }).problems[0] === 'questions must be a list' && !checkDebrief([]).debrief);
ok('groups in the kinds\' order, the film\'s order inside', groupsOf(debrief!).map((g) => `${g.kind}:${g.questions.map((q) => q.id).join('+')}`).join() === 'cutting:q1+q3,sound:q2,prompts:q4');
let a = checkAnswers({ answers: { q1: { picked: ['slow'], at: 't1' }, bad: { picked: ['x'] } }, sent: 's' });
ok('checkAnswers: an answer needs its time', Object.keys(a.answers).join() === 'q1' && a.sent === 's');
a = setAnswer(a, 'q2', { words: '  the full one was too loud  ' }, 't2');
ok('setAnswer: words trimmed; a change makes the answers unsent', a.answers.q2.words === 'the full one was too loud' && a.sent === undefined);
a = setAnswer(a, 'q3', { skipped: true, words: 'ignored' }, 't3');
ok('a skip keeps no words', a.answers.q3.skipped === true && a.answers.q3.words === undefined && !isAnswered(a.answers.q3));
a = setAnswer(a, 'q1', {}, 't4');
ok('an empty answer clears it', !a.answers.q1);
a = setAnswer(a, 'q1', { picked: ['slow', ' '], words: 'he lifts the cup "slowly"' }, 't5');
const c = countsOf(debrief!, a);
ok('the counts: answered, skipped, open', c.questions === 4 && c.answered === 2 && c.skipped === 1 && c.open === 1, c);
const msg = debriefMessage(debrief!, a, 'The Lighthouse');
ok('the message: one tag with the counts, each answer in the user\'s words, by group', msg.startsWith('<harness-action kind="debrief" answered="2" skipped="1" open="1"/>')
  && msg.includes('Cutting:\n- q1 · “Why 72 frames?” (72 frames): the user tapped "slow" and wrote "he lifts the cup ”slowly”"\n')
  && msg.includes('Sound:\n- q2') && msg.includes('Skipped: q3.') && msg.includes('Not answered: q4.') && msg.includes('review/debrief-answers.json'), msg);

// ---- a why card answered (answer.ts, dry run, on a temp film)

async function why(): Promise<void> {
  const repo = mkdtempSync(path.join(tmpdir(), 'hh-why-'));
  const film = path.join(repo, 'assets', 'films', 'why-film');
  mkdirSync(path.join(film, 'review'), { recursive: true });
  writeFileSync(path.join(film, 'review', 'cards.json'), JSON.stringify({ sections: [{ heading: 'Edit', cards: [
    { type: 'card', id: 'WHY-1', title: 'Why did S7 shot 2 lose 72 frames?', at: 'edit', ask: 'why', options: ['Too slow', 'Bad frames'], updated: '2026-11-19T10:00:00Z' },
    { type: 'card', id: 'ASK-S1-sounds', title: 'S1 sounds', at: 'sound', ask: 'pick', sfx: ['gull-cry'], updated: '2026-11-19T10:00:00Z' },
  ] }] }));
  process.env.HARNESS_DIR = mkdtempSync(path.join(tmpdir(), 'hh-why-harness-'));
  process.env.HARNESS_FILM_REPO = repo;
  const { answerCard } = await import('../src/server/actions/answer');
  const { readFeed } = await import('../src/server/films/read/feed');
  const { Warnings } = await import('../src/server/films/util');
  const feed = await readFeed({ dir: film, warn: new Warnings() }, 'why-film');
  const w = feed.cards.find((x) => x.id === 'WHY-1');
  ok('a why card reads as ask "why" with its likely answers', w?.ask?.kind === 'why' && w.ask.options.map((o) => o.label).join() === 'Too slow,Bad frames', w?.ask);
  const s = feed.cards.find((x) => x.id === 'ASK-S1-sounds');
  ok('a sound pick card reads its sounds and no options', s?.sounds?.[0]?.name === 'gull-cry' && s.ask?.kind === 'pick' && s.ask.options.length === 0, s);
  const r = await answerCard({ card: 'WHY-1', option: '1', note: 'he lifts the cup for a second', from: 'the Edit page' }, 'why-film', { dryRun: true, repo });
  ok('a why answer: no taste row, the words in the message', r.kind === 'why' && !r.tasteRow && r.message.includes('tapped “Too slow” and wrote "he lifts the cup for a second"'), r.message);
  const sk = await answerCard({ card: 'WHY-1', option: 'skip' }, 'why-film', { dryRun: true, repo });
  ok('a skip', sk.option === 'skip' && sk.message.includes('skipped the question'));
  let refused = '';
  try { await answerCard({ card: 'WHY-1' }, 'why-film', { dryRun: true, repo }); } catch (e) { refused = (e as Error).message; }
  ok('a why answer with nothing in it is refused', /needs the user's words/.test(refused), refused);
  refused = '';
  try { await answerCard({ card: 'ASK-S1-sounds', option: '1' }, 'why-film', { dryRun: true, repo }); } catch (e) { refused = (e as Error).message; }
  ok('a sound pick card is answered one sound at a time', /one sound at a time/.test(refused), refused);
}

why().catch((e) => { bad++; console.error('✗ the why card:', e); }).finally(() => {
  console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
  process.exit(bad ? 1 : 0);
});
