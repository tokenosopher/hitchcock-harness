'use client';
// Elements (stage 3b): one 5-second video element per speaking character, from the picked sheet and voice.
// design/boards/Elements.dc.html.
import { usePage } from '@/components/data/ui';
import { fmtCost, fmtCredits, sumCredits } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { FILM_TARGET, qcEntry, qcSpec } from '@/components/lib/qc';
import { Badge, Card } from '@/components/shell/atoms';
import { IconChevronRight, IconInfo } from '@/components/shell/icons';
import { Media } from '@/components/media/Media';
import { useFilmPage, filmMeta, filmPath } from './common';
import { Feed } from '@/components/feed/Feed';
import { StepIntro } from '@/components/intro/StepIntro';

const CUTS: [string, string][] = [['0–1', 'full body, front'], ['1–2', 'full body, back'], ['2–3', 'full body, side'], ['3–4', 'eye macro'], ['4–5', 'hands + feet']];

export function ElementsPage() {
  const { state, error, ui, base } = useFilmPage();
  const speaking = (state?.characters ?? []).filter((c) => !c.extra && !c.silent);
  const done = speaking.filter((c) => c.element?.state === 'final').length;
  usePage(state ? `Elements · ${done} of ${speaking.length} done` : undefined, 'Ask Alma to redo an element, or move on…', done ? ['Play all four', 'Run QC'] : ['What does an element need?'], ['How were the elements made?']);
  if (!state) return <Loading error={error} />;

  // the element's own jobs; "video elements" in a scene's line is that scene's references, not an element job
  const spend = state.spend.lines.filter((l) => /\bvideo element\b|\bE-C\d|^the element line/i.test(l.what));
  const out = state.film.status === 'delivered';
  const total = sumCredits(spend.map((l) => l.cost));

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Elements' }]}
        meta={filmMeta(state, `${speaking.length} elements`)} phoneSub={`Elements · ${done} of ${speaking.length} done`} />
      <PageBody wide>
        <StageTitle kicker="Stage 3b · Video elements" title="Elements"
          sub="One 5-second video element for each speaking character, made from the picked sheet and the picked voice. Every scene takes it as a video reference, with the head-to-toe sheet beside it."
          right={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-[14px] border border-edge-strong px-2.5 text-[12px] font-medium"><span className="size-1.5 rounded-full bg-ink" />{done} of {speaking.length} done</span>
                <QCChip spec={qcSpec('elements')} targets={{ target: FILM_TARGET, label: 'elements', entry: qcEntry(state, 'elements', FILM_TARGET), ready: done > 0, waitsFor: done ? `the ${done} finished ${done === 1 ? 'element' : 'elements'}` : 'the first element' }} />
              </div>
              {!out && <span className="text-[11.5px] text-mute">from now on the elements QC runs before the 1080p finish</span>}
            </div>
          } />
        <StepIntro step="elements" />

        <Card>
          <details open={!out} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 group-open:border-b group-open:border-line [&::-webkit-details-marker]:hidden">
              <span className="lbl flex items-center gap-1.5"><IconChevronRight size={12} className="text-sub transition-transform group-open:rotate-90" />The element · the same for every character</span>
              <span className="text-[12px] text-sub">{out ? '1920×1080 · 5 s · Seedance 2.5' : 'Seedance 2.5 · 480p draft, then 1080p on your word'}</span>
            </summary>
            <div className="grid grid-cols-[228px_minmax(0,1fr)] gap-5 p-4 max-[900px]:grid-cols-1">
              <div className="grid aspect-[16/9] grid-cols-2 overflow-hidden rounded-[6px] border border-edge">
                <div className="flex flex-col border-r border-edge">{CUTS.map(([t]) => <span key={t} className="flex-1 border-b border-line px-1.5 pt-1 font-mono text-[9.5px] text-mute last:border-b-0">{t}</span>)}</div>
                <div className="flex items-center justify-center bg-tile"><span className="size-8 rounded-full bg-edge-strong" /></div>
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">{['1920×1080', '5 s', '24 fps', 'side-by-side split', 'sound on'].map((t) => <span key={t} className="rounded-[6px] border border-edge px-2 py-0.5 text-[12px] text-ink-3">{t}</span>)}</div>
                <span className="text-[12.5px] text-sub">Left half · a hard cut every second · six items in five cuts: hands and feet share the last second</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {CUTS.map(([t, l]) => (
                    <div key={t} className="flex flex-col gap-1"><span className="h-1 rounded-sm bg-sub/70" /><span className="font-mono text-[10.5px] text-mute">{t}</span><span className="text-[12px] leading-tight">{l}</span></div>
                  ))}
                </div>
                <span className="text-[12.5px] text-sub">Right half · all 5 s</span>
                <p className="m-0 text-[13px] leading-normal">Head and shoulders to the lens, speaking the line once in the picked voice, cut from that voice’s preview: “This is how I look and this is how I sound.” Lips closed after the last word.</p>
                <div className="flex gap-2.5 rounded-lg border border-edge px-3 py-2.5 text-[12.5px] leading-normal text-ink-3"><IconInfo size={13} className="mt-0.5 flex-none text-sub" />Reference videos may total at most 30 s in one generation; a previz video counts against the same 30 s.</div>
              </div>
            </div>
          </details>
        </Card>

        {spend.length > 0 && (
          <details className="text-[12.5px] text-sub">
            <summary className="cursor-pointer list-none hover:text-ink-3 [&::-webkit-details-marker]:hidden">Credits · <span className="text-ink">{fmtCredits(total)}</span> over {spend.length} {spend.length === 1 ? 'job' : 'jobs'} in spend.md</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {spend.map((l, i) => <li key={i} className="flex justify-between gap-4"><span className="min-w-0">{l.what}</span><span className="flex-none tabular-nums">{fmtCost(l.cost)}</span></li>)}
            </ul>
          </details>
        )}

        <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">
          {speaking.map((c) => {
            const pickedVoice = c.voice?.rounds.flatMap((r) => r.candidates).find((o) => o.id === c.voice?.pick?.candidateId);
            const state3 = c.element?.state ?? 'none';
            return (
              <Card key={c.id} as="article" dashed={state3 === 'none'} className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => ui.addChip({ id: `element:${c.id}`, label: `E-${c.id} ${c.name}`, ref: c.element?.path })} className="flex cursor-pointer items-center gap-2 text-left">
                    <span className={state3 === 'final' ? 'size-1.5 rounded-full bg-ink' : 'size-1.5 rounded-full border border-mute'} />
                    <span className="font-mono text-[12px] text-sub">E-{c.id}</span><span className="text-[14px] font-medium">{c.name}</span>
                  </button>
                  <Badge dim={state3 !== 'final'} dashed={state3 === 'none'}>{state3 === 'final' ? 'Done' : state3 === 'draft' ? 'Draft' : out ? 'Not made' : 'Waiting for picks'}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-3.5">
                  <div className="flex flex-col gap-1">
                    {c.element?.path
                      ? <Media path={filmPath(state, c.element.path)} w={320} t={0.5} play fit="cover" className="aspect-[16/9] rounded-[6px] border border-edge" onPlay={() => ui.addChip({ id: `element:${c.id}`, label: `E-${c.id} ${c.name}`, ref: c.element?.path })} />
                      : <div className="flex aspect-[16/9] items-center justify-center rounded-[6px] border border-edge bg-tile" />}
                    <div className="flex justify-between font-mono text-[10px] text-mute"><span>0</span><span>5 s</span></div>
                  </div>
                  <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px] leading-normal">
                    <dt className="text-sub">Sheet</dt><dd className="m-0">{c.face?.pick ? `face ${c.face.pick.candidateId}` : 'face not picked'}{c.wardrobe?.pick ? ` · wardrobe ${c.wardrobe.pick.candidateId}` : ''}{c.sheet?.approved ? ' · sheet approved' : ''}</dd>
                    <dt className="text-sub">Voice</dt><dd className="m-0">{c.voice?.pick ? `${c.voice.pick.candidateId.replace('-', ' ')}${pickedVoice?.hz !== undefined ? ` · ${pickedVoice.hz.toFixed(1)} Hz` : ''}` : 'not picked'}</dd>
                    <dt className="text-sub">Line</dt><dd className="m-0">{c.voice?.elementLine?.seconds !== undefined ? `${c.voice.elementLine.seconds} s, cut from the preview` : '—'}</dd>
                  </dl>
                </div>
              </Card>
            );
          })}
        </div>
        <Feed query="place=elements" note="element clips and their tests" from="the Elements page" />
      </PageBody>
    </>
  );
}
