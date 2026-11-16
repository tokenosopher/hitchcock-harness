// POST {answers: [{card, option}], from?, dryRun?} → several cards answered with one button; Alma gets one message.
// POST {card, option?, note?, from?, dryRun?} → the user's answer to a card that asks (src/server/actions/answer.ts):
// the taste.md row for a pick, the harness's own note of the answer, and a line to Alma.
// dryRun: true returns what would be written and sent, and touches nothing.
import { connection } from 'next/server';
import { answerCard, answerCards } from '@/server/actions/answer';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { PickError } from '@/server/actions/pick';
import { isMock } from '@/fixtures/mock';
import { mockAnswer } from '@/server/release/mockAlma';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/answer'>): Promise<Response> {
  await connection();
  const { film } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  // MOCK=boards: a release sample's card is answered in memory (the harness's line goes to the mock thread)
  const mocked = isMock() && !Array.isArray(body.answers) ? mockAnswer(film, { card: s(body.card), option: s(body.option), from: s(body.from) }) : undefined;
  if (mocked) return mocked;
  if (!(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  if (Array.isArray(body.answers)) {
    // several cards with one button: [{card, option}], one message to Alma
    const inputs = (body.answers as unknown[]).map((x) => (x ?? {}) as Record<string, unknown>).map((x) => ({ card: s(x.card) ?? '', option: s(x.option), from: s(body.from) }));
    if (inputs.some((i) => !i.card)) return Response.json({ error: 'every answer needs its card' }, { status: 400 });
    try {
      return Response.json(await answerCards(inputs, film, { dryRun: body.dryRun === true }), { headers: { 'cache-control': 'no-store' } });
    } catch (e) {
      if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  const card = s(body.card);
  if (!card) return Response.json({ error: 'card (the card\'s id) is required' }, { status: 400 });
  try {
    const r = await answerCard({ card, option: s(body.option), note: s(body.note), from: s(body.from) }, film, { dryRun: body.dryRun === true });
    return Response.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
