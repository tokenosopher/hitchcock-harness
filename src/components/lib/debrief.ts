// The debrief at the end of a film (Flow v3.3 - 12 Release, "The debrief", steps 39 to 42). The
// user: "when the film is done, I think Alma should start asking questions around 'Why did you make the changes that
// you made?' ... kind of like a debrief session at the end of every video". Alma writes the questions to the film's
// review/debrief.json; the user answers on the film's one debrief page (tap a likely answer, write their own words, or
// skip); the harness keeps each answer in review/debrief-answers.json as it is given, and "Send the answers to Alma"
// sends them all as one message. Pure: the check of the questions file, the groups, the counts and the message.
import { defuse } from '../../lib/defuse';

export const DEBRIEF_REL = 'review/debrief.json';
export const DEBRIEF_ANSWERS_REL = 'review/debrief-answers.json';
export const DEBRIEF_KINDS = ['cutting', 'sound', 'previz', 'prompts'] as const;
export type DebriefKind = (typeof DEBRIEF_KINDS)[number];
export const KIND_WORDS: Record<DebriefKind, string> = { cutting: 'Cutting', sound: 'Sound', previz: 'Previz and storyboards', prompts: 'Prompts and script lines' };

/** What a question shows of its change: a picture, a clip (from a second on), a sound; a line of words under it. */
export interface DebriefMedia { file: string; label?: string; from?: number }
export interface DebriefQuestion {
  id: string;
  kind: DebriefKind;
  question: string;
  /** The change in a line: "72 frames (3.0 s) cut at the head, at 00:01:42:10". */
  change?: string;
  /** Two prompts or two lines side by side: what Alma proposed, what the user made of it. */
  before?: string;
  after?: string;
  media: DebriefMedia[];
  /** A few likely answers to tap. */
  answers: string[];
  /** Where on the cut (a timecode), for the Edit page link. */
  at?: string;
}
export interface Debrief {
  film?: string;
  made?: string;
  intro?: string;
  questions: DebriefQuestion[];
  /** What the debrief measures, as Alma counted it (step 42): shown at the top, read only. */
  counts?: { label: string; value: string }[];
}
export interface DebriefAnswer { picked?: string[]; words?: string; skipped?: boolean; at: string }
export interface DebriefAnswers { answers: Record<string, DebriefAnswer>; sent?: string; sentCount?: number }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const SAFE = (p: string): boolean => !/^[a-z]+:\/\//i.test(p) && !p.startsWith('/') && !p.includes('..');

/** The questions file as Alma wrote it. Lenient: a question without words or with an unknown kind is left out and named
 *  in `problems`; at most 20 questions are kept. */
export function checkDebrief(raw: unknown): { debrief?: Debrief; problems: string[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: ['not an object'] };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.questions)) return { problems: ['questions must be a list'] };
  const questions: DebriefQuestion[] = [];
  const ids = new Set<string>();
  r.questions.forEach((x, i) => {
    const q = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const id = str(q.id) ?? `q${i + 1}`;
    const kind = str(q.kind) as DebriefKind | undefined;
    const question = str(q.question);
    if (!question) { problems.push(`question ${i + 1}: no words`); return; }
    if (!kind || !DEBRIEF_KINDS.includes(kind)) { problems.push(`question ${i + 1}: kind must be ${DEBRIEF_KINDS.join(', ')}`); return; }
    if (ids.has(id)) { problems.push(`question ${i + 1}: the id "${id}" is used twice`); return; }
    ids.add(id);
    const media: DebriefMedia[] = [];
    const add = (m: unknown) => {
      const o = typeof m === 'string' ? { file: m } : m && typeof m === 'object' ? (m as Record<string, unknown>) : undefined;
      const file = o ? str(o.file ?? o.path) : undefined;
      if (!file || !SAFE(file)) return;
      const from = Number(o!.from);
      media.push({ file, ...(str(o!.label) ? { label: str(o!.label) } : {}), ...(Number.isFinite(from) && from >= 0 ? { from } : {}) });
    };
    if (Array.isArray(q.media)) q.media.forEach(add);
    for (const k of ['frame', 'file', 'sound', 'clip']) if (q[k] !== undefined) add(q[k]);
    questions.push({
      id, kind, question,
      ...(str(q.change) ? { change: str(q.change) } : {}),
      ...(str(q.before) ? { before: str(q.before) } : {}),
      ...(str(q.after) ? { after: str(q.after) } : {}),
      media,
      answers: (Array.isArray(q.answers) ? q.answers : []).map(str).filter((a): a is string => !!a).slice(0, 6),
      ...(str(q.at) ? { at: str(q.at) } : {}),
    });
  });
  if (questions.length > 20) problems.push(`${questions.length} questions: only the first 20 are shown`);
  const counts = Array.isArray(r.counts)
    ? r.counts.flatMap((c) => { const o = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}; const label = str(o.label); const value = o.value === undefined ? undefined : String(o.value); return label && value ? [{ label, value }] : []; })
    : undefined;
  return { debrief: { film: str(r.film), made: str(r.made), intro: str(r.intro), questions: questions.slice(0, 20), ...(counts?.length ? { counts } : {}) }, problems };
}

/** The answers file read loosely: what is not an answer is dropped. */
export function checkAnswers(raw: unknown): DebriefAnswers {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const a = r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers) ? (r.answers as Record<string, unknown>) : {};
  const answers: Record<string, DebriefAnswer> = {};
  for (const [id, v] of Object.entries(a)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
    if (!o || !str(o.at)) continue;
    const picked = Array.isArray(o.picked) ? o.picked.map(str).filter((x): x is string => !!x) : [];
    answers[id] = { at: str(o.at)!, ...(picked.length ? { picked } : {}), ...(str(o.words) ? { words: str(o.words) } : {}), ...(o.skipped === true ? { skipped: true } : {}) };
  }
  return { answers, ...(str(r.sent) ? { sent: str(r.sent) } : {}), ...(typeof r.sentCount === 'number' ? { sentCount: r.sentCount } : {}) };
}

/** An answer that says something: a tapped answer or words. A skip is not one. */
export const isAnswered = (a?: DebriefAnswer): boolean => !!a && !a.skipped && (!!a.picked?.length || !!a.words);

/** One answer set: the new one replaces the old (an empty one clears it). Pure. */
export function setAnswer(file: DebriefAnswers, id: string, a: { picked?: string[]; words?: string; skipped?: boolean }, at: string): DebriefAnswers {
  const picked = (a.picked ?? []).map((x) => x.trim()).filter(Boolean);
  const words = a.words?.trim().slice(0, 2000);
  const answers = { ...file.answers };
  if (!a.skipped && !picked.length && !words) delete answers[id];
  else answers[id] = { at, ...(picked.length && !a.skipped ? { picked } : {}), ...(words && !a.skipped ? { words } : {}), ...(a.skipped ? { skipped: true } : {}) };
  // a change after the answers were sent makes them unsent again: the page offers to send them once more
  const { sent: _sent, sentCount: _n, ...rest } = file;
  void _sent; void _n;
  return { ...rest, answers };
}

/** The questions in their groups, in the order of the kinds, each group in the film's order (Alma's). */
export function groupsOf(d: Debrief): { kind: DebriefKind; questions: DebriefQuestion[] }[] {
  return DEBRIEF_KINDS.map((kind) => ({ kind, questions: d.questions.filter((q) => q.kind === kind) })).filter((g) => g.questions.length);
}

export function countsOf(d: Debrief, a: DebriefAnswers): { questions: number; answered: number; skipped: number; open: number } {
  let answered = 0, skipped = 0;
  for (const q of d.questions) {
    const x = a.answers[q.id];
    if (isAnswered(x)) answered += 1;
    else if (x?.skipped) skipped += 1;
  }
  return { questions: d.questions.length, answered, skipped, open: d.questions.length - answered - skipped };
}

const q1 = (s: string): string => defuse(s.replace(/"/g, '”'));

/** The one message to Alma when the user sends the answers. Each answer in the user's words, with the question and
 *  the change it explains; the skipped ones named; what is Alma's to do from her stage note. */
export function debriefMessage(d: Debrief, a: DebriefAnswers, filmTitle: string): string {
  const c = countsOf(d, a);
  const lines: string[] = [];
  for (const g of groupsOf(d)) {
    const answered = g.questions.filter((q) => isAnswered(a.answers[q.id]));
    if (!answered.length) continue;
    lines.push('', `${KIND_WORDS[g.kind]}:`);
    for (const q of answered) {
      const x = a.answers[q.id];
      const said = [x.picked?.length ? `tapped "${x.picked.map(q1).join('", "')}"` : '', x.words ? `wrote "${q1(x.words)}"` : ''].filter(Boolean).join(' and ');
      lines.push(`- ${q.id} · “${q.question}”${q.change ? ` (${q.change})` : ''}: the user ${said}`);
    }
  }
  const skipped = d.questions.filter((q) => a.answers[q.id]?.skipped).map((q) => q.id);
  const open = d.questions.filter((q) => !a.answers[q.id]).map((q) => q.id);
  return [
    `<harness-action kind="debrief" answered="${c.answered}" skipped="${c.skipped}" open="${c.open}"/> The user sent their debrief answers for ${filmTitle} from the debrief page of Hitchcock Harness: ${c.answered} of ${c.questions} answered.`,
    ...lines,
    ...(skipped.length ? ['', `Skipped: ${skipped.join(', ')}.`] : []),
    ...(open.length ? [`Not answered: ${open.join(', ')}.`] : []),
    '',
    `The harness kept every answer in ${DEBRIEF_ANSWERS_REL}, in the user's words. Yours: what your stage note's debrief says to do with each answer.`,
  ].join('\n');
}
