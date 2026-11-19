// review/cards.json → the misses each take check wrote ("Misses: …" in a card), keyed by scene or
// pick-up and take, so the Scene page can list them under the take.
import { abs, readJson, type FilmCtx } from '../util';

export interface ReviewMiss {
  scene?: string;      // "S9"
  pickup?: string;     // "FIX-lamp-S3"
  take: string;        // "take4"
  misses: string[];
  heading: string;
}

export interface ReviewInfo {
  path: string;
  title?: string;
  subtitle?: string;
  deliveryFolder?: string;  // "assets/final-cuts/<date> <Film>"
  sections: number;
  misses: ReviewMiss[];
}

const textOf = (v: unknown): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : '';

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The misses after "Miss:" or "Misses:", one per clause. */
function missesIn(text: string): string[] {
  const m = /\bMiss(es)?:\s*([\s\S]*)$/.exec(text);
  if (!m) return [];
  const body = m[2].split(/\b(?:CHECKS|Flags?):/)[0];
  // "Miss:" is one miss in several clauses; "Misses:" lists them with semicolons
  const parts = m[1] ? body.split(/;\s+/) : [body];
  return parts
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 3 && !/^none\b/i.test(s));
}

export async function readReview(ctx: FilmCtx, pickupFolders: string[]): Promise<ReviewInfo | undefined> {
  const rel = 'review/cards.json';
  const data = await readJson<Record<string, unknown>>(ctx, rel);
  if (!data) return undefined;
  const sections = Array.isArray(data.sections) ? data.sections : [];
  if (!Array.isArray(data.sections)) ctx.warn.add(rel, 'no "sections" list');
  const out: ReviewMiss[] = [];
  const keys = pickupFolders.map((f) => ({ folder: f, key: norm(f.replace(/^FIX-/, '').replace(/-S\d+$/, '')) }));

  const visit = (node: unknown, heading: string): void => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, heading));
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const own = textOf(o.heading) || textOf(o.title);
    const ctxHeading = [heading, own].filter(Boolean).join(' · ');
    const body = [textOf(o.sub), textOf(o.text), textOf(o.summary)].join(' ');
    const misses = missesIn(body);
    if (misses.length) {
      const where = ctxHeading;
      // the most specific mention is the last one ("Whole film · S1 to S10 · S5 grey take 1")
      const tm = [...where.matchAll(/\b(grey )?take (\d+[A-Z]?)\b/gi)].pop();
      const take = tm ? `${tm[1] ? 'grey-' : ''}${tm[2]}` : undefined;
      const scene = [...where.matchAll(/\b(?:S|Scene )(\d+)\b/g)].pop()?.[1];
      const n = norm(where);
      // a pick-up when the heading names a FIX folder's subject ("lamp", "bottle", "Who was it")
      const hits = keys.filter((k) => k.key && n.includes(k.key));
      const fix = (scene ? hits.find((k) => k.folder.endsWith(`-S${scene}`)) : undefined)?.folder ?? hits.find((k) => !/-S\d+$/.test(k.folder))?.folder ?? hits[0]?.folder;
      if (take && (fix || scene)) out.push({ scene: scene ? `S${scene}` : undefined, pickup: fix, take: take.startsWith('grey-') ? `grey-take${take.slice(5)}` : `take${take}`, misses, heading: where });
      // misses about a scene or a pick-up whose take cannot be told; misses on anything else (a face, a look, a
      // sheet, a view: every card says its misses plainly) are not a take's, and nothing is wrong with them
      else if (scene || fix) ctx.warn.add(rel, `misses under "${where.slice(0, 60)}" name no take`);
    }
    for (const k of ['cards', 'items', 'blocks']) if (Array.isArray(o[k])) visit(o[k], ctxHeading);
  };
  visit(sections, '');
  return {
    path: rel,
    title: textOf(data.title) || undefined,
    subtitle: textOf(data.subtitle) || undefined,
    deliveryFolder: textOf(data.delivery_folder) || textOf(data.icloud_folder) || undefined,
    sections: sections.length,
    misses: out,
  };
}

export const reviewFile = (ctx: FilmCtx): string => abs(ctx, 'review/cards.json');
