'use client';
// The one call every page makes for where the shots stand: the Shots page and Shot details
// through this hook, the Edit page's Takes view through pickupRows.ts pickupView. All three hand places.ts shotPlaces the
// same things: the takes cut into their shots, the shot lists and stands records (GET …/shotlist), the checks' planned
// cuts and the cut as the Edit page has it, each asked again when the film's files change.
import { useMemo } from 'react';
import type { Timeline } from '@/server/types';
import type { ShotList } from '@/server/films/read/shotlist';
import type { TakeShots } from '@/components/edit/shots';
import { copiesOf, unCopied } from '@/components/edit/pickupRows';
import { useJson } from '@/components/pages/postCommon';
import { shotPlaces, takeFolder, type Made, type ShotsList } from './places';

interface CutGet { current?: Timeline | null; working?: { rev: number; version?: string; edited?: boolean; equals?: string } | null }
interface WorkingGet { working?: { rev: number; version?: string; fps: Timeline['fps']; width: number; height: number; tracks: Timeline['tracks']; markers?: Timeline['markers']; note?: string; at: string } }

/** The cut as the Edit page has it now: the working cut when it was edited past the newest version, else that version
 *  (the board's What's next reads it the same way, flow/useWhatsNext.ts). Undefined while it is read or when there is none. */
export function useFilmCut(film: string, changed?: string): { tl?: Timeline; read: boolean } {
  const { data: cut, error } = useJson<CutGet>(`/api/films/${encodeURIComponent(film)}/cut`, changed);
  const w = cut?.working ?? undefined;
  const own = !!w && ((!!w.edited && !w.equals) || (!!w.equals && w.equals !== cut?.current?.version));
  const { data: wj } = useJson<WorkingGet>(own ? `/api/films/${encodeURIComponent(film)}/cut/working` : undefined, changed);
  return useMemo(() => {
    if (!own) return { tl: cut?.current ?? undefined, read: !!cut || !!error };
    const x = wj?.working;
    return { tl: x ? { version: `w${x.rev}`, fps: x.fps, width: x.width, height: x.height, at: x.at, tracks: x.tracks, markers: x.markers ?? [] } : undefined, read: !!x };
  }, [own, cut, error, wj]);
}

/** Every scene's places with every shot made of them (places.ts shotPlaces), once the shot lists and the cut are read;
 *  and the shot lists as read (`shotList`, for the page's other uses: the whole film's previz).
 *  `takes`: the takes the page lists (a copy of a listed take left out); `all`: every take, the copies too. */
export function useShotPlaces(film: string, state: { scenes: { id: string; title: string; shots?: number }[]; updatedAt?: string } | undefined,
  takes: TakeShots[], all: TakeShots[]): { list?: ShotsList; shotList: { data?: ShotList; error?: string } } {
  // asked again whenever the film's files change (a shots file or a stands record written after the page opened)
  const extra = useJson<ShotList>(state ? `/api/films/${encodeURIComponent(film)}/shotlist` : undefined, state?.updatedAt);
  const fc = useFilmCut(film, state?.updatedAt);
  const list = useMemo(() => {
    if (!state || !extra.data || !fc.read) return undefined;
    const checks = extra.data.checks ?? {};
    return shotPlaces({
      scenes: state.scenes.map((s) => ({ id: s.id, title: s.title, ...(s.shots ? { shots: s.shots } : {}) })),
      gens: extra.data.gens,
      takes: takes.map((t) => ({ ...t, ...(checks[takeFolder(t.src)] ? { planned: checks[takeFolder(t.src)] } : {}) })),
      // a clip of a copy of a pick-up take is a clip of that take
      cut: unCopied(fc.tl, copiesOf(all)),
    });
  }, [state, extra.data, takes, all, fc]);
  return { list, shotList: extra };
}

/** The shots of one take as the list places them, by their place in the take (Made.i). */
export function takePlaces(list: ShotsList | undefined, src: string): Map<number, Made & { place?: string }> {
  const out = new Map<number, Made & { place?: string }>();
  for (const s of list?.scenes ?? []) {
    for (const v of s.versions) for (const p of v.places) for (const m of p.versions) if (m.src === src && !out.has(m.i)) out.set(m.i, { ...m, place: p.id });
    for (const m of [...s.other, ...s.extras.map((x) => x.v)]) if (m.src === src && !out.has(m.i)) out.set(m.i, m);
  }
  return out;
}
