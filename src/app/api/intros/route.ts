// GET → IntroPrefs: which of Alma's step intros show (src/server/intros.ts, harness/step-intros.json).
// PATCH {off?: boolean, hide?: step, show?: step} → the prefs after the change.
import { connection } from 'next/server';
import { changeIntroPrefs, getIntroPrefs } from '@/server/intros';

const NO_STORE = { headers: { 'cache-control': 'no-store' } };

export async function GET() {
  await connection();
  return Response.json(await getIntroPrefs(), NO_STORE);
}

export async function PATCH(req: Request) {
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { off?: unknown; hide?: unknown; show?: unknown };
  const c = {
    off: typeof b.off === 'boolean' ? b.off : undefined,
    hide: typeof b.hide === 'string' ? b.hide : undefined,
    show: typeof b.show === 'string' ? b.show : undefined,
  };
  if (c.off === undefined && !c.hide && !c.show) return Response.json({ error: 'nothing to change' }, { status: 400 });
  return Response.json(await changeIntroPrefs(c), NO_STORE);
}
