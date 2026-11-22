// The why of a step, kept beside it (Flow v3.3 - 9 Edit step 8). The
// user: "Maybe I should have recorded why I did it ... I did this because of this, I did this because of this, and then
// you can take that information and learn." A line the user writes beside a step in the History tab is kept in the
// film's harness/cut-reasons.json, by the step's rev, with the step's own words and time copied in, so the reason
// still says what it is about after the step has left the history (a new edit after an undo, the 1,000-step cap).
// Alma reads the file before she changes the cut and at the debrief (recipes/edit.md). Pure; the route is
// src/app/api/films/[film]/cut/reasons.

export const REASONS_REL = 'harness/cut-reasons.json';
export const REASON_MAX = 500;

export interface StepReason {
  rev: number;                  // the step's rev in harness/cut-history.json
  step: string;                 // the step's words ("trimmed the head of S7 shot 2 by 72 frames")
  stepAt?: string;              // when the step was made
  by?: string;                  // who made the step (user, alma)
  reason: string;               // the user's words
  at: string;                   // when the reason was written
}
export interface ReasonsFile { format: 1; reasons: StepReason[] }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The file read loosely: an entry without a rev or words is dropped; one entry per rev (the newest wins). */
export function checkReasons(raw: unknown): ReasonsFile {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const by = new Map<number, StepReason>();
  for (const x of Array.isArray(r.reasons) ? r.reasons : []) {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const rev = o.rev;
    const reason = str(o.reason), at = str(o.at);
    if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0 || !reason || !at) continue;
    by.set(rev, { rev, step: str(o.step) ?? '', ...(str(o.stepAt) ? { stepAt: str(o.stepAt) } : {}), ...(str(o.by) ? { by: str(o.by) } : {}), reason: reason.slice(0, REASON_MAX), at });
  }
  return { format: 1, reasons: [...by.values()].sort((a, b) => a.rev - b.rev) };
}

/** The reason of a step set (or, with empty words, taken away). Pure. */
export function setReason(file: ReasonsFile, step: { rev: number; words: string; at?: string; by?: string }, reason: string, at: string): ReasonsFile {
  const words = reason.replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
  const rest = file.reasons.filter((r) => r.rev !== step.rev);
  if (!words) return { format: 1, reasons: rest };
  const entry: StepReason = { rev: step.rev, step: step.words, ...(step.at ? { stepAt: step.at } : {}), ...(step.by ? { by: step.by } : {}), reason: words, at };
  return { format: 1, reasons: [...rest, entry].sort((a, b) => a.rev - b.rev) };
}

/** By rev, for the History tab. */
export const reasonsByRev = (file: ReasonsFile): Map<number, StepReason> => new Map(file.reasons.map((r) => [r.rev, r]));
