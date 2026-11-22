// The phone's folded thread bar: what Alma is doing, read from the same thread stream and tasks the open thread shows. And the phone's
// Enter key: a new line on a touch-first device, Send on the desktop.
import type { TaskCard, ThreadEvent } from '@/server/types';

export type BarState =
  | { kind: 'idle' }
  | { kind: 'sending' }                                  // the message is on its way to the harness
  | { kind: 'unsent' }                                   // a message from the box did not go: a tap sends it again
  | { kind: 'working'; step: string }                    // her turn runs, or her sub-agents do; step: what she does now
  | { kind: 'done'; at: string }                         // her last turn ended well, at
  | { kind: 'failed'; at: string };                      // her last turn failed, at

const short = (s: string, n = 48): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** The step a running turn is on: the sub-agents running, else the newest step since the last message, else that the
 *  message reached her. */
export function stepOf(events: ThreadEvent[], running: TaskCard[], queued = 0): string {
  if (running.length === 1) return short(running[0].title.replace(/^Alma\s*›\s*/, ''));
  if (running.length > 1) return `${running.length} sub-agents running`;
  if (queued) return `${queued} queued`;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'user') break;
    if (e.kind === 'tool_use' && e.name !== 'Agent') return short(e.summary.startsWith(e.name) ? e.summary : `${e.name} · ${e.summary}`);
    if (e.kind === 'assistant_text') return 'writing to you';
  }
  return 'got your message';
}

/** What the folded bar shows. `workingSince` and `sending` are the thread's own (useThread); `unsent`: a message from
 *  the box did not go (its bubble, in the folded thread, cannot be seen). */
export function barState(events: ThreadEvent[], tasks: TaskCard[], o: { sending: boolean; workingSince?: number; unsent?: boolean }): BarState {
  if (o.unsent) return { kind: 'unsent' };
  const running = tasks.filter((t) => t.state === 'running');
  if (o.sending && o.workingSince === undefined) return { kind: 'sending' };
  const queued = tasks.filter((t) => t.state === 'queued').length;
  if (o.workingSince !== undefined || running.length || queued) {
    // a send still in flight with nothing back yet reads as on its way
    if (o.sending && !events.some((e) => e.kind === 'user' && Date.parse(e.at) >= (o.workingSince ?? 0) - 2000)) return { kind: 'sending' };
    return { kind: 'working', step: stepOf(events, running, o.workingSince === undefined ? queued : 0) };
  }
  // the end of the last turn, after the last message
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'user') break;
    if (e.kind === 'result') return e.ok ? { kind: 'done', at: e.at } : { kind: 'failed', at: e.at };
    if (e.kind === 'error') return { kind: 'failed', at: e.at };
  }
  return { kind: 'idle' };
}

/** "14:32" today, "20 Nov 14:32" another day. */
export function clockWords(at: string, now = Date.now()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return hm;
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${hm}`;
}

/** What Enter does in the message box: on a touch-first device a new line (only the button sends); elsewhere Enter
 *  sends and Shift+Enter is a new line. Composing (an IME) is never a send. */
export function enterAction(e: { key: string; shiftKey: boolean; isComposing: boolean }, coarse: boolean): 'send' | 'newline' | 'other' {
  if (e.key !== 'Enter') return 'other';
  if (e.isComposing || e.shiftKey || coarse) return 'newline';
  return 'send';
}

/** The tallest the phone's box grows by itself: a few lines, so the page above stays put. */
export const PHONE_BOX_LINES = 5;
