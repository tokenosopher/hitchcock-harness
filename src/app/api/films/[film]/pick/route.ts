// POST {kind, target, round?, candidate, prediction?, note?, source?: 'round'|'library', libraryId?, libraryKind?, from?, dryRun?}
// → the film flow's pick writes, the taste.md row, the library entry, and a line to Alma.
// dryRun: true returns what would be written and sent, and touches nothing.
import { connection } from 'next/server';
import { makePick, PickError, PICK_KINDS, type PickInput, type PickKind } from '@/server/actions/pick';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { LIBRARY_KINDS, LibraryUnavailable, type LibraryKind } from '@/server/library/store';
import { isMock } from '@/fixtures/mock';
import { notifyHub } from '@/server/claude/notify';
import { soundMockPicks } from '@/fixtures/soundpick';

type Ctx = { params: Promise<{ film: string }> };

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  // a pick leaves the film's count of "Waiting for you" (the sidebar's white dot) within a moment
  const acted = () => notifyHub().userAnswered(film, [], [{ kind: s(body.kind) ?? '', target: s(body.target) ?? '', card: s(body.card) }]);
  const mocked = isMock() ? soundMockPicks(film, [{ kind: s(body.kind), target: s(body.target), candidate: s(body.candidate), note: s(body.note), card: s(body.card) }]) : undefined;
  if (mocked) { if (mocked.ok) acted(); return mocked; }
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  const kind = s(body.kind) as PickKind | undefined;
  if (!kind || !PICK_KINDS.includes(kind)) return Response.json({ error: `kind must be one of ${PICK_KINDS.join(', ')}` }, { status: 400 });
  const libraryKind = s(body.libraryKind) as LibraryKind | undefined;
  const input: PickInput = {
    kind,
    target: s(body.target) ?? '',
    round: s(body.round),
    candidate: s(body.candidate),
    prediction: s(body.prediction),
    note: s(body.note),
    source: body.source === 'library' ? 'library' : 'round',
    libraryId: s(body.libraryId),
    libraryKind: libraryKind && LIBRARY_KINDS.includes(libraryKind) ? libraryKind : undefined,
    from: s(body.from),
    card: s(body.card),
  };
  try {
    const r = await makePick(input, film, { dryRun: body.dryRun === true });
    if (body.dryRun !== true) acted();
    return Response.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof LibraryUnavailable) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
