// The why the user gives, kept in the film folder for Alma :
//   harness/cut-reasons.json      a reason beside a step of the History tab (components/edit/reasons.ts)
//   review/debrief-answers.json   the debrief's answers, as they are given (components/lib/debrief.ts)
// review/debrief.json is Alma's and is only read. Each write replaces its file whole (a temp file, then a rename), one
// at a time per file. Under MOCK=boards the sample films keep these in memory (src/fixtures/soundpick.ts).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isMock } from '@/fixtures/mock';
import { mockDebrief, mockDebriefLine, mockDebriefSave, mockReasons, mockSetReason } from '@/fixtures/soundpick';
import { checkReasons, REASONS_REL, setReason, type ReasonsFile } from '@/components/edit/reasons';
import { checkAnswers, checkDebrief, countsOf, debriefMessage, DEBRIEF_ANSWERS_REL, DEBRIEF_REL, setAnswer, type Debrief, type DebriefAnswers } from '@/components/lib/debrief';
import { filmTarget } from './film';
import { PickError } from './pick';

const chains = new Map<string, Promise<unknown>>();
async function writeJson(file: string, data: unknown): Promise<void> {
  const prev = chains.get(file) ?? Promise.resolve();
  const run = prev.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 1) + '\n');
    await fs.rename(tmp, file);
  });
  chains.set(file, run.catch(() => undefined));
  return run;
}
const readJson = async (file: string): Promise<unknown> => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return undefined; }
};
async function dirOf(slug: string): Promise<string> {
  const ft = await filmTarget(slug);
  if (!ft) throw new PickError(`no film folder assets/films/${slug}`, 404);
  return ft.dir;
}

// ---- reasons beside the History tab's steps

export async function readReasons(slug: string): Promise<ReasonsFile> {
  if (isMock()) return mockReasons(slug);
  return checkReasons(await readJson(path.join(await dirOf(slug), REASONS_REL)));
}

export async function saveReason(slug: string, step: { rev: number; words: string; at?: string; by?: string }, reason: string): Promise<ReasonsFile> {
  if (isMock()) return mockSetReason(slug, step, reason);
  const file = path.join(await dirOf(slug), REASONS_REL);
  const next = setReason(checkReasons(await readJson(file)), step, reason, new Date().toISOString());
  await writeJson(file, next);
  return next;
}

// ---- the debrief

export interface DebriefRead { debrief?: Debrief; answers: DebriefAnswers; problems: string[]; title: string }

export async function readDebrief(slug: string): Promise<DebriefRead> {
  if (isMock()) {
    const m = mockDebrief(slug);
    return m ? { ...m, problems: [], title: 'the sample film' } : { answers: { answers: {} }, problems: [], title: slug };
  }
  const ft = await filmTarget(slug);
  if (!ft) throw new PickError(`no film folder assets/films/${slug}`, 404);
  const raw = await readJson(path.join(ft.dir, DEBRIEF_REL));
  const { debrief, problems } = raw === undefined ? { debrief: undefined, problems: [] } : checkDebrief(raw);
  return { debrief, answers: checkAnswers(await readJson(path.join(ft.dir, DEBRIEF_ANSWERS_REL))), problems, title: ft.title };
}

/** One answer kept as it is given (a tap, the words, a skip); the page saves as the user goes. */
export async function saveDebriefAnswer(slug: string, id: string, a: { picked?: string[]; words?: string; skipped?: boolean }): Promise<DebriefAnswers> {
  const r = await readDebrief(slug);
  if (!r.debrief?.questions.some((q) => q.id === id)) throw new PickError(`no question "${id}" in ${DEBRIEF_REL}`, 404);
  const at = new Date().toISOString();
  if (isMock()) return mockDebriefSave(slug, (f) => setAnswer(f, id, a, at))!;
  const next = setAnswer(r.answers, id, a, at);
  await writeJson(path.join(await dirOf(slug), DEBRIEF_ANSWERS_REL), next);
  return next;
}

/** "Send the answers to Alma": one message with every answer, and the file marked sent (the card stops waiting). */
export async function sendDebrief(slug: string, opts: { dryRun?: boolean } = {}): Promise<{ message: string; answers: DebriefAnswers }> {
  const r = await readDebrief(slug);
  if (!r.debrief?.questions.length) throw new PickError(`no questions in ${DEBRIEF_REL}`, 404);
  const c = countsOf(r.debrief, r.answers);
  if (!c.answered && !c.skipped) throw new PickError('nothing answered yet', 409);
  const message = debriefMessage(r.debrief, r.answers, r.title);
  const sent = { ...r.answers, sent: new Date().toISOString(), sentCount: c.answered };
  if (opts.dryRun) return { message, answers: r.answers };
  if (isMock()) {
    mockDebriefSave(slug, () => sent);
    mockDebriefLine(slug, message);
    return { message, answers: sent };
  }
  await writeJson(path.join(await dirOf(slug), DEBRIEF_ANSWERS_REL), sent);
  const { sendToAlma } = await import('../claude/thread');
  await sendToAlma(slug, message);
  const { pokeFilm } = await import('../films/watcher');
  pokeFilm(slug);
  return { message, answers: sent };
}
