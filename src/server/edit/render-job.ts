// The processes of one render job ("Cancel the 480p render please, don't need it"). Every
// ffmpeg a job starts is kept on that job, as the ChildProcess object spawn returned, so cancelling the job stops
// exactly those processes and nothing else: never a pid looked up by name, never a process group, never a search.
// The job's code runs inside `jobScope.run(procs, …)`; the spawners (render.ts ffmpegRun, render-options.ts ffmpegText,
// render.ts soundOf) call `adopt` right after they spawn, which is a no-op outside a job (the other users of ffmpegText).
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChildProcess } from 'node:child_process';

/** What a job spawned that is still running, and whether it was asked to stop. */
export interface JobProcs { children: Set<ChildProcess>; cancelled: boolean }

export const jobScope = new AsyncLocalStorage<JobProcs>();

/** Thrown in a job asked to stop, at its next step (no new process is started for it). */
export class RenderCancelled extends Error {
  constructor() { super('cancelled on request'); }
}

/** Keeps a child just spawned on the job this code runs for. A job already asked to stop: the child is stopped at once. */
export function adopt(p: ChildProcess): void {
  const j = jobScope.getStore();
  if (!j) return;
  j.children.add(p);
  p.once('exit', () => j.children.delete(p));
  if (j.cancelled) stopChild(p);
}

/** Throws when the job this code runs for was asked to stop. */
export function checkCancelled(): void {
  if (jobScope.getStore()?.cancelled) throw new RenderCancelled();
}

/** Has this child exited (by itself or by a signal)? */
const exited = (p: ChildProcess): boolean => p.exitCode !== null || p.signalCode !== null;

/** SIGTERM to this one child, then SIGKILL to the same object if it has not exited after `graceMs`. Node sends nothing
 *  once the child has exited and been reaped (its handle is gone), so a pid used again later is never signalled. */
export function stopChild(p: ChildProcess, graceMs = 4000): void {
  if (exited(p)) return;
  p.kill('SIGTERM');
  const t = setTimeout(() => { if (!exited(p)) p.kill('SIGKILL'); }, graceMs);
  t.unref?.();
  p.once('exit', () => clearTimeout(t));
}

/** Marks the job as asked to stop and stops every child it has running now. */
export function stopJob(j: JobProcs, graceMs = 4000): number {
  j.cancelled = true;
  let n = 0;
  for (const p of j.children) if (!exited(p)) { stopChild(p, graceMs); n++; }
  return n;
}
