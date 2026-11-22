// The film's debrief (Flow v3.3 - 12 Release, "The debrief").
// GET → { debrief?, answers, problems }: Alma's questions (review/debrief.json) and the answers kept so far
//   (review/debrief-answers.json).
// POST { question, picked?: string[], words?, skipped? } → { answers }: one answer kept as it is given.
// POST { send: true, dryRun? } → { message, answers }: every answer to Alma as one message; the answers marked sent.
import { connection } from 'next/server';
import { readDebrief, saveDebriefAnswer, sendDebrief } from '@/server/actions/filmfiles';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { PickError } from '@/server/actions/pick';
import { isMock } from '@/fixtures/mock';

const NO_STORE = { 'cache-control': 'no-store' };
const fail = (e: unknown) => (e instanceof PickError ? Response.json({ error: e.message }, { status: e.status, headers: NO_STORE }) : Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: NO_STORE }));
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function GET(_req: Request, { params }: RouteContext<'/api/films/[film]/debrief'>): Promise<Response> {
  await connection();
  if (!isMock() && !(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  try {
    const r = await readDebrief((await params).film);
    return Response.json({ debrief: r.debrief, answers: r.answers, problems: r.problems }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/debrief'>): Promise<Response> {
  await connection();
  if (!isMock() && !(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return Response.json({ error: 'body must be JSON' }, { status: 400 }); }
  const film = (await params).film;
  try {
    if (b.send === true) return Response.json(await sendDebrief(film, { dryRun: b.dryRun === true }), { headers: NO_STORE });
    const q = str(b.question);
    if (!q) return Response.json({ error: 'question (its id) is required, or send: true' }, { status: 400 });
    const picked = Array.isArray(b.picked) ? b.picked.filter((x): x is string => typeof x === 'string') : undefined;
    const answers = await saveDebriefAnswer(film, q, { picked, words: typeof b.words === 'string' ? b.words : undefined, skipped: b.skipped === true });
    return Response.json({ answers }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
