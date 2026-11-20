// POST {card, on} → marks a card that asks as in progress, or unlocks it (src/server/actions/progress.ts).
import { connection } from 'next/server';
import { setProgress } from '@/server/actions/progress';
import { pokeFilm } from '@/server/films/watcher';
import { validFilm } from '@/server/claude/thread';

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/progress'>): Promise<Response> {
  await connection();
  const { film } = await params;
  if (!validFilm(film)) return Response.json({ error: 'unknown film' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { card?: unknown; on?: unknown };
  const card = typeof body.card === 'string' ? body.card.trim() : '';
  if (!card) return Response.json({ error: 'card (the card\'s key) is required' }, { status: 400 });
  await setProgress(film, [card], body.on !== false);
  pokeFilm(film);
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
