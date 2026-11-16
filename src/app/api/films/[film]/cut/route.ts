// GET → the current timeline, every version, the current version's renders and the length of each file it plays
// (sourceSeconds: { src: seconds }) · GET ?version=v3 → that version.
// POST {basedOn, note, by, tracks, markers, fps?, width?, height?} (the Edit page's way until 14 Nov; since stage 2 of
// "saving apart from history" the page never calls it: its edits are steps, POST …/cut/working, and its saves POST
// …/cut/save; kept for any other caller) → validates, writes cut/v<n+1>.json; renders nothing
// (14 Nov, ASKS 44: the 480p is made when asked for, POST …/cut/render) unless HARNESS_AUTO_480P=1. basedOn must be the current version (409 otherwise: reload and apply the change again). (Undo was a POST
// of an older version's tracks with the note "undo to v3" until stage 2; it is now POST …/cut/undo, a pointer move.)
// When the film has a working cut, the version also becomes one step of its history by the user, marked saved
// (alma-drop.ts writePageVersion), so the working cut never drifts from what the page saved.
// The GET also answers `working` (rev, version, edited, equals, note, by, at; null until the working cut is made by one of
// the routes under cut/working, cut/undo … on 14 Nov, stage 1) and `history` (HistorySummary: the steps with their
// state hashes, no snapshots; null likewise). Reading never makes, seeds or repairs anything (working.ts peekWorking).
// It also answers `names` ({ v236: { name, at } }, harness/version-names.json). Under MOCK=boards it answers the sample's
// versions as its memory store holds them (the fixture's and the ones saved since), and ?version= from there too.
import { connection } from 'next/server';
import { isMock, mockCut } from '@/fixtures/mock';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { afterNewVersion, auto480p, renderStates } from '@/server/edit/render';
import { CutError, isVersion, readVersion, readVersions, sourceSeconds } from '@/server/edit/timeline';
import { writePageVersion } from '@/server/edit/alma-drop';
import { diskStore, mockVersions, peekWorking, readNames, type CutStore } from '@/server/edit/working';
import { storeFor } from '@/server/edit/working-http';
import { madeOf, type Timeline } from '@/server/types';

type Ctx = { params: Promise<{ film: string }> };

/** The working cut in brief and the history, as they are (nothing made); a damaged history is said in `workingError`. */
async function workingBrief(s: CutStore | undefined): Promise<Record<string, unknown>> {
  if (!s) return { working: null, history: null };
  // the names given to versions (harness/version-names.json), for the versions menu (stage 2)
  const names = await readNames(s).catch(() => ({}));
  return { ...(await briefOf(s)), names };
}
async function briefOf(s: CutStore): Promise<Record<string, unknown>> {
  try {
    const a = await peekWorking(s);
    if (!a) return { working: null, history: null };
    const { rev, version, edited, equals, note, by, at } = a.working;
    return { working: { rev, version, edited, equals, note, by, at }, history: a.history };
  } catch (e) {
    return { working: null, history: null, workingError: (e as Error).message };
  }
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (isMock()) {
    // MOCK=boards: the hand-written timeline, and the versions saved since in the sample's memory store (stage 2: the
    // page works on the working cut routes, as on a real film; nothing is written to disk). POST is never called.
    const slug = (await ctx.params).film;
    const fx = mockCut(slug);
    if (!fx) return Response.json({ error: `no cut fixture for "${slug}" under MOCK=boards` }, { status: 404, headers: NO_STORE });
    const s = await storeFor(slug).catch(() => undefined);
    const held = mockVersions(slug);
    const v = new URL(req.url).searchParams.get('version');
    if (v) {
      const t = held?.timelines.find((x) => x.version === v) ?? ([fx.current, ...(fx.timelines ?? [])] as Timeline[]).find((x) => x && x.version === v);
      if (!t) return Response.json({ error: `${v} does not exist` }, { status: 404, headers: NO_STORE });
      return Response.json({ film: slug, mock: true, timeline: t, renders: {} }, { headers: NO_STORE });
    }
    // the fixture's own list (it may name versions it holds no content for) and the ones saved since, oldest first
    const listed = (fx.versions ?? []) as { version: string }[];
    // with the marks of what each records as made from it (its renders: the versions menu, 15 Nov)
    const tls = [...(held?.timelines ?? []), fx.current, ...(fx.timelines ?? [])] as (Timeline | undefined)[];
    const versions = [...listed, ...(held?.versions ?? []).filter((x) => !listed.some((y) => y.version === x.version))]
      .sort((a, b) => Number(a.version.slice(1)) - Number(b.version.slice(1)))
      .map((x) => { const t = tls.find((y) => y && y.version === x.version); const made = t ? madeOf(t) : undefined; return made ? { ...x, made } : x; });
    const newest = held?.timelines[held.timelines.length - 1];
    const over = held ? { versions, ...(newest ? { current: newest } : {}), timelines: held.timelines.filter((t) => t !== newest) } : {};
    return Response.json({ film: slug, mock: true, ...fx, ...over, renders: {}, auto480p: auto480p(), ...(await workingBrief(s)) }, { headers: NO_STORE });
  }
  try {
    const film = await routeFilm((await ctx.params).film);
    const v = new URL(req.url).searchParams.get('version');
    if (v) {
      if (!isVersion(v)) throw new CutError('version must be "v<n>"');
      return Response.json({ film: film.slug, timeline: await readVersion(film, v), renders: await renderStates(film, v) }, { headers: NO_STORE });
    }
    const { versions, current, problems } = await readVersions(film);
    return Response.json({
      film: film.slug,
      versions,
      current: current ?? null,
      renders: current ? { [current.version]: await renderStates(film, current.version) } : {},
      // the length of every file the current version plays, so the page stops a trim or a join at a file's end
      sourceSeconds: current ? await sourceSeconds(film, current.tracks) : {},
      // HARNESS_AUTO_480P=1: the 480p of every version is rendered by itself (the page then says nothing to ask)
      auto480p: auto480p(),
      ...(Object.keys(problems).length ? { problems } : {}),
      ...(await workingBrief(diskStore(film))),
    }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

const BY = new Set(['user', 'alma', 'migration']);

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  if (isMock()) return Response.json({ error: 'MOCK=boards: the cut is a fixture and nothing is written' }, { status: 403, headers: NO_STORE });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  try {
    const film = await routeFilm((await ctx.params).film);
    if (!Array.isArray(body.tracks)) throw new CutError('tracks must be a list');
    if (body.basedOn !== undefined && body.basedOn !== null && !isVersion(body.basedOn)) throw new CutError('basedOn must be "v<n>"');
    // through the film's queue: the version, then the working cut and history brought along (one step, marked saved)
    const t = await writePageVersion(film, {
      basedOn: typeof body.basedOn === 'string' ? body.basedOn : undefined,
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : undefined,
      by: typeof body.by === 'string' && BY.has(body.by) ? (body.by as Timeline['by']) : 'user',
      tracks: body.tracks as Timeline['tracks'],
      markers: Array.isArray(body.markers) ? (body.markers as Timeline['markers']) : undefined,
      fps: typeof body.fps === 'number' ? (body.fps as Timeline['fps']) : undefined,
      width: typeof body.width === 'number' ? body.width : undefined,
      height: typeof body.height === 'number' ? body.height : undefined,
    });
    const render = await afterNewVersion(film.slug, t.version, 'page');
    return Response.json({ film: film.slug, version: t.version, timeline: t, render }, { status: 201, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}
