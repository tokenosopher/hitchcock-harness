// GET  → ThreadEvent[] (history: the session transcript merged with this server's live events)
// GET ?info=1 → ThreadInfo
// POST {text, context?} → 202 {event, info}: queued for Alma; follow the stream route for her answer
// PATCH {model} → changes the model this film's Alma runs on; answers the new ThreadInfo
// DELETE → interrupts Alma's current turn
import { connection } from 'next/server';
import { getAlma } from '@/server/claude/process';
import { isAlmaModel } from '@/server/claude/model';
import { isMock, mockPost, mockThread } from '@/fixtures/mock';
import { parseContext, sendToAlma, threadHistory, threadInfo, validFilm } from '@/server/claude/thread';

type Ctx = { params: Promise<{ film: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  if (isMock()) return Response.json(mockThread(film)); // workstream A's fixture shim, removed at integration
  if (new URL(req.url).searchParams.get('info')) return Response.json(await threadInfo(film));
  const { events, warnings } = await threadHistory(film);
  return Response.json(events, { headers: warnings.length ? { 'X-Harness-Warnings': encodeURIComponent(warnings.join(' | ')) } : {} });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'body must be JSON {text, context}' }, { status: 400 });
  }
  const b = (body ?? {}) as { text?: unknown; context?: unknown };
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return Response.json({ error: 'text is empty' }, { status: 400 });
  if (isMock()) {
    mockPost(film, text, parseContext(film, b.context));
    return Response.json({ ok: true }, { status: 202 });
  }
  const result = await sendToAlma(film, text, parseContext(film, b.context));
  return Response.json(result, { status: 202 });
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { model?: unknown };
  if (!isAlmaModel(b.model)) return Response.json({ error: 'model is not one of the offered ones' }, { status: 400 });
  if (isMock()) return Response.json({ ok: true });
  const alma = getAlma(film);
  const r = await alma.setModel(b.model);
  return Response.json({ ...r, info: alma.info() }, { status: r.ok ? 200 : 409 });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { film } = await ctx.params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  const r = await getAlma(film).interrupt();
  return Response.json(r, { status: r.ok ? 200 : 409 });
}
