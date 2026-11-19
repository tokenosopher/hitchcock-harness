// review/cards.json → the feed: every card Alma has shown the user, flattened (groups and all), each with the
// place on the flow board it belongs to, the IDs it is about, its files, and what it asks, if it asks.
//
// The film flow already says everything the user judges is a card on the review page. The harness reads that one
// file instead of inventing a second record, so a kind of work no page has a panel for still has a place.
//
// Where a card belongs: a card written for the harness says so (`at`, `for`; see recipes/show.md). An older card
// is placed from its group ("S3 …", "C01 …", "L01 …") and the words of its title; that guess is marked
// `placed: 'guess'` and is only ever used to choose a page, never to decide that something is approved or open.
// What a card asks: only its own `ask` field. Nothing is read out of "for your go" or "APPROVED" in a title.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { FEED_PLACES, type FeedAsk, type FeedCard, type FeedMedia, type FeedOption, type FeedPlace, type FeedSummary } from '../../types';
import { answersStamp, readAnswers } from '../../actions/answers';
import { progressStamp, readProgress } from '../../actions/progress';
import { abs, asRecord, asString, AUDIO_RE, IMAGE_RE, redact, VIDEO_RE, type FilmCtx } from '../util';

export interface Feed { cards: FeedCard[]; warnings: string[] }

const REL = 'review/cards.json';
const clean = (s: string): string => redact(s.replace(/\*\*|`/g, '')).trim();
const str = (v: unknown): string | undefined => {
  const s = asString(v);
  return s === undefined ? undefined : clean(s) || undefined;
};
const paras = (v: unknown): string[] =>
  (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []).map(clean).filter(Boolean);

const kindOf = (p: string): FeedMedia['kind'] => (VIDEO_RE.test(p) ? 'video' : AUDIO_RE.test(p) ? 'audio' : IMAGE_RE.test(p) ? 'image' : 'file');

// ---- what a card is about

/** C01, L01, P02, S3 and whole pick-up names (FIX-name-S2a, which is also about S2). */
export function idsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\bFIX-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)) {
    out.add(m[0]);
    for (const s of m[0].matchAll(/S(\d{1,2})/g)) out.add(`S${s[1]}`);
  }
  for (const m of text.matchAll(/\b([CLP]\d{2})[a-z]?\b/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bS(\d{1,2})[a-z]?\b/g)) out.add(`S${m[1]}`);
  return [...out];
}

// ---- where an older card belongs (a guess, from its group and its title)

const charPlace = (t: string): FeedPlace =>
  /video element|\bE-C\d/i.test(t) ? 'elements'
    : /element line|\bvoice/i.test(t) ? 'voices'
      : /\bsheet\b|\bskin\b/i.test(t) ? 'sheet'
        : /wardrobe|costume|cloak|clothing|\blooks?\b/i.test(t) ? 'clothing'
          : 'faces';

/** Title words, most specific stage first. Tried on the title's head (before the first " · "), then on all of it. */
const WORDS: [FeedPlace, RegExp][] = [
  ['release', /\brelease\b|social kit|\bkit\b|thumbnail|caption|as posted/i],
  ['finish', /\b1080|upscal/i],
  ['edit', /rough assembly|\bdraft \d|edit notes|title card|\bcut v\d/i],
  ['sound', /^["“”']|\bmusic\b|\bscore\b|\bsong\b|\bmix\b|\blufs\b|loudness|\bboom\b|\bsfx\b|sound effect|\bclon(e|ed|es)\b|\breadings?\b|recorded lines?|\bwords?\b|\bvoice|table read/i],
  ['scenes', /pick-up|\bFIX-|\btake \d|\bprobes?\b|name test|name matrix|\bredo(s|ne)?\b|set-up|\bprompt\b/i],
  ['previz', /previz|storyboard/i],
  ['loc', /light test/i],
  ['story', /research|evidence|\bbrief\b|\bscript\b|premise/i],
];

function byWords(title: string): FeedPlace | undefined {
  const head = title.split(' · ')[0];
  for (const t of head === title ? [title] : [head, title]) {
    const hit = WORDS.find(([, re]) => re.test(t));
    if (hit) return hit[0];
  }
  return undefined;
}

function byGroup(groups: string[], title: string): FeedPlace | undefined {
  for (const g of groups) {
    if (/^S\d+\b/.test(g)) return /previz|storyboard/i.test(title) ? 'previz' : 'scenes';
    if (/^C\d{2}\b/.test(g)) return charPlace(title);
    if (/^[LP]\d{2}\b/.test(g)) return /empty views|previz cameras|\bplan\b/i.test(title) ? 'views' : 'loc';
  }
  return undefined;
}

const bySection = (section: string): FeedPlace =>
  /final/i.test(section) ? 'edit' : /scene/i.test(section) ? 'scenes' : /character|cast/i.test(section) ? 'faces' : 'story';

// ---- the files of a card

function mediaOf(card: Record<string, unknown>): FeedMedia[] {
  const out: FeedMedia[] = [];
  const seen = new Set<string>();
  const add = (file: unknown, label?: string, sub?: string, option?: string): void => {
    const p = asString(file);
    if (!p || /^[a-z]+:\/\//i.test(p) || p.startsWith('/') || p.includes('..')) return; // files of the film only
    if (seen.has(p)) return;
    seen.add(p);
    out.push({ kind: kindOf(p), path: p, label, sub, option });
  };
  const items = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      const it = asRecord(x);
      if (it) add(it.file ?? it.path, str(it.label), str(it.sub), str(it.id));
    }
  };
  add(card.file, str(card.as));
  items(card.items);
  if (Array.isArray(card.versions)) {
    for (const x of card.versions) {
      const v = asRecord(x);
      if (!v) continue;
      const note = [str(v.verdict), str(v.note)].filter(Boolean).join(' · ');
      add(v.path ?? v.file, str(v.v), note ? (note.length > 240 ? note.slice(0, 237) + '…' : note) : undefined);
    }
  }
  if (Array.isArray(card.blocks)) for (const x of card.blocks) {
    const b = asRecord(x);
    if (!b) continue;
    add(b.file ?? b.path, str(b.label), str(b.sub), str(b.id));
    items(b.items);
  }
  items(card.files);
  return out;
}

// ---- what a card asks

function askOf(card: Record<string, unknown>, media: FeedMedia[]): FeedAsk | undefined {
  const kind = asString(card.ask);
  if (kind !== 'pick' && kind !== 'yes' && kind !== 'go') return undefined;
  let options: FeedOption[] = [];
  if (kind === 'pick') {
    if (Array.isArray(card.options)) {
      options = card.options.flatMap((x, i): FeedOption[] => {
        if (typeof x === 'string') return [{ id: String(i + 1), label: clean(x) }];
        const o = asRecord(x);
        if (!o) return [];
        const p = asString(o.file ?? o.path);
        return [{ id: str(o.id) ?? String(i + 1), label: str(o.label) ?? p?.split('/').pop() ?? `option ${i + 1}`, path: p }];
      });
      // an option that names one of the card's files sits under that file
      for (const o of options) {
        const m = o.path ? media.find((x) => x.path === o.path) : undefined;
        if (m) m.option = o.id;
      }
    } else {
      // no list: the card's own playable files are the options, in order
      const own = media.filter((m) => m.kind !== 'file');
      options = own.map((m, i) => ({ id: m.option ?? String(i + 1), label: m.label ?? m.path.split('/').pop()!, path: m.path }));
      own.forEach((m, i) => (m.option = options[i].id));
    }
  }
  const a = card.answer;
  const ar = asRecord(a);
  const answer: FeedAsk['answer'] =
    ar ? { option: str(ar.option), at: str(ar.at), note: str(ar.note), by: 'card' }
      : typeof a === 'string' ? { option: clean(a), by: 'card' }
        : a === true ? { by: 'card' }
          : undefined;
  // Alma's own word that the question is being worked on: "progress": "what is being done" (or true)
  const pr = card.progress;
  const progress: FeedAsk['progress'] = answer ? undefined : typeof pr === 'string' && pr.trim() ? { note: clean(pr), by: 'card' } : pr === true ? { by: 'card' } : undefined;
  const labels = { ...(str(card.yesLabel) && kind !== 'pick' ? { yesLabel: str(card.yesLabel) } : {}), ...(str(card.noLabel) && kind !== 'pick' ? { noLabel: str(card.noLabel) } : {}) };
  return { kind, options, prediction: str(card.prediction), cost: str(card.cost), answer, progress, ...labels };
}

// ---- the walk

/** The card types the record knows (the old review build stopped on any other; 16 Nov, Film Flow v3.2, it is gone). A
 *  card with another type is still shown as a plain card, with the files it names, and the film's warnings say so. */
export const CARD_TYPES = ['card', 'asset', 'group', 'video', 'videos', 'audio', 'images', 'script', 'lines', 'shotlist'] as const;
function parse(data: Record<string, unknown>, warn: (m: string) => void): FeedCard[] {
  const out: FeedCard[] = [];
  const keys = new Map<string, number>();
  const sections = Array.isArray(data.sections) ? data.sections : [];
  for (const s of sections) {
    const sec = asRecord(s);
    if (!sec) continue;
    const section = str(sec.heading) ?? '';
    let above: FeedCard | undefined; // the card just above, in this section: an unplaceable card sits with it

    const visit = (node: unknown, groups: string[]): void => {
      const c = asRecord(node);
      if (!c) return;
      const title = str(c.title) ?? '';
      if (c.type !== undefined && !(CARD_TYPES as readonly unknown[]).includes(c.type)) {
        warn(`"${title.slice(0, 50)}": the card type ${JSON.stringify(c.type)} is not one the harness knows (${CARD_TYPES.join(', ')}); it is shown as a plain card${Array.isArray(c.cards) ? ', and the cards inside it are not shown' : ''}`);
      }
      if (c.type === 'group') {
        if (Array.isArray(c.cards)) for (const x of c.cards) visit(x, [...groups, title]);
        return;
      }
      const media = mediaOf(c);
      const ask = askOf(c, media);
      const own = str(c.id);
      const said = asString(c.at);
      const at = FEED_PLACES.find((p) => p === said);
      if (said && !at) warn(`"${title.slice(0, 50)}": at "${said}" is not a place (${FEED_PLACES.join(', ')})`);
      const forIds = (typeof c.for === 'string' ? [c.for] : Array.isArray(c.for) ? c.for.filter((x): x is string => typeof x === 'string') : []).flatMap((x) => {
        const found = idsIn(x);
        return found.length ? found : [x.trim()];
      });
      let ids = [...new Set([...forIds, ...idsIn([...groups, title].join(' · '))])];
      let place = at ?? byGroup(groups, title) ?? byWords(title);
      if (!place && ids.some((x) => /^S\d+$/.test(x))) place = 'scenes';
      if (!place && above) {
        place = above.place;
        if (!ids.length) ids = above.ids;
      }
      place ??= bySection(section);

      // an asset card's id is the asset's (C01, on every round of it); any other card's id is its own
      const base = own && c.type !== 'asset' ? own : createHash('sha1').update([section, ...groups, title, media[0]?.path ?? ''].join('\n')).digest('hex').slice(0, 10);
      const n = (keys.get(base) ?? 0) + 1;
      keys.set(base, n);
      if (n > 1 && own && c.type !== 'asset') warn(`two cards share the id "${own}"`);
      if (ask && !(own && c.type !== 'asset')) warn(`"${title.slice(0, 50)}" asks but has no id of its own`);

      const text = [...paras(c.what), ...paras(c.text)];
      // a card's own "who", or a first paragraph that starts "Who:" (how cards said it before the field existed)
      const whoLine = !str(c.who) && /^Who:\s*/i.test(text[0] ?? '') ? text.shift()!.replace(/^Who:\s*/i, '') : undefined;
      const card: FeedCard = {
        key: n > 1 ? `${base}~${n}` : base,
        id: own,
        title: title || '(no title)',
        sub: str(c.sub),
        text: text.length ? text : undefined,
        date: str(c.updated),
        section,
        group: groups.length ? groups.join(' › ') : undefined,
        place,
        ids,
        placed: at ? 'card' : 'guess',
        who: str(c.who) ?? whoLine,
        media,
        ask,
      };
      // Release, stage 3: exact words kept as written (only trimmed), one file named in a line, a note of Alma's
      if (typeof c.quote === 'string' && c.quote.trim()) card.quote = c.quote.replace(/^\s*\n|\s+$/g, '');
      const fl = asRecord(c.fileLine);
      if (fl && str(fl.name)) card.fileLine = { name: str(fl.name)!, sub: str(fl.sub), path: asString(fl.path) };
      if (str(c.note)) card.note = str(c.note);
      out.push(card);
      above = card;
    };
    if (Array.isArray(sec.cards)) for (const x of sec.cards) visit(x, []);
  }
  return out;
}

/** The cards of a review record already read (the sample-data mode's cards of the Release pages use it). */
export const cardsOf = (data: Record<string, unknown>, warn: (m: string) => void = () => undefined): FeedCard[] => parse(data, warn);

// ---- cached on the two files it reads

interface Cached { stamp: string; feed: Feed }
// module-level on purpose: a code change in dev starts it empty, so a new placement rule shows at once
const cache = new Map<string, Cached>();

export async function readFeed(ctx: FilmCtx, slug: string): Promise<Feed> {
  const file = abs(ctx, REL);
  let mtime = 0;
  try {
    mtime = (await fs.stat(file)).mtimeMs;
  } catch {
    return { cards: [], warnings: [] };
  }
  const stamp = `${file}:${mtime}:${await answersStamp()}:${await progressStamp()}`;
  const hit = cache.get(slug);
  if (hit?.stamp === stamp) return hit.feed;

  const warnings: string[] = [];
  let data: Record<string, unknown> | undefined;
  try {
    data = asRecord(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (e) {
    warnings.push(`${REL}: not valid JSON (${(e as Error).message.slice(0, 80)})`);
  }
  const cards = data ? parse(data, (m) => warnings.push(`${REL}: ${m}`)) : [];
  const answers = await readAnswers(slug);
  const marks = await readProgress(slug);
  for (const c of cards) {
    const a = answers[c.key];
    if (c.ask && !c.ask.answer && a) c.ask.answer = { option: a.option, at: a.at, note: a.note, by: 'harness' };
    // the user wrote to Alma about the card: in progress until Alma rewrites the card (a newer "updated") or it is answered
    const p = marks[c.key];
    if (c.ask && !c.ask.answer && !c.ask.progress && p && (c.date ?? '') <= p.at) c.ask.progress = { at: p.at, by: 'harness' };
  }
  // newest first across the whole record (the record is newest-first only inside each group); undated cards keep their place at the end
  cards.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const feed = { cards, warnings };
  cache.set(slug, { stamp, feed });
  return feed;
}

export const isOpen = (c: FeedCard): boolean => !!c.ask && !c.ask.answer;
/** Open and really waiting for the user: not being worked on. */
export const isWaiting = (c: FeedCard): boolean => isOpen(c) && !c.ask!.progress;

/** A yes the user gave: a card that asks for a yes, answered with anything but a no or "replaced by …". */
export const isYes = (c: FeedCard): boolean => c.ask?.kind === 'yes' && !!c.ask.answer && c.ask.answer.option !== 'no' && !/^replaced by\b/i.test(c.ask.answer.option ?? '');

export function feedSummary(feed: Feed): FeedSummary {
  const counts: FeedSummary['counts'] = {};
  for (const c of feed.cards) counts[c.place] = (counts[c.place] ?? 0) + 1;
  const working = feed.cards.filter((c) => isOpen(c) && !isWaiting(c));
  const approvals = feed.cards.filter(isYes).map((c) => ({ key: c.key, ...(c.id ? { id: c.id } : {}), place: c.place, ids: c.ids, title: c.title, ...(c.ask!.answer!.at ?? c.date ? { at: c.ask!.answer!.at ?? c.date } : {}) }));
  return { counts, asks: feed.cards.filter(isWaiting), ...(working.length ? { working } : {}), ...(approvals.length ? { approvals } : {}) };
}

export interface FeedQuery {
  places?: FeedPlace[];
  /** Cards about this ID (C01, L01, S3), wherever they are placed. */
  id?: string;
  /** With `places`: leave out the cards about exactly one scene or one character (they are on that one's page). */
  shared?: boolean;
}

const single = (c: FeedCard, re: RegExp): boolean => c.ids.filter((x) => re.test(x)).length === 1;

export function feedFor(feed: Feed, q: FeedQuery): FeedCard[] {
  return feed.cards.filter((c) => {
    if (q.id && c.ids.includes(q.id)) return true;
    if (!q.places?.includes(c.place)) return false;
    if (!q.shared) return true;
    return isOpen(c) || !(single(c, /^S\d+$/) || single(c, /^C\d{2}$/));
  });
}
