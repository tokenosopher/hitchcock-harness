// What the UI is told about every film's thread at once (GET /api/notify): Alma finished a turn, a sub-agent
// finished, something new waits for the user. The browser counts them unread per film while the user is not
// looking at that film. One hub per server process; it attaches to each film's Alma as it appears.
// Also which films' Alma is at work right now (the sidebar's glowing orb, the user): worked out from
// her own state on each of her events, and pushed only when the set changes.
// And how many items each film's "Waiting for you" lists (the sidebar's white dot): counted by the page's own rule (derive.ts
// waitingKeys, with what the user sent and the state does not show answered yet left out, lib/sent.ts) for every film,
// open or not: once at the first stream, after each turn or sub-agent ends, when a sub-agent starts, right after the
// user answers anything (userActed), and whenever a film's state is built afresh for any other reason (a page, the
// folder watcher); pushed only when a film's count changes.
// A new item in a film's "Waiting for you" moves the film to the top of the sidebar (src/server/films/recent.ts);
// Alma's reply alone does not.
import type { FilmState, HarnessNotice, NoticeKind, TaskCard, ThreadEvent } from '../types';
import { latestTasks, waitingKeys, waitingWords } from '@/components/lib/derive';
import { sentItems, stillSent, withSent, type Sent } from '@/components/lib/sent';
import { isMock, mockFilms, mockState, mockThread, mockWatchAll } from '@/fixtures/mock';
import { isWaiting, readFeed } from '../films/read/feed';
import { findFilm, getRegistry } from '../films/registry';
import { noteAttention } from '../films/recent';
import { getFilmState, invalidateFilmState, onFilmStateBuilt, type FilmStateX } from '../films/state';
import { Warnings } from '../films/util';
import { allAlmas, type AlmaSession } from './process';
import { oneLine } from './summarize';

type Listener = (n: HarnessNotice) => void;
/** Told the films whose Alma is at work, sorted, each time that set changes. */
export type RunningListener = (films: string[]) => void;
/** Told how many items wait for the user in each film that has any ({slug: n}, by slug), each time a count changes. */
export type WaitingListener = (counts: Record<string, number>) => void;

const KEEP = 200;              // notices kept for ?after= replays (a page reload, a phone waking up)
const ATTACH_EVERY_MS = 2000;  // how often the hub looks for an Alma it has not attached to yet
const PICK_CHECK_MS = 2500;    // after a sub-agent or a turn ends, let its files land before counting again
const SOON_MS = 250;           // after the user answered (the route has written it) or a sub-agent started

/** The threads that are films ("library" and the smoke test have no "Waiting for you"). */
const countable = (film: string): boolean => film !== 'library' && film !== 'smoke-test' && film !== 'settings';

/** "Maren" for Maren and the Sea; a title that starts with an article stays whole ("The Ferry"). */
function shortTitle(title: string): string {
  const words = title.trim().split(/\s+/);
  return /^(the|a|an)$/i.test(words[0] ?? '') ? title.trim() : words[0] ?? title;
}

function firstLine(text: string | undefined, max = 110): string {
  const line = (text ?? '').split('\n').map((l) => l.replace(/^(?:[#>*-]+\s+|\d+[.)]\s+)/, '').trim()).find(Boolean) ?? '';
  return line ? oneLine(line.replace(/[*_`]/g, ''), max) : '';
}

class NotifyHub {
  private listeners = new Set<Listener>();
  private notices: HarnessNotice[] = [];
  private firstSeq = Date.now();
  private seq = this.firstSeq;
  private attached = new Map<AlmaSession, () => void>();
  private lastText = new Map<string, string>();        // film → Alma's last final text this turn
  private cardState = new Map<string, TaskCard['state']>();
  private waiting = new Map<string, string[]>();       // film → the keys of its "Waiting for you" at the last count
  private sent = new Map<string, Sent[]>();            // film → what the user sent that its state does not show answered yet
  private countTimers = new Map<string, ReturnType<typeof setTimeout>>(); // "<film> soon|later" → its count to come
  private ticket = 0;                                  // counts in the order they began: an older one never overwrites
  private countedAt = new Map<string, number>();       // film → the ticket of the count it shows
  private waitingListeners = new Set<WaitingListener>();
  private toldWaiting = '{}';
  private countedAll: Promise<void> | null = null;
  private offBuilt: (() => void) | null = null;
  private offMock: (() => void) | null = null;
  private titles = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bornAt = Date.now();
  private running = new Set<string>();                 // films whose Alma is at work
  private runningListeners = new Set<RunningListener>();
  private checking = new Set<string>();                // films whose state is looked at once the current event is done

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.start();
    return () => { this.listeners.delete(fn); };
  }

  /** The films whose Alma is at work now: a turn in flight or queued, or a sub-agent running. */
  runningNow(): string[] { return [...this.running].sort(); }
  subscribeRunning(fn: RunningListener): () => void {
    this.runningListeners.add(fn);
    this.start();
    return () => { this.runningListeners.delete(fn); };
  }

  /** How many items wait for the user in each film that has any, by slug. */
  waitingNow(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [film, keys] of [...this.waiting].sort((a, b) => a[0].localeCompare(b[0]))) if (keys.length) out[film] = keys.length;
    return out;
  }
  subscribeWaiting(fn: WaitingListener): () => void {
    this.waitingListeners.add(fn);
    this.start();
    return () => { this.waitingListeners.delete(fn); };
  }

  /** The user answered something in the film (a pick, an answer, Done picking, a message; the routes call this once it
   *  is written): what they sent stays out of the count until the state shows it answered, as on their own page
   *  (lib/sent.ts), and the film is counted again at once, so its white dot goes within a moment. */
  userActed(film: string, sent: Sent[] = []): void {
    if (!countable(film)) return;
    if (sent.length) {
      const keys = new Set(sent.map((x) => x.key));
      this.sent.set(film, [...(this.sent.get(film) ?? []).filter((x) => !keys.has(x.key)), ...sent]);
      // what was sent leaves the count now; the count below confirms it from the state
      const cur = this.waiting.get(film);
      if (cur?.some((k) => keys.has(k))) {
        this.waiting.set(film, cur.filter((k) => !keys.has(k)));
        this.countedAt.set(film, ++this.ticket);
        this.tellWaiting();
      }
    }
    this.start();
    this.schedule(film, 'soon');
  }

  /** userActed for answers to cards and picks (POST …/done, …/answer, …/pick), sent as their page sends them
   *  (lib/sent.ts sentItems; a card of sounds is shown answered by the state at once, so it is not kept aside here). */
  userAnswered(film: string, answers: { card: string }[], picks: { kind: string; target: string; card?: string }[]): void {
    const sent = sentItems([...answers.map((a) => ({ label: a.card, answer: { card: a.card } })), ...picks.map((p) => ({ label: p.target, pick: p }))], () => undefined);
    this.userActed(film, sent);
  }

  /** A sample film's notice, played by the test hook (POST /api/notify/mock; MOCK=boards only). */
  mockNotice(film: string, kind: NoticeKind, text: string): Promise<void> {
    return this.emit(film, kind, `${kind}:mock:${film}:${Date.now()}`, text);
  }

  currentSeq(): number { return this.seq; }
  /** Notices after `seq`, or undefined when `seq` is not from this server's lifetime. */
  since(seq: number): HarnessNotice[] | undefined {
    if (!(seq >= this.firstSeq && seq <= this.seq)) return undefined;
    return this.notices.filter((n) => n.seq > seq);
  }

  /** Attaches to every Alma there is now (one just made by a send included), and to each new one every 2 s; counts
   *  every film's "Waiting for you" once, and from then on each film state built afresh. */
  start(): void {
    this.attachAll();
    this.offBuilt ??= onFilmStateBuilt((film, state) => this.fromBuilt(film, state));
    if (isMock()) this.offMock ??= mockWatchAll((film) => this.schedule(film, 'soon'));
    void this.countAll();
    if (this.timer) return;
    this.timer = setInterval(() => this.attachAll(), ATTACH_EVERY_MS);
    this.timer.unref?.();
  }

  /** Takes over an older hub's subscribers and notices (dev hot reload), so open streams keep their ids. */
  adopt(old: unknown): void {
    const o = old as Partial<{ listeners: Set<Listener>; runningListeners: Set<RunningListener>; waitingListeners: Set<WaitingListener>; notices: HarnessNotice[]; firstSeq: number; seq: number; waiting: Map<string, string[]>; sent: Map<string, Sent[]>; toldWaiting: string }>;
    if (o.listeners) for (const fn of o.listeners) this.listeners.add(fn);
    if (o.runningListeners) for (const fn of o.runningListeners) this.runningListeners.add(fn);
    if (o.waitingListeners) for (const fn of o.waitingListeners) this.waitingListeners.add(fn);
    if (o.notices) this.notices = [...o.notices];
    if (typeof o.firstSeq === 'number' && typeof o.seq === 'number') { this.firstSeq = o.firstSeq; this.seq = o.seq; }
    // an older hub's counts are the baseline, so nothing reads as new after a reload
    if (o.waiting instanceof Map) for (const [f, keys] of o.waiting) if (Array.isArray(keys)) this.waiting.set(f, keys);
    if (o.sent instanceof Map) this.sent = new Map(o.sent);
    if (typeof o.toldWaiting === 'string') this.toldWaiting = o.toldWaiting;
    if (this.listeners.size || this.runningListeners.size || this.waitingListeners.size) this.start();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.attached.values()) off();
    this.attached.clear();
    for (const t of this.countTimers.values()) clearTimeout(t);
    this.offBuilt?.();
    this.offMock?.();
  }

  private attachAll(): void {
    for (const alma of allAlmas()) {
      if (this.attached.has(alma) || alma.film === 'smoke-test') continue;
      const film = alma.film;
      // the hub looks for new Almas every 2 s: what one did in that gap is still news; older events are not
      const recent = Date.now() - ATTACH_EVERY_MS * 3;
      for (const ev of alma.liveEvents()) {
        if (Date.parse(ev.at) >= Math.max(recent, this.bornAt)) this.onEvent(film, ev);
        else if (ev.kind === 'task') this.cardState.set(ev.task.id, ev.task.state);
      }
      this.attached.set(alma, alma.subscribe((ev) => { this.onEvent(film, ev); this.checkRunning(alma); }, () => this.checkRunning(alma)));
      this.checkRunning(alma);
      void this.title(film);
      void this.count(film, false);
    }
  }

  /** Looks at whether the film's Alma is at work once the event in hand is done with (send() queues the message just
   *  after emitting it; a result clears her turn just after), and tells the listeners when that changed. A burst of
   *  events (partial text streams many times a second) is looked at once. */
  private checkRunning(alma: AlmaSession): void {
    const film = alma.film;
    if (this.checking.has(film)) return;
    this.checking.add(film);
    queueMicrotask(() => {
      this.checking.delete(film);
      const on = alma.busy || alma.runningTasks().length > 0;
      if (on === this.running.has(film)) return;
      if (on) this.running.add(film);
      else this.running.delete(film);
      const list = this.runningNow();
      for (const fn of this.runningListeners) {
        try { fn(list); } catch { /* a closed stream */ }
      }
    });
  }

  private async title(film: string): Promise<string> {
    const hit = this.titles.get(film);
    if (hit) return hit;
    let t = film === 'library' ? 'Library' : film;
    try {
      const ref = film === 'library' ? undefined : await findFilm(film);
      if (ref?.title) t = shortTitle(ref.title);
    } catch { /* the slug stands in */ }
    this.titles.set(film, t);
    return t;
  }

  private onEvent(film: string, ev: ThreadEvent): void {
    if (ev.kind === 'assistant_text' && !ev.partial) this.lastText.set(film, ev.text);
    else if (ev.kind === 'user') this.lastText.delete(film);
    else if (ev.kind === 'result') {
      const said = firstLine(this.lastText.get(film));
      this.lastText.delete(film);
      void this.emit(film, 'turn', `turn:${ev.id}`, ev.ok ? said || 'finished' : 'the turn failed');
      this.schedule(film, 'later');
    } else if (ev.kind === 'task') {
      const was = this.cardState.get(ev.task.id);
      this.cardState.set(ev.task.id, ev.task.state);
      const ended = ev.task.state === 'done' || ev.task.state === 'failed';
      if (ended && was !== 'done' && was !== 'failed') {
        const job = ev.task.title.replace(/^Alma\s*›\s*/, '');
        const what = ev.task.state === 'failed' ? (ev.task.liveLine === 'stopped' ? 'stopped' : 'failed') : firstLine(ev.task.result?.text, 80) || 'done';
        void this.emit(film, 'task', `task:${ev.task.id}`, `${job} · ${what}`, ev.task.id);
        this.schedule(film, 'later');
      } else if (ev.task.state !== was) {
        // a sub-agent starting takes its round off the list until it lands (gateItems reads the running tasks)
        this.schedule(film, 'soon');
      }
    }
  }

  /** Counts the film again in a moment: `soon` after the user answered or a sub-agent started (the state as it is),
   *  `later` after a turn or a sub-agent ended (its files given time to land, the state built afresh). A burst of
   *  either is one count. */
  private schedule(film: string, when: 'soon' | 'later'): void {
    if (!countable(film)) return;
    const key = `${film} ${when}`;
    clearTimeout(this.countTimers.get(key));
    const t = setTimeout(() => { this.countTimers.delete(key); void this.count(film, when === 'later'); }, when === 'later' ? PICK_CHECK_MS : SOON_MS);
    t.unref?.();
    this.countTimers.set(key, t);
  }

  /** Every film's count once per server lifetime (from the first stream on), one film after another. */
  private countAll(): Promise<void> {
    this.countedAll ??= (async () => {
      const films = isMock() ? mockFilms().map((f) => f.slug) : ((await getRegistry().catch(() => undefined))?.films ?? []).map((f) => f.slug);
      if (!films.length) this.countedAll = null;   // the drive not there yet: the next stream asks again
      for (const film of films) await this.count(film, false);
    })().catch(() => undefined);
    return this.countedAll;
  }

  /** Counts what waits for the user in the film ("Waiting for you"); `fresh` builds its state again (the watcher only
   *  runs for the film a page has open). */
  private async count(film: string, fresh: boolean): Promise<void> {
    if (!countable(film)) return;
    const ticket = ++this.ticket;
    try {
      const keys = await this.keysOf(film, fresh);
      if (keys) this.apply(film, keys, ticket);
    } catch { /* a film that cannot be read keeps its last count */ }
  }

  private async keysOf(film: string, fresh: boolean): Promise<string[] | undefined> {
    if (isMock()) {
      const s = mockState(film) as unknown as FilmState | undefined;
      return s ? this.keysFrom(film, s, latestTasks(mockThread(film))) : undefined;
    }
    const ref = await findFilm(film);
    if (!ref) return undefined;
    // a delivered film has no gate (gateItems lists nothing for it), so only its cards that ask can wait: with none
    // open in its feed nothing waits, and its whole state (seconds for a long film) is not built for the count
    if (ref.status === 'delivered' && !(await readFeed({ dir: ref.folder, warn: new Warnings() }, film)).cards.some(isWaiting)) {
      this.sent.delete(film);
      return [];
    }
    if (fresh) invalidateFilmState(film);
    const state = await getFilmState(film);
    return state ? this.keysFrom(film, state as unknown as FilmState, this.tasksOf(film)) : undefined;
  }

  /** A film state built afresh for anyone (a page, the folder watcher, a count): the film's count from it. */
  private fromBuilt(film: string, state: FilmStateX): void {
    if (!countable(film) || isMock()) return;
    const ticket = ++this.ticket;
    try { this.apply(film, this.keysFrom(film, state as unknown as FilmState, this.tasksOf(film)), ticket); } catch { /* as above */ }
  }

  private tasksOf(film: string): TaskCard[] {
    return allAlmas().find((a) => a.film === film)?.runningTasks() ?? [];
  }

  /** The keys of "Waiting for you" as the film's page lists them: the state with what was sent and not shown answered
   *  yet laid over it (lib/sent.ts), by the page's own rule (derive.ts waitingKeys). */
  private keysFrom(film: string, s: FilmState, tasks: TaskCard[]): string[] {
    const sent = stillSent(s, this.sent.get(film) ?? []);
    if (sent.length) this.sent.set(film, sent);
    else this.sent.delete(film);
    return waitingKeys(withSent(s, sent), tasks);
  }

  /** Keeps the film's count; an item that was not there before is news (a notice, and the film moves up the sidebar);
   *  a changed count is told to the pages. The first count of a film is only the baseline. */
  private apply(film: string, keys: string[], ticket: number): void {
    if ((this.countedAt.get(film) ?? 0) > ticket) return;   // a count begun later has already spoken
    this.countedAt.set(film, ticket);
    const before = this.waiting.get(film);
    this.waiting.set(film, keys);
    const added = before ? keys.filter((k) => !before.includes(k)) : [];
    if (added.length) void this.emit(film, 'pick', `pick:${film}:${Date.now()}`, waitingWords(keys, true));
    if (!before || before.length !== keys.length) this.tellWaiting();
  }

  private tellWaiting(): void {
    const counts = this.waitingNow();
    const json = JSON.stringify(counts);
    if (json === this.toldWaiting) return;
    this.toldWaiting = json;
    for (const fn of this.waitingListeners) {
      try { fn(counts); } catch { /* a closed stream */ }
    }
  }

  private async emit(film: string, kind: NoticeKind, id: string, text: string, taskId?: string): Promise<void> {
    const filmTitle = await this.title(film);
    const n: HarnessNotice = { id, seq: ++this.seq, film, filmTitle, kind, at: new Date().toISOString(), text, ...(taskId ? { taskId } : {}) };
    // a new item in "Waiting for you" moves the film up the sidebar; her reply alone, or a sub-agent's end, does not
    //
    if (kind === 'pick') noteAttention(film, n.at);
    this.notices.push(n);
    if (this.notices.length > KEEP) this.notices.splice(0, this.notices.length - KEEP);
    for (const fn of this.listeners) {
      try { fn(n); } catch { /* a closed stream */ }
    }
  }
}

// one hub per process; a dev hot reload replaces it (the old one lets go of the Almas first)
const HUB_VERSION = 2;
const g = globalThis as unknown as { __notifyHub?: { hub: NotifyHub; version: number } };

export function notifyHub(): NotifyHub {
  const cur = g.__notifyHub;
  if (cur && cur.version === HUB_VERSION && cur.hub instanceof NotifyHub) return cur.hub;
  try { (cur?.hub as { dispose?: () => void } | undefined)?.dispose?.(); } catch { /* an older hub */ }
  const hub = new NotifyHub();
  if (cur) hub.adopt(cur.hub);
  g.__notifyHub = { hub, version: HUB_VERSION };
  return hub;
}
