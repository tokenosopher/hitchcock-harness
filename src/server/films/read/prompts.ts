// The go for the video: per scene, the newest prompt with its text, its diff to the version before, the check's
// verdict and the media list as it will be sent (every reference at its number), the shots, and the credits the
// generation would cost at the rate spend.md shows for seedance_2_5 at that resolution. Read on request only
// (GET /api/films/[film]/go): prompt texts run to 25,000 characters, too much for every FilmState frame.
import type { GoCheck, GoDiffOp, GoMediaItem, GoPrompt, GoRate, GoReview, GoScene, GoShot } from '../../types';
import type { SceneRefX } from './scenes';
import type { SpendLineX } from './spend';
import { abs, asNumber, asRecord, asString, exists, natCmp, readJson, readText, type FilmCtx } from '../util';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-08" → "8 Nov". */
const fmtDay = (iso: string): string => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : iso; };

/** The check file: its first line is the summary, its verdict the last PASS or "<n> STOP(S): do not submit". */
export async function readCheck(ctx: FilmCtx, rel: string): Promise<GoCheck | undefined> {
  const text = await readText(abs(ctx, rel));
  if (text === undefined) return undefined;
  const lines = text.replace(/\s+$/, '').split('\n');
  let verdict: GoCheck['verdict'];
  for (const l of lines) {
    if (/^\s*PASS\b/.test(l)) verdict = 'pass';
    else if (/^\s*\d+\s+STOP\(S\)/.test(l) || /^\s*FAIL\b/.test(l)) verdict = 'fail';
  }
  return { path: rel, verdict, summary: lines[0]?.trim() || undefined, lines };
}

/** What a reference is, from where its file lives. */
function whatOf(file: string, kind: string, page?: number): string {
  const el = /^elements\/(C\d+[a-z]?)/.exec(file);
  if (el) return `${el[1]} element`;
  const cast = /^cast\/((?:C\d+[a-z]?-?)+)/.exec(file);
  if (cast) return kind === 'AUDIO' ? `${cast[1].replace(/-$/, '')} voice` : `${cast[1].replace(/-$/, '')} sheet`;
  const prop = /^props\/(P\d+)|\/(P\d+)-[^/]*$/.exec(file);
  if (prop) return `${prop[1] ?? prop[2]} prop`;
  const loc = /^locations\/(L\d+)/.exec(file);
  if (loc) return `${loc[1]} view`;
  const board = /storyboard\/(v\d+)\/page-(\d+)/.exec(file);
  if (board) return `boards ${board[1]} · page ${page ?? board[2]}`;
  if (kind === 'AUDIO' || /^voices\//.test(file)) return 'voice line';
  return kind === 'VIDEO' ? 'video' : kind === 'AUDIO' ? 'audio' : 'image';
}

const KIND_LETTER: Record<GoMediaItem['kind'], string> = { VIDEO: 'V', IMAGE: 'I', AUDIO: 'A' };

async function readMedia(ctx: FilmCtx, rel: string): Promise<GoPrompt['media']> {
  const j = asRecord(await readJson(ctx, rel));
  if (!j) return undefined;
  const s = asRecord(j.settings) ?? {};
  const raw = Array.isArray(j.media) ? j.media : [];
  const counters: Record<string, number> = {};
  const items: GoMediaItem[] = [];
  for (const [i, v] of raw.entries()) {
    const m = asRecord(v);
    const file = asString(m?.file);
    if (!m || !file) continue;
    const roleKind = /video/.test(asString(m.role) ?? '') ? 'VIDEO' : /audio/.test(asString(m.role) ?? '') ? 'AUDIO' : 'IMAGE';
    const kindRaw = (asString(m.kind) ?? roleKind).toUpperCase();
    const kind: GoMediaItem['kind'] = kindRaw === 'VIDEO' || kindRaw === 'AUDIO' ? kindRaw : 'IMAGE';
    counters[kind] = (counters[kind] ?? 0) + 1;
    const n = asNumber(m.n) ?? counters[kind];
    const page = asNumber(m.page);
    items.push({
      order: i + 1, kind, n, ref: `${KIND_LETTER[kind]}${n}`, tag: asString(m.tag) ?? file.split('/').pop()!,
      what: whatOf(file, kind, page), file, desc: asString(m.desc), view: m.view === true || undefined, page,
      missing: (await exists(abs(ctx, file))) ? undefined : true,
    });
  }
  return {
    path: rel,
    settings: {
      model: asString(s.model), mode: asString(s.mode), duration: asNumber(s.duration), aspect: asString(s.aspect_ratio),
      resolution: asString(s.resolution), draft: typeof s.draft === 'boolean' ? s.draft : undefined,
      audio: typeof s.generate_audio === 'boolean' ? s.generate_audio : undefined,
    },
    previzTake: asString(j.previz_take),
    storyboard: asString(j.storyboard),
    items,
  };
}

/** A line diff (LCS) of b against a, as runs over b's lines plus a's removed lines. */
export function lineDiff(a: string[], b: string[]): { ops: GoDiffOp[]; added: number; removed: number } {
  // trim the common head and tail first: versions differ in a few places
  let h = 0;
  while (h < a.length && h < b.length && a[h] === b[h]) h++;
  let t = 0;
  while (t < a.length - h && t < b.length - h && a[a.length - 1 - t] === b[b.length - 1 - t]) t++;
  const A = a.slice(h, a.length - t);
  const B = b.slice(h, b.length - t);
  const dp: Uint16Array[] = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: GoDiffOp[] = [];
  const push = (op: '=' | '+', k = 1): void => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.count += k;
    else ops.push({ op, count: k });
  };
  const drop = (line: string): void => {
    const last = ops[ops.length - 1];
    if (last && last.op === '-') last.lines.push(line);
    else ops.push({ op: '-', lines: [line] });
  };
  if (h) push('=', h);
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { push('='); i++; j++; }
    else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) { push('+'); added++; j++; }
    else { drop(A[i]); removed++; i++; }
  }
  if (t) push('=', t);
  return { ops, added, removed };
}

const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/** The shots: ids and seconds from the shots file, names and facings from the scene file's "### SHOT n: NAME (CAM FACING: X)". */
async function readShots(ctx: FilmCtx, sc: SceneRefX): Promise<{ shots: GoShot[]; duration?: number }> {
  const sj = asRecord(await readJson(ctx, `${sc.folder}/${sc.id}-shots.json`));
  const md = sc.more.file ? (await readText(abs(ctx, sc.more.file))) ?? '' : '';
  const heads = new Map<string, { name: string; facing?: string }>();
  for (const m of md.matchAll(/^###\s+SHOT\s+(\w+):\s*(.+?)(?:\s*\(CAM FACING:\s*([^)]+)\))?\s*$/gm)) heads.set(m[1], { name: m[2].trim(), facing: m[3]?.trim() });
  const shots: GoShot[] = [];
  for (const v of Array.isArray(sj?.shots) ? sj.shots : []) {
    const s = asRecord(v);
    if (!s) continue;
    const id = String(s.id ?? shots.length + 1);
    const h = heads.get(id);
    shots.push({ id, name: h?.name ?? asString(s.name), facing: h?.facing ?? asString(s.facing), t0: toNum(s.t0), t1: toNum(s.t1) });
  }
  if (!shots.length) for (const [id, h] of heads) shots.push({ id, name: h.name, facing: h.facing });
  return { shots, duration: toNum(sj?.duration) };
}

/** The rate for seedance_2_5 at a resolution: credits ÷ seconds of every paid row of that model and resolution. */
export function seedanceRate(lines: SpendLineX[], resolution: string): GoRate | undefined {
  const rows = lines.filter((l) => {
    const svc = `${l.service} ${l.what}`;
    if (!/seedance[_ ]?2[._]?5/i.test(svc) || /refund/i.test(svc) || /^\s*\+/.test(l.more.costText)) return false;
    const res = /\b(480p|720p|1080p)\b/i.exec(l.service)?.[1]?.toLowerCase();
    if (res !== resolution.toLowerCase()) return false;
    const secs = l.more.seconds ?? toNum(/(\d+(?:\.\d+)?)\s*s\b/.exec(l.more.units ?? '')?.[1]);
    return !!secs && (l.cost.credits ?? 0) > 0;
  });
  if (!rows.length) return undefined;
  const rates = rows.map((l) => {
    const stated = /(\d+(?:\.\d+)?)\s*cr\s*\/\s*s/i.exec(l.more.rate ?? '');
    return stated ? Number(stated[1]) : (l.cost.credits ?? 0) / (l.more.seconds ?? toNum(/(\d+(?:\.\d+)?)/.exec(l.more.units ?? '')?.[1]) ?? 1);
  });
  // the rate most rows paid (ties: the newest row's)
  const counts = new Map<number, number>();
  for (const r of rates) counts.set(Math.round(r * 100) / 100, (counts.get(Math.round(r * 100) / 100) ?? 0) + 1);
  const newest = rows[rows.length - 1];
  const newestRate = Math.round(rates[rates.length - 1] * 100) / 100;
  const best = [...counts].sort((x, y) => y[1] - x[1] || (x[0] === newestRate ? -1 : y[0] === newestRate ? 1 : 0))[0];
  const same = best[1];
  const draft = rows.some((l) => /draft/i.test(l.service)) ? ' draft' : '';
  const label = (newest.more.label ?? newest.what).split(/[,:;(]/)[0].trim();
  return {
    crPerSec: best[0],
    resolution,
    rows: rows.length,
    basis: `${best[0]} cr/s at ${resolution}${draft}: ${same === rows.length ? `all ${rows.length}` : `${same} of ${rows.length}`} paid seedance_2_5 ${resolution} ${rows.length === 1 ? 'row' : 'rows'} in spend.md; the newest, ${label} (${fmtDay(newest.date)}), line ${newest.more.line}`,
  };
}

/** The last Higgsfield balance a record file states ("balance 812 cr", "812 credits left"). */
async function readBalance(ctx: FilmCtx): Promise<GoReview['balance']> {
  let found: GoReview['balance'];
  for (const f of ['spend.md', 'regeneration-log.md']) {
    const text = await readText(abs(ctx, f));
    if (!text) continue;
    const lines = text.split('\n');
    for (const [k, line] of lines.entries()) {
      const m = /\bbalance\b[^\n|.]{0,40}?\b(\d[\d,]*(?:\.\d+)?)\s*(?:cr|credits)\b|\b(\d[\d,]*(?:\.\d+)?)\s*(?:cr|credits)\s+(?:left|remaining|in the balance)\b/i.exec(line);
      if (!m) continue;
      const date = /\b(20\d\d-\d\d-\d\d)\b/.exec(line)?.[1];
      found = { credits: Number((m[1] ?? m[2]).replace(/,/g, '')), date, source: `${f} line ${k + 1}` };
    }
  }
  return found;
}

/** The newest take of a scene and the prompt version spend.md says it ran ("S1 prompt v6, take 1"). */
function lastTakeOf(sc: SceneRefX, lines: SpendLineX[]): GoScene['lastTake'] {
  const takes = sc.takes.filter((t) => t.kind === 'take');
  const t = takes[takes.length - 1];
  if (!t) return undefined;
  const paid = lines.filter((l) => t.more.spendLines.includes(l.more.line));
  const label = paid.map((l) => l.more.label ?? '').find((x) => /prompt\s+v\d+/i.test(x))
    ?? lines.map((l) => l.more.label ?? '').filter((x) => new RegExp(`^${sc.id}\\s+prompt\\s+v\\d+`, 'i').test(x)).pop();
  const version = label ? /prompt\s+(v\d+)/i.exec(label)?.[1] : undefined;
  return { id: t.id, version, date: t.date };
}

/** `only` reads one scene; `version` (with `only`) reads that prompt version instead of the newest. */
export async function readGo(ctx: FilmCtx, film: string, scenes: SceneRefX[], spend: SpendLineX[], only?: string, version?: string): Promise<GoReview> {
  const warnings: string[] = [];
  const out: GoScene[] = [];
  const rates = new Map<string, GoRate | undefined>();
  const rateFor = (res: string): GoRate | undefined => {
    if (!rates.has(res)) rates.set(res, seedanceRate(spend, res));
    return rates.get(res);
  };
  for (const sc of scenes) {
    if (only && sc.id !== only) continue;
    const blockers: string[] = [];
    const warns: string[] = [];
    const versions = sc.promptVersions.map((p) => p.version);
    const at = version ? sc.promptVersions.findIndex((p) => p.version === version) : sc.promptVersions.length - 1;
    if (version && at < 0) warnings.push(`${sc.id} has no prompt ${version}; showing the newest`);
    const idx = at < 0 ? sc.promptVersions.length - 1 : at;
    const latest = sc.promptVersions[idx];
    const { shots, duration: shotsSeconds } = await readShots(ctx, sc);
    let prompt: GoPrompt | undefined;
    if (!latest) blockers.push('no prompt yet');
    else {
      const text = (await readText(abs(ctx, latest.path))) ?? '';
      const prevRef = sc.promptVersions[idx - 1];
      let previous: GoPrompt['previous'];
      if (prevRef) {
        const prevText = await readText(abs(ctx, prevRef.path));
        if (prevText !== undefined) {
          const d = lineDiff(prevText.split('\n'), text.split('\n'));
          previous = { version: prevRef.version, diff: d.ops, added: d.added, removed: d.removed };
        }
      }
      const check = latest.checkPath ? await readCheck(ctx, latest.checkPath) : undefined;
      const media = latest.mediaPath ? await readMedia(ctx, latest.mediaPath) : undefined;
      const tm = `${sc.folder}/prompt/${sc.id}-take-medias-${latest.version}.json`;
      prompt = {
        version: latest.version, path: latest.path, text, chars: text.length, previous, check, media,
        takeMediasPath: (await exists(abs(ctx, tm))) ? tm : undefined,
      };
      if (!check) blockers.push(`${latest.version} has no check yet`);
      else if (check.verdict === 'fail') blockers.push(`the check of ${latest.version} stopped: ${check.lines.filter((l) => /^STOP \d+:/.test(l.trim())).length || 'see its'} STOP lines`);
      else if (check.verdict !== 'pass') blockers.push(`the check of ${latest.version} has no PASS line`);
      if (!media) blockers.push(`${latest.version} has no media list`);
      for (const m of media?.items.filter((x) => x.missing) ?? []) blockers.push(`${m.ref} missing: ${m.file}`);
      const sent = media?.settings.duration;
      if (sent !== undefined && shotsSeconds !== undefined && Math.ceil(shotsSeconds) !== sent)
        warns.push(`the media list asks for ${sent} s; the shots file says ${shotsSeconds} s`);
      // the length the prompt states: "27 seconds. 8 shots" (SCENE CONTEXT) or "sequence, 27 seconds" (FORMAT MODE)
      const said = (/(?<![\d.])(\d+(?:\.\d+)?)\s+seconds[.:,]\s+(?:\d+|[a-z]+)\s+shots/i.exec(text) ?? /sequence,\s*(\d+(?:\.\d+)?)\s+seconds/i.exec(text))?.[1];
      if (sent !== undefined && said && Math.ceil(Number(said)) !== sent) warns.push(`the prompt says ${said} seconds; the media list asks for ${sent} s`);
      if (media && media.settings.model && media.settings.model !== 'seedance_2_5') warns.push(`model ${media.settings.model}, not seedance_2_5`);
      if (media?.settings.resolution === '480p' && media.settings.draft === false) warns.push('480p without draft: it could never be finalized to 1080p');
    }
    const takes = sc.takes.filter((t) => t.kind === 'take').length;
    const duration = prompt?.media?.settings.duration ?? (shotsSeconds !== undefined ? Math.ceil(shotsSeconds) : sc.seconds !== undefined ? Math.ceil(sc.seconds) : undefined);
    const res = prompt?.media?.settings.resolution ?? '480p';
    const rate = rateFor(res);
    out.push({
      id: sc.id, title: sc.title, folder: sc.folder, seconds: sc.seconds, shotsSeconds, shots, versions, prompt, takes,
      lastTake: lastTakeOf(sc, spend), ready: blockers.length === 0, blockers, warnings: warns, duration,
      credits: duration !== undefined && rate ? Math.round(duration * rate.crPerSec * 100) / 100 : undefined,
    });
  }
  out.sort((a, b) => natCmp(a.id, b.id));
  const res = out.find((s) => s.prompt?.media?.settings.resolution)?.prompt?.media?.settings.resolution ?? '480p';
  const rate = rateFor(res);
  if (!rate) warnings.push(`spend.md has no paid seedance_2_5 ${res} row yet, so no rate to quote from`);
  const multi = new Set(out.map((s) => s.prompt?.media?.settings.resolution).filter(Boolean));
  if (multi.size > 1) warnings.push(`the scenes ask for different resolutions (${[...multi].join(', ')}); each is quoted at its own rate`);
  return { film, scenes: out, rate, balance: await readBalance(ctx), warnings };
}
