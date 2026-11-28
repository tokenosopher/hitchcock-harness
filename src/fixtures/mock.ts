// MOCK=boards: serves workstream A's hand-written fixtures (the numbers on the design boards) from the
// real API routes, for comparing the app with the boards. Unset, every route serves the real files.
// Server-only (imported by route handlers).
import type { FilmState, HarnessContext, ThreadEvent } from '@/server/types';
import { noteUserWrote } from '@/server/films/recent';
import { FIXTURES_BOARDS, FIXTURE_LIBRARY, FIXTURE_THREADS } from './index';
import cutFilm from './boards/cut-the-lighthouse.json';
import { sampleCut, sampleFilms, sampleState } from './masters';
import { releaseSampleFilms, releaseSampleState, releaseSeed } from './release';
import { LEFT_THREADS, leftReleaseSeed, leftSampleCut, leftSampleFilms, leftSampleState, leftTicksSeed } from './left';
import { postBrief, type LeftFile } from '@/components/edit/left';
import { castSampleFilms, castSampleState } from './cast';
import { day1SampleCut, day1SampleFilms, day1SampleState } from './day1';
import { storySampleFilms, storySampleState } from './story';
import { soundSampleCut, soundSampleFilms, soundSampleState } from './soundpick';
import { AFTERLOCK_THREADS, afterlockSampleCut, afterlockSampleFilms, afterlockSampleState } from './afterlock';
import { ELEMENTS_THREADS, elementsSampleFilms, elementsSampleState } from './elements';
import { trimSampleCut, trimSampleFilms, trimSampleState } from './trim';

export const isMock = () => process.env.MOCK === 'boards';
const set = () => FIXTURES_BOARDS;

type Listener = (e: ThreadEvent) => void;
type RunningListener = (films: string[]) => void;
const g = globalThis as unknown as { __hhMock?: { threads: Record<string, ThreadEvent[]>; listeners: Record<string, Set<Listener>>; open?: Record<string, number>; running?: Set<RunningListener> } };
const store = (g.__hhMock ??= {
  threads: Object.fromEntries(Object.entries({ ...FIXTURE_THREADS, ...AFTERLOCK_THREADS, ...ELEMENTS_THREADS, ...LEFT_THREADS }).map(([k, v]) => [k, [...v]])),
  listeners: {},
});
// a sample film's Alma is "at work" from a message sent to it until its turn ends (a result, an error, Stop), as the
// phone bar reads the same thread; the fixtures' own history never counts (the sidebar's orb)
const open = (store.open ??= {});
const runningListeners = (store.running ??= new Set());

export const mockFilms = () => [...set().films, ...sampleFilms(), ...releaseSampleFilms(), ...leftSampleFilms(), ...castSampleFilms(), ...day1SampleFilms(), ...storySampleFilms(), ...soundSampleFilms(), ...afterlockSampleFilms(), ...elementsSampleFilms(), ...trimSampleFilms()];
export const mockLibrary = () => FIXTURE_LIBRARY;
export const mockState = (film: string) => withRelease(film, baseState(film));
/** The sample's release in brief, as the real reader puts it in the state (read/post.ts): the release file in memory
 *  (server/release/file.ts mockReleases) or its seed, and the ticks in memory (server/edit/left.ts mockLeft) or theirs,
 *  read off their shared globals so this file imports neither ("Waiting for you" for posting). */
function withRelease<T extends FilmState | undefined>(slug: string, s: T): T {
  if (!s) return s;
  const g = globalThis as unknown as { __hhMockRelease?: Map<string, unknown>; __mockLeft?: Map<string, LeftFile> };
  const file = g.__hhMockRelease?.has(slug) ? g.__hhMockRelease.get(slug) ?? undefined : releaseSeed(slug) ?? leftReleaseSeed(slug);
  const brief = postBrief(file, (g.__mockLeft?.get(slug) ?? leftTicksSeed(slug))?.ticks);
  if (!brief) return s;
  return { ...s, post: { ...(s.post ?? { cuts: [], masters: [], captions: [] }), release: { path: 'social/release.json', ...brief } } };
}
const baseState = (film: string) => trimSampleState(film) ?? elementsSampleState(film) ?? afterlockSampleState(film) ?? soundSampleState(film) ?? storySampleState(film) ?? releaseSampleState(film) ?? leftSampleState(film) ?? castSampleState(film) ?? day1SampleState(film) ?? sampleState(film, set().states[film]) ?? set().states[film];
/** The Edit page's hand-written timeline (the Scenes page's cut lane as of 1 Nov), for the boards comparison:
 *  GET …/cut answers it with `mock: true` and the page keeps its versions in memory (nothing is written). */
const CUTS: Record<string, unknown> = { 'the-lighthouse': cutFilm };
export const mockCut = (film: string) => (CUTS[film] ?? trimSampleCut(film) ?? soundSampleCut(film) ?? sampleCut(film) ?? leftSampleCut(film) ?? day1SampleCut(film) ?? afterlockSampleCut(film)) as { current: unknown; empty?: boolean; versions: unknown[]; timelines?: unknown[]; sourceSeconds?: Record<string, number>; problems?: Record<string, string[]> } | undefined;
export const mockThread = (film: string) => store.threads[film] ?? [];
/** The film's thread as the fixtures have it: a sample's reset clears what earlier tests sent. */
export const resetMockThread = (film: string) => { const f = FIXTURE_THREADS[film] ?? AFTERLOCK_THREADS[film] ?? ELEMENTS_THREADS[film] ?? LEFT_THREADS[film]; if (f) store.threads[film] = [...f]; else delete store.threads[film]; };

function emit(film: string, e: ThreadEvent) {
  (store.threads[film] ??= []).push(e);
  store.listeners[film]?.forEach((l) => l(e));
  const was = (open[film] ?? 0) > 0;
  if (e.kind === 'user') open[film] = (open[film] ?? 0) + 1;
  else if (e.kind === 'result') open[film] = Math.max(0, (open[film] ?? 0) - 1);
  else if (e.kind === 'error') open[film] = 0;
  if ((open[film] ?? 0) > 0 !== was) {
    const list = mockRunning();
    runningListeners.forEach((l) => { try { l(list); } catch { /* a closed stream */ } });
  }
}

/** The sample films whose turn is open (a message sent this server's lifetime, not answered yet), sorted. */
export const mockRunning = (): string[] => Object.keys(open).filter((f) => open[f] > 0).sort();
export function mockSubscribeRunning(l: RunningListener): () => void {
  runningListeners.add(l);
  return () => { runningListeners.delete(l); };
}
/** Stop (DELETE …/thread) on a sample film: its open turn and the messages behind it end, one result each. */
export function mockStop(film: string): void {
  for (let n = open[film] ?? 0; n > 0; n--) emit(film, { kind: 'result', id: `r-${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString(), ok: true, durationMs: 0, sessionId: '' });
}

export function mockSubscribe(film: string, l: Listener) {
  (store.listeners[film] ??= new Set()).add(l);
  return () => store.listeners[film]?.delete(l);
}

/** Records the message as the user's and answers with a system line: nothing reaches Alma under MOCK. */
export function mockPost(film: string, text: string, context?: HarnessContext) {
  const at = new Date().toISOString();
  const id = Math.random().toString(36).slice(2, 10);
  emit(film, { kind: 'user', id: `u-${id}`, at, text, context });
  // the user wrote in the film: it goes to the top of the sidebar (sendToAlma does the same for a real film)
  noteUserWrote(film);
  setTimeout(() => emit(film, { kind: 'system', id: `s-${id}`, at: new Date().toISOString(), text: 'MOCK · not sent to Alma: the thread is served from fixtures' }), 400);
}

/** One SSE response that writes `send(write)` frames and keeps the connection alive. */
export function sseResponse(start: (write: (data: unknown) => void) => (() => void) | void, signal: AbortSignal) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (data: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };
      const stop = start(write);
      const ping = setInterval(() => { try { controller.enqueue(enc.encode('event: ping\ndata: \n\n')); } catch { /* closed */ } }, 15000);
      signal.addEventListener('abort', () => {
        clearInterval(ping);
        if (stop) stop();
        try { controller.close(); } catch { /* closed */ }
      });
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}

// Release, stage 3: a sample film's state stream sends the state again when its release changes in memory (the
// test hook playing Alma, an answer to her card), as the folder watcher does for a real film.
const pokes = ((globalThis as unknown as { __hhMockPokes?: Map<string, Set<() => void>> }).__hhMockPokes ??= new Map());
export function mockWatch(film: string, fn: () => void): () => void {
  (pokes.get(film) ?? pokes.set(film, new Set()).get(film)!).add(fn);
  return () => { pokes.get(film)?.delete(fn); };
}
// and every sample film's change, for the notify hub's count of "Waiting for you" (the sidebar's white dot)
const anyPoke = ((globalThis as unknown as { __hhMockAnyPoke?: Set<(film: string) => void> }).__hhMockAnyPoke ??= new Set());
export function mockWatchAll(fn: (film: string) => void): () => void {
  anyPoke.add(fn);
  return () => { anyPoke.delete(fn); };
}
export function mockPoke(film: string): void {
  pokes.get(film)?.forEach((fn: () => void) => fn());
  anyPoke.forEach((fn) => { try { fn(film); } catch { /* a listener's own trouble */ } });
}
