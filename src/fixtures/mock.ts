// MOCK=boards: serves workstream A's hand-written fixtures (the numbers on the design boards) from the
// real API routes, for comparing the app with the boards. Unset, every route serves the real files.
// Server-only (imported by route handlers).
import type { HarnessContext, ThreadEvent } from '@/server/types';
import { FIXTURES_BOARDS, FIXTURE_LIBRARY, FIXTURE_THREADS } from './index';
import cutFilm from './boards/cut-the-lighthouse.json';
import { sampleCut, sampleFilms, sampleState } from './masters';
import { releaseSampleFilms, releaseSampleState } from './release';
import { leftSampleCut, leftSampleFilms, leftSampleState } from './left';
import { castSampleFilms, castSampleState } from './cast';
import { day1SampleCut, day1SampleFilms, day1SampleState } from './day1';
import { storySampleFilms, storySampleState } from './story';

export const isMock = () => process.env.MOCK === 'boards';
const set = () => FIXTURES_BOARDS;

type Listener = (e: ThreadEvent) => void;
const g = globalThis as unknown as { __hhMock?: { threads: Record<string, ThreadEvent[]>; listeners: Record<string, Set<Listener>> } };
const store = (g.__hhMock ??= {
  threads: Object.fromEntries(Object.entries(FIXTURE_THREADS).map(([k, v]) => [k, [...v]])),
  listeners: {},
});

export const mockFilms = () => [...set().films, ...sampleFilms(), ...releaseSampleFilms(), ...leftSampleFilms(), ...castSampleFilms(), ...day1SampleFilms(), ...storySampleFilms()];
export const mockLibrary = () => FIXTURE_LIBRARY;
export const mockState = (film: string) => storySampleState(film) ?? releaseSampleState(film) ?? leftSampleState(film) ?? castSampleState(film) ?? day1SampleState(film) ?? sampleState(film, set().states[film]) ?? set().states[film];
/** The Edit page's hand-written timeline (the Scenes page's cut lane as of 1 Nov), for the boards comparison:
 *  GET …/cut answers it with `mock: true` and the page keeps its versions in memory (nothing is written). */
const CUTS: Record<string, unknown> = { 'the-lighthouse': cutFilm };
export const mockCut = (film: string) => (CUTS[film] ?? sampleCut(film) ?? leftSampleCut(film) ?? day1SampleCut(film)) as { current: unknown; empty?: boolean; versions: unknown[]; timelines?: unknown[]; sourceSeconds?: Record<string, number>; problems?: Record<string, string[]> } | undefined;
export const mockThread = (film: string) => store.threads[film] ?? [];

function emit(film: string, e: ThreadEvent) {
  (store.threads[film] ??= []).push(e);
  store.listeners[film]?.forEach((l) => l(e));
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
export function mockPoke(film: string): void { pokes.get(film)?.forEach((fn: () => void) => fn()); }
