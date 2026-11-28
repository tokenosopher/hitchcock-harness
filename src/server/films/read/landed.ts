// The takes that came back, what the app knows of each beside its shots (components/takes/landed.ts says what
// each part is and where it comes from). One entry per take folder under generations/ and blocks/ that has a video:
// GET /api/films/[film]/landed. Read only, every file optional; nothing is cached, the page asks again when the film's
// files change.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilmTarget } from '../../actions/film';
import { creditsOf, modelOf, readCheck, readFindings, readFindingsNote, readReadme, type LandedMap, type LandedTake, type TakeSpend } from '@/components/takes/landed';
import { readFeed } from './feed';
import { readSpend } from './spend';
import { Warnings } from '../util';

const ROOTS = ['generations', 'blocks'];
const read = (f: string): Promise<string | undefined> => fs.readFile(f, 'utf8').catch(() => undefined);
const readJson = async (f: string): Promise<unknown> => { const t = await read(f); if (t === undefined) return undefined; try { return JSON.parse(t) as unknown; } catch { return undefined; } };
const dirs = async (p: string): Promise<string[]> =>
  (await fs.readdir(p, { withFileTypes: true }).catch(() => [])).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.') && !e.name.endsWith('.nosync')).map((e) => e.name);
const names = async (p: string): Promise<string[]> => (await fs.readdir(p).catch(() => [] as string[])).filter((n) => !n.startsWith('.'));

export async function readLanded(film: FilmTarget): Promise<LandedMap> {
  const ctx = { dir: film.dir, warn: new Warnings() };
  const [feed, spend] = await Promise.all([readFeed(ctx, film.slug).catch(() => undefined), readSpend(ctx).catch(() => undefined)]);
  // the cards that show a take, by the take's folder (the first card listed wins: the newest, as Alma writes them)
  const cards = new Map<string, LandedTake['card']>();
  for (const c of feed?.cards ?? []) {
    for (const m of c.media) {
      if (m.kind !== 'video') continue;
      const k = m.path.split('/').slice(0, -1).join('/');
      if (!cards.has(k)) cards.set(k, { title: c.title, ...(c.sub ? { sub: c.sub } : {}), text: c.text ?? [] });
    }
  }
  const byJob = new Map<string, NonNullable<typeof spend>['lines'][number]>();
  for (const l of spend?.lines ?? []) if (l.jobId && !l.more.refund) byJob.set(l.jobId, l);
  const out: LandedMap = {};
  for (const root of ROOTS) {
    for (const gen of await dirs(path.join(film.dir, root))) {
      const gdir = path.join(film.dir, root, gen);
      const takesDir = path.join(gdir, 'takes');
      const takes = await dirs(takesDir);
      if (!takes.length) continue;
      const [readme, record] = await Promise.all([read(path.join(gdir, 'README.md')), readJson(path.join(gdir, `${gen}-findings.json`))]);
      for (const take of takes) {
        const tdir = path.join(takesDir, take);
        const ns = await names(tdir);
        if (!ns.some((n) => /\.mp4$/i.test(n))) continue;
        const rel = `${root}/${gen}/takes/${take}`;
        const jobFile = ns.find((n) => n.endsWith('.jobid'));
        const job = jobFile ? (await read(path.join(tdir, jobFile)))?.trim().split(/\s+/)[0]?.toLowerCase() : undefined;
        const card = cards.get(rel);
        const row = job ? byJob.get(job) ?? byJob.get(job.slice(0, 8)) : undefined;
        let sp: TakeSpend | undefined;
        if (row) {
          const m = modelOf(row.service);
          const credits = creditsOf(row.more.costText);
          sp = { ...m, ...(row.more.seconds !== undefined ? { seconds: row.more.seconds } : {}), ...(credits !== undefined ? { credits } : {}), costText: row.more.costText, from: 'spend.md' };
        } else if (card?.sub) {
          const m = modelOf(card.sub);
          const credits = creditsOf(card.sub);
          if (m.res || m.model || credits !== undefined) sp = { ...m, ...(credits !== undefined ? { credits } : {}), from: 'card' };
        }
        const [check, note] = await Promise.all([
          ns.includes('check.json') ? readJson(path.join(tdir, 'check.json')).then(readCheck) : undefined,
          ns.includes('findings.md') ? read(path.join(tdir, 'findings.md')).then(readFindingsNote) : undefined,
        ]);
        const rm = readReadme(readme);
        const alma = readFindings(record, take);
        out[film.show(tdir)] = {
          folder: film.show(tdir), gen, take,
          ...(job ? { job } : {}), ...(card ? { card } : {}), ...(rm ? { readme: rm } : {}), ...(sp ? { spend: sp } : {}),
          ...(alma ? { alma } : {}), ...(note ? { note } : {}), ...(check ? { check } : {}),
        };
      }
    }
  }
  return out;
}
