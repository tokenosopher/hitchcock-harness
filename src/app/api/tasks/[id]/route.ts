// A running sub-agent of Alma's, by its TaskCard id (the Agent tool_use id).
// POST {message} → Alma forwards it to the sub-agent with SendMessage (a user turn in the thread)
// DELETE → stops the sub-agent (stop_task control request to the CLI)
import { connection } from 'next/server';
import { findTaskOwner } from '@/server/claude/process';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  const alma = findTaskOwner(id);
  if (!alma) return Response.json({ error: 'no such task in this server' }, { status: 404 });
  let message = '';
  try {
    const b = (await req.json()) as { message?: unknown };
    message = typeof b.message === 'string' ? b.message.trim() : '';
  } catch { /* handled below */ }
  if (!message) return Response.json({ error: 'body must be JSON {message}' }, { status: 400 });
  const r = await alma.messageTask(id, message);
  return Response.json(r, { status: r.ok ? 202 : 409 });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  const alma = findTaskOwner(id);
  if (!alma) return Response.json({ error: 'no such task in this server' }, { status: 404 });
  const r = await alma.stopTask(id);
  return Response.json(r, { status: r.ok ? 200 : 409 });
}
