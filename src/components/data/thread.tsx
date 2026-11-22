'use client';
// The film's thread with Alma: history from GET, then live ThreadEvents from the stream.
// Events with the same id replace each other (partial assistant text, task updates).
// The stream can go quiet without an error (a tunnel that buffers it), so GET is polled as a backstop:
// every 2 s after a send until the turn's result arrives (3 min at most), and every 10 s whenever the
// stream has delivered nothing for 20 s.
// Alma's turn (workingSince) opens for every message to her, whoever sent it (almaOutbox.ts): this thread's own send,
// a card's answer, Done picking, a pick, the Story page's settle, the script's lock, a <harness-action>; it is read
// off the user messages the thread sees arrive, and closes with as many results (or an error).
// A message sent with `send` shows in the thread at the tap, before the server has it (pendingSends.ts): marked as
// sending, then replaced by the thread's own copy under the same key, or kept as "Not sent" with a retry.
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AlmaModel, HarnessContext, SpendLine, TaskCard, ThreadEvent, ThreadInfo } from '@/server/types';
import { latestTasks } from '@/components/lib/derive';
import { cardCost, lineKey } from '@/components/shell/TaskCardCost';
import { useFilm } from './film';
import { almaFetch, arrived, onPosted, outbound, subscribeOutbox } from './almaOutbox';
import { pendingKey, settle, userIds, type PendingSend } from './pendingSends';

interface ThreadValue {
  events: ThreadEvent[];
  /** False until the first read of the thread has come back, so a count is not shown as 0 meanwhile. */
  loaded: boolean;
  tasks: TaskCard[];
  error?: string;
  sending: boolean;
  /** A message to Alma from anywhere in the app is on its way (almaOutbox.ts): the POST is out, not answered yet. */
  toAlma: boolean;
  /** When the oldest unanswered message was sent (ms), until its turn's result or an error arrives. */
  workingSince?: number;
  /** Shows the message in the thread at once and sends it; true once the server took it. Sends go out in order. */
  send: (text: string, context: HarnessContext) => Promise<boolean>;
  /** The model this film's Alma runs on: the choice ('' = Claude Code's own setting), what that setting is, and what the CLI last reported. */
  model: { choice: AlmaModel; fallback?: string; served?: string };
  setModel: (m: AlmaModel) => Promise<boolean>;
  /** The reserve switch, as the server last told it; undefined until it has. */
  reserve?: NonNullable<ThreadInfo['reserve']>;
  /** Turns the reserve on (the offer under a usage-limit message); false with the reason when the server refused. */
  turnOnReserve: () => Promise<{ ok: boolean; error?: string }>;
  /** Interrupts Alma's current turn (DELETE on the thread route); the server also drops the messages queued behind it. */
  stop: () => Promise<boolean>;
}
const Ctx = createContext<ThreadValue>({ events: [], loaded: false, tasks: [], sending: false, toAlma: false, send: async () => false, stop: async () => false, model: { choice: '' }, setModel: async () => false, turnOnReserve: async () => ({ ok: false }) });

/** The messages sent from here that the thread has not got back yet, in a context of their own: a tap redraws the
 *  thread column, not every reader of the thread (the sidebar, the pages). */
interface PendingValue {
  /** Messages sent here whose copy is not on the thread yet: on their way, taken, or not sent (pendingSends.ts). */
  pending: PendingSend[];
  /** The key a thread event is drawn under: a message sent here keeps the key its pending bubble had. */
  keyOf: ReadonlyMap<string, string>;
  /** Sends a message that did not go again. */
  retry: (key: string) => void;
}
const PendingCtx = createContext<PendingValue>({ pending: [], keyOf: new Map(), retry: () => {} });

const FAST_POLL_MS = 2000;
const FAST_POLL_FOR_MS = 180_000;
const SILENT_AFTER_MS = 20_000;
const SLOW_POLL_MS = 10_000;
/** After a POST to Alma is answered, how long it still reads as on its way while her message is not on the thread. */
const LANDING_MS = 2000;
/** An unanswered message younger than this, found on load or arriving, counts as Alma's turn in progress. */
const WORKING_WINDOW_MS = 5 * 60_000;

function merge(list: ThreadEvent[], e: ThreadEvent): ThreadEvent[] {
  const i = list.findIndex((x) => x.id === e.id);
  if (i < 0) return [...list, e];
  if (list[i] === e) return list;
  const next = list.slice();
  next[i] = e;
  return next;
}
function mergeAll(list: ThreadEvent[], incoming: ThreadEvent[]): ThreadEvent[] {
  // by an index of ids, not a search per event: a long film's thread is 3,500 events, and a search of the list for each
  // of them was 12 million steps on every read of the thread
  const at = new Map<string, number>();
  list.forEach((x, i) => { if (!at.has(x.id)) at.set(x.id, i); });
  let out = list;
  const own = () => { if (out === list) out = list.slice(); };
  for (const e of incoming) {
    const i = at.get(e.id);
    if (i === undefined) { own(); at.set(e.id, out.length); out.push(e); continue; }
    const cur = out[i];
    // a final text from history replaces a live partial; a stale partial never replaces a final
    if (cur.kind === 'assistant_text' && !cur.partial && e.kind === 'assistant_text' && e.partial) continue;
    if (cur === e || JSON.stringify(cur) === JSON.stringify(e)) continue;
    own();
    out[i] = e;
  }
  return out;
}
const ends = (e: ThreadEvent) => e.kind === 'result' || e.kind === 'error';

/** A card seen within this long of its start is "seen starting": the spend rows already there are not its. */
const SEEN_STARTING_MS = 15_000;

/** Every task card gets its credits from spend.md (TaskCardCost.ts); a card already carrying a cost keeps it. */
function withCosts(events: ThreadEvent[], lines: SpendLine[] | undefined, baselines: Map<string, Set<string>>): ThreadEvent[] {
  if (!lines?.length) return events;
  let changed = false;
  const out = events.map((e) => {
    if (e.kind !== 'task' || e.task.cost) return e;
    const cost = cardCost(e.task, lines, baselines.get(e.task.id));
    if (!cost) return e;
    changed = true;
    return { ...e, task: { ...e.task, cost } };
  });
  return changed ? out : events;
}

export function ThreadProvider({ film, children }: { film: string; children: React.ReactNode }) {
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [model, setModelState] = useState<ThreadValue['model']>({ choice: '' });
  const [reserve, setReserve] = useState<ThreadValue['reserve']>();
  const [error, setError] = useState<string>();
  const [queue, setQueue] = useState<PendingSend[]>([]);
  // event id → the key of the pending bubble it replaced, kept after the pending one is gone
  const [kept, setKept] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [workingSince, setWorkingSince] = useState<number>();
  // a POST the server took, its message not on the thread yet (2 s at most: a route that sent her nothing)
  const [landing, setLanding] = useState<number>();

  const lastHeard = useRef(0); // when the stream last opened or delivered anything
  const fastUntil = useRef(0); // poll every 2 s until then (after a send)
  const lastPoll = useRef(0);
  const pending = useRef(0); // messages to Alma seen arrive and not yet answered by a result
  const endsAtSend = useRef<Set<string>>(new Set()); // result/error ids known when the first of them arrived
  const seenUsers = useRef<Set<string>>(new Set()); // user messages already looked at (almaOutbox.arrived)
  const postedAt = useRef(0); // when a POST to Alma from elsewhere in the app was last answered

  const refresh = useCallback(async () => {
    lastPoll.current = Date.now();
    try {
      const r = await fetch(`/api/films/${film}/thread`, { cache: 'no-store' });
      if (!r.ok) return;
      const list = (await r.json()) as ThreadEvent[];
      setEvents((l) => mergeAll(l, list));
    } catch { /* the next poll tries again */ }
  }, [film]);

  useEffect(() => {
    let live = true;
    fetch(`/api/films/${film}/thread`, { cache: 'no-store' })
      .then(async (r) => {
        if (!live) return;
        if (r.ok) {
          const list = (await r.json()) as ThreadEvent[];
          // a message sent moments ago and not answered yet (the Idea page's first message) opens her turn below
          setEvents((l) => mergeAll(list, l));
          setLoaded(true);
        }
        else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `thread: ${r.status}`);
      })
      .catch(() => live && setError('The harness server is not answering'));
    const es = new EventSource(`/api/films/${film}/thread/stream`);
    const heard = () => { lastHeard.current = Date.now(); };
    es.onopen = heard;
    es.addEventListener('ping', heard);
    const takeInfo = (i: ThreadInfo) => { if (live) setModelState({ choice: i.model ?? '', fallback: i.defaultModel, served: i.servedModel }); };
    const takeReserve = (i: ThreadInfo) => { if (live && i.reserve) setReserve(i.reserve); };
    fetch(`/api/films/${film}/thread?info=1`, { cache: 'no-store' }).then(async (r) => { if (r.ok) { const i = (await r.json()) as ThreadInfo; takeInfo(i); takeReserve(i); } }).catch(() => undefined);
    es.addEventListener('info', (m) => {
      heard();
      // the first frame of a stream can come before the saved choice is read: only a frame that knows the default counts
      try { const i = JSON.parse((m as MessageEvent<string>).data) as ThreadInfo; if (i.defaultModel !== undefined || i.model) takeInfo(i); takeReserve(i); } catch { /* a partial frame */ }
    });
    // Events are applied in batches, a few hundredths of a second apart: on connect the stream replays up to 500
    // events, which were 500 renders of the whole thread, and a task replayed as running and then as finished
    // lit the running tray for a moment.
    let queue: ThreadEvent[] = [];
    let flushAt: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushAt = undefined;
      const batch = queue;
      queue = [];
      if (live && batch.length) setEvents((l) => mergeAll(l, batch));
    };
    es.onmessage = (m) => {
      heard();
      try { queue.push(JSON.parse(m.data) as ThreadEvent); } catch { return; /* a partial frame */ }
      flushAt ??= setTimeout(flush, 30);
    };
    lastHeard.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const fast = now < fastUntil.current && (pending.current > 0 || now - postedAt.current < 15_000);
      const silent = now - lastHeard.current > SILENT_AFTER_MS;
      if ((fast && now - lastPoll.current >= FAST_POLL_MS) || (silent && now - lastPoll.current >= SLOW_POLL_MS)) void refresh();
    }, 1000);
    // a POST to Alma from a page or a card: poll fast for her message and answer, in case the stream is held up
    const offPosted = onPosted((f, ok) => {
      if (f !== film) return;
      // the answer can come a moment before her message does on the stream: it still reads as on its way till then
      if (ok) setLanding(Date.now());
      postedAt.current = Date.now();
      fastUntil.current = Date.now() + FAST_POLL_FOR_MS;
      void refresh();
    });
    return () => { live = false; es.close(); clearInterval(timer); clearTimeout(flushAt); offPosted(); };
  }, [film, refresh]);

  const out = useSyncExternalStore(subscribeOutbox, () => outbound(film) > 0, () => false);
  useEffect(() => {
    if (landing === undefined) return;
    const t = setTimeout(() => setLanding(undefined), LANDING_MS);
    return () => clearTimeout(t);
  }, [landing]);
  const toAlma = out || landing !== undefined;

  // Every message to her that arrives opens her turn (or queues behind it); the turn is over when as many new
  // results (or an error) have arrived as messages did.
  useEffect(() => {
    if (!loaded) return;
    const found = arrived(events, seenUsers.current, Date.now(), WORKING_WINDOW_MS);
    if (found.length) {
      if (!pending.current) endsAtSend.current = new Set(events.filter(ends).map((e) => e.id));
      pending.current += found.length;
      fastUntil.current = Date.now() + FAST_POLL_FOR_MS;
      setWorkingSince((w) => w ?? Date.parse(found[0].at));
      setLanding(undefined);
    }
    if (!pending.current) return;
    const fresh = events.filter((e) => ends(e) && !endsAtSend.current.has(e.id));
    if (fresh.some((e) => e.kind === 'error') || fresh.filter((e) => e.kind === 'result').length >= pending.current) {
      pending.current = 0;
      fastUntil.current = 0;
      setWorkingSince(undefined);
    }
  }, [events, loaded]);

  // the thread's copy of a pending message is matched in the same render it arrives in: never drawn twice
  const settled = useMemo(() => settle(queue, events, new Set(kept.keys())), [queue, events, kept]);
  const keyOf = useMemo(() => (settled.matched.size ? new Map([...kept, ...settled.matched]) : kept), [kept, settled]);
  useEffect(() => {
    if (!settled.matched.size) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the matched ones leave the queue; their keys stay
    setKept((m) => new Map([...m, ...settled.matched]));
    const gone = new Set(settled.matched.values());
    setQueue((q) => q.filter((p) => !gone.has(p.key)));
  }, [settled]);
  const unsettled = settled.rest;

  const eventsNow = useRef(events);
  useEffect(() => { eventsNow.current = events; }, [events]);
  // one POST at a time, in the order of the taps: the server queues them for Alma in the order they arrive
  const line = useRef<Promise<unknown>>(Promise.resolve());
  const patch = (key: string, p: Partial<PendingSend>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const post = useCallback((p: PendingSend): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      let why = '';
      try {
        const r = await almaFetch(film, `/api/films/${film}/thread`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: p.text, context: p.context }) });
        if (r.ok) {
          const body = (await r.json().catch(() => undefined)) as { event?: ThreadEvent } | undefined;
          patch(p.key, { state: 'sent', serverId: body?.event?.id });
          if (body?.event) setEvents((l) => merge(l, body.event!));
          fastUntil.current = Date.now() + FAST_POLL_FOR_MS;
          lastPoll.current = Date.now();
          return true;
        }
        why = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `The harness answered ${r.status}`;
      } catch {
        why = 'The harness server is not answering';
      }
      patch(p.key, { state: 'failed', why });
      // the message did not go out
      if (!pending.current) setWorkingSince(undefined);
      return false;
    };
    const next = line.current.then(run, run);
    line.current = next;
    return next;
  }, [film]);

  const send = useCallback((text: string, context: HarnessContext) => {
    const p: PendingSend = { key: pendingKey(), text, context, at: Date.now(), state: 'sending', before: userIds(eventsNow.current) };
    setQueue((q) => [...q, p]);
    // working from the tap; the turn itself opens when the message comes back on the thread. Drawn just after the
    // bubble: the readers of the thread (the sidebar, the page) do not hold up the tap's first frame
    const now = Date.now();
    startTransition(() => setWorkingSince((w) => w ?? now));
    return post(p);
  }, [post]);

  const retry = useCallback((key: string) => {
    const p = queue.find((x) => x.key === key && x.state === 'failed');
    if (!p) return;
    const again: PendingSend = { ...p, at: Date.now(), state: 'sending', why: undefined, before: userIds(eventsNow.current) };
    patch(key, again);
    const now = Date.now();
    startTransition(() => setWorkingSince((w) => w ?? now));
    void post(again);
  }, [queue, post]);
  const sending = out;
  const pendingValue = useMemo<PendingValue>(() => ({ pending: unsettled, keyOf, retry }), [unsettled, keyOf, retry]);

  const stop = useCallback(async () => {
    try {
      const r = await fetch(`/api/films/${film}/thread`, { method: 'DELETE' });
      if (!r.ok) {
        setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `stop: ${r.status}`);
        return false;
      }
    } catch {
      setError('The harness server is not answering');
      return false;
    }
    // the turn and everything queued behind it are gone: stop waiting for their results
    pending.current = 0;
    fastUntil.current = 0;
    setWorkingSince(undefined);
    void refresh();
    return true;
  }, [film, refresh]);

  // credits: spend.md rows naming the card's target; for a card seen starting, only rows added after that
  const lines = useFilm().state?.spend.lines;
  const [baselines, setBaselines] = useState<Map<string, Set<string>>>(() => new Map());
  useEffect(() => {
    if (!lines) return;
    const fresh = events.filter((e): e is Extract<ThreadEvent, { kind: 'task' }> => e.kind === 'task' && e.task.state === 'running'
      && !baselines.has(e.task.id) && Date.now() - Date.parse(e.task.startedAt) <= SEEN_STARTING_MS);
    if (!fresh.length) return;
    const keys = new Set(lines.map(lineKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a card seen starting takes the spend rows of that moment as its baseline
    setBaselines((m) => { const next = new Map(m); for (const e of fresh) if (!next.has(e.task.id)) next.set(e.task.id, keys); return next; });
  }, [events, lines, baselines]);
  const costed = useMemo(() => withCosts(events, lines, baselines), [events, lines, baselines]);

  const tasks = useMemo(() => latestTasks(costed), [costed]);
  const setModel = useCallback(async (m: AlmaModel): Promise<boolean> => {
    const before = model;
    setModelState((x) => ({ ...x, choice: m, served: undefined }));
    try {
      const r = await fetch(`/api/films/${film}/thread`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m }) });
      if (r.ok) return true;
    } catch { /* below */ }
    setModelState(before);
    return false;
  }, [film, model]);
  const turnOnReserve = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch('/api/settings/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: true }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; on?: boolean; hasKey?: boolean };
      if (!r.ok) return { ok: false, error: j.error ?? `The harness answered ${r.status}` };
      // the server's info frame follows with what this Alma runs on; meanwhile it reads as from her next turn
      setReserve((x) => ({ on: true, hasKey: j.hasKey ?? true, onKey: x?.onKey ?? false }));
      return { ok: true };
    } catch {
      return { ok: false, error: 'The harness server is not answering' };
    }
  }, []);
  const value = useMemo(() => ({ events: costed, loaded, tasks, error, sending, toAlma, workingSince, send, stop, model, setModel, reserve, turnOnReserve }),
    [costed, loaded, tasks, error, sending, toAlma, workingSince, send, stop, model, setModel, reserve, turnOnReserve]);
  return <Ctx.Provider value={value}><PendingCtx.Provider value={pendingValue}>{children}</PendingCtx.Provider></Ctx.Provider>;
}

export const useThread = () => useContext(Ctx);
export const usePendingSends = () => useContext(PendingCtx);
