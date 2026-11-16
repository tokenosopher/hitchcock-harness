// The file that goes out (14 Nov 2026, ASKS 56; the user: "we're going to be doing this kind of small version of the
// video … before putting them out on the social media platform … for all of the videos going forward"). Naming a
// final asks for its smaller file as one more companion (`companions.post`, final.ts buildFinal); this says, in one
// place, which file a platform sends and how the page says it. Pure: the platform page's File row, the by-hand save
// step, the ask's chip and the go card's file line (sendflow.ts, through PlatformSend.tsx useFinalInfo), the Release
// page's final column, and goCheck's wait all read it.
//   - no `post` (a final named before 14 Nov): the final, exactly as before;
//   - `post` is the final itself (the final is a smaller file already): the final;
//   - the smaller file done: it (it is only written when it passed its checks: the same frames, the sound copied,
//     smaller, SSIM 0.98 or more);
//   - being made (queued or rendering): the final is not sent yet; Post now and Schedule wait (goCheck);
//   - failed, came out no smaller, or not made: the final goes out, and the row says why; nothing waits;
//   - a platform already asked (or past it) keeps the file its ask recorded (`send.asked.file`; an ask without one,
//     made before 14 Nov, had the final).
import type { ReleaseFile } from './file';
import type { CompanionStatus } from './masters';

export interface OutFile {
  /** The file that goes out, relative to the film folder. */
  path: string;
  /** It is the smaller file of the final (or the final is one). */
  small: boolean;
  /** Its size, and the final's (the full one), when known. */
  bytes?: number;
  finalBytes?: number;
  /** The smaller file is being made: the final is not sent yet, the go waits. */
  making?: { state: 'queued' | 'running'; percent?: number };
  /** The smaller file was not made or not used: why, in plain words; the final goes out. */
  why?: string;
  /** The platform's ask recorded this file: it keeps it, whatever the companions do later. */
  kept?: boolean;
}

/** Which file goes out, for the release (`pid`: for that platform, which keeps the file of its ask). `companions`: the
 *  companions' states as GET …/release answers them; `finalBytes`: the final's own size. */
export function outFile(file: ReleaseFile, companions: CompanionStatus[] | undefined, finalBytes?: number, pid?: string): OutFile | undefined {
  const f = file.final;
  if (!f) return undefined;
  const post = f.companions.post;
  const st = companions?.find((c) => c.key === 'post');
  const plat = pid ? file.platforms.find((p) => p.id === pid) : undefined;
  if (plat?.send.asked) {
    const path = plat.send.asked.file ?? f.path;
    const small = path !== f.path || post?.path === f.path;
    return { path, small, bytes: path === f.path ? finalBytes : st?.bytes, finalBytes, kept: true };
  }
  if (!post) return { path: f.path, small: false, bytes: finalBytes };
  if (post.path === f.path) return { path: f.path, small: true, bytes: finalBytes };
  // the companions not read (a view without them): the final, as before, with nothing said
  if (!st) return { path: f.path, small: false, bytes: finalBytes };
  if (st.state === 'done' || st.state === 'same') return { path: post.path, small: true, bytes: st.bytes, finalBytes };
  if (st.state === 'queued' || st.state === 'running') return { path: f.path, small: false, bytes: finalBytes, making: { state: st.state, percent: st.percent } };
  return { path: f.path, small: false, bytes: finalBytes, why: whyNot(st) };
}

/** Why the final goes out instead of its smaller file, from the render's own words. */
function whyNot(st: CompanionStatus): string {
  const e = (st.error ?? '').trim();
  const no = /^the smaller file came out no smaller \(([^)]*)\)/i.exec(e);
  if (no) return `The smaller file came out no smaller (${no[1]}), so the final itself goes out.`;
  const lost = /^the smaller file lost too much: SSIM ([\d.]+)/i.exec(e);
  if (lost) return `The smaller file lost too much (SSIM ${lost[1]}), so the final itself goes out.`;
  if (st.state === 'failed') return 'The smaller file could not be made, so the final itself goes out.';
  return 'The smaller file was not made, so the final itself goes out.';
}

/** "60 MB", "1.4 GB". */
const mb = (b: number): string => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

/** The File row's quiet line under the file, and the hover text of its size: being made, why not, or which file it is. */
export function outWords(o: OutFile | undefined): { note?: string; title?: string } {
  if (!o) return {};
  if (o.making) return { note: o.making.state === 'running' ? `the smaller file is being made, ${Math.round(o.making.percent ?? 0)}%` : 'the smaller file is waiting to be made' };
  if (o.why) return { note: o.why };
  if (o.small && o.bytes !== undefined && o.finalBytes !== undefined && o.bytes !== o.finalBytes) return { title: `${mb(o.bytes)}, the smaller file of the ${mb(o.finalBytes)} final` };
  if (o.small) return { title: 'The smaller file of the final' };
  return {};
}
