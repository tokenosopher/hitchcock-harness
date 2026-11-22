// GET ?v=v2 → {version, text}: one version of the story (the newest is already in the film state)
// POST {text, base?, force?, dryRun?} → saves the user's hand edit as the next story/v<n>.md
// POST {settle: "v3", dryRun?} → the user settles that version; Alma is told to write the script from it
import { connection } from 'next/server';
import { DRIVE_MISSING, driveConnected } from '@/server/actions/film';
import { PickError } from '@/server/actions/pick';
import { saveStory, settleStory, storyVersionText } from '@/server/actions/story';
import { isMock } from '@/fixtures/mock';
import { notifyHub } from '@/server/claude/notify';
import { storySent } from '@/components/lib/sent';

export async function GET(req: Request, { params }: RouteContext<'/api/films/[film]/story'>): Promise<Response> {
  await connection();
  const { film } = await params;
  const v = new URL(req.url).searchParams.get('v') ?? '';
  if (!/^v\d+$/.test(v)) return Response.json({ error: 'v must be a version like v2' }, { status: 400 });
  const text = await storyVersionText(film, v);
  if (text === undefined) return Response.json({ error: `no story ${v}` }, { status: 404 });
  return Response.json({ version: v, text }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request, { params }: RouteContext<'/api/films/[film]/story'>): Promise<Response> {
  await connection();
  const { film } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  if (!isMock() && !(await driveConnected())) return Response.json({ error: DRIVE_MISSING }, { status: 503 });
  const dryRun = body.dryRun === true;
  try {
    if (typeof body.settle === 'string') {
      const r = await settleStory(body.settle, film, { dryRun });
      // the story's item leaves the film's count of "Waiting for you" (the sidebar's white dot) at once
      if (!r.dryRun) notifyHub().userActed(film, [storySent('story', r.version)]);
      return Response.json(r, { headers: { 'cache-control': 'no-store' } });
    }
    const r = await saveStory({ text: typeof body.text === 'string' ? body.text : '', base: typeof body.base === 'string' ? body.base : undefined, force: body.force === true }, film, { dryRun });
    return Response.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof PickError) return Response.json({ error: e.message }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
