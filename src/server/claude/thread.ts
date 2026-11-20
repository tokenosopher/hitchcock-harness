// What the thread routes call: history (transcript + this server's live events), send, interrupt.
import { setProgress } from '../actions/progress';
import { pokeFilm } from '../films/watcher';
import type { HarnessContext, ThreadEvent, ThreadInfo } from '../types';
import { FILM_SLUG } from './config';
import { getAlma } from './process';
import { mergeEvents, readHistory } from './transcript';

export function validFilm(film: string): boolean {
  return FILM_SLUG.test(film);
}

export { asTyped } from './typed';

/** The chats that belong to no film. */
export const NON_FILM_THREADS = new Set(['library', 'settings']);

export async function threadHistory(film: string): Promise<{ events: ThreadEvent[]; warnings: string[] }> {
  const alma = getAlma(film);
  const sessionId = await alma.currentSessionId();
  const live = alma.liveEvents();
  if (!sessionId) return { events: live, warnings: [] };
  const h = await readHistory(alma.cwd, sessionId);
  alma.learnEnded(h.tasks);
  return { events: mergeEvents(h.events, live), warnings: h.warnings };
}

export async function threadInfo(film: string): Promise<ThreadInfo> {
  const alma = getAlma(film);
  await alma.currentSessionId();
  const info = alma.info();
  if (info.sessionId) {
    const h = await threadHistory(film);
    info.messageCount = h.events.filter((e) => e.kind === 'user').length;
  }
  return info;
}

function isChip(v: unknown): v is { id: string; label: string; ref?: string } {
  const c = v as { id?: unknown; label?: unknown; ref?: unknown };
  return !!v && typeof v === 'object' && typeof c.id === 'string' && typeof c.label === 'string' && (c.ref === undefined || typeof c.ref === 'string');
}

/** Checks a POST body's context against HarnessContext; drops it when malformed rather than failing the message. */
export function parseContext(film: string, v: unknown): HarnessContext | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Record<string, unknown>;
  return {
    film: typeof c.film === 'string' && c.film ? c.film : film,
    page: typeof c.page === 'string' ? c.page : '',
    pinned: typeof c.pinned === 'string' ? c.pinned : '',
    selected: Array.isArray(c.selected) ? c.selected.filter(isChip).map((x) => ({ id: x.id, label: x.label, ...(x.ref ? { ref: x.ref } : {}) })) : [],
    ...(typeof c.playhead === 'string' && c.playhead ? { playhead: c.playhead } : {}),
  };
}

export async function sendToAlma(film: string, text: string, context?: HarnessContext): Promise<{ event: ThreadEvent; info: ThreadInfo }> {
  const alma = getAlma(film);
  const event = await alma.send(text, context);
  // a message about a card that asks (its chip rides along) puts that card in progress: its options lock
  const cards = (context?.selected ?? []).filter((c) => c.id.startsWith('card:')).map((c) => c.id.slice(5));
  if (cards.length) void setProgress(film, cards, true).then(() => pokeFilm(film)).catch(() => undefined);
  return { event, info: alma.info() };
}
