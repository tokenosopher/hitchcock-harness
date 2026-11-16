// qc/ → every QC report the critic wrote (recipes/qc-critic.md), one file per round:
// qc/<stage>-<target>-r<n>.json. Grouped per (stage, target), rounds in order; the latest is the one the chip reads.
// Tolerant: a broken file is a warning, a missing field gets a safe default, an unknown category falls back
// to the group its sub-category names.
import type { QCEntry, QCMiss, QCReport } from '../../types';
import { qcCategoryOf } from '../../../lib/qc';
import { abs, asNumber, asRecord, asString, list, readJson, type FilmCtx } from '../util';

const FILE = /^([a-z]+)-(.+)-r(\d+)\.json$/;

function toMiss(v: unknown, i: number): QCMiss | undefined {
  const m = asRecord(v);
  if (!m) return undefined;
  const finding = asString(m.finding);
  if (!finding) return undefined;
  const sub = asString(m.sub) ?? asString(m.category) ?? '';
  const evidence = Array.isArray(m.evidence)
    ? m.evidence.map(asRecord).filter((e): e is Record<string, unknown> => !!e && typeof e.path === 'string')
      .map((e) => ({ path: e.path as string, note: asString(e.note) ?? '' }))
    : undefined;
  const fixedIn = asString(m.fixedIn);
  return {
    id: asString(m.id) ?? `m${i + 1}`,
    category: qcCategoryOf(asString(m.category) ?? sub),
    sub,
    finding,
    fix: asString(m.fix) ?? '',
    fixedIn,
    open: typeof m.open === 'boolean' ? m.open : !fixedIn,
    evidence,
    where: asString(m.where),
    title: asString(m.title),
    risk: asString(m.risk),
  };
}

function toReport(v: unknown, file: string, fromName: { stage: string; target: string; round: number }): QCReport | undefined {
  const r = asRecord(v);
  if (!r) return undefined;
  const score = asNumber(r.score);
  const inputs = Array.isArray(r.inputs)
    ? r.inputs.map(asRecord).filter((x): x is Record<string, unknown> => !!x && typeof x.path === 'string')
      .map((x) => ({ path: x.path as string, sha1: asString(x.sha1) ?? '' }))
    : [];
  return {
    stage: asString(r.stage) ?? fromName.stage,
    target: asString(r.target) ?? fromName.target,
    label: asString(r.label),
    round: asNumber(r.round) ?? fromName.round,
    score: score === undefined ? null : Math.max(0, Math.min(10, score)),
    model: asString(r.model) ?? '',
    at: asString(r.at) ?? '',
    inputs,
    misses: (Array.isArray(r.misses) ? r.misses : []).map(toMiss).filter((m): m is QCMiss => !!m),
    next: asString(r.next) ?? '',
    locked: typeof r.locked === 'boolean' ? r.locked : undefined,
    file,
  };
}

export const qcKey = (stage: string, target: string): string => `${stage}-${target}`;

/** Every report in qc/, grouped per (stage, target) with the rounds in order. */
export async function readQC(ctx: FilmCtx): Promise<Record<string, QCEntry> | undefined> {
  const files = (await list(abs(ctx, 'qc'))).filter((e) => !e.dir && FILE.test(e.name));
  if (!files.length) return undefined;
  const groups = new Map<string, QCReport[]>();
  await Promise.all(files.map(async (e) => {
    const m = FILE.exec(e.name)!;
    const rel = `qc/${e.name}`;
    const json = await readJson(ctx, rel);
    if (json === undefined) return; // readJson has warned
    const report = toReport(json, rel, { stage: m[1], target: m[2], round: Number(m[3]) });
    if (!report) { ctx.warn.add(rel, 'not a QC report'); return; }
    const k = qcKey(report.stage, report.target);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(report);
  }));
  const out: Record<string, QCEntry> = {};
  for (const [key, reports] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const history = reports.sort((a, b) => a.round - b.round || a.at.localeCompare(b.at));
    const latest = history[history.length - 1];
    out[key] = { key, stage: latest.stage, target: latest.target, latest, history };
  }
  return out;
}
