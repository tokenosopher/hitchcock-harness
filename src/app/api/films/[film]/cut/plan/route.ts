// The timeline from day one (15 Nov 2026, ASKS 47; ARCHITECTURE.md "The timeline from day one"; src/server/edit/plan.ts).
//   GET  → { film, locked, first?, pending? }: whether the script is locked, whether the film has no cut yet, and the
//          words of what an update would bring in (absent when the cut already says what the files say). Writes nothing.
//   POST { action: "update" } → the cut brought up to date with the locked script, the shot lists and the boards, as ONE
//          step (the first cut, v1, when the film has none);
//        { action: "take", scene, take? } → the scene's take in place of its boards (the take: its name or its file;
//          default the scene's first take with a video);
//        { action: "boards", scene } → "Put the boards back": the scene's take out, its boards back.
//        Each takes `rev` (optional: the working cut's rev, 409 "stale" when it moved) and `by` ("alma", the default: a
//        step by Alma, saved as a version with her words, as a drop is; "user": a step only, as an edit on the page).
//        → 200/201 { film, working, history, words, version?, same?, kept? }; 409 with the reason in words.
// Under MOCK=boards the sample films' plans and takes come from src/fixtures/day1.ts, in memory; nothing is written.
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { mockPlanSource, mockPlanTakes } from '@/fixtures/day1';
import { NO_STORE, routeFilm } from '@/server/edit/http';
import { planBoards, planPending, planTake, planUpdate, readPlanSource, takeInfo } from '@/server/edit/plan';
import { filmShots } from '@/server/edit/shots';
import { CutError } from '@/server/edit/timeline';
import { WorkingError } from '@/server/edit/working';
import { bodyOf, refusal, storeFor, type Ctx } from '@/server/edit/working-http';
import type { TakeIn } from '@/components/edit/planned';

async function sourceOf(slug: string) {
  if (isMock()) return mockPlanSource(slug);
  return readPlanSource(await routeFilm(slug));
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  try {
    const src = await sourceOf(slug);
    const s = await storeFor(slug).catch(() => undefined);
    return Response.json({ film: slug, ...(isMock() ? { mock: true } : {}), ...(await planPending(s, src)) }, { headers: NO_STORE });
  } catch (e) {
    return refusal(e);
  }
}

/** The take a scene's boards give way to: the one named (by its name or its file), else the scene's first with a video. */
async function takeFor(slug: string, scene: string, want?: string): Promise<TakeIn> {
  if (isMock()) {
    const t = mockPlanTakes(slug).find((x) => x.scene === scene && (!want || x.name === want || x.src === want));
    if (!t) throw new CutError(`${scene} has no take with a video${want ? ` named ${want}` : ''}.`, 409);
    return { src: t.src, name: t.name, seconds: t.seconds, sound: true };
  }
  const film = await routeFilm(slug);
  const { takes } = await filmShots(film);
  const t = takes.filter((x) => x.scene === scene && x.state !== 'making' && x.state !== 'failed').find((x) => !want || x.name === want || x.src === want);
  if (!t) throw new CutError(`${scene} has no take with a video${want ? ` named ${want}` : ''}.`, 409);
  const info = await takeInfo(film, t);
  if (!info) throw new CutError(`${t.src} could not be read.`, 409);
  return info;
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  let s;
  try {
    s = await storeFor(slug);
    const b = await bodyOf(req);
    if (b.rev !== undefined && (typeof b.rev !== 'number' || !Number.isInteger(b.rev))) throw new WorkingError('bad-request', 'rev must be the working cut\'s rev (a whole number)', 400);
    const o = { by: b.by === 'user' ? 'user' as const : 'alma' as const, ...(typeof b.rev === 'number' ? { rev: b.rev } : {}) };
    const scene = typeof b.scene === 'string' && /^S\d+[A-Za-z]?$/.test(b.scene) ? b.scene : undefined;
    let out;
    if (b.action === 'update') out = await planUpdate(s, await sourceOf(slug), o);
    else if (b.action === 'take') {
      if (!scene) throw new WorkingError('bad-request', 'scene must be a scene id ("S3")', 400);
      out = await planTake(s, scene, await takeFor(slug, scene, typeof b.take === 'string' ? b.take : undefined), o);
    } else if (b.action === 'boards') {
      if (!scene) throw new WorkingError('bad-request', 'scene must be a scene id ("S3")', 400);
      out = await planBoards(s, scene, await sourceOf(slug), o);
    } else throw new WorkingError('bad-request', 'action must be "update", "take" or "boards"', 400);
    return Response.json({ film: slug, ...(isMock() ? { mock: true } : {}), ...out }, { status: out.same ? 200 : 201, headers: NO_STORE });
  } catch (e) {
    return refusal(e, s);
  }
}
