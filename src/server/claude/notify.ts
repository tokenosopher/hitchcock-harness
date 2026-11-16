// What the UI is told about every film's thread at once (GET /api/notify): Alma finished a turn, a sub-agent
// finished, picks are waiting at the gate. The browser counts them unread per film while the user is not
// looking at that film. One hub per server process; it attaches to each film's Alma as it appears.
import type { FilmState, HarnessNotice, NoticeKind, TaskCard, ThreadEvent } from '../types';
import { gateItems } from '@/components/lib/derive';
import { findFilm } from '../films/registry';
import { getFilmState, invalidateFilmState } from '../films/state';
import { allAlmas, type AlmaSession } from './process';
import { oneLine } from './summarize';

type Listener = (n: HarnessNotice) => void;

const KEEP = 200;              // notices kept for ?after= replays (a page reload, a phone waking up)
const ATTACH_EVERY_MS = 2000;  // how often the hub looks for an Alma it has not attached to yet
const PICK_CHECK_MS = 2500;    // after a sub-agent or a turn ends, let its files land before counting picks

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
  private picks = new Map<string, number>();           // film → picks waiting at the last count
  private pickTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private titles = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private bornAt = Date.now();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.start();
    return () => { this.listeners.delete(fn); };
  }

  currentSeq(): number { return this.seq; }
  /** Notices after `seq`, or undefined when `seq` is not from this server's lifetime. */
  since(seq: number): HarnessNotice[] | undefined {
    if (!(seq >= this.firstSeq && seq <= this.seq)) return undefined;
    return this.notices.filter((n) => n.seq > seq);
  }

  start(): void {
    if (this.timer) return;
    this.attachAll();
    this.timer = setInterval(() => this.attachAll(), ATTACH_EVERY_MS);
    this.timer.unref?.();
  }

  /** Takes over an older hub's subscribers and notices (dev hot reload), so open streams keep their ids. */
  adopt(old: unknown): void {
    const o = old as Partial<{ listeners: Set<Listener>; notices: HarnessNotice[]; firstSeq: number; seq: number; picks: Map<string, number> }>;
    if (o.listeners) for (const fn of o.listeners) this.listeners.add(fn);
    if (o.notices) this.notices = [...o.notices];
    if (typeof o.firstSeq === 'number' && typeof o.seq === 'number') { this.firstSeq = o.firstSeq; this.seq = o.seq; }
    if (o.picks) this.picks = new Map(o.picks);
    if (this.listeners.size) this.start();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.attached.values()) off();
    this.attached.clear();
    for (const t of this.pickTimers.values()) clearTimeout(t);
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
      this.attached.set(alma, alma.subscribe((ev) => this.onEvent(film, ev)));
      void this.title(film);
      void this.countPicks(film, false);
    }
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
      this.schedulePickCount(film);
    } else if (ev.kind === 'task') {
      const was = this.cardState.get(ev.task.id);
      this.cardState.set(ev.task.id, ev.task.state);
      const ended = ev.task.state === 'done' || ev.task.state === 'failed';
      if (ended && was !== 'done' && was !== 'failed') {
        const job = ev.task.title.replace(/^Alma\s*›\s*/, '');
        const what = ev.task.state === 'failed' ? (ev.task.liveLine === 'stopped' ? 'stopped' : 'failed') : firstLine(ev.task.result?.text, 80) || 'done';
        void this.emit(film, 'task', `task:${ev.task.id}`, `${job} · ${what}`, ev.task.id);
        this.schedulePickCount(film);
      }
    }
  }

  private schedulePickCount(film: string): void {
    if (film === 'library') return;
    clearTimeout(this.pickTimers.get(film));
    const t = setTimeout(() => { this.pickTimers.delete(film); void this.countPicks(film, true); }, PICK_CHECK_MS);
    t.unref?.();
    this.pickTimers.set(film, t);
  }

  /** Counts the gate's picks waiting (the same derivation the gate page and the sidebar use); a rise is news. */
  private async countPicks(film: string, announce: boolean): Promise<void> {
    if (film === 'library') return;
    try {
      if (announce) invalidateFilmState(film); // the watcher only runs for the film a page has open
      const state = await getFilmState(film);
      if (!state) return;
      const alma = allAlmas().find((a) => a.film === film);
      const n = gateItems(state as unknown as FilmState, alma?.runningTasks() ?? []).length;
      const before = this.picks.get(film);
      this.picks.set(film, n);
      if (announce && before !== undefined && n > before) await this.emit(film, 'pick', `pick:${film}:${Date.now()}`, `${n} ${n === 1 ? 'pick' : 'picks'} waiting`);
    } catch { /* a film that cannot be read has nothing waiting */ }
  }

  private async emit(film: string, kind: NoticeKind, id: string, text: string, taskId?: string): Promise<void> {
    const filmTitle = await this.title(film);
    const n: HarnessNotice = { id, seq: ++this.seq, film, filmTitle, kind, at: new Date().toISOString(), text, ...(taskId ? { taskId } : {}) };
    this.notices.push(n);
    if (this.notices.length > KEEP) this.notices.splice(0, this.notices.length - KEEP);
    for (const fn of this.listeners) {
      try { fn(n); } catch { /* a closed stream */ }
    }
  }
}

// one hub per process; a dev hot reload replaces it (the old one lets go of the Almas first)
const HUB_VERSION = 1;
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
