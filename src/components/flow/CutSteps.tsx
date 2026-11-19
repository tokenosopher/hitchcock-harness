'use client';
// What the flow's Shots and Edit steps show under the board (ASKS 46, boards 11 and 16).
// Shots: the cut scene by scene, each shot a frame as wide as its seconds; a press opens the scene on the timeline.
// Edit: the Edit page's "What's next" list (left.ts, LeftTab), worked out from the same files and routes as the Edit
// page does it, with the way to the timeline. A press on a row goes where that row leads on the Edit page.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { FilmState, Timeline } from '@/server/types';
import { Media } from '@/components/media/Media';
import { IconChevronRight } from '@/components/shell/icons';
import { useShots } from '@/components/edit/ShotViews';
import { mainTracks, sceneOf, shotTimeline, type BySrc } from '@/components/edit/shots';
import type { LeftDo } from '@/components/edit/left';
import { goTakesAsk } from '@/components/edit/early';
import { useSendAsUser } from '@/components/release/AskAlma';
import { NO_CUT, useLeftReads } from './useWhatsNext';
import { LeftTab } from '@/components/edit/LeftTab';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const secs = (n: number) => `${Math.round(n)} s`;

interface SceneStrip { id: string; title: string; at: number; seconds: number; shots: { id: string; src?: string; mid: number; seconds: number }[] }

/** The cut's picture, scene by scene, split at the takes' own shot cuts (the Edit page's way, shots.ts). */
function stripsOf(s: FilmState, tl: Timeline, by: BySrc): SceneStrip[] {
  const v = mainTracks(shotTimeline(tl, by)).v;
  const out: SceneStrip[] = [];
  for (const c of [...(v?.clips ?? [])].sort((a, b) => a.at - b.at)) {
    const scene = sceneOf(c, by);
    if (!scene) continue;
    const len = (c.out - c.in) / (c.speed && c.speed > 0 ? c.speed : 1);
    let st = out.find((x) => x.id === scene);
    if (!st) out.push((st = { id: scene, title: s.scenes.find((x) => x.id === scene)?.title ?? scene, at: c.at, seconds: 0, shots: [] }));
    st.seconds += len;
    st.shots.push({ id: c.id, src: c.src, mid: (c.in + c.out) / 2, seconds: len });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** "34 shots in cut v239 · each frame as wide as its seconds", or the scene files' own count before there is a cut. */
export function shotsLine(s: FilmState): string {
  const tl = s.cut?.current;
  // only the scenes whose file is written count, as on the Shots box and its rows ("0 of 10", "not written")
  const written = s.scenes.filter((x) => x.sceneFile);
  const n = written.reduce((k, sc) => k + (sc.shots ?? 0), 0);
  if (!s.scenes.length) return 'no scenes yet';
  if (tl) return `${plural(s.scenes.length, 'scene')} in cut ${tl.version} · each frame as wide as its seconds`;
  if (n && written.length === s.scenes.length) return `${plural(n, 'shot')} in ${plural(s.scenes.length, 'scene file')}`;
  return `${written.length} of ${plural(s.scenes.length, 'scene file')} written`;
}

/** Board 11. Without a cut yet, the scene files' own rows (today's list) stay. */
export function ShotsStep({ s, base, fallback }: { s: FilmState; base: string; fallback: React.ReactNode }) {
  const shots = useShots(s.film.slug);
  const tl = s.cut?.current;
  const strips = useMemo(() => (tl ? stripsOf(s, tl, shots.by) : []), [s, tl, shots.by]);
  if (!tl || !strips.length) return <>{fallback}</>;
  const longest = Math.max(...strips.map((x) => x.seconds), 1);
  // the longest scene fills about 420 px; a shot is never thinner than 4 px
  const k = Math.min(16, 420 / longest);
  const fps = tl.fps;
  return (
    <div data-shots className="flex flex-col gap-2.5">
      <p className="m-0 text-[12.5px] text-sub">Pressing a scene opens it on the timeline.</p>
      <div className="overflow-hidden rounded-[10px] border border-edge">
        {strips.map((st, i) => (
          <Link key={st.id} href={`${base}/edit?at=${Math.round(st.at * fps)}`} data-shot-scene={st.id}
            className={`group/sc flex min-h-[58px] items-center gap-4 bg-transparent px-3 py-1.5 text-ink no-underline transition-colors duration-150 hover:bg-raised/60 ${i > 0 ? 'border-t border-line' : ''}`}>
            <span className="flex w-[180px] flex-none flex-col gap-0.5 max-[760px]:w-[120px]">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug">{st.id} · {st.title}</span>
              <span className="text-[12px] text-sub">{plural(st.shots.length, 'shot')} · {secs(st.seconds)}</span>
            </span>
            <span className="flex min-w-0 flex-1 gap-px overflow-hidden" aria-label={`${st.id}: ${plural(st.shots.length, 'shot')}`}>
              {/* each frame as wide as its seconds */}
              {st.shots.map((x) => (
                <span key={x.id} data-shot-frame style={{ width: Math.max(4, x.seconds * k) }} className="block flex-none overflow-hidden rounded-[3px]">
                  <Media path={x.src} w={160} t={x.mid} missingLabel="" className="h-11 w-full" />
                </span>
              ))}
            </span>
            <IconChevronRight size={14} className="flex-none text-mute transition-colors duration-150 group-hover/sc:text-ink" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Board 16: the Edit page's "What's next" list, from what the Edit page reads (the working cut, the version it is, its
 *  renders, the full-size pictures, the Seedance marks and the left route), built by the same leftInputOf. */
export function EditNext({ s, base }: { s: FilmState; base: string }) {
  const router = useRouter();
  // the same reads as the board's Edit box (useWhatsNext.ts useLeftReads), the early steps included
  const { film, cut, cutError, leftTl, input, left, ref, edited } = useLeftReads(s);
  const sendAs = useSendAsUser(film);
  const currentVersion = ref;
  // every press but a tick and Release goes to the Edit page, where the row's own action is
  const onDo = useCallback((d: LeftDo) => {
    const h = cut?.history;
    if (d.kind === 'tick' && currentVersion) { void left.tick({ tick: d.tick, cut: currentVersion, ...(h?.steps[h.at] ? { state: h.steps[h.at].state, ...(typeof h.steps[h.at].rev === 'number' ? { step: h.steps[h.at].rev } : {}) } : {}), ...(edited ? { edited: true } : {}) }); return; }
    if (d.kind === 'release') { router.push(`${base}/release`); return; }
    if (d.kind === 'page') { router.push(`${base}/${d.page}`); return; }
    if (d.kind === 'go-takes') { void sendAs(goTakesAsk(d.n, d.scenes)); return; }
    router.push(`${base}/edit`);
  }, [left, currentVersion, router, base, cut?.history, edited, sendAs]);
  if (!cut && !cutError) return <p className="m-0 text-[13px] text-sub duration-200 animate-in fade-in-0">Reading the cut…</p>;
  if (!input) return <p className="m-0 text-[13px] text-sub">No cut yet: the list starts with the first version of the timeline.</p>;
  return (
    <div data-edit-next className="flex flex-col gap-3">
      <LeftTab film={film} tl={leftTl ?? NO_CUT} input={input} onDo={onDo} onUntick={(st) => st.ticked && void left.tick({ untick: st.ticked })} error={left.error} from="What's next on the film's board" />
    </div>
  );
}
