// GET ?version=v<n>&f=<frame> → the film's picture at that frame of that version, as a PNG at the source's full size
//   (the picture clip under the frame, as the render stacks the tracks; mirrored when the clip is), as a download
//   named "<film>-<version>-<timecode>.png". Read-only: nothing is written into the film's folder.
//   ?version=working: the working cut as it is now (cut/working.json, stage 2 of "saving apart from history"), so a
//   frame of an edited cut is saved without saving a version first; the file is named "<film>-working-<timecode>.png".
import { connection } from 'next/server';
import { isMock } from '@/fixtures/mock';
import { MOCK_FRAME } from '@/fixtures/files';
import { errorResponse, NO_STORE, routeFilm } from '@/server/edit/http';
import { frameAt } from '@/server/edit/files';
import { CutError, isVersion, readVersion } from '@/server/edit/timeline';
import { diskStore, peekWorking } from '@/server/edit/working';
import type { Timeline } from '@/server/types';

type Ctx = { params: Promise<{ film: string }> };

const download = (png: Uint8Array, name: string): Response => new Response(new Uint8Array(png), {
  headers: { 'content-type': 'image/png', 'content-length': String(png.length), 'content-disposition': `attachment; filename="${name}"`, ...NO_STORE },
});

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const q = new URL(req.url).searchParams;
  const version = q.get('version') ?? '';
  const f = Number(q.get('f'));
  const slug = (await ctx.params).film;
  try {
    if (version !== 'working' && !isVersion(version)) throw new CutError('version must be "v<n>" or "working"');
    if (!Number.isInteger(f) || f < 0 || f > 10_000_000) throw new CutError('f must be a frame number');
    if (isMock()) {
      // sample-data mode: the files do not exist; a grey picture under the same name
      if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) throw new CutError('unknown film', 404);
      const s = Math.floor(f / 24), p = (n: number) => String(n).padStart(2, '0');
      return download(MOCK_FRAME, `${slug}-${version}-${p(Math.floor(s / 3600))}-${p(Math.floor(s / 60) % 60)}-${p(s % 60)}-${p(f % 24)}.png`);
    }
    const film = await routeFilm(slug);
    let tl: Timeline;
    if (version === 'working') {
      const w = (await peekWorking(diskStore(film)))?.working;
      if (!w) throw new CutError('this film has no working cut yet', 404);
      tl = { version: 'working', fps: w.fps, width: w.width, height: w.height, at: w.at, tracks: w.tracks, markers: w.markers };
    } else tl = await readVersion(film, version);
    const { png, name } = await frameAt(film, tl, f);
    return download(png, name);
  } catch (e) {
    return errorResponse(e);
  }
}
