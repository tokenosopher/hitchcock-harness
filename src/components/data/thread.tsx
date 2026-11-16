'use client';
// The film's thread with Alma: history from GET, then live ThreadEvents from the stream.
// Events with the same id replace each other (partial assistant text, task updates).
// The stream can go quiet without an error (a tunnel that buffers it), so GET is polled as a backstop:
// every 2 s after a send until the turn's result arrives (3 min at most), and every 10 s whenever the
// stream has delivered nothing for 20 s.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AlmaModel, HarnessContext, SpendLine, TaskCard, ThreadEvent, ThreadInfo } from '@/server/types';
import { latestTasks } from '@/components/lib/derive';
import { cardCost, lineKey } from '@/components/shell/TaskCardCost';
import { useFilm } from './film';

interface ThreadValue {
  events: ThreadEvent[];
  /** False until the first read of the thread has come back, so a count is not shown as 0 meanwhile. */
  loaded: boolean;
  tasks: TaskCard[];
  error?: string;
  sending: boolean;
  /** When the oldest unanswered message was sent (ms), until its turn's result or an error arrives. */
  workingSince?: number;
  send: (text: string, context: HarnessContext) => Promise<boolean>;
  /** The model this film's Alma runs on: the choice ('' = Claude Code's own setting), what that setting is, and what the CLI last reported. */
  model: { choice: AlmaModel; fallback?: string; served?: string };
  setModel: (m: AlmaModel) => Promise<boolean>;
  /** Interrupts Alma's current turn (DELETE on the thread route); the server also drops the messages queued behind it. */
  stop: () => Promise<boolean>;
}
const Ctx = createContext<ThreadValue>({ events: [], loaded: false, tasks: [], sending: false, send: async () => false, stop: async () => false, model: { choice: '' }, setModel: async () => false });

const FAST_POLL_MS = 2000;
const FAST_POLL_FOR_MS = 180_000;
const SILENT_AFTER_MS = 20_000;
const SLOW_POLL_MS = 10_000;
/** An unanswered message younger than this, found on load, counts as Alma's turn in progress. */
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
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [workingSince, setWorkingSince] = useState<number>();

  const lastHeard = useRef(0); // when the stream last opened or delivered anything
  const fastUntil = useRef(0); // poll every 2 s until then (after a send)
  const lastPoll = useRef(0);
  const pending = useRef(0); // messages sent and not yet answered by a result
  const endsAtSend = useRef<Set<string>>(new Set()); // result/error ids known when the first of them was sent
  const eventsRef = useRef<ThreadEvent[]>([]);
  useEffect(() => { eventsRef.current = events; }, [events]);

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
          setEvents((l) => mergeAll(list, l));
          setLoaded(true);
          // a message sent from elsewhere moments ago (the Idea page's first message) and not answered yet:
          // show Alma working and poll fast, as after a send from this composer
          const lastUser = [...list].reverse().find((e) => e.kind === 'user');
          const answered = lastUser && list.slice(list.indexOf(lastUser)).some(ends);
          if (lastUser && !answered && !pending.current && Date.now() - Date.parse(lastUser.at) < WORKING_WINDOW_MS) {
            endsAtSend.current = new Set(list.filter(ends).map((e) => e.id));
            pending.current = 1;
            fastUntil.current = Date.now() + FAST_POLL_FOR_MS;
            setWorkingSince(Date.parse(lastUser.at));
          }
        }
        else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `thread: ${r.status}`);
      })
      .catch(() => live && setError('The harness server is not answering'));
    const es = new EventSource(`/api/films/${film}/thread/stream`);
    const heard = () => { lastHeard.current = Date.now(); };
    es.onopen = heard;
    es.addEventListener('ping', heard);
    const takeInfo = (i: ThreadInfo) => { if (live) setModelState({ choice: i.model ?? '', fallback: i.defaultModel, served: i.servedModel }); };
    fetch(`/api/films/${film}/thread?info=1`, { cache: 'no-store' }).then(async (r) => { if (r.ok) takeInfo((await r.json()) as ThreadInfo); }).catch(() => undefined);
    es.addEventListener('info', (m) => {
      heard();
      // the first frame of a stream can come before the saved choice is read: only a frame that knows the default counts
      try { const i = JSON.parse((m as MessageEvent<string>).data) as ThreadInfo; if (i.defaultModel !== undefined || i.model) takeInfo(i); } catch { /* a partial frame */ }
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
      const fast = now < fastUntil.current && pending.current > 0;
      const silent = now - lastHeard.current > SILENT_AFTER_MS;
      if ((fast && now - lastPoll.current >= FAST_POLL_MS) || (silent && now - lastPoll.current >= SLOW_POLL_MS)) void refresh();
    }, 1000);
    return () => { live = false; es.close(); clearInterval(timer); clearTimeout(flushAt); };
  }, [film, refresh]);

  // The turn is over when as many new results (or an error) have arrived as messages were sent.
  useEffect(() => {
    if (!pending.current) return;
    const fresh = events.filter((e) => ends(e) && !endsAtSend.current.has(e.id));
    if (fresh.some((e) => e.kind === 'error') || fresh.filter((e) => e.kind === 'result').length >= pending.current) {
      pending.current = 0;
      fastUntil.current = 0;
      setWorkingSince(undefined);
    }
  }, [events]);

  const send = useCallback(async (text: string, context: HarnessContext) => {
    setSending(true);
    if (!pending.current) {
      endsAtSend.current = new Set(eventsRef.current.filter(ends).map((e) => e.id));
      setWorkingSince(Date.now());
    }
    pending.current++;
    try {
      const r = await fetch(`/api/films/${film}/thread`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, context }) });
      if (!r.ok) {
        setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `send: ${r.status}`);
      } else {
        const body = (await r.json().catch(() => undefined)) as { event?: ThreadEvent } | undefined;
        if (body?.event) setEvents((l) => merge(l, body.event!));
        fastUntil.current = Date.now() + FAST_POLL_FOR_MS;
        lastPoll.current = Date.now();
        return true;
      }
    } catch {
      setError('The harness server is not answering');
    } finally {
      setSending(false);
    }
    // the message did not go out
    pending.current = Math.max(0, pending.current - 1);
    if (!pending.current) setWorkingSince(undefined);
    return false;
  }, [film]);

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
  const value = useMemo(() => ({ events: costed, loaded, tasks, error, sending, workingSince, send, stop, model, setModel }), [costed, loaded, tasks, error, sending, workingSince, send, stop, model, setModel]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useThread = () => useContext(Ctx);
