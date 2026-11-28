'use client';
// Voices (stage 3): one designed voice per character, its options, the pick and the element line.
// design/boards/Voices.dc.html.
import { useState } from 'react';
import { usePage } from '@/components/data/ui';
import { lastRound } from '@/components/lib/derive';
import { capital, fmtDate, word } from '@/components/lib/format';
import { Header, HeaderLink } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { FILM_TARGET, qcEntry, qcSpec } from '@/components/lib/qc';
import { Card, CardHead } from '@/components/shell/atoms';
import { IconPlay } from '@/components/shell/icons';
import { useFilmPage, filmPath, filmCost } from './common';
import { FromLibrary } from '@/components/library/FromLibrary';
import { PickButton, SaveButton } from '@/components/library/PickButton';
import { Who } from '@/components/feed/Who';
import { faceDone, voiceDone, voiceStepFor } from '@/components/lib/derive';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { MakingLines, useMaking } from '@/components/flow/Making';
import { makingFor } from '@/components/lib/making';
import { cn } from '@/lib/utils';
import { Feed } from '@/components/feed/Feed';
import { StepIntro } from '@/components/intro/StepIntro';
import { refData } from '@/components/lib/refPick';
import { voiceRefOf } from '@/components/shell/refItems';

/** A voice option's name: "3" and "option-3" both read "option 3". */
const opt = (id: string) => (/^\d+$/.test(id) ? `option ${id}` : id.replace('option-', 'option '));

/** A stand-in waveform: bars from a fixed pattern, no audio decoding in step 1. */
function Wave({ seed = 1, className }: { seed?: number; className?: string }) {
  const bars = Array.from({ length: 22 }, (_, i) => 30 + ((i * 37 + seed * 53) % 70));
  return (
    <span className={cn('flex h-6 flex-1 items-center gap-[2px]', className)} aria-hidden="true">
      {bars.map((h, i) => <span key={i} className="w-[2px] rounded-[1px] bg-sub/80" style={{ height: `${h}%` }} />)}
    </span>
  );
}

export function VoicesPage() {
  const { state, error, ui, base } = useFilmPage();
  const speaking = state?.characters ?? [];
  // extras and characters with no lines have no voice to pick
  const noVoice = (x: { extra?: boolean; silent?: boolean }) => !!x.extra || !!x.silent;
  const [sel, setSel] = useState<string>();
  const [tab, setTab] = useState<'round' | 'lib'>('round');
  const [opt1, setOpt] = useState<{ c: string; o: string }>();
  // opens on the first character whose voice is a step now (face picked, not taken from the library, Flow v3.3 21 Nov
  // 2026), its voice not picked yet; else the first with a voice
  const c = speaking.find((x) => x.id === sel) ?? speaking.find((x) => voiceStepFor(x) && !voiceDone(x)) ?? speaking.find((x) => voiceStepFor(x)) ?? speaking.find((x) => !noVoice(x));
  const making = useMaking();
  // a voice counts when it is picked here, or came with a character taken from the library (its element line is on file)
  const picked = speaking.filter((x) => !noVoice(x) && voiceDone(x)).length;
  const total = speaking.filter((x) => !noVoice(x)).length;
  usePage(state ? `stage 3 · ${picked} of ${total} voices picked` : undefined, 'Ask Alma to redo a voice, or move on to Elements…',
    picked === total ? ['Play all picks', 'Open Elements'] : c ? [`Play ${c.id}’s options`] : []);
  if (!state) return <Loading error={error} />;

  const r = c ? lastRound(c.voice?.rounds) : undefined;
  const speaker = c?.name.replace(/^the /, '').toUpperCase();
  const lines = (state.script?.lines ?? []).filter((l) => l.speaker === speaker);
  const pick = c?.voice?.pick;
  const pickedOpt = r?.candidates.find((o) => o.id === pick?.candidateId);
  const linePath = c?.voice?.elementLine?.path;
  const lineSecs = c?.voice?.elementLine?.seconds;
  const lineHz = c?.voice?.elementLine?.hz ?? pickedOpt?.hz;
  const cMaking = c && !c.reused ? makingFor(making, ['voices'], c.id) : [];

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Voices' }]}
        back={{ label: 'Back to Voices', href: `${base}?open=voices`, soft: true }}
        meta={<>{[state.film.aspect, filmPath(state, 'voices'), 'Higgsfield'].filter(Boolean).join(' · ')} · <span title={filmCost(state).title}>{filmCost(state).text}</span></>} phoneSub={`Voices · ${picked} of ${total} picked`}
        actions={<HeaderLink icon={<IconPlay size={11} />} onClick={() => ui.command({ id: 'voices:play-all', label: 'Play all the picked voices' }, 'Play all the picked voices, one after the other')}>Play all picks</HeaderLink>} />
      <PageBody wide>
        <StageTitle kicker="Stage 3 · Voices" title={<>Voices <span className="text-[15px] font-normal text-sub">· {picked} of {total} picked</span></>}
          sub="One designed voice per character. The element line, “This is how I look and this is how I sound.”, is cut from the picked preview. The video elements have their own page."
          right={<QCChip spec={qcSpec('voice')} targets={{ target: FILM_TARGET, label: 'voices', entry: qcEntry(state, 'voice', FILM_TARGET), ready: total > 0 && picked === total, waitsFor: !total ? 'the voice picks' : picked === total ? `the ${word(total)} picked voices` : `the ${word(total)} picks (${picked} made)` }} />} />
        <StepIntro step="voices" />

        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {speaking.map((x) => {
            const xr = lastRound(x.voice?.rounds);
            const on = x.id === c?.id;
            return (
              <button key={x.id} type="button" disabled={noVoice(x)} onClick={() => { setSel(x.id); ui.addChip({ id: `voices:${x.id}`, label: `Voices · ${x.id} round ${xr?.id.replace('r', '') ?? 1}` }); }}
                className={cn('flex cursor-pointer flex-col gap-0.5 rounded-[9px] border px-3 py-2.5 text-left disabled:cursor-default', on ? 'border-sub bg-raised' : 'border-edge bg-panel', noVoice(x) && 'border-dashed bg-bg')}>
                <span className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', voiceDone(x) ? 'bg-ink' : xr ? 'bg-sub' : 'border border-mute')} /><span className="font-mono text-[11.5px] text-sub">{x.id}</span></span>
                  {noVoice(x) && <span className="rounded-[4px] border border-edge px-1 text-[10px] text-sub">no voice</span>}
                </span>
                <span className="text-[13px] font-medium">{x.name}</span>
                <span className="text-[11.5px] text-sub">{noVoice(x) ? 'no lines' : x.reused ? 'from the library' : !x.voice?.pick && voiceDone(x) ? 'from the library' : !faceDone(x) ? 'after the face pick' : x.voice?.pick ? `${opt(x.voice.pick.candidateId)}${x.voice.pick.date ? ` · ${fmtDate(x.voice.pick.date)}` : ''}` : xr ? `${xr.candidates.length} options · your pick` : 'not designed yet'}</span>
              </button>
            );
          })}
        </div>

        {c && (
          <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4 max-[1200px]:grid-cols-1">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold"><span className="font-mono font-normal text-sub">{c.id}</span> {c.name}</span>
                {!c.reused && <span className="text-[12px] text-sub">{c.voice?.rounds.length ?? 0} round · {r?.candidates.length ?? 0} options</span>}
              </div>
              <Who state={state} ids={[c.id]} />
              {!noVoice(c) && !c.reused && (
                <div role="tablist" aria-label={`${c.id} voice`} className="flex gap-4 border-b border-line">
                  {(['round', 'lib'] as const).map((t) => (
                    <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                      className={cn('-mb-px h-[30px] cursor-pointer border-b-2 text-[12.5px] font-medium', tab === t ? 'border-ink text-ink' : 'border-transparent text-sub')}>
                      {t === 'round' ? 'Design rounds' : 'From the library'}
                    </button>
                  ))}
                </div>
              )}
              {c.reused ? (
                // taken whole from the library: its voice came with it, nothing to design or pick here
                <Card data-voice-reused className="flex flex-col gap-2 p-4 duration-200 animate-in fade-in-0">
                  <span className="text-[13px] font-semibold">Reused from the library{c.reusedFrom ? `: ${c.reusedFrom.title}` : ''}</span>
                  <span className="text-[12.5px] leading-normal text-sub">{c.name} came from the library with the voice, the face, the sheet and the video element, so there is no voice to design or pick in this film.</span>
                </Card>
              ) : tab === 'lib' && !noVoice(c) ? (
                <Card className="p-4"><FromLibrary key={c.id} film={state.film.slug} kind="voice" target={c.id} targetName={c.name} from="the Voices page" /></Card>
              ) : r ? (
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold">Round {r.id.replace('r', '')} <span className="font-mono text-[11px] font-normal text-mute">{r.id}</span></span>
                    {pick && <span className="text-[12px] text-ink-3">{opt(pick.candidateId)} picked{pick.words ? ` · “${pick.words}”` : ''}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 max-[760px]:grid-cols-1">
                    {r.candidates.map((o, i) => {
                      const isPick = pick?.candidateId === o.id;
                      const choose = () => { setOpt({ c: c.id, o: o.id }); ui.addChip({ id: `voice:${c.id}`, label: `${c.id} · ${opt(o.id)}`, ref: o.path }); };
                      return (
                        <div key={o.id} {...refData(voiceRefOf(state, c.id, r.id, o.id, opt(o.id), o.path))} role="button" tabIndex={0} aria-pressed={opt1?.c === c.id && opt1.o === o.id} onClick={choose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } }}
                          className={cn('flex cursor-pointer flex-col gap-2 rounded-[9px] border p-3 text-left', isPick ? 'border-ink outline outline-1 outline-offset-2 outline-ink' : 'border-edge bg-well hover:border-sub')}>
                          <span className="text-[13px] font-medium">{capital(opt(o.id))}</span>
                          {r.prediction === o.id && <span className="w-max rounded-[4px] border border-ink px-1.5 text-[10.5px] font-semibold">Alma: this one</span>}
                          {/* a play button only with a file to play */}
                          <span className="flex items-center gap-2">{o.path && <PlayButton path={filmPath(state, o.path)} label={`${c.id} ${opt(o.id)}`} className="size-6" />}<Wave seed={i + 1} /></span>
                          <span className="font-mono text-[12px]">{o.hz !== undefined ? `${o.hz.toFixed(1)} Hz` : '— Hz'}</span>
                          <span className="whitespace-nowrap font-mono text-[11px] text-sub">preview · {o.seconds ?? '—'} s</span>
                          {isPick && <span className="w-max rounded-[4px] border border-ink px-1.5 text-[10.5px]">picked{pick?.date ? ` · ${fmtDate(pick.date)}` : ''}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {opt1?.c === c.id && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <PickButton key={opt1.o} film={state.film.slug} body={{ kind: 'voice', target: c.id, round: r.id, candidate: opt1.o, prediction: r.prediction, from: 'the Voices page' }}
                        label={<>Pick {opt(opt1.o)}</>} what={`${opt(opt1.o)} for ${c.id} ${c.name}`} />
                      <SaveButton key={`s-${opt1.o}`} film={state.film.slug} kind="voice" refPath={`${c.id} option ${opt1.o.replace(/^\D*/, '')}`} label={<>Save {opt(opt1.o)} to the library</>} />
                    </div>
                  )}
                </Card>
              ) : cMaking.length ? (
                // the loading state: the voices being designed, before the first lands
                <Card dashed className="p-4"><MakingLines items={cMaking} bar /></Card>
              ) : <Card dashed className="p-4 text-[12.5px] text-sub">{faceDone(c) ? `No voice designed for ${c.id} yet.` : `No voice for ${c.id} yet: it is designed once ${c.name}’s face is picked.`}</Card>}
              {!c.reused && <p className="m-0 text-[12.5px] leading-normal text-sub">One design call per brief returns three previews; each starts with the element line, then the character’s own lines. Choose an option to pick it here, or say it in chat, e.g. “{c.id} option 2”. A pick runs the flow’s pick.py and calls no service: the picked preview is the voice, and Alma cuts the element line from it next.</p>}
            </div>

            <Card>
              <CardHead label={`Voice sheet · ${c.id}`} right="cast.json" />
              <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
                <span className="text-[14px] font-semibold">{state.film.title} – {c.name}</span>
                <span className="text-[12px] text-sub">{c.reused ? `Reused from the library: ${c.reusedFrom?.title ?? 'an earlier film'}` : pick ? `Your pick: ${opt(pick.candidateId)}${pick.date ? ` · ${fmtDate(pick.date)}` : ''}` : 'Not picked yet'}</span>
              </div>
              <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
                <span className="lbl">Element line</span>
                <p className="m-0 border-l-2 border-edge-strong pl-3 text-[13px] leading-normal">“This is how I look and this is how I sound.”</p>
                {/* the line's own file plays here; no button when there is no file */}
                {linePath ? (
                  <div data-element-line className="flex items-center gap-2"><PlayButton path={filmPath(state, linePath)} label={`${c.name}’s element line`} className="size-6" /><PlayLine path={filmPath(state, linePath)} idle seconds={lineSecs} className="min-w-0 flex-1" /></div>
                ) : <div className="flex items-center gap-2"><Wave seed={7} /></div>}
                {/* a voice taken from the library shows what is known of it, never a dash */}
                {(!c.reused || lineSecs !== undefined || lineHz !== undefined) && (
                  <div className="grid grid-cols-2 gap-2">
                    {(!c.reused || lineSecs !== undefined) && <div className="rounded-lg border border-edge p-2"><span className="block text-[11px] text-sub">measured length</span><span className="font-mono text-[14px]">{lineSecs !== undefined ? `${lineSecs} s` : '—'}</span></div>}
                    {(!c.reused || lineHz !== undefined) && <div className="rounded-lg border border-edge p-2"><span className="block text-[11px] text-sub">pitch on the line</span><span className="font-mono text-[14px]">{lineHz ?? '—'}{lineHz !== undefined ? ' Hz' : ''}</span></div>}
                  </div>
                )}
                {c.voice?.elementLine?.path && <span className="break-all font-mono text-[11px] text-mute">{filmPath(state, c.voice.elementLine.path)}</span>}
              </div>
              <div className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between"><span className="lbl">Lines in the locked script</span><span className="text-[12px] text-sub">{lines.length} of {(state.script?.lines ?? []).filter((l) => l.speaker).length}</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {lines.map((l) => (
                    <button key={l.id} type="button" title={l.text} onClick={() => ui.addChip({ id: `line:${l.id}`, label: `${l.id} · ${c.name}`, ref: l.id })} className="cursor-pointer rounded-[6px] border border-edge px-2 py-0.5 font-mono text-[11.5px] hover:border-sub">{l.id}</button>
                  ))}
                  {!lines.length && <span className="text-[12px] text-mute">No spoken lines.</span>}
                </div>
              </div>
            </Card>
          </div>
        )}
        <Feed query="place=voices" note="voice rounds and auditions" from="the Voices page" />
      </PageBody>
    </>
  );
}
