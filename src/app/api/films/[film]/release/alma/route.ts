// The test hook that plays Alma's part of a release (Release, stage 3 of 3). Sample-data mode only (MOCK=boards),
// never in production: 404 otherwise. POST {platform, step, link?, note?} (?now= the tests' clock) writes into the
// sample film's release in memory what the recipe tells Alma to write: the post the user made by hand, with its
// link. Steps: src/server/release/mockAlma.ts (ALMA_STEPS).
import { connection } from 'next/server';
import { NO_STORE } from '@/server/edit/http';
import { clockOf } from '@/server/release/clock';
import { ALMA_STEPS, almaHookOn, almaStep, type AlmaStep } from '@/server/release/mockAlma';
import { deriveAll } from '@/components/release/derive';

type Ctx = { params: Promise<{ film: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (!almaHookOn()) return Response.json({ error: 'Not found' }, { status: 404 });
  const slug = (await ctx.params).film;
  const b = (await req.json().catch(() => ({}))) as { platform?: unknown; step?: unknown; link?: unknown; note?: unknown };
  if (typeof b.platform !== 'string' || !ALMA_STEPS.includes(b.step as AlmaStep)) return Response.json({ error: `{platform, step}: step is one of ${ALMA_STEPS.join(', ')}` }, { status: 400, headers: NO_STORE });
  const now = clockOf(req);
  const r = almaStep(slug, b.platform, b.step as AlmaStep, now, { link: typeof b.link === 'string' ? b.link : undefined, note: typeof b.note === 'string' ? b.note : undefined });
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 409, headers: NO_STORE });
  return Response.json({ ok: true, file: r.file, derived: deriveAll(r.file, now) }, { headers: NO_STORE });
}
