// Fixtures for the MOCK=boards shim, typed against the contract.
//   MOCK=boards  serves the hand-written sample data (src/fixtures/boards/): one invented film, The Lighthouse,
//                delivered, with its thread, for trying the app without a real film.
import type { FilmRef, FilmState, ThreadEvent } from '@/server/types';
import boardFilms from './boards/films.json';
import boardSample from './boards/the-lighthouse.json';
import library from './boards/library.json';
import sampleThread from './boards/thread-the-lighthouse.json';

export interface LibraryCounts { faces: number; voices: number; characters: number; locations: number }
export interface FixtureSet { films: FilmRef[]; states: Record<string, FilmState> }

export const FIXTURES_BOARDS: FixtureSet = {
  films: boardFilms as FilmRef[],
  states: {
    'the-lighthouse': boardSample as unknown as FilmState,
  },
};

export const FIXTURE_LIBRARY = library as LibraryCounts;
export const FIXTURE_THREADS: Record<string, ThreadEvent[]> = {
  'the-lighthouse': sampleThread as ThreadEvent[],
};
