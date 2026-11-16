// The user's answer to a card that asks (a round of word readings, music takes, speeds, thumbnails; a yes to
// what is shown; the go for a quoted job). The card is Alma's, in the film's review/cards.json; the harness
// writes the taste.md row for a pick (as the flow's taste rule wants for every choice), notes the answer in its
// own harness/answers.json so the gate stops asking, and tells Alma, who applies it and marks the card.
// Faces, wardrobe, sheets, voices, locations and props keep their own path (pick.ts): those copy files.
import type { FeedCard } from '../types';
import { readFeed } from '../films/read/feed';
import { pokeFilm } from '../films/watcher';
import { Warnings } from '../films/util';
import { saveAnswer } from './answers';
import { filmTarget } from './film';
import { makePick, PickError, type PickInput, type PickResult } from './pick';
import { appendTasteRow, type TasteRow } from './taste';
import { Writer, type WriteRecord } from './writes';

export interface AnswerInput {
  card: string;                 // the card's key (its id)
  option?: string;              // for a pick: the option's id
  note?: string;                // the user's words, if they typed any
  from?: string;                // "the gate page"
}

export interface AnswerResult {
  ok: true;
  dryRun: boolean;
  film: string;
  card: string;
  kind: 'pick' | 'yes' | 'go';
  option?: string;
  writes: WriteRecord[];
  tasteRow?: string;
  message: string;
  notified: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const attr = (v: string): string => v.replace(/"/g, '&quot;');

export async function answerCard(input: AnswerInput, film: string, opts: { dryRun?: boolean; notify?: boolean; repo?: string } = {}): Promise<AnswerResult> {
  const ft = await filmTarget(film, opts.repo);
  if (!ft) throw new PickError(`no film "${film}"`, 404);
  const feed = await readFeed({ dir: ft.dir, warn: new Warnings() }, ft.slug);
  const card: FeedCard | undefined = feed.cards.find((c) => c.key === input.card);
  if (!card) throw new PickError(`no card "${input.card}" in review/cards.json`, 404);
  if (!card.ask) throw new PickError(`the card "${card.title}" does not ask for anything`, 409);
  if (card.ask.answer) throw new PickError(`the card "${card.title}" is already answered`, 409);
  const { kind } = card.ask;
  const opt = kind === 'pick' ? card.ask.options.find((o) => o.id === input.option) : undefined;
  if (kind === 'pick' && !opt) throw new PickError(`option must be one of ${card.ask.options.map((o) => o.id).join(', ') || '(the card lists none)'}`, 400);
  // a yes or a go with a no button of its own ("Cancel the ask"): option "no" is that button (Release, stage 3)
  const saidNo = kind !== 'pick' && input.option === 'no' && !!card.ask.noLabel;

  const where = input.from ?? 'Hitchcock Harness';
  const w = new Writer(`answer ${kind} ${card.key}${opt ? ` ${opt.id}` : ''}`, ft.show, !!opts.dryRun);
  let tasteRow: string | undefined;
  if (kind === 'pick' && opt) {
    const predicted = card.ask.prediction;
    const row: TasteRow = {
      date: today(),
      film: ft.title,
      choice: card.title,
      candidates: `${card.ask.options.map((o) => o.id).join(', ')} (${card.ask.options.length})`,
      pick: opt.id,
      pickNote: opt.label !== opt.id ? opt.label : undefined,
      words: input.note ? `"${input.note}"` : `– (picked on ${where} of Hitchcock Harness)`,
      predicted,
      right: predicted !== undefined ? predicted === opt.id || predicted === opt.label : undefined,
    };
    tasteRow = (await appendTasteRow(ft.repo, row, w)).line;
  }
  const at = new Date().toISOString();
  if (!opts.dryRun) await saveAnswer(ft.slug, card.key, { option: saidNo ? 'no' : opt?.id, at, note: input.note, kind });
  await w.wrote('harness/answers.json', `${ft.slug} · ${card.key}`);

  const attrs = [['kind', 'answer'], ['ask', kind], ['card', card.id ?? card.key], ...(opt ? [['option', opt.id]] : saidNo ? [['option', 'no']] : []), ...(card.ask.prediction ? [['prediction', card.ask.prediction]] : [])]
    .map(([k, v]) => `${k}="${attr(v)}"`).join(' ');
  const said = input.note ? ` Their words: "${input.note}".` : '';
  const what =
    saidNo ? `The user pressed “${card.ask.noLabel}” (no) on the card “${card.title}”`
    : kind !== 'pick' && card.ask.yesLabel ? `The user pressed “${card.ask.yesLabel}” on the card “${card.title}”`
    : kind === 'pick' ? `The user picked ${opt!.id}${opt!.label !== opt!.id ? ` (${opt!.label})` : ''} on the card “${card.title}”`
      : kind === 'yes' ? `The user said yes to the card “${card.title}”`
        : `The user gave the go for the card “${card.title}”${card.ask.cost ? ` (${card.ask.cost})` : ''}`;
  const message = [
    `<harness-action ${attrs}/> ${what}, on ${where}.${said} Apply it and continue the flow from there.`,
    '',
    kind === 'pick' ? 'The harness already wrote: the taste.md row.' : 'The harness wrote nothing in the film folder.',
    saidNo ? 'Yours: set "answer" on that card in review/cards.json to {"option": "no", "at": "<now>"}, and do nothing the card asked for.' : `Yours: set "answer" on that card in review/cards.json${kind === 'pick' ? ', the row\'s "What it says" cell and the score in taste.md' : ''}, and the work the answer starts${kind === 'go' ? ' (the spend gates still hold: this go covers the quote on the card and nothing else)' : ''}.`,
  ].join('\n');

  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  if (!opts.dryRun) pokeFilm(ft.slug);
  return { ok: true, dryRun: !!opts.dryRun, film: ft.slug, card: card.key, kind, option: opt?.id, writes: w.records, tasteRow, message, notified };
}

export interface ChoicesResult { ok: true; dryRun: boolean; film: string; answers: AnswerResult[]; picks: PickResult[]; message: string; notified: boolean }

/** Everything the user chose and set aside, sent with one button ("Done picking"): answers to cards that ask, and
 *  picks made on an asset's own page (a face, a voice, a master). Every one is checked first, so one that cannot be
 *  taken stops them all before anything is written; then each is written as it would be by itself, and Alma gets
 *  ONE message that lists them, not a turn per choice. */
export async function sendChoices(input: { answers: AnswerInput[]; picks: PickInput[] }, film: string, opts: { dryRun?: boolean; notify?: boolean; repo?: string } = {}): Promise<ChoicesResult> {
  const { answers, picks } = input;
  if (!answers.length && !picks.length) throw new PickError('no choices given');
  if (new Set(answers.map((i) => i.card)).size !== answers.length) throw new PickError('a card is named twice');
  if (new Set(picks.map((i) => `${i.kind}:${i.target}`)).size !== picks.length) throw new PickError('one thing is picked twice');
  for (const i of answers) await answerCard(i, film, { dryRun: true, repo: opts.repo });
  for (const i of picks) await makePick(i, film, { dryRun: true, repo: opts.repo });
  const doneA: AnswerResult[] = [];
  const doneP: PickResult[] = [];
  for (const i of answers) doneA.push(await answerCard(i, film, { dryRun: opts.dryRun, notify: false, repo: opts.repo }));
  for (const i of picks) doneP.push(await makePick(i, film, { dryRun: opts.dryRun, notify: false, repo: opts.repo }));
  const ft = (await filmTarget(film, opts.repo))!;
  const feed = await readFeed({ dir: ft.dir, warn: new Warnings() }, ft.slug);
  const lines = doneA.map((r) => {
    const card = feed.cards.find((c) => c.key === r.card);
    const opt = card?.ask?.options.find((o) => o.id === r.option);
    const bits = [`card="${attr(card?.id ?? r.card)}"`, `ask="${r.kind}"`, ...(r.option ? [`option="${attr(r.option)}"`] : []), ...(card?.ask?.prediction ? [`prediction="${attr(card.ask.prediction)}"`] : [])];
    return `- ${bits.join(' ')} · “${card?.title ?? r.card}”${opt && opt.label && opt.label !== opt.id ? ` · ${opt.label}` : ''}${r.kind === 'go' && card?.ask?.cost ? ` · the go covers: ${card.ask.cost}` : ''}`;
  });
  // a pick's own message already says what was picked, what the harness wrote and what is Alma's: it is kept whole
  const blocks = doneP.map((r) => r.message.split('\n').filter(Boolean).map((l, n) => (n ? `  ${l}` : `- ${l.replace(/ Continue the flow from there\.$/, '')}`)).join('\n'));
  const n = doneA.length + doneP.length;
  const tasteRows = doneA.filter((r) => r.kind === 'pick').length;
  const message = [
    `<harness-action kind="answers" count="${n}"/> The user is done choosing and sent ${n === 1 ? 'one choice' : `${n} choices`} with one button, in Hitchcock Harness. Each item below is one answer or one pick, exactly as it would say by itself. Apply them all in this turn, then continue the flow once.`,
    ...(lines.length ? ['', 'Answers to cards that ask:', ...lines, tasteRows ? `The harness already wrote the taste.md row of ${tasteRows === 1 ? 'the pick' : `each of the ${tasteRows} picks`} among them. Yours: set "answer" on each of those cards in review/cards.json, each row's "What it says" cell and the score in taste.md, and the work the answers start. A go covers the quote on its card and nothing more.` : 'The harness wrote nothing in the film folder for these. Yours: set "answer" on each of those cards in review/cards.json and do the work the answers start. A go covers the quote on its card and nothing more.'] : []),
    ...(blocks.length ? ['', 'Picks made on an asset\'s own page:', ...blocks] : []),
  ].join('\n');
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  return { ok: true, dryRun: !!opts.dryRun, film: ft.slug, answers: doneA, picks: doneP, message, notified };
}

export interface AnswersResult { ok: true; dryRun: boolean; film: string; answers: AnswerResult[]; message: string; notified: boolean }

/** Several cards answered with one button (the gate's "send all picks"). Every answer is checked first, so one that
 *  cannot be taken stops them all before anything is written; then each is written as a single answer is, and Alma
 *  gets ONE message that lists them, not a turn per card. */
export async function answerCards(inputs: AnswerInput[], film: string, opts: { dryRun?: boolean; notify?: boolean; repo?: string } = {}): Promise<AnswersResult> {
  if (!inputs.length) throw new PickError('no answers given');
  if (new Set(inputs.map((i) => i.card)).size !== inputs.length) throw new PickError('a card is named twice');
  for (const i of inputs) await answerCard(i, film, { dryRun: true, repo: opts.repo });
  const done: AnswerResult[] = [];
  for (const i of inputs) done.push(await answerCard(i, film, { dryRun: opts.dryRun, notify: false, repo: opts.repo }));
  const where = inputs[0].from ?? 'Hitchcock Harness';
  const ft = (await filmTarget(film, opts.repo))!;
  const feed = await readFeed({ dir: ft.dir, warn: new Warnings() }, ft.slug);
  const lines = done.map((r) => {
    const card = feed.cards.find((c) => c.key === r.card);
    const opt = card?.ask?.options.find((o) => o.id === r.option);
    const bits = [`card="${attr(card?.id ?? r.card)}"`, `ask="${r.kind}"`, ...(r.option ? [`option="${attr(r.option)}"`] : []), ...(card?.ask?.prediction ? [`prediction="${attr(card.ask.prediction)}"`] : [])];
    return `- ${bits.join(' ')} · “${card?.title ?? r.card}”${opt && opt.label && opt.label !== opt.id ? ` · ${opt.label}` : ''}`;
  });
  const picks = done.filter((r) => r.kind === 'pick').length;
  const message = [
    `<harness-action kind="answers" count="${done.length}"/> The user answered ${done.length} cards with one button, on ${where}. Each line is one answer, by the card's ID, exactly as a single answer would say it. Apply them all, then continue the flow once.`,
    '',
    ...lines,
    '',
    picks ? `The harness already wrote: the taste.md row of ${picks === 1 ? 'the pick' : `each of the ${picks} picks`}.` : 'The harness wrote nothing in the film folder.',
    `Yours: set "answer" on each of those cards in review/cards.json${picks ? ', each row\'s "What it says" cell and the score in taste.md' : ''}, and the work the answers start.`,
  ].join('\n');
  let notified = false;
  if (!opts.dryRun && opts.notify !== false) {
    const { sendToAlma } = await import('../claude/thread');
    await sendToAlma(ft.slug, message);
    notified = true;
  }
  return { ok: true, dryRun: !!opts.dryRun, film: ft.slug, answers: done, message, notified };
}

