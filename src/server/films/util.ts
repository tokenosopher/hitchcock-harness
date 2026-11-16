// Small tolerant helpers shared by the film readers: reads never throw on a missing file,
// problems go to a warnings list the UI and `films:check` show.
import { promises as fs, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';

/** Collects what a reader could not parse, as "file: what went wrong". */
export class Warnings {
  readonly list: string[] = [];
  add(file: string, msg: string): void {
    const line = `${file}: ${msg}`;
    if (!this.list.includes(line)) this.list.push(line);
  }
}

/** One film being read: its folder, and paths relative to it. */
export interface FilmCtx {
  dir: string; // absolute film folder (through the repo's assets link)
  warn: Warnings;
}

export const abs = (ctx: FilmCtx, rel: string): string => path.join(ctx.dir, rel);

export async function statOf(p: string): Promise<Stats | undefined> {
  try {
    return await fs.stat(p);
  } catch {
    return undefined;
  }
}

export async function exists(p: string): Promise<boolean> {
  return (await statOf(p)) !== undefined;
}

export async function readText(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return undefined;
  }
}

/** Reads JSON; a missing file is undefined, a broken one is undefined plus a warning. */
export async function readJson<T = unknown>(ctx: FilmCtx, rel: string): Promise<T | undefined> {
  const text = await readText(abs(ctx, rel));
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    ctx.warn.add(rel, `not valid JSON (${(e as Error).message.slice(0, 80)})`);
    return undefined;
  }
}

export interface Entry { name: string; dir: boolean }

/** Lists a folder (names and kinds only), skipping dot files, cloud-drive scratch and Python caches. */
export async function list(p: string): Promise<Entry[]> {
  try {
    const ents = await fs.readdir(p, { withFileTypes: true });
    const out: Entry[] = [];
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name.endsWith('.nosync') || e.name === '__pycache__') continue;
      let dir = e.isDirectory();
      if (e.isSymbolicLink()) dir = (await statOf(path.join(p, e.name)))?.isDirectory() ?? false;
      out.push({ name: e.name, dir });
    }
    return out.sort((a, b) => natCmp(a.name, b.name));
  } catch {
    return [];
  }
}

/** Lists a folder in a child process with a hard time limit: for cloud-drive folders, where a read
 *  can hang on a macOS permission prompt. A timeout or error returns undefined ("not available"). */
export function listSlow(p: string, ms = 4000): Promise<Entry[] | undefined> {
  return new Promise((resolve) => {
    execFile('/bin/ls', ['-1p', p], { signal: AbortSignal.timeout(ms), maxBuffer: 4 << 20 }, (err, stdout) => {
      if (err) return resolve(undefined);
      const out = stdout
        .split('\n')
        .filter((l) => l && !l.startsWith('.'))
        .map((l) => (l.endsWith('/') ? { name: l.slice(0, -1), dir: true } : { name: l, dir: false }));
      resolve(out);
    });
  });
}

/** Natural order: S2 before S10, v9 before v10. */
export function natCmp(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
export const VIDEO_RE = /\.(mp4|mov|m4v)$/i;
export const AUDIO_RE = /\.(mp3|wav|m4a)$/i;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** First date in a text, as ISO (2026-11-06 or "6 Nov 2026"). */
export function firstDate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const iso = /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(text);
  const dmy = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (20\d\d)\b/.exec(text);
  const isoAt = iso ? iso.index : Infinity;
  const dmyAt = dmy ? dmy.index : Infinity;
  if (iso && isoAt <= dmyAt) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (dmy) return `${dmy[3]}-${String(MONTHS[dmy[2].toLowerCase()]).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return undefined;
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Splits a markdown table row into trimmed cells (outer pipes dropped). */
export function cells(row: string): string[] {
  const t = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  // a pipe inside backticks is rare in these files; split plainly
  return t.split('|').map((c) => c.trim());
}

/** Every markdown table in a text: header cells and data rows. */
export function tables(text: string): { header: string[]; rows: string[][]; line: number }[] {
  const lines = text.split('\n');
  const out: { header: string[]; rows: string[][]; line: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|\s*:?-{2,}/.test(lines[i + 1])) continue;
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(cells(lines[j]));
    out.push({ header, rows, line: i + 1 });
    i = j - 1;
  }
  return out;
}

/** Keeps keys, tokens and presigned URLs out of anything the harness shows or stores. */
export function redact(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s"'<>)]+?)\?[^\s"'<>)]*/g, '$1?[query removed]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[key removed]')
    .replace(/\bfal_[A-Za-z0-9]{16,}/g, '[key removed]')
    .replace(/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*[:=]\s*)\S{6,}/g, '$1[removed]')
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[a-f0-9]{32,}\b/gi, '[key removed]');
}

/** Same content check without reading whole media files twice: size first, then a hash. */
export async function sameFile(a: string, b: string, sizeA?: number): Promise<boolean> {
  const sa = sizeA ?? (await statOf(a))?.size;
  const sb = (await statOf(b))?.size;
  if (sa === undefined || sa !== sb) return false;
  const [ha, hb] = await Promise.all([hashFile(a), hashFile(b)]);
  return ha !== undefined && ha === hb;
}

const hashCache = new Map<string, { mtime: number; hash: string }>();
async function hashFile(p: string): Promise<string | undefined> {
  const st = await statOf(p);
  if (!st) return undefined;
  const hit = hashCache.get(p);
  if (hit && hit.mtime === st.mtimeMs) return hit.hash;
  try {
    const hash = createHash('sha1').update(await fs.readFile(p)).digest('hex');
    hashCache.set(p, { mtime: st.mtimeMs, hash });
    return hash;
  } catch {
    return undefined;
  }
}

/** "ferryman" → "Ferryman", "ai-woman" → "Ai Woman". */
export const titleCase = (slug: string): string =>
  slug
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

export const stripMd = (s: string): string => s.replace(/\*\*|__|`/g, '').replace(/^\*(.*)\*$/, '$1').trim();

export const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const asNumber = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
