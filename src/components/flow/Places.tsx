'use client';
// What the flow's place steps show under the board (ASKS 46, boards 8 to 10): Locations (each place with the main
// image that was picked, its views, scenes and props), one place deeper, and Views (every view of each place). The
// rounds and the picking stay on the Locations page and at "Waiting for you"; these read the same files.
import Link from 'next/link';
import type { FilmState, LocationRef, Round } from '@/server/types';
import { lastRound, locationSettled, roundProgress } from '@/components/lib/derive';
import { fmtDate, repoPath } from '@/components/lib/format';
import { Media } from '@/components/media/Media';
import { Dot } from '@/components/shell/atoms';
import { IconCheck, IconChevronDown, IconChevronRight } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { rememberBack } from '@/components/shell/BackLink';

type Chip = (id: string, label: string, ref?: string) => void;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listWords = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** A place's name as a title: "the lamp room" → "The lamp room". */
export const placeName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
/** The floor plan is kept with the views ("L01-…-plan-v5.png"); it is shown apart from them, last. */
const isPlan = (v: { camera: string }) => /^plan\b/i.test(v.camera);

/** The round the main image was picked from. */
export const pickedRound = (l: LocationRef): Round | undefined => [...(l.styleImages ?? [])].reverse().find((r) => r.pick);

/** The scenes set in a place, from each scene file's location ("L01 the shore"): "S1 to S6", "S7", "S2 and S5". */
export function scenesIn(s: FilmState, l: LocationRef): string {
  const ids = s.scenes.filter((sc) => sc.location && new RegExp(`^${l.id}\\b`).test(sc.location)).map((sc) => sc.id);
  if (ids.length < 3) return listWords(ids);
  const nums = ids.map((i) => Number(/\d+/.exec(i)?.[0]));
  const run = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return run ? `${ids[0]} to ${ids[ids.length - 1]}` : listWords(ids);
}

/** "main image picked 11 Nov, from 3", or where the place stands while it is not picked. */
function mainLine(l: LocationRef): { done: boolean; text: string } {
  const r = pickedRound(l);
  if (r?.pick) return { done: true, text: `main image picked${r.date ? ` ${fmtDate(r.date)}` : ''}, from ${r.candidates.length}` };
  if (locationSettled(l)) return { done: true, text: 'main image settled' };
  const last = lastRound(l.styleImages);
  if (!last) return { done: false, text: 'no main image yet' };
  const p = roundProgress(last);
  return { done: false, text: p.pending ? `main image: ${p.landed} of ${p.asked} landed` : `main image: ${p.landed} to pick from` };
}

const propPicture = (p: NonNullable<LocationRef['props']>[number]): string | undefined =>
  p.path ?? p.rounds?.flatMap((r) => r.candidates).find((c) => c.id === p.pick)?.path ?? lastRound(p.rounds)?.candidates.find((c) => c.path)?.path;

/** "2 places, 4 props". */
export function placesLine(s: FilmState): string {
  const props = s.locations.reduce((n, l) => n + (l.props?.length ?? 0), 0);
  return [plural(s.locations.length, 'place'), props ? plural(props, 'prop') : ''].filter(Boolean).join(', ');
}

/** "56 views of the 2 places". */
export function viewsLine(s: FilmState): string {
  const settled = s.locations.filter(locationSettled);
  const n = settled.reduce((k, l) => k + (l.views?.length ?? 0), 0);
  if (!settled.length) return 'Views are made once a main image is picked.';
  return `${plural(n, 'view')} of ${settled.length === 1 ? 'the place' : `the ${settled.length} places`}`;
}

/** Board 8: each place as a card with its main image; a press opens the place. */
export function LocationsStep({ s, onAt, onChip }: { s: FilmState; onAt: (id: string) => void; onChip: Chip }) {
  const toRepo = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  if (!s.locations.length) return <p className="m-0 text-[13px] text-sub">No places in locations/ yet.</p>;
  return (
    <div data-places className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
      {s.locations.map((l) => {
        const main = mainLine(l);
        const where = scenesIn(s, l);
        const props = l.props ?? [];
        const views = l.views?.length ?? 0;
        return (
          <article key={l.id} data-place={l.id} className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-edge bg-panel">
            {/* the whole card opens the place; its picture opens full screen there */}
            <button type="button" data-no-zoom onClick={() => { onAt(l.id); onChip(`loc:${l.id}`, `${l.id} · ${l.name}`, l.master?.path); }} aria-label={`Open ${l.name}`}
              className="group/place flex min-w-0 cursor-pointer flex-col border-0 bg-transparent p-0 text-left text-ink">
              <Media path={toRepo(l.master?.path)} w={640} missingLabel={l.master?.path ? undefined : 'no main image yet'} className="aspect-[16/9] w-full" />
              <span className="flex items-center gap-2 px-3 pb-1 pt-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{placeName(l.name)}</span>
                <IconChevronRight size={14} className="flex-none text-mute transition-colors duration-150 group-hover/place:text-ink" />
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 px-3 text-[12px] text-ink-3">
                {main.done ? <IconCheck size={12} className="flex-none text-ok" /> : <Dot state="waiting" />}
                <span>{main.text}</span>
                {views > 0 && <><span className="text-mute">·</span><span>{plural(views, 'view')}</span></>}
                {where && <><span className="text-mute">·</span><span>{where}</span></>}
              </span>
            </button>
            <div className="flex min-w-0 items-center gap-2 px-3 pb-3 pt-2.5">
              {props.length ? (
                <>
                  <span className="flex flex-none gap-1.5">
                    {props.slice(0, 4).map((p) => (
                      <button key={p.id} type="button" onClick={() => onChip(`prop:${p.id}`, `${p.id} · ${p.name}`, propPicture(p))} aria-label={p.name} title={p.name}
                        className="cursor-pointer rounded-[5px] border-0 bg-transparent p-0">
                        <Media path={toRepo(propPicture(p))} w={160} missingLabel="" className="size-9 rounded-[5px] border border-edge" />
                      </button>
                    ))}
                  </span>
                  <span className="line-clamp-2 min-w-0 text-[11.5px] leading-snug text-sub">{plural(props.length, 'prop')}: {listWords(props.map((p) => p.name))}</span>
                </>
              ) : <span className="text-[12px] text-sub">No props here.</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Board 10: every view of each place, a row of pictures per place; a press opens the place. */
export function ViewsStep({ s, onAt, onChip }: { s: FilmState; onAt: (id: string) => void; onChip: Chip }) {
  const toRepo = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  const places = s.locations.filter(locationSettled);
  if (!places.length) return <p className="m-0 text-[13px] text-sub">No main image is picked yet, so there are no views.</p>;
  const SHOWN = 10;
  return (
    <div data-views className="flex flex-col gap-3">
      {places.map((l) => {
        const all = l.views ?? [];
        // the views first, the floor plan last with its word on it
        const v = [...all.filter((x) => !isPlan(x)), ...all.filter(isPlan)];
        return (
          <article key={l.id} data-view-place={l.id} className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-edge bg-panel px-3 py-3">
            <button type="button" onClick={() => onAt(l.id)} aria-label={`Open ${l.name}`} className="group/v flex min-h-6 min-w-0 max-[760px]:min-h-11 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-ink">
              <span className="truncate text-[13.5px] font-medium">{placeName(l.name)}</span>
              <span className="flex-none text-[12px] text-sub">{plural(v.length, 'view')}</span>
              <IconChevronRight size={14} className="ml-auto flex-none text-mute transition-colors duration-150 group-hover/v:text-ink" />
            </button>
            {v.length ? (
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {v.slice(0, SHOWN).map((x) => (
                  <button key={x.path} type="button" onClick={() => onChip(`view:${l.id}:${x.camera}`, `${l.id} · ${x.camera}`, x.path)} aria-label={`${l.name}, ${x.camera}`} title={x.camera}
                    className="relative cursor-pointer rounded-[5px] border-0 bg-transparent p-0">
                    <Media path={toRepo(x.path)} w={160} missingLabel="" fit={isPlan(x) ? 'contain' : undefined} className={cn('aspect-[4/5] w-14 rounded-[5px] border border-edge', isPlan(x) && 'bg-[#f4f1ea]')} />
                    {isPlan(x) && <span className="absolute bottom-[3px] left-[3px] rounded-[3px] bg-black/80 px-1 text-[10.5px] leading-[14px] text-ink">plan</span>}
                  </button>
                ))}
                {v.length > SHOWN && (
                  <button type="button" onClick={() => onAt(l.id)} className="flex aspect-[4/5] w-14 cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed border-edge-strong bg-transparent text-[11px] leading-tight text-sub hover:text-ink">
                    <span>{v.length - SHOWN}</span><span>more</span>
                  </button>
                )}
              </div>
            ) : <span className="text-[12px] text-sub">No views yet.</span>}
          </article>
        );
      })}
      <p className="m-0 text-[12.5px] text-sub">Pressing a place opens it, with every view{places.some((l) => l.views?.some(isPlan)) ? ' and its floor plan' : ''}.</p>
    </div>
  );
}

/** Board 9: one place, deeper: its main image and facts at the left, every view at the right, then its props. */
export function PlaceDeep({ s, l, base, onChip }: { s: FilmState; l: LocationRef; base: string; onChip: Chip }) {
  const toRepo = (rel?: string) => (rel ? repoPath(s.film.folder, s.film.repo, rel) : undefined);
  const r = pickedRound(l);
  const others = r ? r.candidates.filter((c) => c.id !== r.pick && c.path) : [];
  const main = mainLine(l);
  const where = scenesIn(s, l);
  const views = (l.views ?? []).filter((v) => !isPlan(v));
  const plan = (l.views ?? []).find(isPlan);
  const props = l.props ?? [];
  return (
    <div data-place-deep={l.id} className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-4 max-[900px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-3">
        <Media path={toRepo(l.master?.path)} w={640} missingLabel={l.master?.path ? undefined : 'no main image yet'} className="aspect-[16/9] w-full rounded-[9px] border border-edge" />
        <dl className="m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px] leading-normal">
          <dt className="text-sub">Main image</dt>
          <dd className="m-0 flex items-center gap-1.5">{main.done ? <IconCheck size={12} className="flex-none text-ok" /> : <Dot state="waiting" />}{main.text.replace(/^main image:? /, '')}</dd>
          <dt className="text-sub">Views</dt><dd className="m-0">{views.length || 'none yet'}{plan ? ', and the floor plan' : ''}</dd>
          <dt className="text-sub">Used in</dt><dd className="m-0">{where || 'no scene file names it yet'}</dd>
          <dt className="text-sub">Props</dt><dd className="m-0">{props.length ? listWords(props.map((p) => p.name)) : 'none here'}</dd>
        </dl>
        {others.length > 0 && (
          <details className="group rounded-[9px] border border-edge">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12.5px] [&::-webkit-details-marker]:hidden">
              <span className="font-medium">The other main images</span><span className="text-sub">{others.length}, not picked</span>
              <IconChevronDown size={13} className="ml-auto text-sub transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3 duration-200 animate-in fade-in-0">
              {others.map((c) => (
                <button key={c.id} type="button" onClick={() => onChip(`cand:${l.id}`, `${l.id} · ${c.id}`, c.path)} aria-label={`${l.id}, ${c.id}`} className="cursor-pointer rounded-[5px] border-0 bg-transparent p-0">
                  <Media path={toRepo(c.path)} w={320} className="aspect-[16/9] w-full rounded-[5px] border border-edge" />
                </button>
              ))}
            </div>
          </details>
        )}
        <Link href={`${base}/locations`} onClick={() => rememberBack(`${base}/locations`, `Back to ${placeName(l.name)}`)} className="text-[12.5px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">Every round and prop, on the Locations page</Link>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Views" className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Views <span className="font-normal text-sub">{views.length}</span></span>
          {views.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {views.map((v) => (
                <button key={v.path} type="button" onClick={() => onChip(`view:${l.id}:${v.camera}`, `${l.id} · ${v.camera}`, v.path)} aria-label={`${l.name}, ${v.camera}`}
                  className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
                  <Media path={toRepo(v.path)} w={320} className="aspect-[4/3] w-full rounded-[6px] border border-edge" />
                  <span className="truncate text-[11.5px] text-ink-3">{v.camera}</span>
                </button>
              ))}
            </div>
          ) : <span className="text-[12.5px] text-sub">No views yet.</span>}
          {plan && (
            <button type="button" onClick={() => onChip(`view:${l.id}:plan`, `${l.id} · the floor plan`, plan.path)} data-floor-plan
              className="mt-1 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[9px] border border-edge bg-transparent px-3 py-1.5 text-left text-ink transition-colors duration-150 hover:bg-raised">
              <Media path={toRepo(plan.path)} w={160} fit="contain" missingLabel="" className="h-8 w-11 flex-none rounded-[4px] bg-[#f4f1ea]" />
              <span className="text-[12.5px] font-medium">The floor plan</span><span className="text-[12px] text-sub">the place from above</span>
            </button>
          )}
        </section>
        {props.length > 0 && (
          <section aria-label="Props" className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">Props <span className="font-normal text-sub">{props.length}</span></span>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
              {props.map((p) => (
                <button key={p.id} type="button" onClick={() => onChip(`prop:${p.id}`, `${p.id} · ${p.name}`, propPicture(p))} aria-label={p.name}
                  className="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left text-ink">
                  <Media path={toRepo(propPicture(p))} w={320} missingLabel="" className={cn('aspect-[4/3] w-full rounded-[6px] border', p.pick ? 'border-edge-strong' : 'border-edge')} />
                  <span className="truncate text-[11.5px] text-ink-3">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
