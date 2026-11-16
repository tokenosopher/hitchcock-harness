// The Release pages' one route (14 Nov 2026; the shape and the rules: src/components/release/).
//   GET  → ReleaseView: social/release.json and what is derived from it at the server's clock; the masters on offer
//          while no final is named (or with ?masters=1); the final's companions; the cut now; the delivery's Social
//          kit folder when there is one; for a film with only social/kit.md, today's read-only kit page (`legacy`).
//   POST {op, …} → one operation (ops.ts) applied to the file read fresh, checked and written; 409 {error} with the
//          plain reason when the rules refuse it. {op: "nameFinal", path} names a master on offer as the final and
//          asks the render queue for its companions (nothing is spent).
// Outside production both take ?now= (the tests' clock). In sample-data mode the file lives in memory.
import path from 'node:path';
import { connection } from 'next/server';
import { isMock, mockCut, mockState } from '@/fixtures/mock';
import { RELEASE_SAMPLES, SAMPLE_MASTERS, releaseSeed, sampleCompanions, sampleFinal, sampleKitRelease } from '@/fixtures/release';
import { resetMockCards } from '@/server/release/mockAlma';
import { leftReleaseSeed } from '@/fixtures/left';
import { mockRenderFiles } from '@/fixtures/renders';
import { fileWords } from '@/components/edit/renderList';
import { getFilmState } from '@/server/films/state';
import { readRelease, shownFolder } from '@/server/films/read/release';
import { harnessConfig } from '@/server/config';
import { listSlow } from '@/server/films/util';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { clockOf } from '@/server/release/clock';
import { mockOperate, mockReleases, operate, readReleaseFile } from '@/server/release/file';
import { buildFinal, companionStatus, finalFacts, listMasters, optionsOf, queueCompanions } from '@/server/release/final';
import { deriveAll } from '@/components/release/derive';
import { cutNowView as cutView, finalNames, masterRows, type MasterOption } from '@/components/release/masters';
import { parseOp, type ReleaseOp } from '@/components/release/ops';
import type { ReleaseFile } from '@/components/release/file';
import type { ReleaseView } from '@/components/release/view';
import { versionPart } from '@/server/edit/timeline';
import type { Timeline } from '@/server/types';

type Ctx = { params: Promise<{ film: string }> };
const refused = (error: string, status = 409) => Response.json({ ok: false, error }, { status, headers: NO_STORE });

// ---- sample-data mode

const mockSeed = (slug: string) => (): ReleaseFile | undefined => releaseSeed(slug) ?? leftReleaseSeed(slug);
const mockFile = (slug: string): ReleaseFile | undefined => (mockReleases.has(slug) ? mockReleases.get(slug) ?? undefined : mockSeed(slug)());
/** The masters a sample film offers: the board's three, or the masters the sample renders made (the Edit page). */
function mockMasters(slug: string): MasterOption[] {
  if (RELEASE_SAMPLES[slug] && slug !== 'sample-release-kit') return SAMPLE_MASTERS;
  return mockRenderFiles(slug).filter((f) => f.kind === 'master' && !f.earlier && /\.mp4$/.test(f.path) && !/\.picture\./.test(f.path)).map((f) => {
    // a "More renders" file says what it is, as the real list does (final.ts listMasters): "· smaller file (60 MB, from 101 MB)"
    const extra = f.tag ? fileWords(f, 1080, 1920).extra : undefined;
    return {
      path: f.path, version: f.version, title: `Master of ${f.version}${extra ? ` · ${extra}` : ''}`, at: f.at, bytes: f.bytes, ...(f.small ? { fromBytes: f.small.fromBytes } : {}), seconds: f.seconds, current: true, still: f.path,
      rows: masterRows({ picture: f.picture, lines: 8, subtitlesLeft: false, sound: ['Dialogue', 'Music'], soundLeft: [], seconds: f.seconds, width: 1080, height: 1920, bytes: f.bytes, ...(f.small ? { fromBytes: f.small.fromBytes } : {}) }, { seconds: f.seconds, lines: 8 }),
    };
  });
}

async function mockGet(slug: string, now: Date, wantMasters: boolean, light: boolean): Promise<ReleaseView> {
  const st = mockState(slug);
  const file = mockFile(slug);
  if (light) return { film: slug, mock: true, file };
  const fm = file?.final ? mockMasters(slug).find((m) => m.path === file.final!.path) : undefined;
  const legacy = slug === 'sample-release-kit' && !file ? sampleKitRelease(slug) : undefined;
  return {
    film: slug, mock: true, file, derived: file ? deriveAll(file, now) : undefined,
    masters: !legacy && (!file?.final || wantMasters) ? mockMasters(slug) : undefined,
    companions: file?.final ? sampleCompanions(file.final, now) : undefined,
    finalFile: fm ? { bytes: fm.bytes, seconds: fm.seconds, width: 1080, height: 1920, ...(fm.fromBytes ? { fromBytes: fm.fromBytes } : {}) } : undefined,
    cut: cutView(st?.cut?.current, file?.final, ((mockCut(slug)?.timelines ?? []) as Timeline[]).find((t) => t.version === file?.final?.version)),
    kit: slug === 'sample-release-open' ? { shown: 'assets/final-cuts/2026-11-14 The Lighthouse/Social kit', folder: path.join(/*turbopackIgnore: true*/ harnessConfig().driveRoot, 'final-cuts', '2026-11-14 The Lighthouse', 'Social kit') } : undefined,
    legacy,
  };
}

// ---- the routes

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const q = new URL(req.url).searchParams;
  const now = clockOf(req);
  if (isMock()) {
    // a test starts from the sample as it was seeded
    if (q.get('reset') === '1') { mockReleases.delete(slug); resetMockCards(slug); }
    return Response.json(await mockGet(slug, now, q.get('masters') === '1', q.get('light') === '1'), { headers: NO_STORE });
  }
  try {
    const state = await getFilmState(slug);
    if (!state) return Response.json({ error: `No film "${slug}" in the registry (or the studio folder is missing)` }, { status: 404, headers: NO_STORE });
    const film = await routeFilm(slug);
    const r = await readReleaseFile(film);
    // the Edit page's Renders tab wants only the file (which master is the final, whether anything is posted)
    if (q.get('light') === '1') return Response.json({ film: slug, file: r.file, problems: r.problems.length ? r.problems : undefined } satisfies ReleaseView, { headers: NO_STORE });
    const current = state.cut?.current;
    const legacy = !r.exists && state.post?.kit ? await readRelease(state) : undefined;
    // the delivery's Social kit, read under a time limit (a synced folder can hang on a permission prompt)
    let kit: ReleaseView['kit'];
    for (const d of state.film.more.deliveryFolders) {
      const top = await listSlow(d.folder);
      const k = top?.find((e) => e.dir && /^social kit$/i.test(e.name));
      if (k) { kit = { folder: path.join(d.folder, k.name), shown: `${shownFolder(d.folder)}/${k.name}` }; break; }
    }
    const view: ReleaseView = {
      film: slug, file: r.file, problems: r.problems.length ? r.problems : undefined, derived: r.file ? deriveAll(r.file, now) : undefined,
      masters: !legacy && (!r.file?.final || q.get('masters') === '1') ? await listMasters(film, current, state.master) : undefined,
      companions: r.file?.final ? await companionStatus(film, r.file.final) : undefined,
      finalFile: r.file?.final ? await finalFacts(film, r.file.final) : undefined,
      cut: cutView(current, r.file?.final, r.file?.final && current && r.file.final.version !== current.version ? await versionPart(film, r.file.final.version) : undefined), kit, legacy,
    };
    return Response.json(view, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const slug = (await ctx.params).film;
  const now = clockOf(req);
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return refused('The operation was not JSON.', 400); }
  const naming = body?.op === 'nameFinal';
  if (naming && typeof body.path !== 'string') return refused('"nameFinal" needs the "path" of a master on offer.', 400);
  const parsed = naming ? undefined : parseOp(body);
  if (typeof parsed === 'string') return refused(parsed, 400);
  try {
    if (isMock()) {
      let op = parsed as ReleaseOp;
      if (naming) {
        const m = mockMasters(slug).find((x) => x.path === body.path);
        if (!m) return refused('That is not one of the masters on offer.', 404);
        if (m.stale) return refused(`The master of ${m.version} is out of date: ${m.stale}. Render it again in the Renders tab first.`);
        op = { op: 'nameFinal', final: sampleFinal(mockState(slug)?.film.title ?? RELEASE_SAMPLES[slug]?.title ?? slug, m, now) };
      }
      const r = await mockOperate(slug, mockSeed(slug), op, now);
      if (!r.ok) return refused(r.refused);
      return Response.json({ ok: true, file: r.file, said: r.said, derived: deriveAll(r.file, now), companions: r.file.final ? sampleCompanions(r.file.final, now) : undefined }, { headers: NO_STORE });
    }
    const film = await routeFilm(slug);
    let op = parsed as ReleaseOp;
    if (naming) {
      const state = await getFilmState(slug);
      const masters = await listMasters(film, state?.cut?.current, state?.master);
      const m = masters.find((x) => x.path === body.path);
      if (!m) return refused('That is not one of the masters on offer.', 404);
      const final = await buildFinal(film, m, await optionsOf(film, m.path), now);
      if (typeof final === 'string') return refused(final);
      op = { op: 'nameFinal', final: { ...final, name: finalNames(state?.film.title ?? film.title).final } };
    }
    const r = await operate(film, op, now);
    if (!r.ok) return refused(r.refused);
    if (naming && r.file.final) await queueCompanions(film, r.file.final);
    return Response.json({ ok: true, file: r.file, said: r.said, derived: deriveAll(r.file, now), companions: r.file.final ? await companionStatus(film, r.file.final) : undefined }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e);
  }
}

