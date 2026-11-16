// Display rules from ARCHITECTURE.md "Fixed facts": costs with units, dates as "7 Nov", SMPTE timecode.
import type { Cost } from '@/server/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

export function fmtNum(n: number, decimals = 2): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

/** "1.80 cr" for small fractional amounts, "744 cr" for whole ones. */
export function fmtCredits(n: number, unit: 'cr' | 'credits' = 'cr'): string {
  return `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;
}

export function fmtUsd(amount: number, service: string): string {
  return `$${amount.toFixed(2)} · ${service}`;
}

/** Both totals when both exist; never a bare number. */
export function fmtCost(c?: Cost, unit: 'cr' | 'credits' = 'cr'): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.credits !== undefined) parts.push(fmtCredits(c.credits, unit));
  for (const u of c.usd ?? []) parts.push(fmtUsd(u.amount, u.service));
  return parts.join(' · ');
}

export function sumCredits(costs: (Cost | undefined)[]): number {
  return Math.round(costs.reduce((a, c) => a + (c?.credits ?? 0), 0) * 100) / 100;
}

export function fmtSecs(s?: number): string {
  if (s === undefined) return '';
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

/** m:ss for film lengths ("1:34"). */
export function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** SMPTE at the film's fps: 00:00:08:05. */
export function smpte(seconds: number, fps = 24): string {
  const total = Math.max(0, Math.round(seconds * fps));
  const f = total % fps;
  const s = Math.floor(total / fps);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

/** Elapsed between two ISO times, "4 min" / "35 s". */
export function fmtElapsed(from: string, to?: string): string | undefined {
  if (!to) return undefined;
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Path relative to the film repo, as everything shown to the user must be. */
export function repoPath(filmFolder: string, repo: string, rel?: string): string {
  const base = filmFolder.startsWith(repo) ? filmFolder.slice(repo.length).replace(/^\//, '') : filmFolder;
  if (!rel) return base;
  if (rel.startsWith('assets/')) return rel;
  return `${base}/${rel}`;
}

/** "take3" → "Take 3", "grey2" and "grey-take2" → "grey 2", "take3A" → "Take 3A", "testA" → "test A", pick-ups unchanged. */
export function takeLabel(id: string): string {
  if (id.startsWith('FIX-')) return id;
  const m = /^([a-z-]+?)(?:-take)?-?(\d+[A-Z]?|[A-Z])$/.exec(id);
  if (!m) return id;
  const word = m[1] === 'take' ? 'Take' : m[1].replace(/-/g, ' ');
  return `${word} ${m[2]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export function word(n: number): string {
  return WORDS[n] ?? String(n);
}
/** Capitalises the first letter, except a version ("v4 locked", "v1 · 1 version" stay as they are). */
export function capital(s: string): string {
  if (/^v\d/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
