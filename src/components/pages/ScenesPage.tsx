'use client';
// Scenes (stages 6 to 8): the whole film on one page. One row per scene: its best take, playable; what the scene
// is doing, in plain words; every take as a small tile; and what waits for the user. Redrawn 13 Nov 2026 after
// the user's ask ("see all of the scenes and all of the takes on one single page with the most important bits"):
// the table of numbers and the table/cards switch are gone, the numbers sit in one line under the title.
import Link from 'next/link';
import type { FeedCard, FilmState, SceneRef, TakeRef, TaskCard } from '@/server/types';
import { usePage } from '@/components/data/ui';
import { sceneCredits } from '@/components/lib/derive';
import { fmtCredits, fmtSecs, plural, sumCredits, takeLabel } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import { IconChevronRight } from '@/components/shell/icons';
import { useFilmPage, filmMeta, filmPath } from './common';
import { useJson } from './postCommon';
import { Media } from '@/components/media/Media';
import { sceneNow, TONE_BAR, TONE_CHIP, TONE_DOT, type SceneNow } from '@/components/lib/scenes';
import { cn } from '@/lib/utils';
import { Feed, ShownLink } from '@/components/feed/Feed';

interface FeedData { cards: FeedCard[] }
// a test take: a clip kept under tests/, or a card that calls itself a test
const isTest = (c: FeedCard): boolean => c.media.some((m) => m.kind === 'video' && (/(^|\/)tests?\//.test(m.path) || (/\btest\b/i.test(`${c.title} ${c.sub ?? ''}`) && !/^(generations|blocks|previz)\//.test(m.path))));
/** The words under a tile: "1", "2" for takes, "P1" for the first pick-up. The full name is in the tile's hover text. */
function tileNames(takes: TakeRef[]): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  for (const t of takes) out.set(t.id, t.kind === 'pickup' ? `P${++p}` : (/(\d+[A-Z]?)$/.exec(t.id)?.[1] ?? takeLabel(t.id)));
  return out;
}

/** One take as a small tile: its frame, or why there is none. The scene's best take is ringed. */
function TakeTile({ t, name, state, href, best, used, size }: { t: TakeRef; name: string; state: FilmState; href: string; best: boolean; used: boolean; size: string }) {
  const box = cn('relative block overflow-hidden rounded-[5px] border transition-[border-color,transform] duration-200 ease-out group-hover/tile:-translate-y-px', size, best ? 'border-ink ring-1 ring-ink' : 'border-edge group-hover/tile:border-sub');
  const what = t.path ? (t.verdict === 'redo' ? 'needs a redo' : t.verdict === 'good' ? 'holds' : t.verdict === 'usable' ? 'usable' : 'landed') : t.stopped ?? 'rendering';
  return (
    <Link href={href} title={`${takeLabel(t.id)}: ${what}${used ? ', in the cut' : ''}${t.finding ? `. ${t.finding}` : t.stoppedWhy ? `. ${t.stoppedWhy}` : ''}`} aria-label={`${takeLabel(t.id)}, ${what}${used ? ', in the cut' : ''}`}
      className="group/tile relative z-[1] flex flex-none flex-col items-center gap-1 no-underline">
      {t.path ? (
        <span className={box}>
          <Media path={filmPath(state, t.path)} w={120} t={0.5} missingLabel="" className="absolute inset-0" />
          {t.verdict && <span aria-hidden="true" className={cn('absolute right-[3px] top-[3px] size-[5px] rounded-full ring-1 ring-black/60', t.verdict === 'redo' ? 'bg-warn' : 'bg-ok')} />}
        </span>
      ) : t.stopped ? (
        <span className={cn(box, 'flex items-center justify-center border-dashed bg-transparent text-bad')} aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </span>
      ) : (
        <span className={cn(box, 'animate-pulse bg-raised')} aria-hidden="true" />
      )}
      <span className={cn('font-mono text-[10px] leading-none', best ? 'font-medium text-ink' : used ? 'text-ink-2' : 'text-mute')}>{name}</span>
      {/* a short line under a take that is in the cut */}
      <span aria-hidden="true" className={cn('h-[2px] w-3 rounded-full', used ? 'bg-ink' : 'bg-transparent')} />
    </Link>
  );
}

/** A test take as a tile: a clip made on the scene that is not a take of the film. Dashed; named by its own letter or "T1". */
function TestTile({ c, i, state, href, size, used, best }: { c: FeedCard; i: number; state: FilmState; href: string; size: string; used: boolean; best: boolean }) {
  const clip = c.media.find((m) => m.kind === 'video')!;
  const tail = /-([A-Za-z])$/.exec(c.id ?? '')?.[1];
  return (
    <Link href={href} title={`Test take${used ? ', in the cut' : ''}: ${c.title}${c.text?.[0] ? `. ${c.text[0].slice(0, 160)}` : ''}`} aria-label={`Test take${used ? ', in the cut' : ''}, ${c.title}`} className="group/tile relative z-[1] flex flex-none flex-col items-center gap-1 no-underline">
      <span className={cn('relative block overflow-hidden rounded-[5px] border bg-tile transition-[opacity,transform] duration-200 ease-out group-hover/tile:-translate-y-px group-hover/tile:opacity-100', best ? 'border-ink ring-1 ring-ink' : used ? 'border-dashed border-ink/70' : 'border-dashed border-edge-strong opacity-75', size)}>
        <Media path={filmPath(state, clip.path)} w={120} t={0.5} missingLabel="" className="absolute inset-0" />
      </span>
      <span className={cn('font-mono text-[10px] leading-none', best ? 'font-medium text-ink' : used ? 'text-ink-2' : 'text-mute')}>{tail ? tail.toUpperCase() : `T${i + 1}`}</span>
      <span aria-hidden="true" className={cn('h-[2px] w-3 rounded-full', used ? 'bg-ink' : 'bg-transparent')} />
    </Link>
  );
}

function SceneRow({ sc, state, base, now, tests, asks, working, dense }: { sc: SceneRef; state: FilmState; base: string; now: SceneNow; tests: FeedCard[]; asks: FeedCard[]; working: FeedCard[]; dense: boolean }) {
  const wide = state.film.aspect === '16:9';
  const href = `${base}/scenes/${sc.id}`;
  const credits = sceneCredits(sc);
  const facts = [fmtSecs(sc.seconds), sc.shots ? plural(sc.shots, 'shot') : '', credits >= 1 ? fmtCredits(credits) : ''].filter(Boolean);
  const names = tileNames(sc.takes);
  // a long film gets shorter rows; a scene with many takes shows its newest, the take shown large always among them
  const size = wide ? (dense ? 'h-[27px] w-[48px]' : 'h-[34px] w-[60px]') : dense ? 'h-[46px] w-[26px]' : 'h-[60px] w-[34px]';
  const cap = wide ? 6 : 10;
  const hidden = Math.max(0, sc.takes.length - cap);
  const shown = hidden ? [...sc.takes.slice(hidden).filter((t) => t.id !== now.best?.id), ...(now.best ? [now.best] : [])].slice(-cap).sort((a, b) => sc.takes.indexOf(a) - sc.takes.indexOf(b)) : sc.takes;
  const poster = cn('w-full rounded-[9px] border bg-black', wide ? 'aspect-video' : 'aspect-[9/16]');
  // a test take the cut uses is always among the tiles shown
  const clipOf = (c: FeedCard): string => filmPath(state, c.media.find((m) => m.kind === 'video')!.path);
  const inCutTest = (c: FeedCard): boolean => !!now.outside?.includes(clipOf(c));
  const testCap = wide ? 4 : 6;
  const testsShown = tests.length <= testCap ? tests : [...tests.filter(inCutTest), ...tests.filter((c) => !inCutTest(c))].slice(0, testCap).sort((a, b) => tests.indexOf(a) - tests.indexOf(b));
  return (
    <article id={sc.id} aria-label={`${sc.id} ${sc.title}: ${now.label}`}
      className={cn('group relative flex scroll-mt-4 rounded-[12px] border bg-panel transition-[border-color,background-color] duration-200 ease-out hover:bg-raised/40', asks.length ? 'border-ink/70' : 'border-edge hover:border-edge-strong', dense ? 'gap-3.5 p-2.5' : 'gap-4 p-3.5 max-[560px]:gap-3 max-[560px]:p-3')}>
      {/* the whole row opens the scene; the clip and the tiles sit above this link */}
      <Link href={href} aria-label={`Open ${sc.id}`} className="absolute inset-0 z-0 rounded-[12px]" />
      {/* the take that stands for the scene, playing in place; its full-screen button shows on hover */}
      <div className={cn("relative z-[1] flex-none [&_[title='Full_screen']]:opacity-0 [&_[title='Full_screen']]:transition-opacity [&_[title='Full_screen']]:duration-200 hover:[&_[title='Full_screen']]:opacity-100",
        wide ? (dense ? 'w-[124px]' : 'w-[196px] max-[560px]:w-[124px]') : dense ? 'w-[62px]' : 'w-[88px] max-[560px]:w-[72px]')}>
        {now.outside?.length ? (
          <Media path={now.outside[0]} w={480} t={0.5} fit="cover" play missingLabel="" className={cn(poster, 'border-line')} />
        ) : now.best?.path ? (
          <Media path={filmPath(state, now.best.path)} w={480} t={0.5} fit="cover" play missingLabel="" className={cn(poster, 'border-line')} />
        ) : sc.previzPath ? (
          <div className="relative">
            <Media path={filmPath(state, sc.previzPath)} w={480} t={0.5} fit="cover" missingLabel="" className={cn(poster, 'border-dashed border-edge opacity-60')} />
            <span className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/70 px-1.5 py-px text-[10px] text-ink-3">previz</span>
          </div>
        ) : (
          <div className={cn(poster, 'border-dashed border-edge bg-tile')} />
        )}
      </div>

      <div className={cn('pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col py-0.5', dense ? 'gap-1.5' : 'gap-2.5')}>
        <div className="flex min-w-0 items-baseline gap-x-3">
          <h2 className="m-0 flex min-w-0 items-baseline gap-2 text-[15px] font-semibold tracking-[-0.01em]"><span className="w-[22px] flex-none font-mono text-[12px] font-normal text-sub">{sc.id}</span><span className="truncate">{sc.title}</span></h2>
          <span className="ml-auto flex-none whitespace-nowrap text-[12px] tabular-nums text-mute">{facts.join(' · ')}</span>
        </div>

        {/* where the scene stands, then why: the chip always starts at the same place */}
        <p className={cn('m-0 flex min-w-0 items-baseline gap-2.5 text-[13.5px] leading-[1.45] text-ink-2', dense ? 'flex-nowrap' : 'flex-wrap')}>
          <span className={cn('relative top-[-1px] inline-flex h-[22px] flex-none items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium', TONE_CHIP[now.tone])}>
            <span aria-hidden="true" className={cn('size-[6px] rounded-full', TONE_DOT[now.tone])} />{now.label}
          </span>
          {now.line && <span className={cn('min-w-0 max-w-[600px]', dense && 'truncate')}>{now.line}{/[.!?]$/.test(now.line) ? '' : '.'}</span>}
        </p>

        {(asks.length > 0 || working.length > 0) && (
          <div className="pointer-events-auto flex flex-wrap gap-1.5">
            {asks.map((c) => (
              <Link key={c.key} href={`${base}?open=gate`} title={c.title} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] font-medium text-bg no-underline transition-opacity duration-200 hover:opacity-85">
                <span className="truncate">Waits for you: {c.title}</span><IconChevronRight size={11} />
              </Link>
            ))}
            {working.map((c) => (
              <Link key={c.key} href={`${base}?open=gate`} title={c.title} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-dashed border-edge-strong px-3 text-[12px] text-sub no-underline transition-colors duration-200 hover:text-ink">
                <span aria-hidden="true" className="size-[5px] flex-none animate-pulse rounded-full bg-sub" /><span className="truncate">In progress: {c.title}</span>
              </Link>
            ))}
          </div>
        )}

        {(sc.takes.length > 0 || tests.length > 0) && (
          <div className="pointer-events-auto flex flex-wrap items-start gap-x-2 gap-y-2 pt-1">
            {sc.takes.length > 0 && <span className={cn('flex w-[38px] flex-none items-center text-[11px] text-mute', size.split(' ')[0])}>Takes</span>}
            {hidden > 0 && <Link href={href} title={`${hidden} earlier takes`} className={cn('relative z-[1] flex flex-none items-center px-0.5 text-[11.5px] text-sub no-underline hover:text-ink', size.split(' ')[0])}>+{hidden}</Link>}
            {shown.map((t) => <TakeTile key={t.id} t={t} name={names.get(t.id) ?? ''} state={state} href={`${href}?take=${encodeURIComponent(t.id)}`} best={t.id === now.best?.id} used={now.inCut.includes(t.id)} size={size} />)}
            {tests.length > 0 && (
              <>
                <span className={cn('ml-2 flex flex-none items-center border-l border-line pl-3 text-[11px] text-mute', size.split(' ')[0])}>Tests</span>
                {testsShown.map((c) => <TestTile key={c.key} c={c} i={tests.indexOf(c)} state={state} href={`${href}#tests`} size={size} used={inCutTest(c)} best={inCutTest(c) && clipOf(c) === now.outside?.[0]} />)}
                {tests.length > testCap && <Link href={`${href}#tests`} className={cn('relative z-[1] flex flex-none items-center text-[11.5px] text-sub no-underline hover:text-ink', size.split(' ')[0])}>+{tests.length - testCap}</Link>}
              </>
            )}
          </div>
        )}
      </div>
      <IconChevronRight size={14} className="relative z-[1] flex-none self-center text-mute transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-ink max-[560px]:hidden" />
    </article>
  );
}

/** Everything the overview needs, worked out once: each scene's status, the film's tally, the tests and questions per scene. */
function useScenes(state: FilmState | undefined, tasks: TaskCard[]) {
  const { data: feed } = useJson<FeedData>(state ? `/api/films/${state.film.slug}/feed?place=scenes` : undefined, state?.updatedAt);
  const scenes = state?.scenes ?? [];
  const delivered = state?.film.status === 'delivered';
  const rows = scenes.map((sc) => ({ sc, now: sceneNow(sc, state?.cut, tasks, delivered) }));
  const about = (list: FeedCard[] | undefined, id: string): FeedCard[] => (list ?? []).filter((c) => c.ids.includes(id));
  const tests = (id: string): FeedCard[] => (feed?.cards ?? []).filter((c) => c.ids.includes(id) && isTest(c));
  // the film in one sentence: how many scenes stand where
  const count = (f: (n: SceneNow) => boolean): number => rows.filter((r) => f(r.now)).length;
  const waits = scenes.filter((s) => about(state?.feed?.asks, s.id).length).length;
  const one = (n: number, single: string, many: string): string | undefined => (n ? `${n} ${n === 1 ? single : many}` : undefined);
  const tally = delivered ? [] : [
    one(count((n) => n.tone === 'warn'), 'needs a redo', 'need a redo'), one(count((n) => n.tone === 'part'), 'needs a partial redo', 'need a partial redo'),
    one(count((n) => n.label === 'Usable'), 'is usable', 'are usable'), one(count((n) => n.label === 'Holds'), 'holds', 'hold'),
    one(count((n) => !!n.outside?.length), 'is in the cut from a test take', 'are in the cut from test takes'),
    one(count((n) => n.tone === 'run'), 'is in the works', 'are in the works'), one(count((n) => n.tone === 'bad'), 'is blocked', 'are blocked'),
    one(count((n) => n.tone === 'idle' && !n.best), 'has no take yet', 'have no take yet'),
  ].filter((x): x is string => !!x);
  const rest = state?.scenesRest;
  return {
    scenes, rows, about, tests, tally, waits, delivered, rest, dense: scenes.length > 10,
    shots: scenes.reduce((n, s) => n + (s.shots ?? 0), 0), seconds: scenes.reduce((n, s) => n + (s.seconds ?? 0), 0),
    credits: sumCredits([...scenes.map((s) => ({ credits: sceneCredits(s) })), rest?.cost]),
  };
}

/** The film in a sentence ("3 need a redo, 1 holds. One scene waits for you.") and its numbers under it. */
export function ScenesSummary({ state, tasks }: { state: FilmState; tasks: TaskCard[] }) {
  const { scenes, tally, waits, delivered, seconds, shots, credits } = useScenes(state, tasks);
  return (
    <>
      <span className="block text-[15px] leading-snug text-ink">
        {delivered ? 'The finished film, scene by scene.' : tally.length ? `${tally.join(', ')}.` : 'No take yet.'}
        {waits > 0 && <span className="font-medium"> {waits === 1 ? 'One scene waits' : `${waits} scenes wait`} for you.</span>}
      </span>
      <span className="mt-1 block text-[12.5px] tabular-nums text-mute">{plural(scenes.length, 'scene')} · {fmtSecs(seconds)} · {plural(shots, 'shot')}{credits >= 1 ? ` · ${fmtCredits(credits)} spent on takes` : ''}</span>
    </>
  );
}

/** The film as one bar, then one row per scene. Shown on the Scenes page and in the board's Scenes step. */
export function ScenesOverview({ state, base, tasks }: { state: FilmState; base: string; tasks: TaskCard[] }) {
  const { scenes, rows, about, tests, waits, delivered, rest, dense } = useScenes(state, tasks);
  return (
    <>
        {/* the film as one bar: each scene as long as its seconds, coloured by where it stands; a click goes to its
            row. A white dot marks a scene with a question for the user. The key to the colours sits under it. */}
        {scenes.length > 1 && (
          <div className="flex flex-col gap-2.5">
            <nav aria-label="The film, scene by scene" className="flex gap-[3px]">
              {rows.map(({ sc, now }) => {
                const q = about(state.feed?.asks, sc.id).length > 0;
                return (
                  <a key={sc.id} href={`#${sc.id}`} title={`${sc.id} ${sc.title}: ${now.label}${now.line ? `. ${now.line}` : ''}${q ? '. A question waits for you.' : ''}`} style={{ flexGrow: Math.max(sc.seconds ?? 8, 3) }}
                    onClick={(e) => { e.preventDefault(); document.getElementById(sc.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                    className="group/seg flex min-w-0 basis-0 cursor-pointer flex-col gap-1.5 no-underline">
                    <span className={cn('h-[6px] rounded-full transition-[transform,opacity] duration-200 ease-out group-hover/seg:scale-y-[1.5]', TONE_BAR[now.tone])} />
                    <span className="flex min-w-0 items-center gap-1 overflow-hidden font-mono text-[10.5px] text-mute transition-colors duration-200 group-hover/seg:text-ink">
                      {q && <span aria-hidden="true" className="size-[5px] flex-none rounded-full bg-ink" />}<span className="truncate">{sc.id}</span>
                    </span>
                  </a>
                );
              })}
            </nav>
            {!delivered && (
              <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-mute">
                {([['ok', 'holds or usable'], ['part', 'redo in part'], ['warn', 'needs a redo'], ['run', 'in the works'], ['bad', 'blocked'], ['idle', 'no take yet']] as const)
                  .filter(([k]) => rows.some((r) => r.now.tone === k))
                  .map(([k, w]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-[5px] w-3 rounded-full', TONE_BAR[k].replace(' animate-pulse', ''))} />{w}</span>)}
                {waits > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-[5px] rounded-full bg-ink" />a question waits for you</span>}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {rows.map(({ sc, now }) => (
            <SceneRow key={sc.id} sc={sc} state={state} base={base} now={now} tests={tests(sc.id)} asks={about(state.feed?.asks, sc.id)} working={about(state.feed?.working, sc.id)} dense={dense} />
          ))}
          {rest && (
            <div title={rest.items.join(' · ')} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] border border-dashed border-edge px-4 py-3 text-[12.5px] text-sub">
              <span className="font-medium text-ink-2">Not tied to one scene</span>
              <span className="min-w-0 truncate">{plural(rest.items.length, 'job')}: probes and pick-ups that cover more than one scene</span>
              <span className="ml-auto tabular-nums">{fmtCredits(rest.cost.credits ?? 0)}</span>
            </div>
          )}
        </div>


        <p className="m-0 text-[12px] text-mute">The large frame is the take that stands for its scene (the one in the cut, else the best checked) and plays in place; its tile is ringed. A short line under a tile: that take is in the cut. A dot in the corner of a tile: its check, green or amber. A dashed tile with a cross: blocked or failed. A tile opens that take; the row opens the scene.{state.cut ? ` The cut: ${state.cut.name}.` : ''}</p>
    </>
  );
}

export function ScenesPage() {
  const { state, error, base, tasks } = useFilmPage();
  const scenes = state?.scenes ?? [];
  const shots = scenes.reduce((n, s) => n + (s.shots ?? 0), 0);
  usePage(state ? `Scenes · ${scenes.length} · ${shots} shots` : undefined, 'Ask about a scene, or tell Alma what to redo…', ['Which scenes still need a redo?'], ['Which takes are in the film?', 'What was redone, and why?']);
  if (!state) return <Loading error={error} />;
  const delivered = state.film.status === 'delivered';
  const lockedV = state.script?.versions.find((v) => v.locked);

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Scenes' }]}
        meta={filmMeta(state, lockedV ? `script ${lockedV.version} locked` : '', `${scenes.length} scenes`)} phoneSub={`Scenes · ${scenes.length} · ${shots} shots`}
        actions={<>
          {/* the gate shows only while a scene still has no take */}
          {!delivered && scenes.some((x) => !x.takes.some((t) => t.kind === 'take')) && <Link href={`${base}/go`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-edge px-3 text-[13px] font-medium text-ink no-underline transition-colors duration-200 hover:bg-raised">Go for the video<IconChevronRight size={13} /></Link>}
          <ShownLink places={['scenes']} />
        </>} />
      <PageBody wide>
        <StageTitle kicker="Stages 6 to 8 · Scene prompts, takes and redos" title="Scenes"
          sub={<ScenesSummary state={state} tasks={tasks} />}
          right={<QCChip spec={qcSpec('prompt')} chipLabel="prompts"
            targets={scenes.map((s) => { const p = s.promptVersions[s.promptVersions.length - 1]; return { target: s.id, label: `${s.id} prompt${p ? ` ${p.version}` : ''}`, entry: qcEntry(state, 'prompt', s.id), ready: !!p, waitsFor: p ? `${s.id} prompt ${p.version}` : `${s.id}'s first prompt` }; })} />} />

        <ScenesOverview state={state} base={base} tasks={tasks} />
        <Feed query="place=scenes&shared=1" title="Shown to you · across scenes" note="tests, probes and pick-ups that belong to no single scene" from="the Scenes page" />
      </PageBody>
    </>
  );
}
