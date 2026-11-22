// GET → { reasons: [{rev, step, stepAt?, by?, reason, at}] }: the user's reasons beside the History tab's steps
//, from the film's harness/cut-reasons.json. POST { step: {rev, words, at?, by?}, reason } → the reason of
// that step set (empty words take it away); answers { reasons }. Nothing else is written; Alma is not told (she reads
// the file before she changes the cut, recipes/edit.md).
import { connection } from 'next/server';
import { readReasons, saveReason } from '@/server/actions/filmfiles';
import { PickError } from '@/server/actions/pick';
import { REASON_MAX } from '@/components/edit/reasons';

const NO_STORE = { 'cache-control': 'no-store' };
const fail = (e: unknown) => (e instanceof PickError ? Response.json({ error: e.message }, { status: e.status, headers: NO_STORE }) : Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: NO_STORE }));

export async function GET(_req: Request, { params }: RouteContext<'/api/films/[film]/cut/reasons'>): Promise<Response> {
  await connection();
  try {
    return Response.json(await readReasons((await params).film), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/cut/reasons'>): Promise<Response> {
  await connection();
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return Response.json({ error: 'body must be JSON' }, { status: 400 }); }
  const st = b.step && typeof b.step === 'object' ? (b.step as Record<string, unknown>) : {};
  if (typeof st.rev !== 'number' || !Number.isInteger(st.rev) || st.rev < 0) return Response.json({ error: 'step.rev must be the rev of a step (a whole number)' }, { status: 400 });
  if (typeof b.reason !== 'string') return Response.json({ error: 'reason must be words (empty takes it away)' }, { status: 400 });
  if (b.reason.length > REASON_MAX * 2) return Response.json({ error: `a reason is at most ${REASON_MAX} characters` }, { status: 400 });
  try {
    const step = { rev: st.rev, words: typeof st.words === 'string' ? st.words : '', ...(typeof st.at === 'string' ? { at: st.at } : {}), ...(typeof st.by === 'string' ? { by: st.by } : {}) };
    return Response.json(await saveReason((await params).film, step, b.reason), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
