// What the thread routes call: history (transcript + this server's live events), send, interrupt.
import { setProgress } from '../actions/progress';
import { pokeFilm } from '../films/watcher';
import type { HarnessContext, ThreadEvent, ThreadInfo } from '../types';
import { findFilm } from '../films/registry';
import { noteUserWrote } from '../films/recent';
import { FILM_SLUG } from './config';
import { isOwnUpload } from '../uploads';
import { getAlma } from './process';
import { mergeEvents, readHistory } from './transcript';

export function validFilm(film: string): boolean {
  return FILM_SLUG.test(film);
}

/** Thread keys that are not films: the library's and the settings' own Alma. */
export const NON_FILM_THREADS: ReadonlySet<string> = new Set(['library', 'settings']);

/** A message may start an Alma only for a film the registry knows, or for the library or settings thread. */
export async function knownThread(film: string, find: (slug: string) => Promise<unknown> = findFilm): Promise<boolean> {
  if (!validFilm(film)) return false;
  if (NON_FILM_THREADS.has(film)) return true;
  return !!(await find(film));
}

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

function isChip(v: unknown): v is { id: string; label: string; ref?: string; about?: string } {
  const c = v as { id?: unknown; label?: unknown; ref?: unknown; about?: unknown };
  return !!v && typeof v === 'object' && typeof c.id === 'string' && typeof c.label === 'string' && (c.ref === undefined || typeof c.ref === 'string')
    && (c.about === undefined || typeof c.about === 'string');
}

/** An attached file's chip ("upload:…", whose ref Alma is told to open) is kept only when its file really is in this
 *  thread's uploads folder (harness/uploads/<film>/); every other chip as it came. */
const keptChip = (film: string) => (x: { id: string; ref?: string }): boolean => !x.id.startsWith('upload:') || (!!x.ref && isOwnUpload(film, x.ref));

/** Checks a POST body's context against HarnessContext; drops it when malformed rather than failing the message. */
export function parseContext(film: string, v: unknown): HarnessContext | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Record<string, unknown>;
  return {
    film: typeof c.film === 'string' && c.film ? c.film : film,
    page: typeof c.page === 'string' ? c.page : '',
    pinned: typeof c.pinned === 'string' ? c.pinned : '',
    selected: Array.isArray(c.selected) ? c.selected.filter(isChip).filter(keptChip(film)).map((x) => ({ id: x.id, label: x.label, ...(x.ref ? { ref: x.ref } : {}), ...(x.about ? { about: x.about } : {}) })) : [],
    ...(typeof c.playhead === 'string' && c.playhead ? { playhead: c.playhead } : {}),
  };
}

export async function sendToAlma(film: string, text: string, context?: HarnessContext): Promise<{ event: ThreadEvent; info: ThreadInfo }> {
  const alma = getAlma(film);
  // the notices (her reply landed, a new card waits) and her working state are followed from her first message, open
  // page or not: the sidebar's order and marks read them (attached before the send, so her orb shows at once)
  await import('./notify').then((m) => m.notifyHub().start()).catch(() => undefined);
  const event = await alma.send(text, context);
  // the user wrote in the film: it goes to the top of the sidebar
  noteUserWrote(film);
  // a message about a card that asks (its chip rides along) puts that card in progress: its options lock
  const cards = (context?.selected ?? []).filter((c) => c.id.startsWith('card:')).map((c) => c.id.slice(5));
  if (cards.length) void setProgress(film, cards, true).then(() => pokeFilm(film)).catch(() => undefined);
  return { event, info: alma.info() };
}
