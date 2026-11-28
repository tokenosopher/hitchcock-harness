// What GET /api/films/[film]/release answers (Release, 14 Nov 2026), and what POST answers to one operation.
// Types only, so the pages import them without server code.
import type { ReleaseInfo } from '@/server/films/read/release';
import type { ReleaseFile } from './file';
import type { Derived } from './derive';
import type { CompanionStatus, MasterOption } from './masters';

export interface ReleaseView {
  film: string;
  mock?: boolean;
  /** social/release.json, when it exists and checks out. */
  file?: ReleaseFile;
  /** Why the file on disk does not check out (the page says so and changes nothing). */
  problems?: string[];
  /** Everything derive.ts works out, at the server's clock (for Alma and scripts; the page derives with its own). */
  derived?: Derived;
  /** The masters on offer, newest first: while no final is named, or with ?masters=1. */
  masters?: MasterOption[];
  /** The final's own file: its size and length. */
  finalFile?: { bytes?: number; seconds?: number; width?: number; height?: number; fromBytes?: number; fps?: number };   // fromBytes: a smaller file's source size; fps: read from the file
  /** The final's companions and where each is. */
  companions?: CompanionStatus[];
  /** The cut as it is now ("v238"), and when the final is of another version, its cut against this one (ASKS 49,
   *  sameCut.ts cutGap, words ending on "since the final", `version` the final's): the amber line only when the
   *  content differs. `final` absent, or of another final: not known (the two numbers are said, as before). */
  cut?: { version: string; final?: { version: string; same: boolean; words?: string } };
  /** The delivery's Social kit folder, only when the film's final-cuts folder has one. */
  kit?: { shown: string; folder: string };
  /** Today's Release page for a film with only social/kit.md (no release file, no final). */
  legacy?: ReleaseInfo;
}

export type ReleaseAnswer = { ok: true; file: ReleaseFile; said: string; derived: Derived; companions?: CompanionStatus[] } | { ok: false; error: string };
