// Stages 10 and 11 (Finish): the 1080p path (Higgsfield upscale segments and joins under video/1080/, the master
// cut/*-1080-*.mp4, the frame checks), the sharpness A/B, the music, the captions and the master checks.
// Everything comes from the film folder and its record (spend.md, review/cards.json, taste.md); the masters
// are probed with ffprobe (header only). Facts the record states in prose are quoted with their source.
// Served by GET /api/films/[film]/finish; the Finish page reads it.
import path from 'node:path';
import type { FilmStateX } from '../state';
import { probe } from '../../edit/probe';
import { abs, asRecord, asNumber, asString, list, natCmp, readJson, readText, VIDEO_RE, Warnings, type FilmCtx } from '../util';
import { fileFact, findFact, findFacts, reviewSections, sentences, spendRows, srtFacts, type RecordFact, type RecordSource, type ReviewSection, type SpendRow } from './record';

export type { RecordFact } from './record';

/** A file of the film, relative to the film folder, with its size and date. */
export interface FileFact { path: string; bytes?: number; date?: string }

export interface UpscaleSegment {
  file: string;                 // video/1080/segments/seg-00.mp4
  start: number; end: number; frames: number; seconds?: number;
  upscaled?: string;            // the upscale's output (video/1080/upscale/seg-00-up.mp4)
  filled?: string;              // filled and cropped to the frame (seg-00-1080.mp4)
  status?: string;              // the batch log's word ("completed")
}

export interface FinishMaster extends FileFact {
  frames?: number; width?: number; height?: number; fps?: number; seconds?: number;
}

export interface SrtFact extends FileFact {
  role: 'sidecar' | 'burned' | 'source';
  cues: number; maxChars: number; seconds?: number;
  current: boolean;             // the newest of its role; the others are earlier passes
}

export interface MasterCheck { label: string; state: 'ok' | 'flag' | 'confirm' | 'unknown'; text: string; from?: string }

export interface FinishInfo {
  film: string;
  fps: number;
  cut?: { name: string; version?: string; render?: string; frames?: number; timelineFrames?: number; video?: string };
  upscale: {
    state: 'none' | 'split' | 'upscaling' | 'upscaled' | 'joined';
    source?: { path: string; frames?: number; fps?: number; width?: number; height?: number };
    segments: UpscaleSegment[];
    join?: { list: string; files: number };
    lastRun?: { date: string; what: string; cost?: string; service?: string };
    checks: { path: string; from: number; to: number; label?: string }[];
    notes: RecordFact[];
  };
  master?: FinishMaster;
  variants: (FinishMaster & { label: string; note?: RecordFact; applied?: boolean })[];
  sharpness?: { image?: string; imageLabel?: string; clips: { at: string; a: string; b: string }[]; note?: RecordFact; applied: boolean };
  music: {
    source?: { service: string; name?: string; date?: string; what: string; takes: { label: string; id?: string; url?: string; note?: string }[]; style?: string; note?: string };
    pick?: { what: string; pick: string; date: string };
    track?: { id: string; name: string; clips: { src: string; gain?: number }[] };
    inRender?: RecordFact;
    peak?: { value: number; unit: string; fact: RecordFact; earlier: RecordFact[] };
    stems: FileFact[];
  };
  captions: {
    srts: SrtFact[];
    words?: FileFact & { words: number };
    script?: FileFact & { lines: number };
    captioned: FileFact[];
    frames?: { path: string; label?: string };
    style?: RecordFact; place?: RecordFact; timing?: RecordFact;
    flags: RecordFact[];
  };
  checks: MasterCheck[];
  warnings: string[];
}

const DAY = (iso: string) => {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(iso);
  return m ? `${Number(m[2])} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[1]) - 1]}` : iso;
};
/** A spend row: each cell after the date is its own part (the cells are phrases, not sentences). */
export const spendSource = (r: SpendRow): RecordSource => ({ parts: r.cells.slice(1).flatMap((x) => sentences(x)), from: `spend.md · ${DAY(r.date)}`, date: r.date });
/** A review section: the sub and the cards' prose, sentence by sentence; markdown files shown as cards
 *  (the kit) are left out, they are read where they live. */
export const reviewSource = (s: ReviewSection): RecordSource => ({
  parts: [s.sub, ...s.cards.filter((c) => !/^\s*#/.test(c.text ?? '')).map((c) => c.text ?? '')].flatMap((x) => sentences(x)),
  from: `review/cards.json${s.date ? ` · ${DAY(s.date)}` : ''}`, date: s.date,
});

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** The fact with its short form, when the pattern finds one in it. */
const withValue = (f: RecordFact | undefined, re: RegExp): RecordFact | undefined => (f ? { ...f, value: re.exec(f.text)?.[1]?.trim() } : undefined);

/** Turns an absolute path inside the film folder (or on the drive) into one relative to the film folder. */
function relToFilm(p: string, ctx: FilmCtx, slug: string): string {
  if (p.startsWith(ctx.dir + '/')) return p.slice(ctx.dir.length + 1);
  const i = p.indexOf(`/films/${slug}/`);
  return i >= 0 ? p.slice(i + `/films/${slug}/`.length) : p;
}

/** The timeline's length in frames: the end of the last clip on a picture or sound track. */
function timelineFrames(s: FilmStateX): number | undefined {
  const tl = s.cut?.current;
  if (!tl) return undefined;
  let end = 0;
  for (const t of tl.tracks) {
    if (t.kind === 'captions') continue;
    for (const c of t.clips) end = Math.max(end, c.at + (c.out - c.in) / (c.speed || 1));
  }
  return end ? Math.round(end * tl.fps) : undefined;
}

export async function readFinish(s: FilmStateX): Promise<FinishInfo> {
  const warn = new Warnings();
  const ctx: FilmCtx = { dir: s.film.folder, warn };
  const slug = s.film.slug;
  const fps = s.cut?.fps ?? 24;
  const [rows, secs] = await Promise.all([spendRows(ctx), reviewSections(ctx)]);
  const newestRows = [...rows].sort((a, b) => natCmp(b.date, a.date) || b.line - a.line);
  // the record, newest first: spend rows, then the review sections (both carry dates)
  const sources = [...newestRows.map(spendSource), ...secs.map(reviewSource)].sort((a, b) => natCmp(b.date ?? '', a.date ?? ''));

  // ---- the 1080p path
  const segJson = asRecord(await readJson(ctx, 'video/1080/segments/segments.json'));
  const upDir = await list(abs(ctx, 'video/1080/upscale'));
  const upNames = new Set(upDir.filter((e) => !e.dir).map((e) => e.name));
  const batch = asRecord(await readJson(ctx, 'video/1080/upscale/batch-log.json')) ?? {};
  const segList = Array.isArray(segJson?.segments) ? segJson.segments : [];
  let segments: UpscaleSegment[] = segList.map((x) => {
    const r = asRecord(x) ?? {};
    const file = asString(r.file) ?? '';
    const stem = file.replace(/\.[^.]+$/, '');
    return {
      file: `video/1080/segments/${file}`,
      start: asNumber(r.start) ?? 0, end: asNumber(r.end) ?? 0, frames: asNumber(r.frames) ?? 0, seconds: asNumber(r.seconds),
      upscaled: upNames.has(`${stem}-up.mp4`) ? `video/1080/upscale/${stem}-up.mp4` : undefined,
      filled: upNames.has(`${stem}-1080.mp4`) ? `video/1080/upscale/${stem}-1080.mp4` : undefined,
      status: asString(asRecord(batch[stem])?.status),
    };
  });
  if (!segments.length) {
    // no segments.json: the upscale folder alone
    const stems = [...upNames].map((n) => /^(seg-\d+)-up\.mp4$/.exec(n)?.[1]).filter((x): x is string => !!x).sort(natCmp);
    segments = stems.map((stem) => ({ file: `video/1080/segments/${stem}.mp4`, start: 0, end: 0, frames: 0,
      upscaled: `video/1080/upscale/${stem}-up.mp4`, filled: upNames.has(`${stem}-1080.mp4`) ? `video/1080/upscale/${stem}-1080.mp4` : undefined,
      status: asString(asRecord(batch[stem])?.status) }));
  }
  const concat = await readText(abs(ctx, 'video/1080/upscale/concat.txt'));
  const join = concat !== undefined ? { list: 'video/1080/upscale/concat.txt', files: concat.split('\n').filter((l) => /^\s*file\s/.test(l)).length } : undefined;
  const renderAbs = asString(segJson?.render);
  const source = renderAbs ? { path: relToFilm(renderAbs, ctx, slug), frames: asNumber(segJson?.frames), fps: asNumber(segJson?.fps), width: asNumber(segJson?.width), height: asNumber(segJson?.height) } : undefined;
  const checks = (await list(abs(ctx, 'video/1080'))).filter((e) => !e.dir).map((e) => {
    const m = /^check-(\d+)-(\d+)\.(png|jpe?g)$/i.exec(e.name);
    return m ? { path: `video/1080/${e.name}`, from: Number(m[1]), to: Number(m[2]) } : undefined;
  }).filter((x): x is { path: string; from: number; to: number } => !!x).sort((a, b) => a.from - b.from);
  // the review page names each frame check ("frames 1255 to 1285 (52.3 to 53.5 s)")
  const itemLabel = (p: string) => secs.flatMap((x) => x.cards.flatMap((c) => c.items)).find((it) => it.file === p)?.label;
  const frameChecks = checks.map((c) => ({ ...c, label: itemLabel(c.path) }));

  const upRow = newestRows.find((r) => /upscale/i.test(r.text));
  const costCell = (r: SpendRow) => r.cells.slice(1).find((c) => /\$|\bcr\b|credits?\b/i.test(c) && c.length < 80);
  const lastRun = upRow ? { date: upRow.date, what: upRow.cells[1] ?? upRow.text, cost: costCell(upRow), service: 'Higgsfield upscale' } : undefined;

  // ---- the masters
  const masters = s.post?.masters ?? [];
  const probeMaster = async (rel: string): Promise<FinishMaster> => {
    const [st, pr] = await Promise.all([fileFact(abs(ctx, rel)), /\.(mp4|mov|m4v)$/i.test(rel) ? probe(abs(ctx, rel)) : Promise.resolve(undefined)]);
    return { path: rel, bytes: st?.bytes, date: st?.date, frames: pr?.video?.frames, width: pr?.video?.width, height: pr?.video?.height, fps: pr?.video?.fps, seconds: pr?.duration };
  };
  // the film's master by the one rule (read/master.ts): the newest full-size video the record vouches for
  const mainRel = s.master?.path;
  const master = mainRel ? await probeMaster(mainRel) : undefined;
  const cardFor = (rel: string) => {
    for (const sec of secs) for (const c of sec.cards) if (c.file === rel) return { sec, c };
    return undefined;
  };
  const variants = await Promise.all(masters.filter((m) => m !== mainRel && m.startsWith('cut/')).map(async (rel) => {
    const m = await probeMaster(rel);
    const hit = cardFor(rel);
    const label = /soft/i.test(rel) ? 'soft' : (/1080-([a-z]+)-/i.exec(rel)?.[1] ?? path.basename(rel));
    const note = hit?.c.text ? { text: sentences(hit.c.text).slice(0, 2).join(' '), from: `review/cards.json${hit.sec.date ? ` · ${DAY(hit.sec.date)}` : ''}`, date: hit.sec.date } : undefined;
    const applied = note ? !/not applied/i.test(hit?.c.text ?? '') : undefined;
    return { ...m, label, note, applied };
  }));

  // ---- the sharpness A/B (look/ab/ on the films that have it)
  const ab = await list(abs(ctx, 'look/ab'));
  let sharpness: FinishInfo['sharpness'];
  if (ab.length) {
    const img = ab.find((e) => /sharp|ab/i.test(e.name) && /\.(png|jpe?g)$/i.test(e.name));
    const clips = ab.filter((e) => /^src-/.test(e.name) && VIDEO_RE.test(e.name)).map((e) => {
      const at = e.name.replace(/^src-/, '').replace(/\.[^.]+$/, '');
      const other = ab.find((x) => x.name === `soft-${at}${path.extname(e.name)}`);
      return other ? { at, a: `look/ab/${e.name}`, b: `look/ab/${other.name}` } : undefined;
    }).filter((x): x is { at: string; a: string; b: string } => !!x);
    const imagePath = img ? `look/ab/${img.name}` : undefined;
    const note = findFact(/soft'? preset|0\.9 px|takes the upscale edge/i, sources);
    sharpness = { image: imagePath, imageLabel: imagePath ? itemLabel(imagePath) : undefined, clips, note, applied: variants.some((v) => v.label === 'soft' && v.applied) };
  }

  // ---- music
  const musicRows = newestRows.filter((r) => /\bmusic\b|\bsong\b|\bscore\b/i.test(r.cells.slice(1, 3).join(' ')) && !/removal|remove/i.test(r.text));
  const sourceRow = musicRows.find((r) => /higgsfield|music,/i.test(r.cells[1] ?? '')) ?? musicRows[0];
  const musicSec = secs.find((x) => /^music\b/i.test(x.heading));
  let musicSource: FinishInfo['music']['source'];
  if (sourceRow || musicSec) {
    const text = sourceRow?.text ?? musicSec?.heading ?? '';
    const ids = /clips?:\s*([0-9a-f]{8}(?:\s*,\s*[0-9a-f]{8})*)/i.exec(text)?.[1].split(/\s*,\s*/) ?? [];
    const takes = (musicSec?.cards ?? []).filter((c) => /^take\b/i.test(c.title ?? '')).map((c) => {
      const url = /https:\/\/[^\s)]+/.exec(c.title ?? '')?.[0];
      return { label: (c.title ?? '').split('·')[0].trim(), id: undefined, url, note: c.text?.replace(/^Style:\s*/, '').slice(0, 400) };
    });
    const fromIds = ids.map((id, i) => ({ label: `Take ${String.fromCharCode(65 + i)}`, id }));
    const merged = takes.length ? takes.map((t, i) => ({ ...t, id: t.id ?? fromIds[i]?.id })) : fromIds;
    const service = /\bhiggsfield\b/i.test(text) ? 'Higgsfield' : 'the record';
    const name = /\b(Loop \d+)\b/i.exec(text)?.[1] ?? /[‘'“"]([^’'”"]+)[’'”"]/.exec(musicSec?.heading ?? '')?.[1];
    musicSource = {
      service, name, date: sourceRow?.date ?? musicSec?.date, what: sourceRow?.cells[1] ?? musicSec?.heading ?? '',
      takes: merged, style: /^Style:\s*([\s\S]*)$/.exec(musicSec?.cards[0]?.text ?? '')?.[1]?.trim(),
      note: findFact(/nothing unlocked|not unlocked|not downloaded/i, [...(sourceRow ? [spendSource(sourceRow)] : []), ...(musicSec ? [reviewSource(musicSec), { parts: sentences(musicSec.sub), from: '' }] : [])])?.text,
    };
  }
  const musicPick = s.taste.find((t) => /music|song|track|score/i.test(t.what));
  const tl = s.cut?.current;
  const mt = tl?.tracks.find((t) => t.kind === 'audio' && /music|score/i.test(t.name));
  const peaks = findFacts(/peaks?\b[^.]*?[+\-−]?\d+(?:\.\d+)?\s*dB(?:FS|TP)/i, sources);
  const peakVal = (t: string) => {
    const m = /([+\-−]?\d+(?:\.\d+)?)\s*dB(FS|TP)/i.exec(t);
    return m ? { value: Number(m[1].replace('−', '-')), unit: `dB${m[2].toUpperCase()}` } : undefined;
  };
  const peakFact = peaks[0];
  const pv = peakFact ? peakVal(peakFact.text) : undefined;
  const stems = (await Promise.all((await list(abs(ctx, 'social'))).filter((e) => !e.dir && /stem/i.test(e.name) && /\.(wav|mp3|m4a)$/i.test(e.name))
    .map(async (e) => ({ path: `social/${e.name}`, ...(await fileFact(abs(ctx, `social/${e.name}`))) }))));

  // ---- captions
  const srtFiles = [
    ...(await list(abs(ctx, 'social'))).filter((e) => !e.dir && /\.srt$/i.test(e.name)).map((e) => `social/${e.name}`),
    ...(await list(abs(ctx, 'subtitles'))).filter((e) => !e.dir && /\.srt$/i.test(e.name)).map((e) => `subtitles/${e.name}`),
  ];
  const srts: SrtFact[] = [];
  for (const rel of srtFiles) {
    const text = (await readText(abs(ctx, rel))) ?? '';
    const role: SrtFact['role'] = rel.startsWith('subtitles/') ? 'source' : /-w\d+\.srt$/i.test(rel) ? 'burned' : 'sidecar';
    srts.push({ path: rel, role, ...srtFacts(text), ...(await fileFact(abs(ctx, rel))), current: false });
  }
  for (const role of ['sidecar', 'burned', 'source'] as const) {
    const newest = srts.filter((x) => x.role === role).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.path.length - a.path.length)[0];
    if (newest) newest.current = true;
  }
  srts.sort((a, b) => Number(b.current) - Number(a.current) || (b.date ?? '').localeCompare(a.date ?? ''));
  const wordFiles = [
    ...(await list(abs(ctx, 'social'))).filter((e) => !e.dir && /words\.json$/i.test(e.name)).map((e) => `social/${e.name}`),
    ...(await list(abs(ctx, 'subtitles'))).filter((e) => !e.dir && /words\.json$/i.test(e.name)).map((e) => `subtitles/${e.name}`),
  ];
  let words: FinishInfo['captions']['words'];
  for (const rel of wordFiles) {
    const j = await readJson<unknown>(ctx, rel);
    const arr = Array.isArray(j) ? j : Array.isArray(asRecord(j)?.words) ? (asRecord(j)!.words as unknown[]) : [];
    const n = arr.filter((w) => asString(asRecord(w)?.type) !== 'spacing').length;
    const st = await fileFact(abs(ctx, rel));
    if (!words || (st?.date ?? '') > (words.date ?? '')) words = { path: rel, words: n, ...st };
  }
  const scriptJ = await readJson<unknown>(ctx, 'social/script.json');
  const script = Array.isArray(scriptJ) ? { path: 'social/script.json', lines: scriptJ.length, ...(await fileFact(abs(ctx, 'social/script.json'))) } : undefined;
  const socialFiles = (await list(abs(ctx, 'social'))).filter((e) => !e.dir);
  const captioned = (await Promise.all(socialFiles.filter((e) => /captioned/i.test(e.name) && VIDEO_RE.test(e.name))
    .map(async (e) => ({ path: `social/${e.name}`, ...(await fileFact(abs(ctx, `social/${e.name}`))) }))))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.bytes ?? 0) - (a.bytes ?? 0));
  const frameImgs = (await Promise.all(socialFiles.filter((e) => /^captioned-frames/i.test(e.name)).map(async (e) => ({ path: `social/${e.name}`, ...(await fileFact(abs(ctx, `social/${e.name}`))) }))))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const framesImg = frameImgs[0] ? { path: frameImgs[0].path, label: itemLabel(frameImgs[0].path) } : undefined;
  // a flag is its own clause: what follows the first full stop in the same sentence is another matter ("the upscale cost about 90 credits")
  const capFlags = [findFact(/widest (?:caption )?line/i, sources)].filter((x): x is RecordFact => !!x).map((f) => ({ ...f, text: capFirst(f.text.split(/\.\s+/)[0].replace(/\.$/, '')) + '.' }));

  // ---- the checks on the master
  const checksOut: MasterCheck[] = [];
  const cutFrames = s.cut?.frames;
  const tlFrames = timelineFrames(s);
  if (master) {
    if (master.frames !== undefined && cutFrames !== undefined) {
      const same = master.frames === cutFrames;
      checksOut.push({ label: 'Length', state: same ? 'ok' : 'flag', text: same
        ? `${master.frames} frames, the same as ${s.cut?.render ?? 'the cut'} (${cutFrames} in the record).`
        : `The master has ${master.frames} frames; ${s.cut?.render ?? 'the cut'} has ${cutFrames} in the record.`, from: 'ffprobe · spend.md' });
    } else if (master.frames !== undefined) {
      checksOut.push({ label: 'Length', state: 'unknown', text: `${master.frames} frames; the record gives no frame count for the cut to compare with.`, from: 'ffprobe' });
    }
    if (tlFrames !== undefined && master.frames !== undefined && tlFrames !== master.frames)
      checksOut.push({ label: 'Timeline', state: 'confirm', text: `The Edit timeline (cut/${tl?.version}.json) runs ${tlFrames} frames, ${tlFrames > master.frames ? 'longer' : 'shorter'} than the master's ${master.frames}: its positions are approximate where the migration says so.`, from: `cut/${tl?.version}.json` });
  }
  if (peakFact && pv) {
    const clips = pv.unit === 'dBFS' ? pv.value > 0 : pv.value > -1;
    checksOut.push({ label: 'Loudness peak', state: clips ? 'flag' : 'ok', text: `The mix peaks at ${pv.value > 0 ? '+' : ''}${pv.value} ${pv.unit}${clips ? (pv.unit === 'dBFS' ? ', over full scale, so it clips. The record gives a sample peak, not a true peak in dBTP.' : ', over −1 dBTP.') : '.'}`, from: peakFact.from });
  } else if (master) {
    checksOut.push({ label: 'Loudness peak', state: 'unknown', text: 'Not in the record: no true-peak reading of the mix yet.' });
  }
  const survey = findFact(/shot survey/i, sources);
  const blacks = findFact(/^Blacks?:/i, sources);
  const warmth = findFact(/^Warmth\b|R-G \d|R−G \d/i, sources);
  const noGrade = findFact(/no grade|nothing to grade|no per-shot fix/i, sources);
  if (survey || blacks) checksOut.push({ label: 'Black level and warmth', state: noGrade ? 'ok' : 'unknown',
    text: [survey?.text.replace(/\s*\(black level, brightness, warmth\)/, ''), blacks?.text, warmth?.text, noGrade && noGrade.text !== survey?.text ? noGrade.text : ''].filter(Boolean).join('. ').replace(/\.\./g, '.'), from: (survey ?? blacks)!.from });
  const edges = findFact(/^Edges\b|black line from the upscale/i, sources);
  if (edges) checksOut.push({ label: 'Edges', state: /\bno\b/i.test(edges.text) ? 'ok' : 'unknown', text: capFirst(edges.text.replace(/^Edges:\s*/i, '')), from: edges.from });
  const align = findFact(/offset 0/i, sources) ?? findFact(/frame-exact/i, sources);
  if (align) checksOut.push({ label: 'Alignment', state: 'ok', text: capFirst(align.text.replace(/^Alignment:\s*/i, '')), from: align.from });
  const detector = findFact(/cut detector/i, sources);
  if (detector) checksOut.push({ label: 'Cut detector', state: /not flicker/i.test(detector.text) ? 'ok' : 'confirm', text: capFirst(detector.text), from: detector.from });

  const upState: FinishInfo['upscale']['state'] = master && /1080/.test(master.path) ? 'joined'
    : segments.length && segments.every((x) => x.filled || x.upscaled) ? 'upscaled'
      : segments.some((x) => x.upscaled) ? 'upscaling' : segments.length ? 'split' : 'none';

  return {
    film: slug,
    fps,
    cut: s.cut ? { name: s.cut.name, version: tl?.version, render: s.cut.render, frames: cutFrames, timelineFrames: tlFrames, video: s.cut.video } : undefined,
    upscale: {
      state: upState, source, segments, join, lastRun, checks: frameChecks,
      notes: [findFact(/1088x1936|filled and cropped/i, sources)].filter((x): x is RecordFact => !!x),
    },
    master,
    variants,
    sharpness,
    music: {
      source: musicSource,
      pick: musicPick ? { what: musicPick.what, pick: musicPick.pick, date: musicPick.date } : undefined,
      track: mt ? { id: mt.id, name: mt.name, clips: mt.clips.map((c) => ({ src: c.src ?? '', gain: c.gain })) } : undefined,
      inRender: findFact(/with (?:the user's|your) music|added music|music.*in Resolve/i, sources),
      peak: peakFact && pv ? { ...pv, fact: peakFact, earlier: peaks.slice(1).filter((p) => peakVal(p.text)?.value !== pv.value) } : undefined,
      stems,
    },
    captions: {
      srts, words, script, captioned, frames: framesImg,
      style: withValue(findFact(/Poppins|warm gold/i, sources), /(Poppins[^;)]*?)(?:[;)]|\.$|$)/),
      place: withValue(findFact(/bottom-anchored/i, sources), /(bottom-anchored at [\d.]+)/),
      timing: findFact(/SRT holds|timing unchanged/i, sources),
      flags: capFlags,
    },
    checks: checksOut,
    warnings: warn.list,
  };
}
