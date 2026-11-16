// The current cut: which takes are in it, where, and how that was read. Sources, newest wins:
// the timeline files (an FCPXML export under edits/fcpxml/ or cut/, cut/resolve-build-*.json,
// cut/stitch-v*.json for the grey drafts, an ffmpeg concat list cut/*-list.txt), then spend.md's
// Resolve rows dated after that file ("S3 shot 4 replaced by the lamp pick-up take 2 (97 fr at 90189)"),
// and the render rows that say which timeline the delivered film is ("Resolve edit 7 render … of Grey
// draft 10 …, 4303 frames"). review/cards.json confirms the render's timeline when it names it.
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { CutInfo, CutPiece, CutSource, RecordAhead } from '../../types';
import type { SceneRefX, TakeRefX } from './scenes';
import { abs, asNumber, asRecord, asString, cells, isoDay, list, readJson, readText, statOf, VIDEO_RE, type FilmCtx } from '../util';
import { ffprobeBin } from '../../config';

const FFPROBE = ffprobeBin();

/** A stretch of one video file on a timeline, in frames from the timeline's first frame. */
interface Clip { file: string; at: number; frames: number; sourceIn?: number; over: boolean; shot?: string }

interface Timeline {
  rel: string;                       // the file, relative to the film folder
  kind: 'fcpxml' | 'resolve-build' | 'stitch' | 'concat';
  name?: string;                     // the timeline's own name, when the file has one
  mtime: number;
  day: string;                       // ISO day of the file
  fps: number;
  frames: number;                    // the timeline's length
  start: number;                     // its first frame number (01:00:00:00 = 86400 at 24 fps)
  clips: Clip[];
}

// ---- FCPXML

/** "47/3s" → 15.667, "3600s" → 3600. */
const rat = (v: string | undefined): number => {
  if (!v) return 0;
  const m = /^(-?\d+)(?:\/(\d+))?s?$/.exec(v.trim());
  return m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : 0;
};

const CLIPS = new Set(['asset-clip', 'clip', 'gap', 'ref-clip', 'sync-clip', 'mc-clip', 'title', 'video', 'audio']);

interface Node { tag: string; attrs: Record<string, string>; pos: number; start: number; lane?: number; inLane: boolean; hasVideo: boolean; file?: string; sourceIn?: number }

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
  return out;
}

/** The video clips of an FCPXML timeline: the primary storyline and the connected video above it
 *  (audio-only items and audio lanes are left out). Positions follow FCPXML's rule: a child's offset is in
 *  its parent's local time, so its timeline position is parent.pos + (offset − parent.start). */
function parseFcpxml(xml: string): { fps: number; start: number; frames: number; name?: string; clips: Clip[] } {
  const assets = new Map<string, { name?: string; hasVideo: boolean; file?: string }>();
  let fps = 24;
  let tcStart = 0;
  let seqDur = 0;
  let name: string | undefined;
  const clips: Clip[] = [];
  const stack: Node[] = [];
  let currentAsset: string | undefined;
  for (const m of xml.matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, selfClose] = m;
    if (close) {
      if (tag === 'asset') currentAsset = undefined;
      if (!CLIPS.has(tag)) continue;
      const n = stack.pop();
      if (n) finish(n);
      continue;
    }
    const a = attrsOf(rest);
    if (tag === 'format' && a.frameDuration) {
      const d = rat(a.frameDuration);
      if (d > 0 && !assets.size) fps = Math.round(1 / d);
    } else if (tag === 'asset' && a.id) {
      assets.set(a.id, { name: a.name, hasVideo: a.hasVideo === '1' });
      currentAsset = selfClose ? undefined : a.id;
    } else if (tag === 'media-rep' && currentAsset && a.src) {
      const asset = assets.get(currentAsset);
      if (asset) asset.file = decodeURIComponent(a.src.split('/').pop() ?? '');
    } else if (tag === 'project' && a.name) {
      name ??= a.name;
    } else if (tag === 'sequence') {
      tcStart = rat(a.tcStart);
      seqDur = rat(a.duration);
    }
    if (!CLIPS.has(tag)) continue;
    const parent = [...stack].reverse().find((x) => x.tag !== 'video' && x.tag !== 'audio');
    const offset = rat(a.offset);
    const start = rat(a.start);
    const pos = parent ? parent.pos + (offset - parent.start) : offset;
    const lane = a.lane !== undefined ? Number(a.lane) : undefined;
    const asset = a.ref ? assets.get(a.ref) : undefined;
    const node: Node = {
      tag, attrs: a, pos, start, lane, inLane: lane !== undefined || !!parent?.inLane,
      hasVideo: tag === 'asset-clip' ? !!asset?.hasVideo : false,
      file: asset?.file ?? asset?.name ?? a.name,
      sourceIn: start,
    };
    if ((tag === 'video') && stack.length) {
      // a <clip>'s picture: the clip carries the timing, the video names the file
      const owner = stack[stack.length - 1];
      owner.hasVideo = true;
      if (asset?.file || asset?.name) owner.file = asset.file ?? asset.name;
      owner.sourceIn = owner.start - offset + start;
    }
    if (selfClose) finish(node);
    else stack.push(node);
  }
  function finish(n: Node): void {
    if (n.tag !== 'asset-clip' && n.tag !== 'clip') return;
    if (!n.hasVideo || !n.file || !VIDEO_RE.test(n.file)) return;
    if (n.lane !== undefined && n.lane < 0) return;
    const dur = rat(n.attrs.duration);
    clips.push({ file: n.file, at: Math.round(n.pos * fps), frames: Math.round(dur * fps), sourceIn: n.sourceIn !== undefined ? Math.round(n.sourceIn * fps) : undefined, over: n.inLane });
  }
  const start = Math.round(tcStart * fps) || (clips.length ? Math.min(...clips.map((c) => c.at)) : 0);
  for (const c of clips) c.at -= start;
  const end = clips.reduce((x, c) => Math.max(x, c.at + c.frames), 0);
  return { fps, start, frames: seqDur ? Math.round(seqDur * fps) : end, name, clips };
}

// ---- concat lists (ffmpeg), probed for durations

const probeCache = new Map<string, { mtime: number; seconds?: number }>();
async function durationOf(file: string): Promise<number | undefined> {
  const st = await statOf(file);
  if (!st) return undefined;
  const hit = probeCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.seconds;
  const seconds = await new Promise<number | undefined>((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { signal: AbortSignal.timeout(8000) }, (err, out) => {
      const n = Number(String(out).trim());
      resolve(err || !Number.isFinite(n) ? undefined : n);
    });
  });
  probeCache.set(file, { mtime: st.mtimeMs, seconds });
  return seconds;
}

// ---- the timeline files

async function timelines(ctx: FilmCtx): Promise<Timeline[]> {
  const out: Timeline[] = [];
  const add = async (rel: string, kind: Timeline['kind'], read: () => Promise<Omit<Timeline, 'rel' | 'kind' | 'mtime' | 'day'> | undefined>): Promise<void> => {
    const st = await statOf(abs(ctx, rel));
    if (!st) return;
    try {
      const t = await read();
      if (t && t.clips.length) out.push({ ...t, rel, kind, mtime: st.mtimeMs, day: isoDay(st.mtime) });
      else if (!t) ctx.warn.add(rel, 'a cut file the cut reader could not read');
    } catch (e) {
      ctx.warn.add(rel, `could not be read as a cut (${(e as Error).message.slice(0, 60)})`);
    }
  };
  // FCPXML exports: a file, or a bundle folder with Info.fcpxml inside
  for (const dir of ['edits/fcpxml', 'cut', 'edits']) {
    for (const e of await list(abs(ctx, dir))) {
      if (!/\.fcpxml$/i.test(e.name)) continue;
      const rel = e.dir ? `${dir}/${e.name}/Info.fcpxml` : `${dir}/${e.name}`;
      await add(rel, 'fcpxml', async () => {
        const xml = await readText(abs(ctx, rel));
        if (!xml) return undefined;
        const t = parseFcpxml(xml);
        return { name: t.name, fps: t.fps, frames: t.frames, start: t.start, clips: t.clips };
      });
    }
  }
  for (const e of await list(abs(ctx, 'cut'))) {
    if (e.dir) continue;
    if (/^resolve-build.*\.json$/.test(e.name)) {
      await add(`cut/${e.name}`, 'resolve-build', async () => {
        const j = asRecord(await readJson(ctx, `cut/${e.name}`));
        if (!j || !Array.isArray(j.clips)) return undefined;
        const fps = asNumber(j.fps) ?? 24;
        const clips: Clip[] = j.clips.map(asRecord).filter((c): c is Record<string, unknown> => !!c).map((c) => ({
          file: (asString(c.path) ?? '').split('/').pop() ?? '', at: asNumber(c.record) ?? 0, frames: asNumber(c.frames) ?? 0, over: false,
        }));
        return { name: asString(j.timeline), fps, frames: asNumber(j.frames) ?? clips.reduce((x, c) => Math.max(x, c.at + c.frames), 0), start: 0, clips };
      });
    } else if (/^stitch-v\d+\.json$/.test(e.name)) {
      // the grey drafts: ten whole takes laid end to end (stitch-v5.json is grey draft 5)
      await add(`cut/${e.name}`, 'stitch', async () => {
        const j = await readJson(ctx, `cut/${e.name}`);
        if (!Array.isArray(j)) return undefined;
        const fps = 24;
        const clips: Clip[] = j.map(asRecord).filter((c): c is Record<string, unknown> => !!c).map((c) => {
          const inS = asNumber(c.film_in) ?? 0;
          const len = asNumber(c.out) ?? asNumber(c.clip_len) ?? 0;
          return { file: (asString(c.file) ?? '').split('/').pop() ?? '', at: Math.round(inS * fps), frames: Math.round(len * fps), sourceIn: 0, over: false };
        });
        return { name: `grey draft ${/v(\d+)/.exec(e.name)![1]}`, fps, frames: clips.reduce((x, c) => Math.max(x, c.at + c.frames), 0), start: 0, clips };
      });
    } else if (/\.txt$/.test(e.name)) {
      await add(`cut/${e.name}`, 'concat', async () => {
        const text = (await readText(abs(ctx, `cut/${e.name}`))) ?? '';
        const files = [...text.matchAll(/^\s*file\s+'([^']+)'/gm)].map((m) => m[1]);
        if (!files.length) return undefined;
        const fps = 24;
        const clips: Clip[] = [];
        let at = 0;
        for (const f of files) {
          const full = path.isAbsolute(f) ? f : abs(ctx, `cut/${f}`);
          const sec = await durationOf(full);
          const frames = Math.round((sec ?? 0) * fps);
          clips.push({ file: f.split('/').pop() ?? f, at, frames, sourceIn: 0, over: false });
          at += frames;
        }
        return { fps, frames: at, start: 0, clips };
      });
    }
  }
  return out.sort((a, b) => a.mtime - b.mtime);
}

// ---- spend.md's Resolve rows

interface EditRow { line: number; date: string; name: string; detail: string }
interface RenderRow { line: number; date: string; render: string; of: string; frames?: number; files: string[] }

async function resolveRows(ctx: FilmCtx): Promise<{ edits: EditRow[]; renders: RenderRow[]; all: { line: number; date: string; text: string }[] }> {
  const md = (await readText(abs(ctx, 'spend.md'))) ?? '';
  const edits: EditRow[] = [];
  const renders: RenderRow[] = [];
  const all: { line: number; date: string; text: string }[] = [];
  md.split('\n').forEach((raw, i) => {
    if (!raw.trim().startsWith('|')) return;
    const c = cells(raw);
    const date = /^\d{4}-\d\d-\d\d$/.exec(c[0] ?? '')?.[0];
    if (!date) return;
    const text = c.join(' | ');
    all.push({ line: i + 1, date, text });
    const ei = c.findIndex((x) => /^Resolve:\s*/.test(x));
    if (ei >= 0) edits.push({ line: i + 1, date, name: c[ei].replace(/^Resolve:\s*/, '').trim(), detail: c[ei + 1] ?? '' });
    const r = /\bResolve (edit \d+\w*) render\b/i.exec(text);
    const of = /render of (Grey draft \d+\w*|[^(|,]+?)(?: as it stands)?\s*[(|,]/i.exec(text);
    if (r && of) {
      const frames = /\b(\d{3,6}) frames\b/.exec(text)?.[1];
      renders.push({ line: i + 1, date, render: `Resolve ${r[1]}`, of: of[1].trim(), frames: frames ? Number(frames) : undefined, files: [...text.matchAll(/\bcut\/[^|`]+?\.mp4\b/g)].map((m) => m[0]) });
    }
  });
  return { edits, renders, all };
}

const SHOT_RE = /\b(S\d+) shots? ([\d+–-]+) replaced by the ([\w-]+(?: [\w-]+)*?) pick-up,? take (\d+)(?: \((\d+) fr at (\d+)\))?/i;

const fmtDay = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

// ---- membership

/** Fills SceneRef.inCut, cutSource and TakeRef.placement on the scenes in place; returns the film's cut. */
export async function readCut(ctx: FilmCtx, scenes: SceneRefX[], cutVideos: string[], masters: string[]): Promise<CutInfo | undefined> {
  const tls = await timelines(ctx);
  if (!tls.length) return undefined;
  const { edits, renders, all } = await resolveRows(ctx);

  // the delivered film names its timeline: the last render row
  const render = renders[renders.length - 1];
  const cutEdit = render ? [...edits].reverse().find((e) => e.name.toLowerCase().startsWith(render.of.toLowerCase())) : edits[edits.length - 1];
  const cutDate = cutEdit?.date ?? render?.date;
  // the base: the newest timeline file written no later than the cut's own Resolve row
  const usable = cutDate ? tls.filter((t) => t.day <= cutDate) : tls;
  const base = (usable.length ? usable : tls)[(usable.length ? usable : tls).length - 1];
  const clips: Clip[] = base.clips.map((c) => ({ ...c }));
  const from = [base.rel];
  let newest = base.day;
  const notes: string[] = [];

  // files → takes, by the take's own video or one of its variants (the "-aivoice4" mix of the same take)
  const byFile = new Map<string, { scene: SceneRefX; take: TakeRefX }>();
  for (const s of scenes) for (const t of s.takes) for (const p of [t.path, ...t.more.variants]) if (p) byFile.set(p.split('/').pop()!, { scene: s, take: t });

  // spend.md's Resolve rows after the base file, up to the cut's own row: the replacements they name
  const applied: EditRow[] = [];
  for (const e of edits) {
    if (e.date <= base.day || (cutEdit && e.line > cutEdit.line)) continue;
    const m = SHOT_RE.exec(e.detail);
    if (!m) continue;
    const [, sid, shot, subject, k, fr, atStr] = m;
    const scene = scenes.find((s) => s.id === sid);
    const word = subject.toLowerCase().replace(/\s+/g, '-');
    const pu = scene?.more.pickups.find((p) => p.name.toLowerCase() === `fix-${word}-${sid.toLowerCase()}`) ?? scene?.more.pickups.find((p) => p.name.toLowerCase().startsWith(`fix-${word}`));
    const take = pu ? scene!.takes.find((t) => t.more.folder === pu.folder && new RegExp(`take ${k}$`).test(t.id)) : undefined;
    if (!scene || !take?.path) {
      notes.push(`spend.md line ${e.line} names ${sid} ${subject} pick-up take ${k}, which the folders do not have`);
      continue;
    }
    const file = take.path.split('/').pop()!;
    const frames = fr ? Number(fr) : undefined;
    let at = atStr ? Number(atStr) : undefined;
    if (at !== undefined && at >= base.start) at -= base.start;
    if (at !== undefined && frames) {
      // cut the stretch it lands in: the replaced take keeps what is either side
      const hit = clips.find((c) => !c.over && c.at <= at! && at! < c.at + c.frames);
      if (hit) {
        const tail = hit.at + hit.frames - (at + frames);
        hit.frames = at - hit.at;
        if (tail > 0) clips.push({ ...hit, at: at + frames, frames: tail, sourceIn: hit.sourceIn !== undefined ? hit.sourceIn + (at + frames - hit.at) : undefined });
      }
      clips.push({ file, at, frames, sourceIn: 0, over: false, shot });
    } else {
      clips.push({ file, at: -1, frames: frames ?? 0, over: false, shot });
    }
    applied.push(e);
    newest = e.date > newest ? e.date : newest;
  }
  if (applied.length || cutEdit || render) from.unshift('spend.md');

  // review/cards.json confirms which timeline the delivered render came from
  const cutName = cutEdit?.name ?? render?.of ?? base.name ?? cutNameFromFile(base.rel);
  const cards = await readText(abs(ctx, 'review/cards.json'));
  if (cards && cutName && cards.includes(`Rendered from ${cutName}`)) from.push('review/cards.json');

  const fps = base.fps;
  const delivered = render?.frames;
  if (delivered && delivered !== base.frames)
    notes.push(`the positions come from ${base.rel} (${fmtDay(base.day)}, ${base.frames} frames); the delivered cut is ${delivered} frames, so they are approximate after that export except the frames spend.md names`);

  // per scene: the takes in the cut, in timeline order, with their pieces
  const source: CutSource = {
    cut: cutName,
    from: [...new Set(from)],
    date: newest > (cutDate ?? '') ? newest : cutDate ?? newest,
    label: '',
    note: notes.length ? notes.join('; ') : undefined,
  };
  source.label = `from ${source.from[0]} · ${fmtDay(source.date ?? base.day)}`;
  const unknown = new Set<string>();
  const per = new Map<SceneRefX, Map<TakeRefX, CutPiece[]>>();
  for (const c of clips.filter((x) => x.frames > 0 || x.at < 0).sort((a, b) => a.at - b.at)) {
    const hit = byFile.get(c.file);
    if (!hit) {
      unknown.add(c.file);
      continue;
    }
    if (!per.has(hit.scene)) per.set(hit.scene, new Map());
    const m = per.get(hit.scene)!;
    if (!m.has(hit.take)) m.set(hit.take, []);
    const piece: CutPiece = { at: c.at, frames: c.frames, sourceIn: c.sourceIn, over: c.over || undefined, shot: c.shot };
    const pieces = m.get(hit.take)!;
    if (!pieces.some((p) => p.at === piece.at && p.frames === piece.frames)) pieces.push(piece);
  }
  if (unknown.size) ctx.warn.add(base.rel, `${unknown.size} clip file${unknown.size === 1 ? '' : 's'} in the cut match no take: ${[...unknown].slice(0, 3).join(', ')}`);
  for (const s of scenes) {
    const m = per.get(s);
    if (!m) continue;
    const order = [...m].sort((a, b) => firstAt(a[1]) - firstAt(b[1]));
    s.inCut = order.map(([t]) => t.id).join(' + ');
    s.cutSource = source;
    s.more.cutSource = source;
    for (const [t, pieces] of order) {
      const shots = [...new Set(pieces.map((p) => p.shot).filter(Boolean))].join(', ') || undefined;
      t.placement = { cut: cutName, fps, pieces: pieces.filter((p) => p.at >= 0), shots, frames: pieces.reduce((n, p) => n + p.frames, 0) };
    }
  }

  // the render the cut became, and the delivered master
  const exists = new Set(cutVideos.concat(masters));
  const renderVideo = render?.files.find((f) => exists.has(f)) ?? (render ? cutVideos.find((v) => v.toLowerCase().includes(render.render.replace(/^Resolve /i, '').toLowerCase() + ' ')) : undefined)
    ?? (base.kind === 'concat' ? cutVideos.find((v) => sameStem(v, base.rel)) : undefined);
  const afterRender = render ? all.filter((r) => r.line >= render.line) : [];
  const master = afterRender.flatMap((r) => [...r.text.matchAll(/\bcut\/[^|`\s]*1080[^|`\s]*\.mp4\b/g)].map((m) => m[0])).find((f) => exists.has(f)) ?? (render ? masters.find((m) => /final/.test(m)) : undefined);
  return {
    name: cutName,
    fps,
    frames: delivered ?? base.frames,
    render: render?.render,
    video: renderVideo,
    master,
    source,
  };
}

const firstAt = (pieces: CutPiece[]): number => Math.min(...pieces.map((p) => (p.at < 0 ? Infinity : p.at)));

/** "cut/rough-v1-list.txt" → "rough assembly v1"-like names for a cut file with no name inside. */
function cutNameFromFile(rel: string): string {
  const stem = rel.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/-list$/, '');
  const v = /v(\d+)/.exec(stem)?.[1];
  const word = stem.replace(/-?v\d+/, '').replace(/[-_]+/g, ' ').trim();
  return `${word === 'rough' ? 'rough assembly' : word}${v ? ` v${v}` : ''}`;
}

/** The video a concat list was rendered to: same words and version ("rough-v1-list.txt" ↔ "DMA-rough-assembly-v1-480p.mp4"). */
function sameStem(video: string, listRel: string): boolean {
  const stem = listRel.split('/').pop()!.replace(/-list\.txt$/, '');
  const words = stem.split(/[-_]/).filter(Boolean);
  const name = video.split('/').pop()!.toLowerCase();
  return words.every((w) => name.includes(w.toLowerCase()));
}


// ---- the record ahead of the timeline

/** A cut the terminal workflow made that the harness's timeline has not taken in: the newest video directly in
 *  `cut/` (rough assemblies, drafts, Resolve exports, the final) or on a cut card in review/cards.json, when it
 *  is newer than the last time the timeline was written from the record. That time is the newest version by
 *  Alma or the migration: the user's own trims and undos in the harness do not bring the record in, so a later
 *  "undo: back to v1" does not hide ten newer assemblies (seen on a real film). A film whose versions are all the
 *  user's own is judged by the newest of them. Undefined when the film has no timeline version yet (then the
 *  record is the cut) or nothing is newer. The harness's own renders live in cut/renders/ and never count. */
export async function readRecordAhead(ctx: FilmCtx, cutVideos: string[]): Promise<RecordAhead | undefined> {
  const versions = (await list(abs(ctx, 'cut')))
    .map((e) => ({ name: e.name, n: e.dir ? NaN : Number(/^v(\d+)\.json$/.exec(e.name)?.[1]) }))
    .filter((v) => Number.isFinite(v.n))
    .sort((a, b) => b.n - a.n);
  const top = versions[0];
  if (!top) return undefined;
  // each version's own "at" (its mtime moves when the harness records a render in it) and who wrote it
  let tlTime: number | undefined;
  let topTime: number | undefined;
  for (const v of versions) {
    const j = asRecord(await readJson(ctx, `cut/${v.name}`));
    const at = Date.parse(asString(j?.at) ?? '');
    const time = Number.isFinite(at) ? at : (await statOf(abs(ctx, `cut/${v.name}`)))?.mtimeMs;
    if (time === undefined) continue;
    topTime ??= time;
    const by = asString(j?.by);
    if (by === 'alma' || by === 'migration') { tlTime = time; break; }
  }
  tlTime ??= topTime;
  if (tlTime === undefined) return undefined;

  const cands = new Map<string, { file: string; time: number; label?: string }>();
  for (const v of cutVideos) {
    if (!/^cut\/[^/]+$/.test(v)) continue;
    const st = await statOf(abs(ctx, v));
    if (st) cands.set(v, { file: v, time: st.mtimeMs });
  }
  // the cut cards: a video directly under cut/, labelled by the card's title ("Rough assembly v7 · …")
  const cards = asRecord(await readJson(ctx, 'review/cards.json'));
  const sections = Array.isArray(cards?.sections) ? cards.sections : [];
  for (const sec of sections) {
    const cardList = asRecord(sec)?.cards;
    for (const raw of Array.isArray(cardList) ? cardList : []) {
      const c = asRecord(raw);
      const file = asString(c?.file);
      const title = asString(c?.title) ?? '';
      if (!file || !/^cut\/[^/]+$/.test(file) || !VIDEO_RE.test(file) || !title) continue;
      const label = title.split(' · ')[0].trim().replace(/^\w/, (x) => x.toLowerCase());
      const known = cands.get(file);
      if (known) { known.label ??= label; continue; }
      const st = await statOf(abs(ctx, file));
      const time = st?.mtimeMs ?? Date.parse(asString(c?.updated) ?? '');
      if (Number.isFinite(time)) cands.set(file, { file, time, label });
    }
  }
  const newest = [...cands.values()].sort((a, b) => b.time - a.time)[0];
  if (!newest || newest.time <= tlTime) return undefined;
  return {
    file: newest.file,
    date: isoDay(new Date(newest.time)),
    label: newest.label ?? labelOfCutFile(newest.file, ctx.dir.split('/').pop() ?? ''),
    timeline: top.name.replace(/\.json$/, ''),
    timelineDate: isoDay(new Date(tlTime)),
  };
}

/** "cut/DMA-rough-assembly-v7-480p.mp4" → "rough assembly v7", "cut/<film-slug>-final-clean.mp4" → "final clean":
 *  the film's short code or slug and the size dropped. */
function labelOfCutFile(rel: string, slug: string): string {
  let stem = rel.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/\s*\(?\b\d{3,4}p\)?$/i, '').replace(/-$/, '');
  if (slug && stem.toLowerCase().startsWith(`${slug.toLowerCase()}-`)) stem = stem.slice(slug.length + 1);
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  while (words.length > 1 && /^[A-Z]{2,5}$/.test(words[0])) words.shift();
  return words.join(' ').toLowerCase();
}
