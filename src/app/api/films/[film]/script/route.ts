// POST {edits: [{scene, index, kind, old, new}], base: {version, fingerprint}, dryRun?} → the user's edits to the
// script's words, saved as its next version (src/server/actions/script.ts). 409 when the script is locked, or when
// script.md changed since the page read it: then the body carries `clash`, the newer text and each edit's place in it.
import { connection } from 'next/server';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { PickError } from '@/server/actions/pick';
import { saveScript, ScriptClash, type ScriptBase, lockScript } from '@/server/actions/script';
import { isMock } from '@/fixtures/mock';
import { resetStorySample } from '@/fixtures/story';

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/script'>): Promise<Response> {
  await connection();
  const { film } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  // sample data only: the tests put a sample's story and script back as they were ({reset: true})
  if (body.reset === true) {
    if (!isMock() || process.env.NODE_ENV === 'production' || !resetStorySample(film)) return Response.json({ error: 'only a sample film can be reset, under sample data' }, { status: 403 });
    return Response.json({ ok: true, reset: film });
  }
  if (!isMock() && !(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  try {
    if (typeof body.lock === 'string') return Response.json(await lockScript(body.lock, film, { dryRun: body.dryRun === true }), { headers: { 'cache-control': 'no-store' } });
    const r = await saveScript({ edits: body.edits, base: body.base as ScriptBase }, film, { dryRun: body.dryRun === true });
    return Response.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ScriptClash) return Response.json({ error: e.message, clash: e.clash }, { status: 409 });
    if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
