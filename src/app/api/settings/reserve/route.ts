// The reserve switch. GET → ReserveView. POST {on: boolean} → turns it on or off for every film's Alma
// and answers the new ReserveView; turning it on without a saved key answers 409 with the reason in words.
// The key itself is never part of an answer.
import { connection } from 'next/server';
import { reserveChanged } from '@/server/claude/process';
import { reserveView, setReserveOn } from '@/server/claude/reserve';

export async function GET() {
  await connection();
  return Response.json(reserveView(), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  await connection();
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { on?: unknown };
  if (typeof b.on !== 'boolean') return Response.json({ error: 'The body must be {"on": true} or {"on": false}.' }, { status: 400 });
  const r = await setReserveOn(b.on);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  reserveChanged();
  return Response.json(r.view);
}
