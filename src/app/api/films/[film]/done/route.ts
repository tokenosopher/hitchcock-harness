// POST {answers: [{card, option?}], picks: [{kind, target, round?, candidate?, …}], approvals: [{kind: 'sheet', id, path}], removals: [{key, title, mark?}], dryRun?} → "Done picking": every
// choice the user set aside, written as each would be by itself, and ONE message to Alma that lists them.
import { connection } from 'next/server';
import { sendChoices } from '@/server/actions/answer';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { PickError, PICK_KINDS, type PickInput, type PickKind } from '@/server/actions/pick';
import { LIBRARY_KINDS, LibraryUnavailable, type LibraryKind } from '@/server/library/store';
import { isMock } from '@/fixtures/mock';
import { notifyHub } from '@/server/claude/notify';
import { soundMockDone } from '@/fixtures/soundpick';
import { soundCardsDone } from '@/fixtures/soundcards';
import { sheetMockDone } from '@/fixtures/cast';
import { parseApprovals } from '@/components/lib/approve';
import { parseRemovals } from '@/components/lib/remove';
import { removeMockDone } from '@/fixtures/removed';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})) : []);

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/done'>): Promise<Response> {
  await connection();
  const { film } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  const answers = rows(body.answers).map((x) => ({ card: s(x.card) ?? '', option: s(x.option), note: s(x.note), from: 'the Done picking button' }));
  if (answers.some((a) => !a.card)) return Response.json({ error: 'every answer needs its card' }, { status: 400 });
  const picks: PickInput[] = [];
  for (const x of rows(body.picks)) {
    const kind = s(x.kind) as PickKind | undefined;
    if (!kind || !PICK_KINDS.includes(kind)) return Response.json({ error: `a pick's kind must be one of ${PICK_KINDS.join(', ')}` }, { status: 400 });
    const libraryKind = s(x.libraryKind) as LibraryKind | undefined;
    picks.push({
      kind, target: s(x.target) ?? '', round: s(x.round), candidate: s(x.candidate), prediction: s(x.prediction), note: s(x.note),
      source: x.source === 'library' ? 'library' : 'round', libraryId: s(x.libraryId),
      libraryKind: libraryKind && LIBRARY_KINDS.includes(libraryKind) ? libraryKind : undefined, from: s(x.from), card: s(x.card),
    });
  }
  const approvals = parseApprovals(body.approvals);
  if (typeof approvals === 'string') return Response.json({ error: approvals }, { status: 400 });
  // what was removed from "Waiting for you", not answered
  const removals = parseRemovals(body.removals);
  if (typeof removals === 'string') return Response.json({ error: removals }, { status: 400 });
  // what was answered or removed leaves the film's count of "Waiting for you" (the sidebar's white dot) within a moment
  const acted = () => notifyHub().userAnswered(film, answers, picks, approvals, removals);
  const mocked = isMock() ? removeMockDone(film, answers, picks, approvals, removals) ?? sheetMockDone(film, answers, picks, approvals) ?? soundMockDone(film, answers, picks) ?? soundCardsDone(film, answers) : undefined;
  if (mocked) { if (mocked.ok) acted(); return mocked; }
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  try {
    const r = await sendChoices({ answers, picks, approvals, removals }, film, { dryRun: body.dryRun === true });
    if (body.dryRun !== true) acted();
    return Response.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof LibraryUnavailable) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

