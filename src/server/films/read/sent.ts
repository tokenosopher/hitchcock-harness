// The record of what was sent to the video model for one take (Flow v3.3 - 7 Takes, step 8):
// <G>-take<N>-sent.json beside the take, written at submission by the kit's tools/takes/record_sent.py. Its shape is
// that script's header. Read on request only (GET /api/films/[film]/sent): a prompt runs to 25,000 characters, too
// much for every FilmState frame. The scene reader only notes where the file is (TakeRef.sent).
import type { SentRecord, SentRef } from '../../types';
import { abs, asNumber, asRecord, asString, exists, readJson, type FilmCtx } from '../util';
import { whatOf } from './prompts';

/** A record's path, relative to the film folder: a "-sent.json" under generations/, blocks/ or elements/, nothing above. */
export function sentPathOk(rel: string): boolean {
  return /^(generations|blocks|elements)\/[^\0]+-sent\.json$/.test(rel) && !rel.split(/[\\/]/).includes('..');
}

const KINDS = ['VIDEO', 'IMAGE', 'AUDIO'] as const;
const NAME: Record<SentRef['kind'], string> = { VIDEO: 'Video', IMAGE: 'Image', AUDIO: 'Audio' };
const KNOWN = new Set(['mode', 'aspect_ratio', 'resolution', 'duration', 'draft', 'generate_audio', 'seed', 'count', 'use_unlim']);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

/** The record as written, made safe to show: every field checked, unknown ones dropped. Undefined when it is not a
 *  record of what was sent (no prompt text). `mediaList` is the media list it names, for each reference's words. */
export function parseSent(raw: unknown, rel: string, mediaList?: unknown): SentRecord | undefined {
  const j = asRecord(raw);
  const p = asRecord(j?.prompt);
  const text = asString(p?.text);
  if (!j || !p || text === undefined) return undefined;
  const s = asRecord(j.settings) ?? {};
  const listed = (asRecord(mediaList)?.media as unknown[] | undefined) ?? [];
  const counters: Record<string, number> = {};
  const refs: SentRef[] = [];
  for (const [i, v] of (Array.isArray(j.references) ? j.references : []).entries()) {
    const r = asRecord(v);
    if (!r) continue;
    const k = (asString(r.kind) ?? '').toUpperCase();
    const role = asString(r.role) ?? '';
    const kind: SentRef['kind'] = (KINDS as readonly string[]).includes(k) ? (k as SentRef['kind']) : /video/.test(role) ? 'VIDEO' : /audio/.test(role) ? 'AUDIO' : 'IMAGE';
    counters[kind] = (counters[kind] ?? 0) + 1;
    const n = asNumber(r.n) ?? counters[kind];
    const order = asNumber(r.order) ?? i + 1;
    const file = asString(r.file);
    const tag = asString(r.tag);
    const page = asNumber(r.page);
    // the media list's entry at the same place, when it is the same reference
    const m = asRecord(listed[order - 1]);
    const desc = m && (!tag || asString(m.tag) === tag) ? asString(m.desc) : undefined;
    refs.push({
      order, kind, n, label: `${kind} REFERENCE ${n}`, name: `${NAME[kind]} ${n}`, tag, file,
      what: file ? whatOf(file, kind, page) : 'not in the upload registry',
      ...(desc ? { desc } : {}),
      ...(r.view === true ? { view: true } : {}), ...(page !== undefined ? { page } : {}),
      ...(asString(r.uploaded) ? { uploaded: asString(r.uploaded) } : {}),
    });
  }
  // the media list writes another reference as {AUDIO:YOUNG THANE VOICE}; the prompt sent it as AUDIO REFERENCE 1
  for (const r of refs) {
    if (r.desc) r.desc = r.desc.replace(/\{(VIDEO|IMAGE|AUDIO):([^}]*)\}/g, (x, k: string, t: string) => refs.find((o) => o.kind === k && o.tag === t)?.label ?? x);
  }
  const more: [string, string][] = Object.entries(s)
    .filter(([key, v]) => !KNOWN.has(key) && v !== null && v !== undefined && typeof v !== 'object')
    .map(([key, v]) => [key, String(v)]);
  const lay = asRecord(j.layout);
  const sp = asRecord(j.spend);
  return {
    path: rel,
    take: asString(j.take) ?? rel.split('/').pop()!.replace(/-sent\.json$/, ''),
    jobId: asString(j.job_id),
    submitted: asString(j.submitted),
    model: asString(j.model),
    settings: {
      mode: asString(s.mode), aspect: asString(s.aspect_ratio), resolution: asString(s.resolution), duration: asNumber(s.duration),
      draft: bool(s.draft), audio: bool(s.generate_audio), seed: s.seed === null ? null : asNumber(s.seed),
      count: asNumber(s.count), unlim: bool(s.use_unlim), more,
    },
    settingsFrom: asString(j.settings_from),
    prompt: { file: asString(p.file), version: asString(p.version), text, chars: asNumber(p.chars) ?? text.length, sameAsFile: bool(p.same_as_file) },
    refs,
    layout: lay ? { previzTake: asString(lay.previz_take), previzTakeNumber: asNumber(lay.previz_take_number), storyboard: asString(lay.storyboard), storyboardVersion: asString(lay.storyboard_version) } : undefined,
    spend: sp ? { row: sp.row === true, cost: asString(sp.cost) } : undefined,
    differences: (Array.isArray(j.differences) ? j.differences : []).filter((d): d is string => typeof d === 'string'),
  };
}

/** Reads one take's record from the film folder, with each reference's words from the media list it names and a
 *  mark on any file no longer on disk. Undefined when there is no such file or it is not a record. */
export async function readSent(ctx: FilmCtx, rel: string): Promise<SentRecord | undefined> {
  if (!sentPathOk(rel)) return undefined;
  const raw = await readJson(ctx, rel);
  if (raw === undefined) return undefined;
  const ml = asString(asRecord(asRecord(raw)?.lists)?.media_list);
  const list = ml && !ml.split('/').includes('..') ? await readJson(ctx, ml) : undefined;
  const rec = parseSent(raw, rel, list);
  if (!rec) { ctx.warn.add(rel, 'not a record of what was sent (no prompt text)'); return undefined; }
  for (const r of rec.refs) if (r.file && !(await exists(abs(ctx, r.file)))) r.missing = true;
  return rec;
}
