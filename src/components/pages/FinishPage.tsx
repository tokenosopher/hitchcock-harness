'use client';
// Finish (stage 10): the 1080p path, the sharpness A/B, the music in the master, the captions and the checks on the
// master. design/boards/Finish.dc.html. Read-only: every action puts a message in the composer for Alma
// (1080p runs only on the user's word, per action). Data: the film state plus GET /api/films/[film]/finish.
import Link from 'next/link';
import type { FinishInfo, MasterCheck, SrtFact } from '@/server/films/read/finish';
import { usePage } from '@/components/data/ui';
import { fmtDate, plural } from '@/components/lib/format';
import { FILM_TARGET, qcEntry, qcSpec } from '@/components/lib/qc';
import { Media, mediaUrl } from '@/components/media/Media';
import { Header } from '@/components/shell/Header';
import { QCChip } from '@/components/shell/QCChip';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Badge, Btn, Card, ReadingNotes } from '@/components/shell/atoms';
import { IconArrowUpRight, IconChevronRight, IconPlay } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { filmMeta, filmPath, useFilmPage } from './common';
import { baseName, Flag, fmtBytes, From, KV, PanelHead, smpteFrames, StateDot, SubLabel, ToConfirm, useJson } from './postCommon';
import { Feed, ShownLink } from '@/components/feed/Feed';
import { FullCutLink } from '@/components/media/MasterPlayer';


export function FinishPage() {
  const { film, state, error, ui, base } = useFilmPage();
  const { data: f, error: ferr } = useJson<FinishInfo>(`/api/films/${film}/finish`, state?.updatedAt);
  const master = f?.master;
  usePage(state && f ? `stage 10 · ${master ? `1080p master ${f.cut?.render ? `of ${f.cut.render}` : ''}`.trim() : '1080p not run'}${f.captions.srts.length ? ' · captions' : ''}` : undefined,
    'Ask about the 1080p, the music or the captions…',
    [f?.sharpness && !f.sharpness.applied ? 'Use soft for the kit' : '', f?.music.peak ? 'Leave the peak' : ''].filter(Boolean),
    ['What did the 1080p cost?', 'Which captions went out?']);
  if (!state || !f) return <Loading error={error ?? ferr} />;

  const fps = f.fps;
  const cutV = f.cut?.version ? `cut ${f.cut.version}` : f.cut?.name ?? 'the cut';
  const editWord = /edit (\d+)/i.exec(f.cut?.render ?? '')?.[1];
  const p = (rel: string) => filmPath(state, rel);
  const chip = (id: string, label: string, ref?: string) => ui.addChip({ id, label, ref });
  // every file here starts with the film's name; the row shows what tells the files apart
  const short = (path: string) => { const b = baseName(path); return b.startsWith(`${film}-`) ? b.slice(film.length + 1) : b; };
  const len = master?.frames !== undefined ? `${smpteFrames(master.frames, fps)} · ${master.frames} f` : f.cut?.frames ? `${smpteFrames(f.cut.frames, fps)} · ${f.cut.frames} f` : '';
  const sidecar = f.captions.srts.find((x) => x.role === 'sidecar' && x.current);
  const burned = f.captions.srts.find((x) => x.role === 'burned' && x.current);
  // on a film that went out the page is a record: the buttons that start a job, and the facts still to confirm, go quiet (the composer is always there to ask)
  const settled = state.film.status === 'delivered';
  // the kit's own captioned files; variants kept beside them are finished films, listed on Release
  const kitCaptioned = f.captions.captioned.filter((c) => /final-captioned(-480p)?\.[a-z0-9]+$/i.test(c.path));
  const captioned = kitCaptioned.length ? kitCaptioned : f.captions.captioned;
  const capEdition = editWord ? `edit-${editWord}` : f.cut?.version ?? 'current';

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Finish' }]}
        meta={filmMeta(state, [f.cut?.render, master ? `${master.width}×${master.height}` : '', len].filter(Boolean).join(' · '))}
        phoneSub={`Finish · ${master ? '1080p master' : 'not run'}`}
        actions={<ShownLink places={['finish']} />} />
      <PageBody wide>
        <StageTitle kicker="Stage 10 · Finish and 1080p" title="Finish"
          sub={`The 1080p master and the captions of ${f.cut?.render ?? cutV}, with the music that is in it.${settled ? '' : ' 1080p runs only on your word, per action.'}`}
          right={<QCChip spec={qcSpec('captions')} targets={{ target: FILM_TARGET, label: 'captions', entry: qcEntry(state, 'captions', FILM_TARGET), ready: f.captions.srts.length > 0, waitsFor: f.captions.srts.length ? 'the caption file against the spoken lines' : 'the captions' }} />} />

        {/* ---- the 1080p cut, first: what exists, and the way into the timeline's 1080p view (ASKS 37) */}
        {state.master && <Card className="p-4"><FullCutLink s={state} base={base} /></Card>}

        <div className="grid grid-cols-3 items-start gap-4 max-[1380px]:grid-cols-2 max-[1080px]:grid-cols-1">
          {/* ---- 1080p */}
          <Card>
            <PanelHead title="1080p" sub={settled ? 'Seedance 2.5' : 'Seedance 2.5 · per take, on your word'}
              right={<QCChip spec={qcSpec('frames')} targets={{ target: FILM_TARGET, label: 'frames', entry: qcEntry(state, 'frames', FILM_TARGET), ready: !!master, waitsFor: master ? 'frames of the 1080p master beside the 480p' : 'the 1080p master' }} />} />
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
              <SubLabel>{settled ? 'The run' : 'Next run'}</SubLabel>
              {/* the setup default: each take finalized at 1080p in Seedance 2.5 (…-1080p.mp4 beside its 480p) */}
              {!settled && <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2.5 rounded-lg border border-sub bg-raised px-3 py-2.5 text-left">
                  <span aria-hidden="true" className="mt-[3px] flex size-3.5 flex-none items-center justify-center rounded-full border border-ink"><span className="size-1.5 rounded-full bg-ink" /></span>
                  <span className="flex flex-col gap-0.5"><span className="text-[13px] font-medium">Seedance 2.5</span><span className="text-[12px] text-sub">per take, on your word</span></span>
                </div>
              </div>}
              {f.upscale.lastRun && (
                <p className="m-0 text-[12.5px] leading-normal text-sub">
                  {settled ? '' : 'Last run: '}{f.upscale.lastRun.service ?? 'Higgsfield upscale'} · {fmtDate(f.upscale.lastRun.date)} · {f.upscale.segments.length ? `${f.upscale.segments.length} segments, ` : ''}{f.upscale.source?.frames ? `${Math.round(f.upscale.source.frames / fps)} s, ` : ''}{f.upscale.lastRun.cost ?? ''}
                </p>
              )}
              {!settled && <Btn primary={!master} className="h-auto min-h-8 self-start whitespace-normal py-1.5 text-left" onClick={() => ui.prefill(`Make the 1080p of ${cutV} with Seedance 2.5: finalize each take at 1080p, then render the master.`, { id: 'finish:1080', label: `1080p · ${cutV}` })}>
                {master ? `Render ${cutV} again` : `Render the 1080p master of ${cutV}`}
              </Btn>}
            </div>

            {/* the path the last run took: split → upscale → fill and crop → join */}
            {f.upscale.segments.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
                <SubLabel right="video/1080/">The path</SubLabel>
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px]">
                  <PathStep done label="Split on hard cuts" detail={`${f.upscale.segments.length} segments${f.upscale.source ? ` of ${baseName(f.upscale.source.path).replace(/\.mp4$/, '')}` : ''}`} />
                  <PathStep done={f.upscale.segments.every((x) => x.upscaled)} label="Upscale on Higgsfield" detail={`${f.upscale.segments.filter((x) => x.upscaled).length} of ${f.upscale.segments.length} landed${f.upscale.segments.every((x) => x.status === 'completed') ? ' · batch log: completed' : ''}`} />
                  <PathStep done={f.upscale.segments.every((x) => x.filled)} label="Fill and crop to the frame" detail={`${f.upscale.segments.filter((x) => x.filled).length} of ${f.upscale.segments.length}`} />
                  <PathStep done={!!master && !!f.upscale.join} label="Join" detail={f.upscale.join ? `${f.upscale.join.files} files · ${baseName(f.upscale.join.list)}` : 'no join list'} />
                </ol>
                <div className="scroll flex gap-1 overflow-x-auto pb-1" aria-label="Segments">
                  {f.upscale.segments.map((sg, i) => (
                    <button key={sg.file} type="button" title={`${baseName(sg.file)} · frames ${sg.start}–${sg.end}`}
                      onClick={() => chip(`seg:${sg.file}`, `1080 segment ${i} · ${smpteFrames(sg.start, fps)}`, p(sg.filled ?? sg.file))}
                      style={{ flexGrow: Math.max(sg.frames, 1) }}
                      className={cn('h-6 min-w-[22px] cursor-pointer rounded-[4px] border font-mono text-[10px]', sg.filled ? 'border-edge-strong bg-raised text-ink-3' : 'border-dashed border-edge text-mute')}>
                      {i}
                    </button>
                  ))}
                </div>
                {f.upscale.notes.map((n) => <p key={n.text} className="m-0 text-[12px] leading-normal text-sub">{n.text} <From>{n.from}</From></p>)}
              </div>
            )}

            {master ? (
              <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
                <SubLabel>{`The master${f.cut?.render ? ` · ${f.cut.render}` : ''}`}</SubLabel>
                <div className="flex gap-3">
                  <Media path={p(master.path)} w={320} t={2} play fit="cover" onPlay={() => chip(`master:${master.path}`, `1080p master · ${baseName(master.path)}`, p(master.path))}
                    className="aspect-[9/16] w-[72px] flex-none rounded-[6px] border border-edge bg-black" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <KV k="Length" mono>{master.frames !== undefined ? smpteFrames(master.frames, fps) : '—'}{f.cut?.timelineFrames !== undefined && master.frames !== undefined && f.cut.timelineFrames !== master.frames && !settled && <ToConfirm title={`cut/${f.cut.version}.json runs ${f.cut.timelineFrames} frames`} />}</KV>
                    <KV k="Frames" mono>{master.frames ?? '—'}</KV>
                    <KV k="Size" mono>{master.width && master.height ? `${master.width}×${master.height}` : '—'}</KV>
                    <KV k="File" mono>{fmtBytes(master.bytes)}</KV>
                  </div>
                </div>
                {f.cut?.timelineFrames !== undefined && master.frames !== undefined && f.cut.timelineFrames !== master.frames && (
                  <p className="m-0 text-[12px] text-sub">Edit’s timeline for {cutV} reads {smpteFrames(f.cut.timelineFrames, fps)}.</p>
                )}
                <span className="break-all font-mono text-[11px] text-mute">{master.path}</span>
              </div>
            ) : (
              <p className="m-0 border-b border-line px-4 py-3 text-[12.5px] leading-normal text-sub">No 1080p master yet. It waits for your word on {cutV}; the frames QC runs on it once it lands.</p>
            )}

            {f.upscale.checks.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
                <SubLabel right="render above, 1080p below">Frame checks</SubLabel>
                <div className="grid grid-cols-2 gap-2">
                  {f.upscale.checks.map((c) => (
                    <a key={c.path} href={mediaUrl(p(c.path))} target="_blank" rel="noreferrer" onClick={() => chip(`check:${c.path}`, `frame check ${c.from}–${c.to}`, p(c.path))} className="flex flex-col gap-1 no-underline">
                      <Media path={p(c.path)} w={320} className="aspect-[1464/858] w-full rounded-[6px] border border-edge" />
                      <span className="text-[11.5px] text-sub">{c.label ?? `frames ${c.from}–${c.to}`}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {f.sharpness && (
              <div className="flex flex-col gap-2 px-4 py-3">
                <SubLabel>Sharpness A/B · centre crops 1:1</SubLabel>
                {f.sharpness.image && (
                  <a href={mediaUrl(p(f.sharpness.image))} target="_blank" rel="noreferrer" onClick={() => chip('sharpness', 'sharpness A/B', p(f.sharpness!.image!))} className="no-underline">
                    <Media path={p(f.sharpness.image)} w={640} fit="contain" className="aspect-[1090/1140] w-full rounded-[6px] border border-edge bg-black" />
                  </a>
                )}
                {f.sharpness.imageLabel && <span className="text-[11.5px] text-sub">{f.sharpness.imageLabel}</span>}
                {f.sharpness.clips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {f.sharpness.clips.map((c) => (
                      <span key={c.at} className="inline-flex items-center gap-1 text-[11.5px] text-sub">
                        {Number(c.at).toFixed(1)} s:
                        <a href={mediaUrl(p(c.a), {})} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink no-underline hover:underline"><IconPlay size={10} />A</a>
                        <a href={mediaUrl(p(c.b), {})} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink no-underline hover:underline"><IconPlay size={10} />B</a>
                      </span>
                    ))}
                  </div>
                )}
                {f.sharpness.note && <p className="m-0 text-[12.5px] leading-normal text-sub">{f.sharpness.note.text} <From>{f.sharpness.note.from}</From></p>}
                {f.variants.filter((v) => v.label === 'soft').map((v) => (
                  <p key={v.path} className="m-0 text-[12px] leading-normal text-sub">
                    <span className="font-mono text-[11px] text-mute">{v.path}</span> · {v.frames ?? '—'} f · {fmtBytes(v.bytes)} · {v.applied ? 'applied to the kit' : 'not applied to the kit yet'}
                  </p>
                ))}
                {!settled && !f.sharpness.applied && f.variants.some((v) => v.label === 'soft') && (
                  <Btn className="self-start" onClick={() => ui.prefill(`Use soft for the kit: rebuild the captioned kit files on ${f.variants.find((v) => v.label === 'soft')!.path}.`, { id: 'finish:soft', label: 'soft preset · the kit' })}>Use soft for the kit</Btn>
                )}
              </div>
            )}
          </Card>

          {/* ---- Music */}
          <Card>
            <PanelHead title="Music" right={<Link href={`${base}/sound`} className="inline-flex items-center gap-0.5 text-[12.5px] text-sub no-underline hover:text-ink">Every take on Sound<IconChevronRight size={12} /></Link>}
              sub={f.music.source ? [f.music.source.service, f.music.source.name ? `‘${f.music.source.name}’` : '', f.music.source.takes.length ? `${f.music.source.takes.length} takes` : '', fmtDate(f.music.source.date)].filter(Boolean).join(' · ') : 'Nothing in the record yet'} />
            {f.music.source ? (
              <>
                {f.music.source.takes.map((t) => {
                  const picked = f.music.pick && new RegExp(`\\b${t.label.replace(/^take\s*/i, '')}\\b|${t.id ?? '#'}`, 'i').test(f.music.pick.pick);
                  return (
                    <button key={t.label} type="button" onClick={() => chip(`music:${t.id ?? t.label}`, `music · ${t.label}${t.id ? ` ${t.id}` : ''}`)}
                      className={cn('flex w-full cursor-pointer items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-raised', ui.hasChip(`music:${t.id ?? t.label}`) && 'bg-raised')}>
                      <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-full border border-edge-strong"><IconPlay size={11} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-baseline gap-2 text-[13px] font-medium">{t.label}{t.id && <span className="font-mono text-[11px] font-normal text-mute">{t.id}</span>}</span>
                        <span className="truncate text-[11.5px] text-sub">{t.url ? 'listen online' : 'not downloaded'}</span>
                      </span>
                      {picked ? <Badge>chosen</Badge> : null}
                      {t.url && <a href={t.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open ${t.label}`} className="flex-none text-sub hover:text-ink"><IconArrowUpRight size={13} /></a>}
                    </button>
                  );
                })}
                {f.music.source.style && <p className="m-0 border-b border-line px-4 py-3 text-[12.5px] leading-normal text-ink-3">{f.music.source.style}</p>}
                {(!settled || f.music.track || f.music.inRender || f.music.pick) && <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
                  <SubLabel>In the cut</SubLabel>
                  {f.music.track ? (
                    <>
                      <span className="text-[13px]">{f.music.track.id} in Edit · {cutV}</span>
                      <span className="text-[12px] leading-normal text-sub">{f.music.track.name.replace(/^Music\s*·\s*/i, '')}</span>
                      <KV k="Level" mono>{f.music.track.clips.length ? (f.music.track.clips[0].gain !== undefined ? `${f.music.track.clips[0].gain} dB · set in Edit` : '0 dB') : <>no file on {f.music.track.id}<ToConfirm /></>}</KV>
                    </>
                  ) : !settled && <span className="text-[12.5px] text-sub">No music track on the Edit timeline.</span>}
                  {f.music.inRender && <p className="m-0 text-[12px] leading-normal text-sub">{f.music.inRender.text} <From>{f.music.inRender.from}</From></p>}
                  {(!settled || f.music.pick) && <KV k="Which take">{f.music.pick ? <>{f.music.pick.pick} <From>taste.md · {fmtDate(f.music.pick.date)}</From></> : <>not in the record<ToConfirm title="the kit asks you to name the music" /></>}</KV>}
                  {!settled && <Btn className="mt-1 self-start" onClick={() => ui.prefill(`The music in ${f.cut?.render ?? cutV} is `, { id: 'finish:music', label: 'music · which take' })}>Confirm the music</Btn>}
                </div>}
              </>
            ) : (
              <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
                <p className="m-0 text-[12.5px] leading-normal text-sub">No music row in spend.md, no music track with a file on the timeline.{f.music.track ? ` The Edit timeline has ${f.music.track.id} (${f.music.track.name}) with ${f.music.track.clips.length} clips.` : ''}</p>
                {!settled && <Btn className="self-start" onClick={() => ui.prefill(`Find music for ${cutV}: `, { id: 'finish:music', label: `music · ${cutV}` })}>Ask Alma for music</Btn>}
              </div>
            )}
            {f.music.peak && (
              <div className="border-b border-line px-4 py-3">
                <Flag quiet={settled} from={f.music.peak.fact.from} action={settled ? undefined : <Btn className="self-start" onClick={() => ui.prefill(`The mix peaks at ${f.music.peak!.value > 0 ? '+' : ''}${f.music.peak!.value} ${f.music.peak!.unit} on ${f.cut?.render ?? cutV}. What do you suggest?`, { id: 'finish:peak', label: `mix peak ${f.music.peak!.value > 0 ? '+' : ''}${f.music.peak!.value} ${f.music.peak!.unit}` })}>Ask Alma about the peak</Btn>}>
                  The mix peaks at {f.music.peak.value > 0 ? '+' : ''}{f.music.peak.value} {f.music.peak.unit} on {f.cut?.render ?? cutV}{f.music.peak.value > 0 && f.music.peak.unit === 'dBFS' ? ', so it clips' : ''}.
                </Flag>
                {f.music.peak.earlier.map((e) => <p key={e.text} className="m-0 mt-2 text-[11.5px] text-mute">Earlier: {e.text} <From>{e.from}</From></p>)}
              </div>
            )}
            {f.music.stems.length > 0 && (
              <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
                <SubLabel>Stems</SubLabel>
                {f.music.stems.map((s) => <KV key={s.path} k={<span className="font-mono text-[11.5px]">{baseName(s.path)}</span>} mono>{fmtBytes(s.bytes)}</KV>)}
              </div>
            )}
            {f.music.source?.note && <p className="m-0 px-4 py-3 text-[12px] leading-normal text-mute">{f.music.source.service}: {f.music.source.note}. The kit names the music once you confirm it.</p>}
          </Card>

          {/* ---- Captions */}
          <Card className="max-[1380px]:col-span-2 max-[1080px]:col-span-1">
            <PanelHead title="Captions"
              sub={sidecar ? [`${sidecar.cues} cues`, `${sidecar.maxChars} chars a line`, f.captions.style?.value?.match(/gold/i) ? 'gold' : '', burned ? 'burned in' : ''].filter(Boolean).join(' · ') : 'No captions yet'} />
            {sidecar || f.captions.srts.length ? (
              <>
                <div className="flex flex-col gap-2.5 border-b border-line px-4 py-3 text-[12.5px]">
                  {f.captions.style && <Fact k="Style" v={f.captions.style.value ?? f.captions.style.text} from={f.captions.style.from} />}
                  {f.captions.place && <Fact k="Place" v={f.captions.place.value ?? f.captions.place.text} from={f.captions.place.from} />}
                  {f.captions.timing && <Fact k="Timing" v={f.captions.timing.text} from={f.captions.timing.from} />}
                  {f.captions.words && <Fact k="Word timings" v={`${f.captions.words.words} words · ${baseName(f.captions.words.path)}`} />}
                  {f.captions.script && <Fact k="Caption script" v={`${f.captions.script.lines} lines · ${f.captions.script.path}`} />}
                </div>
                <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3">
                  <SubLabel>Files</SubLabel>
                  {f.captions.srts.map((x) => <SrtRow key={x.path} x={x} name={short(x.path)} onClick={() => chip(`srt:${x.path}`, `${x.role} · ${baseName(x.path)}`, p(x.path))} />)}
                  {captioned.map((c) => (
                    <button key={c.path} type="button" onClick={() => chip(`captioned:${c.path}`, `captioned · ${baseName(c.path)}`, p(c.path))}
                      className={cn('flex cursor-pointer items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-raised', !/1080/.test(c.path) && captioned.some((o) => /1080/.test(o.path)) && 'opacity-60')}>
                      <span className="min-w-0 [overflow-wrap:anywhere] font-mono text-[11.5px] leading-snug" title={baseName(c.path)}>{short(c.path)}</span>
                      <span className="flex-none text-[11px] text-sub">{fmtBytes(c.bytes)} · {fmtDate(c.date)}</span>
                    </button>
                  ))}
                  {captioned.length < f.captions.captioned.length && <Link href={`${base}/release`} className="px-1.5 pt-1 text-[11.5px] text-sub no-underline hover:text-ink">{f.captions.captioned.length - captioned.length} earlier captioned versions are with the finished films on Release</Link>}
                </div>
                {f.captions.frames && (
                  <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
                    <SubLabel right="1080p">Captioned frames</SubLabel>
                    <a href={mediaUrl(p(f.captions.frames.path))} target="_blank" rel="noreferrer" onClick={() => chip('capframes', 'captioned frames', p(f.captions.frames!.path))} className="no-underline">
                      <Media path={p(f.captions.frames.path)} w={640} fit="contain" className="aspect-[1950/854] w-full rounded-[6px] border border-edge bg-black" />
                    </a>
                    {f.captions.frames.label && <span className="font-mono text-[11px] text-sub">{f.captions.frames.label}</span>}
                  </div>
                )}
                {f.captions.flags.map((fl) => <div key={fl.text} className="border-b border-line px-4 py-3"><Flag quiet={settled} from={fl.from}>{fl.text}</Flag></div>)}
              </>
            ) : (
              <p className="m-0 border-b border-line px-4 py-3 text-[12.5px] leading-normal text-sub">No subtitles/ or social/ caption files yet. Captions follow the 1080p master: the script lines timed on its dialogue, burned in the gold style (Flow v3 - 12).</p>
            )}
            {!settled && <div className="px-4 py-3">
              <Btn className="h-auto min-h-8 whitespace-normal py-1.5 text-left" onClick={() => ui.prefill(sidecar ? `Make captions from the ${capEdition} SRT.` : `Make captions for ${cutV}.`, { id: 'finish:captions', label: `captions · ${capEdition}` })}>
                {sidecar ? `Make captions from the ${capEdition} SRT` : `Make captions for ${cutV}`}
              </Btn>
            </div>}
          </Card>
        </div>

        {/* ---- the checks on the master */}
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <span className="lbl">Checks on the 1080p master{master?.date ? ` · ${fmtDate(master.date)}` : ''}</span>
            <span className="text-[12px] text-sub">{checkSummary(f.checks, !!master, settled)}</span>
          </div>
          {f.checks.length ? (
            <div className="grid grid-cols-3 gap-x-5 gap-y-3 px-4 py-3.5 max-[1380px]:grid-cols-2 max-[760px]:grid-cols-1">
              {f.checks.map((c) => (
                <button key={c.label} type="button" onClick={() => chip(`mcheck:${c.label}`, `master check · ${c.label}`)} className="flex cursor-pointer flex-col gap-1 rounded-md text-left hover:bg-raised">
                  <span className="flex items-center gap-2 text-[13px] font-medium"><StateDot state={settled && c.state !== 'ok' ? 'unknown' : c.state} />{c.label} · {(settled ? WENT : WORD)[c.state]}</span>
                  <span className="text-[12px] leading-normal text-sub">{c.text}</span>
                  {c.from && <From>{c.from}</From>}
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 px-4 py-3.5 text-[12.5px] text-sub">They run on the 1080p master: its length against the cut’s frame count, the true peak of the mix, black level and warmth per shot, the edges of the upscale’s fill.</p>
          )}
        </Card>
        <ReadingNotes notes={f.warnings} />
        <Feed query="place=finish" note="1080p tests and caption rounds" from="the Finish page" />
      </PageBody>
    </>
  );
}

const WORD: Record<MasterCheck['state'], string> = { ok: 'ok', flag: 'flag', confirm: 'to confirm', unknown: 'not in the record' };
/** The same states on a film that went out: what the record noted, with nothing left to do. */
const WENT: Record<MasterCheck['state'], string> = { ok: 'ok', flag: 'noted, went out as is', confirm: 'never confirmed', unknown: 'not in the record' };

function checkSummary(c: MasterCheck[], master: boolean, settled?: boolean): string {
  if (!master) return 'waits for the 1080p master';
  const flags = c.filter((x) => x.state === 'flag').length;
  const confirm = c.filter((x) => x.state === 'confirm').length;
  const notes = c.filter((x) => x.state !== 'ok').length;
  if (settled) return [`${c.length - notes} ok`, notes ? `${plural(notes, 'note')} in the record` : ''].filter(Boolean).join(' · ');
  return [flags ? `${flags} ${flags === 1 ? 'flag' : 'flags'}` : 'no flag', confirm ? `${confirm} to confirm` : ''].filter(Boolean).join(' · ');
}

function PathStep({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <StateDot state={done ? 'ok' : 'waiting'} />
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        <span className="break-words text-[11.5px] text-sub">{detail}</span>
      </span>
    </li>
  );
}

function Fact({ k, v, from }: { k: string; v: string; from?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-sub">{k}</span>
      <span className="leading-normal">{v}{from && <> <From>{from}</From></>}</span>
    </div>
  );
}

const ROLE: Record<SrtFact['role'], string> = { sidecar: 'sidecar', burned: 'burned', source: 'from the edit' };

function SrtRow({ x, name, onClick }: { x: SrtFact; name: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left hover:bg-raised', x.current ? 'border-edge' : 'border-dashed border-edge opacity-70')}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 [overflow-wrap:anywhere] font-mono text-[11.5px] leading-snug" title={baseName(x.path)}>{name}</span>
        {!x.current && <span className="flex-none text-[10.5px] text-mute">superseded</span>}
      </span>
      <span className="text-[11.5px] text-sub">{ROLE[x.role]} · {x.cues} cues · {x.maxChars} chars a line · {fmtBytes(x.bytes)} · {fmtDate(x.date)}</span>
    </button>
  );
}
