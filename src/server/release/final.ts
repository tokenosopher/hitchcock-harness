// Naming the final (Release, 14 Nov 2026): the masters on offer with their four fact rows, the final built from the
// one the user names, and its companions asked of the app's own render queue (nothing is spent): the copy without
// subtitles (the subtitles track left out, as "More renders" does), the smaller file for posting, and the subtitle
// file written from the Subtitles track's lines (subs.ts linesToSrt) beside the renders. Never writes over a file.
// The 480p preview is a companion too, but it is not made by naming: the Release page shows it "not made" with "Make it"; one already on disk is shown as before.
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../actions/film';
import type { FilmMaster, RenderOptions, RenderState, Timeline, TimelineClip } from '../types';
import { renderFiles } from '../edit/render-files';
import { probe } from '../edit/probe';
import { masterStaleness, queueRender, renderStates, variantBase } from '../edit/render';
import { optionsTag } from '../edit/render-options';
import { logWrite, readVersion, RENDERS_DIR, resolveSrc, timelineLength } from '../edit/timeline';
import { cuesToLines, isLine, isSrtClip, linesToSrt, srtClipCues } from '@/components/edit/subs';
import { sameCut } from '@/components/edit/sameCut';
import { fileWords, type RenderFile } from '@/components/edit/renderList';
import type { ReleaseFinal } from '@/components/release/file';
import { COMPANION_LABEL, finalNames, masterRows, type CompanionStatus, type MasterFacts, type MasterOption } from '@/components/release/masters';

/** The subtitle lines of a version (captions tracks not muted), as text lines in cut time; `.srt` clips read. */
export async function subtitleLines(film: FilmTarget, t: Timeline): Promise<TimelineClip[]> {
  const out: TimelineClip[] = [];
  for (const tr of t.tracks) {
    if (tr.kind !== 'captions' || tr.muted) continue;
    for (const c of tr.clips) {
      if (c.muted) continue;
      if (isLine(c)) out.push(c);
      else if (isSrtClip(c)) {
        const abs = resolveSrc(film, c.src!);
        const text = abs ? await fs.readFile(abs, 'utf8').catch(() => '') : '';
        out.push(...cuesToLines(srtClipCues(c, text), t.fps));
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
const captionIds = (t: Timeline): string[] => t.tracks.filter((x) => x.kind === 'captions' && !x.muted && x.clips.length).map((x) => x.id);

/** What a master is made of, from its render's file and its version. */
async function factsOf(film: FilmTarget, f: { options?: RenderOptions; picture?: RenderFile['picture']; seconds?: number; bytes?: number; small?: RenderFile['small'] }, t: Timeline): Promise<MasterFacts> {
  const left = new Set(f.options?.leaveOut?.tracks ?? []);
  const caps = captionIds(t);
  const audio = t.tracks.filter((x) => x.kind === 'audio' && !x.muted && x.clips.length);
  return {
    picture: f.picture, lines: (await subtitleLines(film, t)).length, subtitlesLeft: caps.length > 0 && caps.every((id) => left.has(id)),
    sound: audio.map((x) => x.name), soundLeft: audio.filter((x) => left.has(x.id)).map((x) => x.name),
    lufs: f.options?.loudness?.lufs, seconds: f.seconds ?? timelineLength(t), width: t.width, height: t.height, bytes: f.bytes,
    ...(f.small ? { fromBytes: f.small.fromBytes } : {}),
  };
}

/** The masters on offer, newest first: every master the app rendered that is a whole film (the plain master of each
 *  version, the newest of its number, and "More renders" files at full size with picture and sound), and the film's
 *  master from the record when the app did not make it. Each with its four rows; the newest master of each version
 *  says when it is out of date. */
export async function listMasters(film: FilmTarget, current: Timeline | undefined, outside?: FilmMaster): Promise<MasterOption[]> {
  const files = (await renderFiles(film)).filter((f) => f.kind === 'master' && !f.earlier && /\.mp4$/i.test(f.path) && !/\.picture\.mp4$/i.test(f.path)
    && (!f.tag || f.path === `${variantBase(f.version, 'master', f.tag)}.mp4`));
  const versions = new Map<string, Timeline | undefined>();
  const tl = async (v: string) => { if (!versions.has(v)) versions.set(v, await readVersion(film, v).catch(() => undefined)); return versions.get(v); };
  const cutNow = current ? { seconds: timelineLength(current), lines: (await subtitleLines(film, current)).length } : { lines: 0 };
  const out: MasterOption[] = [];
  // of the cut now: of its version, or of one whose content is the same (ASKS 49, sameCut.ts)
  const isNow = (t: Timeline) => !!current && (t.version === current.version || sameCut(t, current));
  for (const f of files) {
    const t = await tl(f.version);
    if (!t) continue;
    const words = fileWords(f, t.width, t.height);
    const stale = !f.tag ? await masterStaleness(film, f.version).then((a) => (a.state === 'stale' && a.path === f.path ? a.reason : undefined), () => undefined) : undefined;
    out.push({ path: f.path, version: f.version, title: `Master of ${f.version}${words.extra ? ` · ${words.extra}` : ''}`, at: f.at, bytes: f.bytes, ...(f.small ? { fromBytes: f.small.fromBytes } : {}), seconds: f.seconds,
      rows: masterRows(await factsOf(film, f, t), cutNow), ...(stale ? { stale } : {}), current: isNow(t), still: f.path });
  }
  if (outside && !out.some((m) => m.path === outside.path)) {
    const t = outside.version ? await tl(outside.version) : undefined;
    const st = await fs.stat(path.join(film.dir, outside.path)).catch(() => undefined);
    if (t && st) {
      const rows = masterRows(await factsOf(film, { bytes: st.size }, t), cutNow);
      rows[0] = { label: 'Picture', text: outside.card?.title ? `made outside the app (${outside.card.title})` : 'made outside the app', warn: false };
      out.push({ path: outside.path, version: t.version, title: `Master of ${t.version}`, at: outside.date, bytes: st.size, seconds: timelineLength(t), rows, current: isNow(t), still: outside.path });
    }
  }
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** The final for a master the user named, with where its companions will be. A string: why it cannot be the final. */
export async function buildFinal(film: FilmTarget, master: MasterOption, options: RenderOptions | undefined, now: Date): Promise<ReleaseFinal | string> {
  if (master.stale) return `The master of ${master.version} is out of date: ${master.stale}. Render it again in the Renders tab first.`;
  const t = await readVersion(film, master.version).catch(() => undefined);
  if (!t) return `Cut ${master.version} cannot be read.`;
  // the companions follow the final's options: a smaller final (ASKS 56) has a smaller copy without subtitles too;
  // the 480p phone copy is small already and takes the rest of them (the smaller file is of the master only)
  const phoneOwn: RenderOptions = { ...(options?.loudness ? { loudness: options.loudness } : {}), ...(options?.leaveOut ? { leaveOut: options.leaveOut } : {}) };
  const own: RenderOptions = { ...phoneOwn, ...(options?.small ? { small: true as const } : {}) };
  const hasOwn = Object.keys(phoneOwn).length > 0;
  const lines = await subtitleLines(film, t);
  const caps = captionIds(t).filter((id) => !(own.leaveOut?.tracks ?? []).includes(id));
  const companions: ReleaseFinal['companions'] = {};
  if (lines.length && caps.length) {
    const clean: RenderOptions = { ...own, leaveOut: { ...(own.leaveOut ?? {}), tracks: [...(own.leaveOut?.tracks ?? []), ...caps] } };
    companions.clean = { path: `${variantBase(master.version, 'master', optionsTag(clean))}.mp4`, options: clean as Record<string, unknown> };
    companions.srt = { path: `${RENDERS_DIR}/${master.version}.srt` };
  } else {
    companions.clean = { path: master.path };
  }
  companions.phone = hasOwn
    ? { path: `${variantBase(master.version, 'proxy', optionsTag(phoneOwn))}.mp4`, options: phoneOwn as Record<string, unknown> }
    : { path: `${RENDERS_DIR}/${master.version}-proxy.mp4` };
  // the file that goes out (ASKS 56, outfile.ts): the final's smaller file, made by itself on naming; the final
  // itself when it is a smaller file already
  const post: RenderOptions = { ...own, small: true };
  companions.post = options?.small ? { path: master.path } : { path: `${variantBase(master.version, 'master', optionsTag(post))}.mp4`, options: post as Record<string, unknown> };
  return { path: master.path, version: master.version, namedAt: now.toISOString(), name: finalNames(film.title).final, companions };
}

/** The render options a master on offer was made with (none for the plain master). */
export async function optionsOf(film: FilmTarget, p: string): Promise<RenderOptions | undefined> {
  return (await renderFiles(film)).find((f) => f.path === p)?.options;
}

/** Asks the render queue for the companions that do not exist yet, and writes the subtitle file. Not the 480p preview
 * : that one only when the user asks for it on the Release page ("Make it", POST …/cut/render). */
export async function queueCompanions(film: FilmTarget, final: ReleaseFinal): Promise<void> {
  const v = final.version;
  const { clean, srt, post } = final.companions;
  // the smaller file first: it is the one that goes out (a final named before 14 Nov has none, and nothing is asked)
  if (post && post.path !== final.path) await queueRender(film.slug, v, 'master', { options: post.options as RenderOptions }).catch(() => undefined);
  if (clean && clean.path !== final.path) await queueRender(film.slug, v, 'master', { options: clean.options as RenderOptions }).catch(() => undefined);
  if (srt) await writeSrt(film, v, srt.path).catch(() => undefined);
}

/** The subtitle file of a version, from its lines; never over a file that is there. */
export async function writeSrt(film: FilmTarget, version: string, rel: string): Promise<boolean> {
  const dest = path.join(film.dir, rel);
  try { await fs.access(dest); return false; } catch { /* not there yet */ }
  const t = await readVersion(film, version);
  const text = linesToSrt(await subtitleLines(film, t), t.fps);
  if (!text.trim()) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text);
  try { await fs.copyFile(tmp, dest, constants.COPYFILE_EXCL); } finally { await fs.unlink(tmp).catch(() => undefined); }
  await logWrite(`release ${version} subtitles`, 'write', film.show(dest), 'the subtitle file of the final, from the Subtitles track');
  return true;
}

/** Where each companion is: done (with its size), rendering, failed, cancelled, or not asked for. */
export async function companionStatus(film: FilmTarget, final: ReleaseFinal): Promise<CompanionStatus[]> {
  const out: CompanionStatus[] = [];
  const states = await renderStates(film, final.version).catch(() => ({} as Awaited<ReturnType<typeof renderStates>>));
  const size = (rel: string) => fs.stat(path.join(film.dir, rel)).then((s) => s.size, () => undefined);
  for (const key of ['clean', 'phone', 'srt', 'post'] as const) {
    const c = final.companions[key];
    const label = COMPANION_LABEL[key];
    if (!c) continue;
    if ((key === 'clean' || key === 'post') && c.path === final.path) { out.push({ key, label, path: c.path, state: 'same', bytes: await size(c.path) }); continue; }
    const bytes = await size(c.path);
    if (bytes !== undefined) { out.push({ key, label, path: c.path, state: 'done', bytes }); continue; }
    let st: RenderState | undefined;
    if (key !== 'srt') {
      const kind = key === 'clean' || key === 'post' ? 'master' : 'proxy';
      st = c.options ? states.variants?.find((x) => x.kind === kind && x.tag === optionsTag(c.options as RenderOptions)) : kind === 'proxy' ? states.proxy : undefined;
    }
    out.push({ key, label, path: c.path, state: st && st.state !== 'done' ? st.state : 'none', percent: st?.percent, error: st?.error });
  }
  return out;
}

/** The final's own file: its size (a smaller file's: with its source's), and its version's length and picture size. */
export async function finalFacts(film: FilmTarget, final: ReleaseFinal): Promise<{ bytes?: number; seconds?: number; width?: number; height?: number; fromBytes?: number; fps?: number }> {
  const bytes = await fs.stat(path.join(film.dir, final.path)).then((s) => s.size, () => undefined);
  const t = await readVersion(film, final.version).catch(() => undefined);
  // a smaller file (ASKS 56): the size of the render it was made from, said beside its own
  const small = /-small\.mp4$/.test(final.path) ? (await renderFiles(film).catch(() => [])).find((f) => f.path === final.path)?.small : undefined;
  // its frame rate, read from the file itself (the frame-by-frame cover picker), else the cut's
  const fps = (await probe(path.join(film.dir, final.path)).catch(() => undefined))?.video?.fps ?? t?.fps;
  return { bytes, ...(t ? { seconds: timelineLength(t), width: t.width, height: t.height } : {}), ...(small ? { fromBytes: small.fromBytes } : {}), ...(fps ? { fps } : {}) };
}
