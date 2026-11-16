// FilmState.cut's timeline part: the versions, the current one and the render states, added to whatever the cut
// reader derived from the record (src/server/films/read/cut.ts). A film whose only cut is the harness's own
// timeline gets a CutInfo built from it.
import type { CutInfo, CutRenders } from '../types';
import { renderStates } from './render';
import { filmTargetOf, frameOf, readVersions, timelineLength } from './timeline';
import { ensureCutWatch } from './watch';

export async function withTimeline(slug: string, dir: string, repo: string, title: string, legacy: CutInfo | undefined): Promise<CutInfo | undefined> {
  const film = filmTargetOf(slug, dir, repo, title);
  const { versions, current } = await readVersions(film).catch(() => ({ versions: [], current: undefined }));
  if (!current) return legacy;
  ensureCutWatch(film);
  const renders: Record<string, CutRenders> = {};
  for (const v of versions) renders[v.version] = await renderStates(film, v.version);
  const day = current.at.slice(0, 10);
  const base: CutInfo = legacy ?? {
    name: `cut ${current.version}`,
    fps: current.fps,
    frames: frameOf(timelineLength(current), current.fps),
    source: { cut: `cut ${current.version}`, from: [`cut/${current.version}.json`], date: day, label: `from cut/${current.version}.json` },
  };
  return { ...base, versions, current, renders };
}
