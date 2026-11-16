'use client';
// Locations and props (stage 4): the locations and props on the left, one location's style-image round,
// the master pick and its views. design/boards/Locations.dc.html.
import { useState } from 'react';
import { usePage } from '@/components/data/ui';
import { inPlaceRound, lastRound, locationState, propBrief, roundProgress } from '@/components/lib/derive';
import { fmtDate } from '@/components/lib/format';
import type { FilmState, LocationRef, PropRef } from '@/server/types';
import { capital, word } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { qcEntry, qcSpec } from '@/components/lib/qc';
import { Btn, Dot } from '@/components/shell/atoms';
import { IconBookmark } from '@/components/shell/icons';
import { useFilmPage, filmCost, filmPath } from './common';
import { Media } from '@/components/media/Media';
import { cn } from '@/lib/utils';
import { Feed } from '@/components/feed/Feed';

export function LocationsPage() {
  const { state, error, ui, base } = useFilmPage();
  const locs = state?.locations ?? [];
  const [selId, setSelId] = useState<string>();
  const l = locs.find((x) => x.id === selId) ?? locs[0];
  const st = l ? locationState(l.styleImages, l.master?.picked) : 'waiting';
  const rounds = l?.styleImages ?? [];
  // once the master is picked, open on the round it came from (the last round with a pick)
  const pickedRound = [...rounds].reverse().find((x) => x.pick);
  const [roundId, setRoundId] = useState<string>();
  const r = rounds.find((x) => x.id === roundId) ?? (st === 'picked' && pickedRound ? pickedRound : lastRound(rounds));
  const p = roundProgress(r);
  const [cand, setCand] = useState<string>();
  const chosen = cand ?? (st === 'picked' ? r?.pick : r?.prediction);
  const rn = (x: { id: string }) => /^r(\d+)/.exec(x.id)?.[1] ?? x.id;
  usePage(l ? `4 Locations · ${l.id} ${st === 'picked' ? 'master picked' : r ? `round ${rn(r)}` : 'not started'}` : undefined, undefined,
    l && chosen && st !== 'picked' ? [`Pick ${chosen} as master`, `Show the ${l.props?.[0]?.name.replace(/^the /, '') ?? 'props'} alone`] : []);
  if (!state) return <Loading error={error} />;
  const props = locs.flatMap((x) => x.props ?? []);

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Locations and props' }]}
        meta={<>{[state.film.aspect, filmPath(state, 'locations')].filter(Boolean).join(' · ')} · <span title={filmCost(state).title}>{filmCost(state).text}</span></>} phoneSub="Locations and props" />
      <div className="grid grid-cols-[200px_minmax(0,1fr)] max-[900px]:grid-cols-1">
        <nav aria-label="Locations and props" className="flex flex-col gap-1 border-r border-line px-3 py-6 max-[900px]:border-b max-[900px]:border-r-0">
          <span className="lbl px-2.5 pb-1.5">Locations</span>
          {locs.map((x) => {
            const s2 = locationState(x.styleImages, x.master?.picked);
            const rr = lastRound(x.styleImages);
            return (
              <button key={x.id} type="button" aria-current={x.id === l?.id ? 'true' : undefined} onClick={() => { setSelId(x.id); setCand(undefined); setRoundId(undefined); ui.addChip({ id: `loc:${x.id}`, label: `${x.id} · ${x.name}` }); }}
                className={cn('flex cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left', x.id === l?.id ? 'bg-panel' : 'hover:bg-panel')}>
                <span className="flex items-center gap-2"><span className="font-mono text-[11.5px] text-sub">{x.id}</span><span className="flex-1 truncate text-[13px] font-medium">{x.name}</span><Dot state={s2 === 'running' ? 'running' : s2 === 'waiting' ? 'waiting' : 'done'} /></span>
                <span className="text-[11.5px] text-sub">{s2 === 'picked' ? `master picked · ${x.styleImages?.length ?? 0} rounds` : rr ? `round ${rn(rr)} · ${s2 === 'running' ? 'running' : 'your pick'}` : 'not started'}</span>
              </button>
            );
          })}
          {props.length > 0 && <span className="lbl px-2.5 pb-1.5 pt-4">Props</span>}
          {props.map((x) => (
            <button key={x.id} type="button" onClick={() => ui.addChip({ id: `prop:${x.id}`, label: `${x.id} · ${x.name}`, ref: x.path })} className="flex cursor-pointer flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-panel">
              <span className="flex items-center gap-2"><span className="font-mono text-[11.5px] text-sub">{x.id}</span><span className="flex-1 truncate text-[13px] font-medium">{x.name}</span><Dot state={x.path ? 'done' : 'waiting'} /></span>
              <span className="text-[11.5px] text-sub">{propRail(x)}</span>
            </button>
          ))}
          <div className="mx-2.5 mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[12px] text-sub">
            <span className="flex items-center gap-2"><Dot state="done" />made</span>
            <span className="flex items-center gap-2"><Dot state="running" />running</span>
            <span className="flex items-center gap-2"><Dot state="waiting" />not started</span>
          </div>
        </nav>

        <PageBody>
          {!l ? <span className="text-[13px] text-sub">No locations in locations/ yet.</span> : (
            <>
              <StageTitle kicker="Stage 4 · Locations and props" title={<><span className="font-mono text-[18px] font-normal text-sub">{l.id}</span> {l.name}</>}
                sub={!r ? 'No style images yet.' : st === 'picked' && r.pick
                  ? `Round ${rn(r)} of ${rounds.length}, the style image: ${word(r.candidates.length)} 16:9 candidates of the place. You picked ${r.pick}; it is the master, and the views below are made from it.`
                  : `Round ${rn(r)}, the style image: ${word(r.candidates.length)} 16:9 candidates of the place. Your pick becomes the master, then the plan from above.`}
                right={<QCChip spec={qcSpec('views')} targets={{ target: l.id, label: `${l.id} views`, entry: qcEntry(state, 'views', l.id), ready: !!l.master?.picked && !!l.views?.length, waitsFor: !l.master?.picked ? `the ${l.id} master pick` : l.views?.length ? `${l.id}'s ${word(l.views.length)} views` : `${l.id}'s views` }} />} />
              {rounds.length > 1 && (
                <div role="tablist" aria-label="Style-image rounds" className="flex flex-wrap gap-4 border-b border-line">
                  {rounds.map((x) => (
                    <button key={x.id} role="tab" type="button" aria-selected={x.id === r?.id} onClick={() => { setRoundId(x.id); setCand(undefined); }}
                      className={cn('-mb-px flex h-[30px] cursor-pointer items-center gap-1.5 border-b-2 text-[12.5px] font-medium', x.id === r?.id ? 'border-ink text-ink' : 'border-transparent text-sub')}>
                      Round {rn(x)}{x.pick && <span className="size-1 rounded-full bg-ink" aria-label="has your pick" />}
                    </button>
                  ))}
                </div>
              )}
              {r && st === 'running' && (
                <div className="flex items-center gap-3 text-[13px]"><Dot state="running" />{p.landed} of {p.asked} landed<span className="h-1 w-36 overflow-hidden rounded-sm bg-edge"><span className="block h-full bg-sub" style={{ width: `${(p.landed / Math.max(1, p.asked)) * 100}%` }} /></span></div>
              )}
              {r && (
                <div className="grid grid-cols-3 gap-3 max-[760px]:grid-cols-2">
                  {r.candidates.map((k) => {
                    const on = k.id === chosen;
                    return (
                      <button key={k.id} type="button" disabled={!k.path} onClick={() => { setCand(k.id); ui.addChip({ id: `cand:${l.id}`, label: `${l.id} · ${k.id}`, ref: k.path }); }}
                        className="flex cursor-pointer flex-col gap-2 text-left disabled:cursor-default">
                        <span className={cn('relative block aspect-[16/9] w-full rounded-[7px] border', !k.path ? 'border-dashed border-edge-strong' : on ? 'border-ink bg-tile outline outline-1 outline-offset-2 outline-ink' : 'border-edge bg-tile hover:border-sub')}>
                          {k.path && <Media path={filmPath(state, k.path)} w={640} className="absolute inset-0 rounded-[6px]" />}
                          <span className={cn('absolute left-2 top-1.5 font-mono text-[11px]', k.path ? 'rounded-[4px] bg-black/60 px-1 text-ink-3' : 'text-sub')}>{k.id}</span>
                          {r.pick === k.id ? <span className="absolute right-2 top-1.5 rounded-[4px] bg-ink px-1.5 text-[10.5px] font-semibold text-bg">Your pick{r.prediction === k.id ? ' · Alma’s too' : ''}</span>
                            : r.prediction === k.id && <span className={cn('absolute right-2 top-1.5 rounded-[4px] px-1.5 text-[10.5px] font-semibold', r.pick ? 'border border-edge-strong text-ink-3' : 'bg-ink text-bg')}>{r.pick ? 'Alma predicted' : 'Alma’s pick'}</span>}
                          {!k.path && <span className="absolute right-2 top-1.5 inline-flex items-center gap-1 text-[10.5px] text-sub"><Dot state="running" size={5} />running</span>}
                        </span>
                        <span className={cn('text-[12.5px] leading-[1.4]', k.path ? 'text-ink-3' : 'text-mute')}>{k.note}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {r?.prediction && st !== 'picked' && (
                <p className="m-0 text-[13px] leading-normal text-ink-3">
                  Alma predicts <span className="font-medium text-ink">{r.prediction}</span>, {r.candidates.find((k) => k.id === r.prediction)?.note?.split(':')[0]}.{' '}
                  {capital(word(p.landed))} of {word(p.asked)} have landed.
                </p>
              )}
              {r && st !== 'picked' && chosen && (
                <div className="flex flex-wrap items-center gap-2">
                  <Btn primary onClick={() => ui.prefill(`Pick ${chosen} as the master for ${l.id}`, { id: `pick:${l.id}`, label: `${l.id} · ${chosen}` })}>Pick {chosen} as master</Btn>
                  <Btn ghost onClick={() => ui.prefill(`Save ${l.id} ${chosen} to the library`)}><IconBookmark size={13} />Save to library</Btn>
                </div>
              )}
              {l.master?.picked && (
                <div className="flex items-center gap-3">
                  {l.master.path && <Media path={filmPath(state, l.master.path)} w={320} className="aspect-[16/9] w-[132px] flex-none rounded-[6px] border border-edge" />}
                  <p className="m-0 text-[13px] text-ink-3">Master picked{l.master.path ? <>: <span className="font-mono text-[12px] text-sub">{filmPath(state, l.master.path)}</span></> : ''}.</p>
                </div>
              )}
              {(l.views ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="lbl">Views</span>
                  <div className="grid grid-cols-3 gap-3">
                    {l.views!.map((v) => (
                      <button key={v.path} type="button" onClick={() => ui.addChip({ id: `view:${l.id}:${v.camera}`, label: `${l.id} · ${v.camera}`, ref: v.path })} className="flex cursor-pointer flex-col gap-1.5 text-left">
                        <Media path={filmPath(state, v.path)} w={640} className="aspect-[16/9] rounded-[7px] border border-edge" /><span className="text-[12.5px] text-ink-3">{v.camera}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(l.props ?? []).length > 0 && <PropsSection s={state} l={l} onChip={(id, label, ref) => ui.addChip({ id, label, ref })} />}
            </>
          )}
          <Feed query="place=loc,views" note="masters, views and props, round by round" from="the Locations page" />
        </PageBody>
      </div>
    </>
  );
}

/** "picked · 4 rounds", "in the place · 3 alone", "made", "not started": the prop's line in the rail. */
function propRail(p: PropRef): string {
  const rounds = p.rounds ?? [];
  const alone = rounds.filter((r) => !inPlaceRound(r)).reduce((n, r) => n + r.candidates.length, 0);
  const inPlace = rounds.some(inPlaceRound);
  const parts = [p.pick ? `${p.pick} picked` : p.path ? 'made' : 'not started', inPlace ? 'in the place' : '', alone ? `${alone} alone` : ''];
  return parts.filter(Boolean).join(' · ');
}

/** Props both ways (design/boards/Locations.dc.html, "Props"): each prop inside the place (cut out of a
 *  location image) and on its own, every candidate round with its pick. */
function PropsSection({ s, l, onChip }: { s: FilmState; l: LocationRef; onChip: (id: string, label: string, ref?: string) => void }) {
  const props = l.props ?? [];
  const picked = [...(l.styleImages ?? [])].reverse().find((r) => r.pick);
  return (
    <section aria-label="Props" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="lbl">Props</span>
        <span className="max-w-[600px] text-[13px] leading-normal text-sub">
          Each prop is made both ways: inside the place, cut out of the picked {l.id} image, and on its own. The pick can be either; it is the reference every take gets.
        </span>
      </div>
      {props.map((p) => {
        const rounds = p.rounds ?? [];
        const what = propBrief(s.brief?.markdown, p.id);
        const placeRounds = rounds.filter(inPlaceRound);
        const aloneRounds = rounds.filter((r) => !inPlaceRound(r));
        const groups = [
          { label: 'In the place', rounds: placeRounds, lead: picked?.pick && placeRounds.length ? { id: `in ${l.id}`, title: `In ${l.id} ${picked.pick}`, status: 'the picked place, where the scenes see it', path: picked.candidates.find((k) => k.id === picked.pick)?.path } : undefined },
          { label: 'On its own', rounds: aloneRounds, lead: undefined },
        ];
        return (
          <article key={`${p.id}:${p.name}`} className="flex flex-col gap-3 rounded-[10px] border border-edge bg-well px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <button type="button" onClick={() => onChip(`prop:${p.id}`, `${p.id} · ${p.name}`, p.path)} className="flex min-w-0 cursor-pointer items-baseline gap-2 border-0 bg-transparent p-0 text-left text-ink">
                <span className="font-mono text-[12px] text-sub">{p.id}</span><span className="text-[14px] font-medium">{p.name}</span>
                {what && <span className="text-[12.5px] text-sub max-[760px]:hidden">{what}</span>}
              </button>
              <span className="whitespace-nowrap text-[12px] text-sub">{p.pick ? `picked ${p.pick}` : p.path ? 'made' : 'not started'}{rounds.length ? ` · ${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}` : ''}</span>
            </div>
            {!rounds.length && p.path && <Media path={filmPath(s, p.path)} w={320} className="aspect-[16/9] w-[180px] rounded-md border border-edge" />}
            {!rounds.length && <span className="text-[12.5px] text-sub">{p.path ? `One image, ${p.path.split('/').pop()}; no candidate rounds on file.` : 'Not started.'}</span>}
            {groups.filter((g) => g.rounds.length || g.lead).map((g) => (
              <div key={g.label} className="flex flex-col gap-2">
                <span className="text-[11.5px] font-medium text-sub">{g.label}</span>
                <div className="grid grid-cols-5 gap-2.5 max-[760px]:grid-cols-2">
                  {g.lead && (
                    <button type="button" onClick={() => onChip(`prop:${p.id}:place`, `${p.id} · ${g.lead!.title}`)} aria-label={`${p.id}, ${g.lead.title}`} className="flex min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-ink">
                      <span className="relative block aspect-[16/9] w-full rounded-md border border-edge bg-bubble">
                        {g.lead.path && <Media path={filmPath(s, g.lead.path)} w={320} className="absolute inset-0 rounded-[5px]" />}
                        <span className={cn('absolute left-[7px] top-1.5 font-mono text-[10.5px]', g.lead.path ? 'rounded-[4px] bg-black/60 px-1 text-ink-3' : 'text-sub')}>{g.lead.id}</span>
                      </span>
                      <span className="flex flex-col gap-0.5"><span className="truncate text-[12px] font-medium">{g.lead.title}</span><span className="text-[11.5px] leading-[1.4] text-sub">{g.lead.status}</span></span>
                    </button>
                  )}
                  {g.rounds.flatMap((r) => r.candidates.map((c) => {
                    const on = p.pick === c.id;
                    return (
                      <button key={`${r.id}:${c.id}`} type="button" onClick={() => onChip(`prop:${p.id}:${c.id}`, `${p.id} · ${c.id}`, c.path)} aria-label={`${p.id}, ${c.id}, round ${r.id}${on ? ', your pick' : ''}`}
                        className="flex min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-ink">
                        <span className={cn('relative block aspect-[16/9] w-full rounded-md border bg-tile', on ? 'border-ink outline outline-1 outline-offset-2 outline-ink' : 'border-edge')}>
                          {c.path && <Media path={filmPath(s, c.path)} w={320} className="absolute inset-0 rounded-[5px]" />}
                          <span className={cn('absolute left-[7px] top-1.5 font-mono text-[10.5px]', c.path ? 'rounded-[4px] bg-black/60 px-1 text-ink-3' : 'text-sub')}>{c.id}</span>
                          {on && <span className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-ink px-1.5 text-[10px] font-semibold text-bg">Your pick</span>}
                        </span>
                        <span className="flex flex-col gap-0.5"><span className="truncate text-[12px] font-medium">{c.id}</span><span className="text-[11.5px] leading-[1.4] text-sub">{r.id}{r.date ? ` · ${fmtDate(r.date)}` : ''}</span></span>
                      </button>
                    );
                  }))}
                </div>
              </div>
            ))}
          </article>
        );
      })}
    </section>
  );
}
