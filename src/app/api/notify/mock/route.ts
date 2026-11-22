// The test hook that plays the notify hub's part for a sample film (MOCK=boards only, 404 otherwise): POST
// {film, kind: "turn" | "pick" | "task", text?} sends the notice every page gets on GET /api/notify, as when Alma's
// reply lands ("turn"), a new card waits for the user ("pick") or a sub-agent ends ("task"). A "pick" also moves the
// film to the top of the sidebar, as the real hub does (src/server/claude/notify.ts); a "turn" does not. The white dot
// does not follow these notices: it follows the sample's own "Waiting for you".
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { notifyHub } from '@/server/claude/notify';
import { validFilm } from '@/server/claude/thread';

const KINDS = ['turn', 'pick', 'task'] as const;

export async function POST(req: Request): Promise<Response> {
  await connection();
  if (!isMock()) return Response.json({ error: 'Not found' }, { status: 404 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { film?: unknown; kind?: unknown; text?: unknown };
  const kind = KINDS.find((k) => k === b.kind);
  if (typeof b.film !== 'string' || !validFilm(b.film) || !kind) return Response.json({ error: `{film, kind}: kind is one of ${KINDS.join(', ')}` }, { status: 400 });
  const text = typeof b.text === 'string' && b.text ? b.text : kind === 'pick' ? '1 pick waiting' : kind === 'turn' ? 'finished' : 'done';
  await notifyHub().mockNotice(b.film, kind, text);
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
