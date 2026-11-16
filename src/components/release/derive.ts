// What the Release pages work out from the release file and the clock (Release, 14 Nov 2026). Pure, never stored:
// the seven states and their precedence, the tags beside a state, which platforms are locked, what a shared edit
// would touch, whether a go is allowed and why not, the counts of a field and a posted part, the caption as each
// platform will post it, the feed preview's cut, the "Next" bar, the waves and the posted count.
// The pages, the server (GET …/release `derived`) and scripts/release-test.ts import it.
import { factIdsIn, type Aim, type Effect, type Fact, type Field, type Platform, type ReleaseFile } from './file';
import { factsOf, numWords, partOf, type PartFacts, type PlatformKind, type Sourced } from './platforms';

// ---- time

/** "18:52" in local time. */
export const hm = (d: Date | string): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
/** The local moment of "about 19:00" on the release day (or the day after). */
export function waveAt(file: Pick<ReleaseFile, 'day'>, p: Pick<Platform, 'wave'>): Date {
  const [y, m, d] = file.day.split('-').map(Number);
  const [h, min] = p.wave.about.split(':').map(Number);
  return new Date(y, m - 1, d + (p.wave.day === 'tomorrow' ? 1 : 0), h, min);
}
/** "today", "tomorrow" or "15 Nov", from the clock. */
export function dayWords(at: Date, now: Date): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(at) - day(now)) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return `${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A send past this long without a post needs the user. */
export const STUCK_MS = 20 * 60_000;

// ---- texts and facts

const factById = (file: ReleaseFile, id: string): Fact | undefined => file.facts.find((f) => f.id === id);
/** A text with its facts filled: the confirmed value, else the value typed so far, else "[the days it took]". */
export function fillFacts(file: ReleaseFile, text: string): string {
  return text.replace(/\{([a-z][a-z0-9-]*)\}/g, (all, id: string) => {
    const f = factById(file, id);
    return f ? (f.value?.trim() ? f.value.trim() : `[${f.label}]`) : all;
  });
}
/** The facts a text uses that are not confirmed. */
export const unconfirmedIn = (file: ReleaseFile, text: string): Fact[] =>
  factIdsIn(text).map((id) => factById(file, id)).filter((f): f is Fact => !!f && !f.confirmedAt);
/** The platforms whose text in use (or whose candidates, while nothing is picked) uses a fact. */
export function usersOf(file: ReleaseFile, factId: string): { platform: Platform; inUse: boolean }[] {
  const out: { platform: Platform; inUse: boolean }[] = [];
  for (const p of file.platforms) {
    const inUse = p.fields.some((f) => factIdsIn(f.text).includes(factId));
    const maybe = p.fields.some((f) => unfilled(f) && f.candidates.some((c) => factIdsIn(c.text).includes(factId)));
    if (inUse || maybe) out.push({ platform: p, inUse });
  }
  return out;
}

/** The unconfirmed facts a platform's texts in use need. */
export function blanks(file: ReleaseFile, p: Platform): Fact[] {
  const out: Fact[] = [];
  for (const f of p.fields) if (f.text) for (const x of unconfirmedIn(file, f.text)) if (!out.includes(x)) out.push(x);
  return out;
}
/** "the days it took are not confirmed", "the cost is not confirmed". */
export const notConfirmed = (fs: Fact[]): string => `${fs.map((f) => f.label).join(' and ')} ${fs.length > 1 || fs[0]?.many ? 'are' : 'is'} not confirmed`;

export const platformOf = (file: ReleaseFile, id: string): Platform | undefined => file.platforms.find((p) => p.id === id);
export const fieldOf = (file: ReleaseFile, pid: string, fid: string): Field | undefined => platformOf(file, pid)?.fields.find((f) => f.id === fid);

/** Tags in a tag field: "#ai #aifilm" (by spaces) or "lighthouse, letter in a bottle" (by commas, when there are any: a
 *  YouTube tag can hold a space). */
export const tagsIn = (text: string): string[] => text.split(text.includes(',') ? /\s*,\s*/ : /\s+/).map((t) => t.trim()).filter(Boolean);

/** The hashtags in a caption: "#ai #aifilm". */
export const hashtagsIn = (text: string): string[] => text.match(/#[\p{L}\p{N}_]+/gu) ?? [];

/** A field still to fill: no text, and not the user's own (a field the user emptied by writing a box whole, ASKS 57,
 *  is their own and empty on purpose). */
export const unfilled = (f: Field): boolean => !f.text.trim() && !f.own;

// ---- the caption as it will be posted

/** The text being typed, before it is saved: `field` holds `text`; the fields in `clear` are empty (a box written
 *  whole into its first field, ASKS 57). */
export interface TextOverride { field: string; text: string; clear?: string[] }
export interface PostedPart { part: PartFacts; text: string; fields: string[] }
/** Each posted part of a platform: its fields in order, facts filled, joined as that platform joins them. Empty fields
 *  are left out, and an optional part (X's reply) with no text at all. A tag part of a list platform (YouTube) is the
 *  tags joined by commas. */
export function postedParts(file: ReleaseFile, pid: string, override?: TextOverride): PostedPart[] {
  const p = platformOf(file, pid);
  if (!p) return [];
  const facts = factsOf(p.kind);
  return facts.parts.map((part) => {
    const fields = p.fields.filter((f) => partOf(p.kind, f.part).id === part.id);
    const texts = fields.map((f) => fillFacts(file, override?.field === f.id ? override.text : override?.clear?.includes(f.id) ? '' : f.text).trim()).filter(Boolean);
    const text = part.tags ? (part.join === ', ' ? texts.flatMap(tagsIn).map((t) => t.replace(/^#/, '')).join(', ') : texts.join(part.join)) : texts.join(part.join);
    return { part, text, fields: fields.map((f) => f.id) };
  }).filter((x) => x.fields.length && !(x.part.optional && !x.text));
}
/** The main text the feed shows (the first part: a caption, or a title). */
export const captionOf = (file: ReleaseFile, pid: string): string => postedParts(file, pid)[0]?.text ?? '';

// ---- counts

/** `over`: past a limit the app verified, which blocks. `past`: past a number the app could not verify ("about 5"):
 *  shown in amber, never a block, because the app must not stop a post on a number it is not sure of. */
export interface PartCount { part: string; label: string; n: number; unit: 'chars' | 'tags'; limit?: Sourced; over: boolean; past?: boolean }
/** Each posted part against the platform's hard limit (characters, and for a tag list its tags or its characters). */
export function partCounts(file: ReleaseFile, pid: string, override?: TextOverride): PartCount[] {
  const out: PartCount[] = [];
  for (const x of postedParts(file, pid, override)) {
    if (x.part.tags?.max) {
      // a caption with a tag cap (Instagram) counts its hashtags, not its words
      const n = x.part.limit ? hashtagsIn(x.text).length : tagsIn(x.text).length;
      out.push({ part: x.part.id, label: x.part.label, n, unit: 'tags', limit: x.part.tags.max, over: !x.part.tags.max.unverified && n > x.part.tags.max.value, ...(x.part.tags.max.unverified && n > x.part.tags.max.value ? { past: true } : {}) });
    }
    const limit = x.part.limit ?? x.part.tags?.chars;
    out.push({ part: x.part.id, label: x.part.label, n: x.text.length, unit: 'chars', limit, over: !!limit && !limit.unverified && x.text.length > limit.value, ...(limit?.unverified && x.text.length > limit.value ? { past: true } : {}) });
  }
  return out;
}

// ---- the feed preview

/** The caption as the feed shows it: cut at the platform's "more" number (the one the page states), at a word. */
export function previewCut(kind: PlatformKind, text: string): { shown: string; more: boolean; fold?: Sourced } {
  const fold = factsOf(kind).fold;
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  if (!fold || flat.length <= fold.value) return { shown: flat, more: false, fold };
  const cut = flat.slice(0, fold.value);
  const sp = cut.lastIndexOf(' ');
  return { shown: `${(sp > fold.value * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:]+$/, '')}…`, more: true, fold };
}

// ---- states

export type StateId = 'to-pick' | 'ready' | 'waiting' | 'scheduled' | 'sending' | 'posted' | 'needs';
/** The seven states, each a glyph and its word, the same everywhere. */
export const STATE_WORD: Record<StateId, string> = {
  'to-pick': 'Text to pick', ready: 'Ready', waiting: 'Waiting for your go', scheduled: 'Scheduled', sending: 'Sending', posted: 'Posted', needs: 'Needs you',
};
export interface Tag { text: string; tone: 'quiet' | 'amber' }
export interface Status {
  state: StateId;
  word: string;
  /** "19:10" for Scheduled, "18:04" for Posted. */
  time?: string;
  /** Needs you: why, in words ("the days it took are not confirmed"). */
  reason?: string;
  /** The tags beside the state: "2 notes from Alma", "1 thing left in TikTok", "By hand, step 4 of 5", "Posted, link to add". */
  tags: Tag[];
  /** Its text cannot change: waiting for the go, scheduled, sending or posted. */
  locked: boolean;
  /** Why its text is locked and how to change it, one quiet line. */
  lockWhy?: string;
  /** Since when it has been sending (Sending, or Needs you after 20 minutes). */
  since?: string;
}

/** The app as the user calls it after a post ("1 thing left in Instagram"). */
export const appName = (p: Pick<Platform, 'name'>): string => p.name.replace(/ (Reels|Shorts)$/, '');
const openNotes = (p: Platform): number => p.fields.reduce((a, f) => a + (f.notes ?? []).filter((n) => !n.answered).length, 0);

/** A platform's state at `now`, with its tags. Precedence: Posted; then a failed send (unless asked again since);
 *  then Sending (a go, or Alma's sending record), which turns into Needs you after 20 minutes; Scheduled; Waiting for
 *  your go; then, for the text: Needs you (a used fact not confirmed, a part over the hard limit) over Text to pick
 *  over Ready. */
export function platformStatus(file: ReleaseFile, pid: string, now: Date): Status {
  const p = platformOf(file, pid);
  if (!p) return { state: 'needs', word: STATE_WORD.needs, reason: `there is no platform "${pid}"`, tags: [], locked: false };
  const s = p.send;
  const tags: Tag[] = [];
  const notes = openNotes(p);
  const noteTag = notes ? [{ text: `${notes} ${notes === 1 ? 'note' : 'notes'} from Alma`, tone: 'quiet' as const }] : [];
  const mk = (state: StateId, x: Partial<Status> = {}): Status => {
    const locked = state === 'waiting' || state === 'scheduled' || state === 'sending' || state === 'posted' || !!x.since;
    return { state, word: STATE_WORD[state], tags, locked, ...x };
  };
  if (s.posted) {
    const left = p.upload.after.filter((x) => !x.done).length;
    if (left) tags.push({ text: `${left} ${left === 1 ? 'thing' : 'things'} left in ${appName(p)}`, tone: 'amber' });
    if (!s.posted.link) tags.push({ text: 'Posted, link to add', tone: 'amber' });
    return mk('posted', { time: hm(s.posted.at), lockWhy: `This is the text as posted. To remove the post, delete it in ${appName(p)}.` });
  }
  const askedAt = s.asked ? Date.parse(s.asked.at) : -Infinity;
  const after = (at: string | undefined) => !!at && Date.parse(at) >= askedAt;
  if (s.failed && !(s.asked && askedAt > Date.parse(s.failed.at))) {
    tags.push(...noteTag);
    return mk('needs', { reason: 'it did not go out' });
  }
  // a scheduled post waits for its time (its go was given before Alma scheduled it); from then it is sending
  const sendingRec = s.sending && after(s.sending.since) ? s.sending.since : undefined;
  if (s.scheduled && !sendingRec && now.getTime() < Date.parse(s.scheduled.for)) {
    if (s.requested?.unschedule) tags.push({ text: 'Unscheduling…', tone: 'quiet' });
    tags.push(...noteTag);
    return mk('scheduled', { time: hm(s.scheduled.for), lockWhy: `Scheduled for ${hm(s.scheduled.for)}. To change the text, unschedule it first.` });
  }
  // stage 3: a go for a time still ahead, before Alma has put it in Buffer, is not sending yet: it waits for its time
  if (!s.scheduled && !sendingRec && s.go && after(s.go.at) && s.asked && s.asked.when !== 'now' && now.getTime() < Date.parse(s.asked.when)) {
    tags.push(...noteTag);
    return mk('scheduled', { time: hm(s.asked.when), lockWhy: `Scheduled for ${hm(s.asked.when)}. To change the text, unschedule it first.` });
  }
  const goFrom = s.go && s.asked && s.asked.when !== 'now' && Date.parse(s.asked.when) > Date.parse(s.go.at) ? s.asked.when : s.go?.at;
  const since = sendingRec ?? (s.scheduled ? s.scheduled.for : s.go && after(s.go.at) ? goFrom : undefined);
  if (since && (s.asked || s.scheduled)) {
    if (s.requested?.stop && !s.sending?.platformHas) tags.push({ text: 'Stopping…', tone: 'quiet' });
    if (now.getTime() - Date.parse(since) > STUCK_MS) return mk('needs', { reason: 'still not posted after 20 minutes', since, lockWhy: 'Sending. The text cannot be changed while it goes out.' });
    return mk('sending', { since, lockWhy: 'Sending. The text cannot be changed while it goes out.' });
  }
  if (s.asked) {
    tags.push(...noteTag);
    return mk('waiting', { lockWhy: 'Waiting for your go. To change the text, cancel the ask.' });
  }
  tags.push(...noteTag);
  // the text: needs you only when it cannot go out until the user acts
  const blank = blanks(file, p);
  if (blank.length) return mk('needs', { reason: notConfirmed(blank) });
  const over = partCounts(file, pid).find((c) => c.over);
  if (over) return mk('needs', { reason: `the ${over.label.toLowerCase()} is over ${appName(p)}'s ${over.limit!.value.toLocaleString('en-GB')}${over.unit === 'tags' ? ' tags' : ''}` });
  if (p.fields.some(unfilled) || emptyPart(file, pid)) {
    // its candidates use a fact still to confirm: said quietly, it is not blocking yet
    const maybe = new Set<string>();
    for (const f of p.fields) if (unfilled(f)) for (const c of f.candidates) for (const x of unconfirmedIn(file, c.text)) maybe.add(x.label);
    if (maybe.size) tags.push({ text: `uses ${[...maybe].join(' and ')}, not confirmed yet`, tone: 'quiet' });
    return mk('to-pick');
  }
  if (p.route === 'hand') {
    const done = p.upload.hand.filter((x) => x.done).length, m = p.upload.hand.length;
    if (done > 0 && m > 0) tags.unshift({ text: `By hand, step ${Math.min(done + 1, m)} of ${m}`, tone: 'quiet' });
  }
  return mk('ready');
}

export const statuses = (file: ReleaseFile, now: Date): Record<string, Status> =>
  Object.fromEntries(file.platforms.map((p) => [p.id, platformStatus(file, p.id, now)]));
/** The platforms whose text cannot change. */
export const lockedIds = (file: ReleaseFile, now: Date): string[] => file.platforms.filter((p) => platformStatus(file, p.id, now).locked).map((p) => p.id);

/** How a locked platform is held, in a sentence ("Instagram is scheduled for 19:10 with this text"). */
export function heldWords(p: Platform, st: Status): string {
  if (st.state === 'scheduled') return `${appName(p)} is scheduled for ${st.time} with this text`;
  if (st.state === 'waiting') return `${appName(p)} is waiting for your go with this text`;
  if (st.state === 'posted') return `${appName(p)} was posted with this text`;
  return `${appName(p)} is going out with this text`;
}

// ---- a shared text

export interface SharedTouch {
  /** The other platforms sharing this field, with their state. */
  others: { id: string; name: string; status: Status }[];
  /** The ones locked: an edit here would change their text. */
  locked: { id: string; name: string; status: Status }[];
  /** Said before the edit is kept when one is locked: "Instagram is scheduled for 19:10 with this text. Your change
   *  will be TikTok's only." */
  warning?: string;
}
/** What an edit of a field would touch: every platform sharing it, and which of them are locked. */
export function sharedTouch(file: ReleaseFile, pid: string, fid: string, now: Date): SharedTouch {
  const p = platformOf(file, pid);
  const f = p?.fields.find((x) => x.id === fid);
  if (!p || !f) return { others: [], locked: [] };
  const others = (f.sharedWith ?? []).map((id) => platformOf(file, id)).filter((x): x is Platform => !!x)
    .map((o) => ({ id: o.id, name: o.name, status: platformStatus(file, o.id, now) }));
  const locked = others.filter((o) => o.status.locked);
  const warning = locked.length
    ? `${locked.map((o) => cap(heldWords(platformOf(file, o.id)!, o.status))).join('. ')}. Your change will be ${appName(p)}'s only.`
    : undefined;
  return { others, locked, warning };
}

// ---- the go

/** Whether "Post now" and "Schedule…" may be pressed, and the reason on the button line when not. */
/** `out`: the file that goes out (outfile.ts outFile); while its smaller file is being made the go waits for it. */
export function goCheck(file: ReleaseFile, pid: string, now: Date, out?: { making?: { state: string; percent?: number } }): { ok: true } | { ok: false; why: string } {
  const p = platformOf(file, pid);
  if (!p) return { ok: false, why: `There is no platform "${pid}".` };
  if (!file.final) return { ok: false, why: 'No final yet. Name the final first.' };
  const st = platformStatus(file, pid, now);
  if (st.state === 'posted') return { ok: false, why: `${appName(p)} is already posted.` };
  if (st.state === 'waiting') return { ok: false, why: 'Already asked. Alma shows you the exact text and file first.' };
  if (st.locked) return { ok: false, why: `${appName(p)} is ${st.word.toLowerCase()}.` };
  if (p.route === 'hand') return { ok: false, why: `${appName(p)} goes by hand: follow its steps.` };
  if (out?.making) return { ok: false, why: `The smaller file is being made${out.making.state === 'running' ? ` (${Math.round(out.making.percent ?? 0)}%)` : ''}. Post now and Schedule wait for it.` };
  const blank = blanks(file, p);
  if (blank.length) return { ok: false, why: `${cap(notConfirmed(blank))}. Fill ${blank.length > 1 ? 'them' : 'it'} to post.` };
  const over = partCounts(file, pid).find((c) => c.over);
  if (over) return { ok: false, why: `The ${over.label.toLowerCase()} is over ${appName(p)}'s ${over.limit!.value.toLocaleString('en-GB')}. Shorten it to post.` };
  const empty = p.fields.find(unfilled);
  if (empty) return { ok: false, why: `Pick the ${empty.label.toLowerCase()} first.` };
  const none = emptyPart(file, pid);
  if (none) return { ok: false, why: `Write the ${none.label.toLowerCase()} first.` };
  return { ok: true };
}

/** A posted part with fields and no text at all (every field of it emptied by the user): nothing to post there. A file
 *  nobody edited never has one that is not also a field to fill. */
function emptyPart(file: ReleaseFile, pid: string): PartFacts | undefined {
  return postedParts(file, pid).find((x) => !x.text.trim())?.part;
}

// ---- the Release list

export interface Wave { key: string; label: string; at: Date; ids: string[]; posted: number; next: boolean }
/** The platforms grouped by wave, in posting order: "Today, about 18:00 · 2 posted", the next one marked. */
export function waves(file: ReleaseFile, now: Date): Wave[] {
  const out: Wave[] = [];
  const nx = nextUp(file, now)?.platform.id;
  for (const p of file.platforms) {
    const key = `${p.wave.day} ${p.wave.about}`;
    let w = out[out.length - 1];
    if (!w || w.key !== key) {
      const at = waveAt(file, p);
      w = { key, label: `${cap(dayWords(at, now))}, about ${p.wave.about}`, at, ids: [], posted: 0, next: false };
      out.push(w);
    }
    w.ids.push(p.id);
    if (p.send.posted) w.posted++;
    if (p.id === nx) w.next = true;
  }
  return out;
}

/** The posted count in the header: "2 of 6 posted". */
export function postedCount(file: ReleaseFile): { n: number; of: number; words: string } {
  const n = file.platforms.filter((p) => p.send.posted).length;
  return { n, of: file.platforms.length, words: `${n} of ${file.platforms.length} posted` };
}

/** What is next, for the Next bar: the first platform in order not posted and not going out now. The clock's own words
 *  ("It is 18:52.") are drawn by the clock component, not here. */
export function nextUp(file: ReleaseFile, now: Date): { platform: Platform; status: Status; words: string; at: Date } | undefined {
  for (const p of file.platforms) {
    const st = platformStatus(file, p.id, now);
    if (st.state === 'posted' || st.state === 'sending') continue;
    if (st.state === 'scheduled') return { platform: p, status: st, words: `Next: ${p.name}, scheduled for ${st.time}`, at: new Date(p.send.scheduled?.for ?? p.send.asked!.when) };
    const at = waveAt(file, p);
    const when = at.getTime() >= now.getTime() - 60 * 60_000 ? `planned for about ${p.wave.about}${dayWords(at, now) === 'today' ? '' : ` ${dayWords(at, now)}`}` : `planned for about ${p.wave.about}, now past`;
    return { platform: p, status: st, words: `Next: ${p.name}, ${when}.`, at };
  }
  return undefined;
}

/** Every derived thing at once (GET …/release `derived`, for Alma and the tests). */
export function deriveAll(file: ReleaseFile, now: Date) {
  return {
    at: now.toISOString(),
    states: statuses(file, now),
    locked: lockedIds(file, now),
    posted: postedCount(file),
    next: (() => { const n = nextUp(file, now); return n ? { platform: n.platform.id, words: n.words } : undefined; })(),
    go: Object.fromEntries(file.platforms.map((p) => [p.id, goCheck(file, p.id, now)])),
    captions: Object.fromEntries(file.platforms.map((p) => [p.id, postedParts(file, p.id).map((x) => ({ part: x.part.id, text: x.text }))])),
  };
}
export type Derived = ReturnType<typeof deriveAll>;

// ---- the text column (stage 2)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** "the credit line", "the first line and the tags", "the first line, the credit line and the tags". */
export function fieldList(labels: string[]): string {
  const xs = labels.map((l) => `the ${lowerFirst(l)}`);
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '';
}
/** "Instagram", "Instagram and X", "Instagram, X and LinkedIn". */
export const nameList = (ns: string[]): string => (ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0] ?? '');

// ---- the cover frame (ASKS 55: one pick for every platform that has a thumbnail)

/** "is scheduled", "is waiting for your go", "was posted", "is going out": a locked platform's state, for the cover
 *  frame's words. */
export function lockedVerb(st: Status): string {
  if (st.state === 'scheduled') return 'is scheduled';
  if (st.state === 'waiting') return 'is waiting for your go';
  if (st.state === 'posted') return 'was posted';
  return 'is going out';
}

/** The other platforms with a thumbnail, as a pick on `pid` treats them: `follow` take it, `held` are locked and keep
 *  theirs, `own` keep their own. All empty when `pid` is itself `own` (or `asOwn`) or has no thumbnail. */
export function coverGroup(file: ReleaseFile, pid: string, now: Date, asOwn?: boolean): { follow: Platform[]; held: { p: Platform; st: Status }[]; own: Platform[] } {
  const out = { follow: [] as Platform[], held: [] as { p: Platform; st: Status }[], own: [] as Platform[] };
  const p = platformOf(file, pid);
  if (!p?.thumbnail || (asOwn ?? !!p.thumbnail.own)) return out;
  for (const q of file.platforms) {
    if (q.id === pid || !q.thumbnail) continue;
    if (q.thumbnail.own) { out.own.push(q); continue; }
    const st = platformStatus(file, q.id, now);
    if (st.locked) out.held.push({ p: q, st }); else out.follow.push(q);
  }
  return out;
}

export interface CoverLine { state: 'shared' | 'own' | 'held'; text: string; button: string }
/** The quiet line under the frames: whether a pick here is the pick on the others too. None when this is the only
 *  platform with a thumbnail, or when it is locked. `asOwn` words it as it would be with the mark set (true) or not
 *  (false), for the page to hold both and keep its height. */
export function coverLine(file: ReleaseFile, pid: string, now: Date, asOwn?: boolean): CoverLine | undefined {
  const p = platformOf(file, pid);
  if (!p?.thumbnail || platformStatus(file, pid, now).locked) return undefined;
  if (!file.platforms.some((q) => q.id !== pid && q.thumbnail)) return undefined;
  if (asOwn ?? p.thumbnail.own) return { state: 'own', text: `Only ${p.name} has this cover frame.`, button: 'Same as the others again' };
  const g = coverGroup(file, pid, now, false);
  const parts: string[] = [];
  if (g.follow.length) parts.push(`The same cover frame on ${nameList(g.follow.map((q) => q.name))}. A pick here picks it there too.`);
  for (const h of g.held) parts.push(`${h.p.name} ${lockedVerb(h.st)} and keeps the frame it has.`);
  if (g.own.length) parts.push(`${nameList(g.own.map((q) => q.name))} ${g.own.length > 1 ? 'keep their' : 'keeps its'} own.`);
  return { state: g.follow.length ? 'shared' : 'held', text: parts.join(' '), button: 'Only here' };
}

/** The platforms a field that is not shared (any more) can be linked with again: another platform's field of the same
 *  id with the same candidates (Alma wrote them as one text). */
export function linkPartners(file: ReleaseFile, pid: string, fid: string): Platform[] {
  const f = fieldOf(file, pid, fid);
  if (!f || !f.candidates.length) return [];
  const key = (x: Field) => x.candidates.map((c) => c.text).join('\u0000');
  return file.platforms.filter((q) => q.id !== pid && !(f.sharedWith ?? []).includes(q.id))
    .filter((q) => { const g = q.fields.find((x) => x.id === fid); return !!g && key(g) === key(f); });
}

/** The posted parts' counts for the top of the text column: "one caption, 166 of 2,200"; several parts each with
 *  its own ("title 54 of 100"); a tag cap ("4 of about 5 tags"). `over` is red. */
export function partWords(file: ReleaseFile, pid: string, override?: TextOverride): { text: string; over: boolean; past?: boolean }[] {
  const all = partCounts(file, pid, override);
  const chars = all.filter((c) => c.unit === 'chars');
  return [...chars, ...all.filter((c) => c.unit === 'tags')].map((c) => {
    if (c.unit === 'tags') return { text: `${c.n} of ${numWords(c.limit)} tags`, over: c.over, ...(c.past ? { past: true } : {}) };
    const n = c.n.toLocaleString('en-GB');
    const lim = c.limit ? ` of ${numWords(c.limit)}` : '';
    return { text: chars.length === 1 ? `one ${lowerFirst(c.label)}, ${n}${lim}` : `${lowerFirst(c.label)} ${n}${lim}`, over: c.over, ...(c.past ? { past: true } : {}) };
  });
}

/** A text cut into plain pieces and the facts it uses, for drawing the facts as tokens. */
export type Piece = { text: string } | { fact: Fact; shown: string };
export function factPieces(file: ReleaseFile, text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{([a-z][a-z0-9-]*)\}/g)) {
    const f = factById(file, m[1]);
    if (!f) continue;
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ fact: f, shown: f.confirmedAt && f.value ? f.value : lowerFirst(f.label.replace(/^the /, '')) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
/** The text as the box shows it while typing: each fact as "[the days it took]". */
export const editableText = (file: ReleaseFile, text: string): string =>
  text.replace(/\{([a-z][a-z0-9-]*)\}/g, (all, id: string) => { const f = factById(file, id); return f ? `[${f.label}]` : all; });
/** The typed text back: "[the days it took]" is the fact again. */
export function fromEditable(file: ReleaseFile, text: string): string {
  let t = text;
  for (const f of file.facts) t = t.split(`[${f.label}]`).join(`{${f.id}}`);
  return t;
}

/** The note answered last (the one "Undo" takes back). */
export function lastAnswered(file: ReleaseFile): { platform: string; field: string; note: string } | undefined {
  let last: { platform: string; field: string; note: string; at: string } | undefined;
  for (const p of file.platforms) for (const f of p.fields) for (const n of f.notes ?? []) {
    if (n.answered && (!last || n.answered.at > last.at)) last = { platform: p.id, field: f.id, note: n.id, at: n.answered.at };
  }
  return last && { platform: last.platform, field: last.field, note: last.note };
}

const shortText = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);
/** The line left where an answered note was: what its button did, in words. */
export function answerWords(file: ReleaseFile, a: { label: string; effect: Effect[] }): string {
  const label = (pid: string, fid: string) => lowerFirst(fieldOf(file, pid, fid)?.label ?? fid);
  const name = (pid: string) => { const q = platformOf(file, pid); return q ? appName(q) : pid; };
  const said = a.effect.map((e) => {
    if (e.kind === 'set') return `The ${label(e.platforms[0], e.field)} is now “${shortText(fillFacts(file, e.text))}” on ${nameList(e.platforms.map(name))}`;
    if (e.kind === 'unlink') return `${name(e.platform)} keeps its own ${label(e.platform, e.field)}`;
    return `${nameList(e.platforms.map(name))} share the ${label(e.platforms[0], e.field)} again`;
  });
  return `${a.label}. ${said.length ? `${said.join('. ')}.` : 'Nothing changed.'}`;
}

// ---- the text column: one box per thing the platform has (ASKS 57, 14 Nov 2026)
//
// The platform's own parts in its order ("Title", "Description"; "Caption"; "First comment"), each one box holding
// the whole text of that part as it will be posted, and a "Tags" box for the tags, even where the platform puts them
// inside another text. A box is drawn from the fields, never stored: the file keeps its fields, so Alma can still
// write a part as several fields or as one.

/** A part that is only a tag list (YouTube's tags), not a text with a tag cap (Instagram's caption). */
export const isTagsPart = (part: PartFacts): boolean => !!part.tags && !part.limit;
const onlyHashtags = (t: string): boolean => { const xs = t.trim().split(/\s+/).filter(Boolean); return xs.length > 0 && xs.every((x) => x.startsWith('#')); };

/** Whether a field is tags, in this order of trust: its part is a tag list; it is marked `tags: true`; else, for files
 *  written before 14 Nov 2026, in a part with other fields, its id is "tags" or "hashtags", or its text (its
 *  candidates while it has none) is only hashtags. The user's own text is never judged by its words. */
export function isTagField(p: Pick<Platform, 'kind' | 'fields'>, f: Field): boolean {
  const part = partOf(p.kind, f.part);
  if (isTagsPart(part)) return true;
  if (f.tags) return true;
  if (p.fields.filter((x) => partOf(p.kind, x.part).id === part.id).length < 2) return false;
  if (f.id === 'tags' || f.id === 'hashtags') return true;
  if (f.own) return false;
  return f.text.trim() ? onlyHashtags(f.text) : f.candidates.length > 0 && f.candidates.every((c) => onlyHashtags(c.text));
}

export interface Box {
  /** "caption", "title"; "tags" for a tag list part; "caption:tags" for the tags inside the caption. */
  key: string;
  kind: 'text' | 'tags';
  /** The posted part its fields go into. */
  part: PartFacts;
  /** The platform's own word: "Caption", "Title", "First comment", "Tags". */
  label: string;
  /** Its fields, in file order. */
  fields: Field[];
  /** Tags inside another part's text (`part`), not a part of their own. */
  inside?: boolean;
}

/** A platform's boxes, in the platform's order: each part's text, then the tags that go into it. A part whose every
 *  field is tags shows only its Tags box. */
export function boxesOf(p: Pick<Platform, 'kind' | 'fields'>): Box[] {
  const parts = factsOf(p.kind).parts;
  const ownTags = parts.some((x) => isTagsPart(x) && p.fields.some((f) => partOf(p.kind, f.part).id === x.id));
  const out: Box[] = [];
  for (const part of parts) {
    const fields = p.fields.filter((f) => partOf(p.kind, f.part).id === part.id);
    if (!fields.length) continue;
    if (isTagsPart(part)) { out.push({ key: part.id, kind: 'tags', part, label: part.label, fields }); continue; }
    const tags = fields.filter((f) => isTagField(p, f));
    const text = fields.filter((f) => !tags.includes(f));
    if (text.length) out.push({ key: part.id, kind: 'text', part, label: part.label, fields: text });
    if (tags.length) out.push({ key: `${part.id}:tags`, kind: 'tags', part, label: ownTags ? 'Hashtags' : 'Tags', fields: tags, inside: true });
  }
  return out;
}
export const boxOf = (p: Pick<Platform, 'kind' | 'fields'>, key: string): Box | undefined => boxesOf(p).find((b) => b.key === key);

const sepOf = (b: Box): string => (b.kind === 'text' ? b.part.join : isTagsPart(b.part) ? ', ' : ' ');
/** The words in a box, as the file holds them (facts as {id}): the one field with text as it is, else the fields
 *  with text, trimmed and joined as the part joins them. */
export function boxText(b: Box, texts?: Record<string, string>): string {
  const t = (f: Field) => texts?.[f.id] ?? f.text;
  const full = b.fields.filter((f) => t(f).trim());
  if (full.length === 1) return t(full[0]);
  return full.map((f) => t(f).trim()).join(sepOf(b));
}
/** A box being typed as the posted text sees it: the first field holds it all, the others empty. */
export const boxOverride = (b: Box, text: string): TextOverride =>
  b.fields.length === 1 ? { field: b.fields[0].id, text } : { field: b.fields[0].id, text, clear: b.fields.slice(1).map((f) => f.id) };
/** The fields of a box as a write of `text` leaves them (setPartText): the first holds it all, the others empty. */
export const boxWrite = (b: Box, text: string): Record<string, string> => Object.fromEntries(b.fields.map((f, i) => [f.id, i ? '' : text]));

/** The one aim a box shows: its field's, or the one every field of it has. A box of several fields with different
 *  aims, or with an aim on some only, shows none. */
export function boxAim(b: Box): Aim | undefined {
  const a = b.fields[0].aim;
  if (!a) return undefined;
  return b.fields.every((f) => f.aim && f.aim.words === a.words && f.aim.min === a.min && f.aim.max === a.max) ? a : undefined;
}

export interface BoxCount {
  /** "475 of 5,000 characters", "475 of 5,000 characters, 537 with the tags.", "4 tags, 31 characters · your usual
   *  tags. They go at the end of the caption." */
  words: string;
  /** `over`: the posted part is past a limit the app verified (red, it blocks); `past`: past one it could not verify,
   *  or outside Alma's aim (amber, never a block). */
  state: 'over' | 'past' | 'outside' | 'ok';
  /** Where the tags go, for a Tags box inside another text. */
  where?: string;
  /** One fact said after the count (the reply's: how it goes out, ASKS 58). */
  fact?: string;
}
const fmt = (n: number) => n.toLocaleString('en-GB');

/** Where the tags of a Tags box go in the part's text, from the order of its fields: "They go at the end of the
 *  caption." Nothing for a tag list of its own. */
export function tagsWhere(p: Pick<Platform, 'kind' | 'fields'>, b: Box): string | undefined {
  if (b.kind !== 'tags' || !b.inside) return undefined;
  const all = p.fields.filter((f) => partOf(p.kind, f.part).id === b.part.id);
  const idx = (f: Field) => all.indexOf(f);
  const tagIdx = b.fields.map(idx), textIdx = all.filter((f) => !b.fields.includes(f)).map(idx);
  const where = !textIdx.length || Math.min(...tagIdx) > Math.max(...textIdx) ? 'at the end' : Math.max(...tagIdx) < Math.min(...textIdx) ? 'at the start' : 'in the middle';
  return `They go ${where} of the ${lowerFirst(b.part.label)}.`;
}

/** A box's quiet line: the count against the platform's own limit (and the whole posted text when the tags go into
 *  it), Alma's one aim, and for a Tags box where they go. `text`: the box while it is typed. */
export function boxCount(file: ReleaseFile, pid: string, key: string, text?: string): BoxCount | undefined {
  const p = platformOf(file, pid);
  const b = p && boxOf(p, key);
  if (!p || !b) return undefined;
  const typed = text === undefined ? undefined : boxWrite(b, text);
  const words = (fs: Field[]) => fs.map((f) => fillFacts(file, typed?.[f.id] ?? f.text).trim()).filter(Boolean).join(sepOf(b));
  const counts = partCounts(file, pid, text === undefined ? undefined : boxOverride(b, text)).filter((c) => c.part === b.part.id);
  const chars = counts.find((c) => c.unit === 'chars');
  const aim = boxAim(b);
  if (b.kind === 'text') {
    const n = words(b.fields).length;
    const m = chars?.n ?? n;
    const lim = chars?.limit ? ` of ${numWords(chars.limit)}` : '';
    const tagsToo = m !== n;
    const out = aim && ((aim.min !== undefined && n < aim.min) || (aim.max !== undefined && n > aim.max));
    const head = `${fmt(n)}${lim} characters${tagsToo ? `, ${fmt(m)} with the tags` : ''}`;
    const fact = replyFact(p, b);
    return { words: `${[head, aim?.words].filter(Boolean).join(' · ')}${tagsToo ? '.' : ''}`, state: chars?.over ? 'over' : chars?.past ? 'past' : out ? 'outside' : 'ok', ...(fact ? { fact } : {}) };
  }
  // tags: a tag list of its own counts its tags and its characters against the list's; tags inside a text count
  // their tags (against the part's tag cap when it has one) and their characters
  const where = tagsWhere(p, b);
  if (!b.inside) {
    const posted = postedParts(file, pid, text === undefined ? undefined : boxOverride(b, text)).find((x) => x.part.id === b.part.id)?.text ?? '';
    const n = tagsIn(posted).length;
    const head = `${n} ${n === 1 ? 'tag' : 'tags'}, ${fmt(posted.length)}${chars?.limit ? ` of ${numWords(chars.limit)}` : ''} characters`;
    const out = aim && ((aim.min !== undefined && n < aim.min) || (aim.max !== undefined && n > aim.max));
    return { words: [head, aim?.words].filter(Boolean).join(' · '), state: chars?.over ? 'over' : chars?.past ? 'past' : out ? 'outside' : 'ok' };
  }
  const t = words(b.fields);
  const n = tagsIn(t).length;
  const cap = counts.find((c) => c.unit === 'tags');
  const head = `${cap?.limit ? `${n} of ${numWords(cap.limit)} tags` : `${n} ${n === 1 ? 'tag' : 'tags'}`}, ${fmt(t.length)} characters`;
  const out = aim && ((aim.min !== undefined && n < aim.min) || (aim.max !== undefined && n > aim.max));
  return { words: `${[head, aim?.words].filter(Boolean).join(' · ')}${where ? `. ${where}` : ''}`, state: cap?.over || chars?.over ? 'over' : cap?.past ? 'past' : out ? 'outside' : 'ok', where };
}

/** The reply (X, Threads; ASKS 58): how it goes out. Through Buffer, with the post as one thread; by hand, the user
 *  posts it under their post. */
export function replyFact(p: Pick<Platform, 'route'>, b: Box): string | undefined {
  if (b.part.id !== 'reply' || b.kind !== 'text') return undefined;
  return p.route === 'hand' ? 'Post it as a reply to your post.' : 'It goes out with the post, as a thread.';
}
/** "post and reply": what a platform with a reply posts, for the Release overview's row; nothing without one. */
export function threadWords(file: ReleaseFile, pid: string): string | undefined {
  const parts = postedParts(file, pid);
  return parts.some((x) => x.part.id === 'reply') ? `${parts.filter((x) => x.part.id !== 'reply').map((x) => lowerFirst(x.part.label)).join(' and ')} and reply` : undefined;
}

export interface BoxShare {
  /** `shared`: every field of the box is one text with the same platforms (an edit changes them all); `some`: only
   *  some are (an edit is this platform's only); `only`: none any more, and it can be linked again; `none`. */
  state: 'shared' | 'some' | 'only' | 'none';
  /** The platforms it is shared with (shared), or some of it is (some), or it can be linked with again (only). */
  with: Platform[];
  /** The ones of `with` that are locked (shared). */
  locked: { p: Platform; st: Status }[];
  /** The line above the box. */
  line?: string;
  /** Said before an edit is kept, when the edit will be this platform's only: a locked partner, or a part shared only
   *  in part. */
  ask?: string;
}
const plural = (b: Box) => /s$/i.test(b.label);

/** Whether a box is shared, with whom, and what the page says above it. Same words as the field lines were, by box. */
export function boxShare(file: ReleaseFile, pid: string, key: string, now: Date): BoxShare {
  const p = platformOf(file, pid);
  const b = p && boxOf(p, key);
  if (!p || !b) return { state: 'none', with: [], locked: [] };
  const lbl = lowerFirst(b.label);
  const ids = b.fields.map((f) => f.id).join(',');
  const sameBox = (q: Platform) => boxOf(q, key)?.fields.map((f) => f.id).join(',') === ids;
  const sets = b.fields.map((f) => (f.sharedWith ?? []).filter((id) => platformOf(file, id)).sort().join(','));
  const name = appName(p);
  if (sets.some(Boolean)) {
    const all = [...new Set(b.fields.flatMap((f) => (f.sharedWith ?? []).filter((id) => platformOf(file, id))))].map((id) => platformOf(file, id)!);
    const whole = sets.every((x) => x === sets[0]) && all.every(sameBox);
    if (!whole) {
      const who = nameList(all.map((q) => q.name));
      return { state: 'some', with: all, locked: [], line: `Part of the ${lbl} ${plural(b) ? 'are' : 'is'} shared with ${who}, so a change here asks first.`, ask: `Part of the ${lbl} ${plural(b) ? 'are' : 'is'} shared with ${who}. Your change will be ${name}'s only.` };
    }
    const locked = all.map((q) => ({ p: q, st: platformStatus(file, q.id, now) })).filter((x) => x.st.locked);
    const head = `The ${lbl} ${plural(b) ? 'are' : 'is'} shared with ${nameList(all.map((q) => q.name))}.`;
    const held = locked.map((x) => cap(heldWords(x.p, x.st))).join('. ');
    return locked.length
      ? { state: 'shared', with: all, locked, line: `${head} ${held}, so a change here asks first.`, ask: `${held}. Your change will be ${name}'s only.` }
      : { state: 'shared', with: all, locked, line: `${head} A change here changes ${all.length > 1 ? 'all of them' : 'both'}.` };
  }
  const partners = file.platforms.filter((q) => q.id !== pid && sameBox(q) && b.fields.every((f) => linkPartners(file, pid, f.id).some((x) => x.id === q.id)));
  if (partners.length) return { state: 'only', with: partners, locked: [], line: `Only ${p.name} has ${plural(b) ? 'these' : 'this'} ${lbl}.` };
  return { state: 'none', with: [], locked: [] };
}

export interface Change { field: string; label: string; was: string; now: string }
/** The boxes whose text is not what Alma last read (`readByAlma`), each named by the box ("Caption") with its whole
 *  text before and now; `field` lists the fields that changed. A field she has no reading of is not counted. */
export function changedSinceRead(p: Platform): Change[] {
  const out: Change[] = [];
  for (const b of boxesOf(p)) {
    const changed = b.fields.filter((f) => f.readByAlma && f.readByAlma.text !== f.text);
    if (!changed.length) continue;
    const was = boxText(b, Object.fromEntries(b.fields.map((f) => [f.id, f.readByAlma?.text ?? f.text])));
    out.push({ field: changed.map((f) => f.id).join(', '), label: b.label, was, now: boxText(b) });
  }
  return out;
}
