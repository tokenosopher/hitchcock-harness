'use client';
// Shot details: one take, opened at one of its shots, with
// everything that was fed to the model for it: the prompt as sent, cut into its parts, and every input, the ones the
// shot's part names first. Reached from the Edit page's right-click menus and the Shots page; its address is
// shotDetailsHref (components/lib/shotHref.ts). Read only: nothing here writes; Option-click puts a thing in Alma's box.
//
// What the data cannot say, said plainly on the page: the model got one prompt and every input for the whole take
// (a shot's inputs are the ones its part names); the shots match the prompt's parts by count only; a take made before
// the records were kept has none.
import { StepIntro } from '@/components/intro/StepIntro';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SceneRef, SentRecord, SentRef, TakeRef } from '@/server/types';
import type { ShotDetailsExtra } from '@/server/films/read/previzTake';
import { usePage } from '@/components/data/ui';
import { fmtDate, takeLabel } from '@/components/lib/format';
import { Header } from '@/components/shell/Header';
import { Loading } from '@/components/shell/StageTitle';
import { IconChevronDown, IconChevronLeft, IconChevronRight } from '@/components/shell/icons';
import { useIsPhone, useIsTouch } from '@/components/shell/useIsPhone';
import { mediaUrl } from '@/components/media/Media';
import { shotsOf, type TakeShots } from '@/components/edit/shots';
import { filmRel, shotDetailsHref, takeFromParam } from '@/components/lib/shotHref';
import { sentence, type Mention, type PromptSection } from '@/components/lib/shotDetails';
import { useFilmPage, filmPath } from '@/components/pages/common';
import { isWide } from '@/lib/frame';
import { useJson } from '@/components/pages/postCommon';
import { cn } from '@/lib/utils';
import { fullName, pageOfPanel, pageShots, previzFor, tagName, useModel, type Model, type PageShot } from './model';
import { ShotPlayer, fmtT, type PlayerHandle } from './ShotPlayer';
import { ShotPrompt, type NameEvents, type PromptHandle } from './ShotPrompt';
import { ShotInputs, shortDesc, type InputsHandle } from './ShotInputs';
import { PICK, pickProps, usePickingRing } from './tell';

/** The take a file is, in the film's state: its scene and its record. */
function findTake(scenes: SceneRef[], rel: string): { sc: SceneRef; t: TakeRef } | undefined {
  for (const sc of scenes) for (const t of sc.takes) if (t.path && (t.path === rel || filmRel(t.path) === rel)) return { sc, t };
  return undefined;
}
/** "seedance_2_5" → "Seedance 2.5". */
const modelName = (m?: string): string => {
  const s = /^seedance[_-]?(\d+)[_.](\d+)/i.exec(m ?? '');
  return s ? `Seedance ${s[1]}.${s[2]}` : m ?? '';
};
/** A take's record when the film's state does not know the take: the file beside it, as the kit names it. */
const guessSent = (rel: string): string | undefined => {
  const g = rel.replace(/(-\d{3,4}p)?\.(mp4|mov|m4v)$/i, '-sent.json');
  return g !== rel && /^(generations|blocks|elements)\//.test(g) ? g : undefined;
};

export function ShotDetailsPage() {
  const { state, error, ui, base, film } = useFilmPage();
  const params = useParams<{ take: string }>();
  const rel = takeFromParam(params.take ?? '');
  const q = useSearchParams();
  const asked = Number(q.get('shot') ?? '') || 0;
  const phone = useIsPhone();
  // a phone is taken as touch: no pointing, a tap (and each input's Tell Alma) instead
  const touch = useIsTouch() || phone;

  const found = state && rel ? findTake(state.scenes, rel) : undefined;
  const sentPath = found ? found.t.sent : rel ? guessSent(rel) : undefined;
  const sent = useJson<SentRecord>(state && sentPath ? `/api/films/${film}/sent?p=${encodeURIComponent(sentPath)}` : undefined, state?.updatedAt);
  // the take cut into its shots (the Edit page's own reading); asked again while takes still wait to be read
  const [poll, setPoll] = useState(0);
  const cuts = useJson<{ takes: TakeShots[]; waiting: number }>(state ? `/api/films/${film}/shots` : undefined, `${state?.updatedAt}:${poll}`);
  const ts = cuts.data?.takes.find((t) => filmRel(t.src) === rel);
  const waiting = !!cuts.data?.waiting && (!ts || ts.state === 'waiting');
  useEffect(() => { if (!waiting || poll > 40) return; const id = setTimeout(() => setPoll((p) => p + 1), 3000); return () => clearTimeout(id); }, [waiting, poll]);

  const rec = sent.data;
  const m = useModel(rec);
  const cut = useMemo(() => shotsOf(ts), [ts]);
  const { shots, matched } = useMemo(() => pageShots(m, cut), [m, cut]);
  // the previz: the take's own when its record names one, else the scene's newest
  const pvFrom: { p: string; from: 'take' | 'scene' } | undefined = rec?.layout?.previzTake ? { p: rec.layout.previzTake, from: 'take' }
    : found?.sc.previzPath ? { p: found.sc.previzPath, from: 'scene' } : undefined;
  const board = rec?.layout?.storyboard ?? undefined;
  const xq = new URLSearchParams({ ...(pvFrom ? { previz: pvFrom.p, from: pvFrom.from } : {}), ...(board ? { board } : {}) }).toString();
  const extra = useJson<ShotDetailsExtra>(state && rec && xq ? `/api/films/${film}/shotdetails?${xq}` : undefined, state?.updatedAt).data;

  const [sel, setSel] = useState(asked);
  const cur: PageShot | undefined = sel ? shots[sel - 1] : undefined;
  const count = shots.length;

  const pathOf = (r?: string) => (r && state ? filmPath(state, r) : undefined);
  // the Edit page's own file for the take once its cuts are read; else the take's path in the film's state
  const videoPath = ts?.state === 'ready' ? ts.src : !cuts.loading && found?.t.path && state ? filmPath(state, found.t.path) : undefined;

  const player = useRef<PlayerHandle>(null);
  const prompt = useRef<PromptHandle>(null);
  const inputs = useRef<InputsHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  usePickingRing(root);

  // names and inputs light each other while pointed at; a clicked name stays lit with its input
  const [hot, setHot] = useState<Set<number>>(new Set());
  const [lit, setLit] = useState<{ key?: string; orders: Set<number> }>({ orders: new Set() });
  const [card, setCard] = useState<{ mn: Mention; r: DOMRect }>();
  const hoverT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const select = (n: number, play: boolean) => {
    const to = n >= 1 && n <= count ? n : 0;
    setSel(to);
    setLit({ orders: new Set() });
    setCard(undefined);
    const url = rel ? shotDetailsHref(film, rel, to || undefined) : undefined;
    if (url) window.history.replaceState(window.history.state, '', url);
    const s = to ? shots[to - 1] : undefined;
    player.current?.cue(s, play);
    if (s?.sec && matched) requestAnimationFrame(() => prompt.current?.scrollTo(s.sec!.id, true));
    else if (!to && !phone) requestAnimationFrame(() => prompt.current?.scrollTo(m?.secs[0]?.id ?? '', true));
  };

  // the shot asked for in the address once the shots are known; the prompt opens at its part
  const opened = useRef(false);
  useLayoutEffect(() => {
    // once the take's cuts are read (or known not to be there), so the shot opens with its times
    if (opened.current || !m || !count || cuts.loading || waiting) return;
    opened.current = true;
    const to = asked >= 1 && asked <= count ? asked : 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address's shot, once the take's shots are read
    setSel(to);
    const s = to ? shots[to - 1] : undefined;
    requestAnimationFrame(() => {
      if (s?.sec && matched) prompt.current?.scrollTo(s.sec.id, false);
      player.current?.cue(s, false);
    });
  }, [m, count, asked, shots, matched, cuts.loading, waiting]);

  // ←/→ step through the shots (not while typing)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' && sel > 1) { e.preventDefault(); select(sel - 1, true); }
      if (e.key === 'ArrowRight' && sel < count) { e.preventDefault(); select(sel + 1, true); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sel, count, select]);

  const takeName = found ? (found.t.kind === 'pickup' ? found.t.id.replace(/\s*·\s*/, ' ') : `${found.sc.id} ${takeLabel(found.t.id).toLowerCase()}`)
    : ts ? `${ts.scene} ${ts.name}` : rec?.take.replace(/-take(\d+)$/, ' take $1') ?? 'This take';
  const sceneOf = found?.sc;
  const where = cur ? `${takeName} · shot ${cur.label}` : takeName;
  usePage(state ? `${sceneOf?.id ?? ''} · ${takeName} · shot details${cur ? ` · shot ${cur.label}` : ''}`.replace(/^ · /, '') : undefined, 'Say go, or tell Alma what to change…', [], []);

  // ---- telling Alma (Option-click, or "Tell Alma" on touch): the thing as a chip, the words for what it is
  const recWhere = `${takeName}${rec ? ` (what was sent: ${rec.path})` : ''}`;
  const tellRef = (r: SentRef) => {
    const path = pathOf(r.file);
    const places = m?.byRef.get(r.order) ?? [];
    ui.about({ id: `shot-details:${rel}:${r.label}`, label: `${where} · ${fullName(r, m)}`, ...(path ? { ref: path, ...(r.kind !== 'AUDIO' ? { image: mediaUrl(path, { w: 160, t: 1 }) } : {}) } : {}) },
      `${fullName(r, m)} (${r.label}${r.tag ? `, [${r.tag}]` : ''}), an input sent with ${recWhere}${cur ? `, ${places.includes(cur.i) ? `named in shot ${cur.label}'s part of the prompt` : `not named in shot ${cur.label}'s part of the prompt`}` : ''}; file ${r.file ?? 'unknown'}`,
      `What should change about ${!r.tag ? r.name : r.tag.split(/\s+/).some((w) => m?.proper.has(w)) ? tagName(r, m) : `the ${tagName(r, m).toLowerCase()}`}…`);
  };
  const tellMention = (mn: Mention, sec: PromptSection) => {
    if (!m) return;
    if (mn.kind === 'ref') { tellRef(m.byOrder.get(mn.orders[0])!); return; }
    const partOf = sec.kind === 'shot' ? `shot ${sec.shot}'s part of the prompt` : `the prompt's "${sentence(sec.title)}" part`;
    if (mn.kind === 'panels') {
      const w = `storyboard panel${(mn.panels?.length ?? 0) > 1 ? 's' : ''} ${mn.panels?.join(', ')}`;
      ui.about({ id: `shot-details:${rel}:panels:${mn.panels?.join('-')}`, label: `${where} · ${w}` }, `${w}, as named in ${partOf} sent with ${recWhere} (on storyboard page${mn.orders.length > 1 ? 's' : ''} ${mn.orders.map((o) => m.byOrder.get(o)?.page).join(', ')})`, `What should change in ${w}…`);
      return;
    }
    if (mn.kind === 'range') { ui.about({ id: `shot-details:${rel}:run:${mn.text}`, label: `${takeName} · ${mn.text.toLowerCase()}` }, `"${mn.text}", named as a run in ${partOf} sent with ${recWhere}`, 'What should change…'); return; }
    ui.about({ id: `shot-details:${rel}:word:${mn.tag}`, label: `${where} · the ${sentence(mn.tag ?? mn.text).toLowerCase()}, in words` }, `the ${mn.tag ?? mn.text}, described in words only in the prompt sent with ${recWhere}`, `What should change about the ${sentence(mn.tag ?? mn.text).toLowerCase()}…`);
  };
  const tellPart = (sec: PromptSection) => {
    const what = sec.kind === 'shot' ? `shot ${sec.shot}'s part of the prompt` : `the prompt's "${sentence(sec.title || 'opening')}" part`;
    ui.about({ id: `shot-details:${rel}:part:${sec.id}`, label: `${takeName} · ${what}` }, `${what}, as sent with ${recWhere}:\n${[sec.head, ...sec.lines].join('\n')}`, `What should change in ${what}…`);
  };
  const tellWords = (w: string, sec?: PromptSection) => {
    const short = w.length > 48 ? `${w.slice(0, 46)}…` : w;
    ui.about({ id: `shot-details:${rel}:words:${w.slice(0, 40)}`, label: `${takeName}${sec?.kind === 'shot' ? ` · shot ${sec.shot}` : ''} · “${short}”` }, `these words of the prompt sent with ${recWhere}${sec?.kind === 'shot' ? `, in shot ${sec.shot}'s part` : ''}: "${w}"`, 'What should these words say…');
  };
  const tellShot = (s?: PageShot) => {
    const th = videoPath && s?.t0 !== undefined && s.t1 !== undefined ? mediaUrl(videoPath, { w: 160, t: (s.t0 + s.t1) / 2 }) : undefined;
    ui.about({ id: `shot-details:${rel}:shot:${s?.i ?? 0}`, label: s ? `${takeName} · shot ${s.label}${s.name ? ` · ${s.name}` : ''}` : `${takeName} · the whole take`, ...(videoPath ? { ref: videoPath } : {}), ...(th ? { image: th } : {}) },
      s ? `shot ${s.label} of ${recWhere}${s.t0 !== undefined ? `, ${fmtT(s.t0)} to ${fmtT(s.t1!)} in the take` : ''}` : `the whole of ${recWhere}`, s ? `What should change in shot ${s.label}…` : 'What should change in this take…');
  };
  const tellPlayer = (at: number) => {
    ui.about({ id: `shot-details:${rel}:at:${at.toFixed(2)}`, label: `${where} · at ${fmtT(at)}`, ...(videoPath ? { ref: videoPath, image: mediaUrl(videoPath, { w: 160, t: at }) } : {}) }, `the moment ${fmtT(at)} of ${recWhere}`, 'What should change here…');
  };
  const tellSetting = (w: string) => ui.about({ id: `shot-details:${rel}:set:${w}`, label: `${takeName} · ${w}` }, `${w}, a setting sent with ${recWhere}`, 'What should change…');
  const tellPreviz = () => {
    const pv = extra?.previz;
    if (!pv?.clip) return;
    const p = pathOf(pv.clip);
    ui.about({ id: `shot-details:${rel}:previz`, label: `${where} · the previz`, ...(p ? { ref: p } : {}) }, `the previz ${pv.clip} that ${takeName}'s storyboard was drawn from (not sent to the model)${cur ? `, at shot ${cur.label}` : ''}`, 'What should change in the previz…');
  };

  // ---- the hover card and the click on a name
  const ev: NameEvents = {
    hot, litKey: lit.key,
    enter: (mn, el) => {
      setHot(new Set(mn.orders));
      clearTimeout(hoverT.current);
      hoverT.current = setTimeout(() => setCard({ mn, r: el.getBoundingClientRect() }), 110);
    },
    leave: () => { clearTimeout(hoverT.current); setHot(new Set()); setCard(undefined); },
    click: (mn, key) => {
      setCard(undefined);
      if (mn.kind === 'word') return;
      setLit({ key, orders: new Set(mn.orders) });
      inputs.current?.go(mn.orders);
      // the input flashes once it is there
      setTimeout(() => {
        for (const o of mn.orders) document.querySelector(`[data-input="${o}"]`)?.animate?.([{ boxShadow: '0 0 0 4px rgba(250,250,250,.25)' }, { boxShadow: '0 0 0 0 rgba(250,250,250,0)' }], { duration: 1400, easing: 'ease-out' });
      }, 360);
    },
    tell: tellMention, tellPart, tellWords,
  };
  const onHotInput = (orders: number[], on: boolean) => setHot(on ? new Set(orders) : new Set());

  if (!state) return <Loading error={error} />;
  const wide = isWide(state.film.aspect);
  if (!rel) return <Loading error="That is not the address of a take" />;
  if (!found && !ts && cuts.loading) return <Loading error={error} />;
  if (!found && !ts && !rec) return <Loading error={`No take ${rel} in this film`} />;

  const pv = previzFor(extra, count, cur);
  const st = rec?.settings;
  const secs = cut.length ? cut[cut.length - 1].out : st?.duration;
  const sentAt = rec?.submitted ? `Sent ${fmtDate(rec.submitted)} ${/T(\d\d:\d\d)/.exec(rec.submitted)?.[1] ?? ''}`.trim() : '';
  const plain = rec ? [sentAt, modelName(rec.model), secs ? `${Math.round(secs)} s${count ? `, ${count} shot${count === 1 ? '' : 's'}` : ''}` : '', st?.aspect ?? '',
    st?.resolution ? `${st.resolution}${st.draft ? ' draft' : ''}` : '', st?.audio === undefined ? '' : st.audio ? 'with sound' : 'no sound', rec.spend?.cost ?? ''].filter(Boolean) : [];
  const lay = rec?.layout;
  const tech: [string, string][] = rec ? ([
    ['Job', rec.jobId ?? ''], ['Model and mode', [rec.model, st?.mode].filter(Boolean).join(' · ')], ['Seed', st?.seed === null || st?.seed === undefined ? 'none sent' : String(st.seed)],
    ['Prompt', [rec.prompt.file?.split('/').pop(), rec.prompt.version, `${rec.prompt.chars.toLocaleString('en-GB')} characters`, rec.prompt.sameAsFile ? 'the same as the file' : rec.prompt.sameAsFile === false ? 'differs from the file' : ''].filter(Boolean).join(' · ')],
    ['Made from', [lay?.previzTakeNumber !== undefined ? `previz take ${lay.previzTakeNumber}` : '', lay?.storyboardVersion ? `storyboard ${lay.storyboardVersion}` : ''].filter(Boolean).join(' · ')],
    ['Settings from', rec.settingsFrom ?? ''], ['Record', rec.path],
  ] as [string, string][]).filter(([, v]) => v) : [];

  const title = cur ? `Shot ${cur.label}` : 'Whole take';
  const sub = cur ? cur.name : count ? `All ${count} shots` : '';
  const scHref = sceneOf ? `${base}/scenes/${sceneOf.id}?take=${encodeURIComponent(found!.t.id)}` : undefined;
  const thumbAt = (s: PageShot) => (videoPath && s.t0 !== undefined && s.t1 !== undefined ? mediaUrl(videoPath, { w: 160, t: Math.round(((s.t0 + s.t1) / 2) * 10) / 10 }) : undefined);
  const panelImg = (n: number) => { const p = extra?.panels?.find((x) => x.n === n); return p ? mediaUrl(pathOf(p.file)!, { w: 160 }) : undefined; };
  const nav = (
    <>
      <button type="button" aria-label="Shot before" title="Shot before (←)" disabled={sel <= 1} onClick={() => select(sel - 1, true)}
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-edge text-ink transition-colors hover:bg-raised disabled:cursor-default disabled:border-line disabled:text-faint disabled:hover:bg-transparent max-[760px]:size-11"><IconChevronLeft size={14} /></button>
      <button type="button" aria-label="Shot after" title="Shot after (→)" disabled={sel >= count} onClick={() => select(sel + 1, true)}
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-edge text-ink transition-colors hover:bg-raised disabled:cursor-default disabled:border-line disabled:text-faint disabled:hover:bg-transparent max-[760px]:size-11"><IconChevronRight size={14} /></button>
    </>
  );

  const noRecord = !sentPath ? 'No record of what was sent to the model was kept for this take: takes made before the records began have none. The clip and its shots are here; the prompt and the inputs are not known.'
    : sent.error ? (/^404$|No record/.test(sent.error) ? 'No record of what was sent to the model was found beside this take. The clip and its shots are here; the prompt and the inputs are not known.' : `Could not read what was sent: ${sent.error}`)
      : undefined;

  return (
    <>
      <Header crumbs={[{ label: state.film.title, href: base }, ...(sceneOf ? [{ label: `${sceneOf.id} · ${sceneOf.title}`, href: `${base}/scenes/${sceneOf.id}` }] : []), { label: takeName }, { label: title }]}
        back={{ label: 'Back to Shots', href: `${base}/shots`, soft: true }} phoneSub={takeName}
        actions={<>{nav}{scHref && <Link href={scHref} className="inline-flex h-8 items-center rounded-lg border border-edge px-3 text-[13px] font-medium text-ink no-underline transition-colors hover:bg-raised">Open the scene</Link>}</>} />

      <div ref={root} data-ref-skip="" data-shot-details=""
        className="flex h-[calc(100dvh-56px)] min-h-[560px] flex-col px-6 pt-4 max-[760px]:block max-[760px]:h-auto max-[760px]:min-h-0 max-[760px]:px-4 max-[760px]:pb-6 max-[760px]:pt-3.5">
        <div className="mb-3 flex flex-none flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <h1 className="m-0 flex flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[19px] font-semibold tracking-[-0.01em] max-[760px]:flex-col max-[760px]:text-[17px]">
              <span>{title}</span>{sub && <span key={sub} className="font-medium text-sub duration-300 animate-in fade-in-0">{sub}</span>}
            </h1>
            <div className="hidden flex-none gap-2 max-[760px]:flex">{nav}</div>
          </div>
          {rec && (
            <div className="flex flex-wrap items-baseline text-[12.5px] text-sub max-[760px]:hidden">
              {plain.map((p, i) => <span key={p} {...pickProps(() => tellSetting(p))} className={cn('whitespace-nowrap rounded-[4px]', PICK)}>{i > 0 && <span className="mx-[7px] text-faint">·</span>}{p}</span>)}
              {tech.length > 0 && <TechDetails rows={tech} tell={tellSetting} />}
            </div>
          )}
          <StepIntro step="shotdetails" width="full" />
        </div>

        {/* the take's shots, the whole take first */}
        <div role="tablist" aria-label="The take's shots"
          className="mb-3.5 grid flex-none gap-1.5 max-[760px]:-mx-4 max-[760px]:flex max-[760px]:overflow-x-auto max-[760px]:px-4 max-[760px]:[scrollbar-width:none]"
          style={phone ? undefined : { gridTemplateColumns: `minmax(0, 116px) repeat(${Math.max(1, count)}, minmax(0, 92px))` }}>
          <StripTile on={sel === 0} label="Whole take" d={secs} img={shots[0] ? thumbAt(shots[0]) : undefined} whole phone={phone} wide={wide} onClick={() => select(0, true)} pick={pickProps(() => tellShot(undefined))} />
          {shots.map((s) => (
            <StripTile key={s.i} on={sel === s.i} label={s.label} d={s.t0 !== undefined ? s.t1! - s.t0 : undefined} img={thumbAt(s)} phone={phone} wide={wide} title={`Shot ${s.label}${s.name ? ` · ${s.name}` : ''}`}
              onClick={() => select(s.i, true)} pick={pickProps(() => tellShot(s))} />
          ))}
          {!count && <span className="self-center text-[12px] text-mute">{waiting ? 'Finding the cuts in this take…' : 'The take has not been cut into its shots.'}</span>}
        </div>

        {/* a landscape film: the player across the top, the prompt and the inputs under it */}
        <div className={cn('grid min-h-0 flex-1 gap-[22px] max-[760px]:flex max-[760px]:flex-col max-[760px]:gap-4', wide ? 'grid-cols-[minmax(0,1fr)_280px] max-[1180px]:grid-cols-[minmax(0,1fr)_240px]' : 'grid-cols-[184px_minmax(0,1fr)_280px] max-[1180px]:grid-cols-[150px_minmax(0,1fr)_240px]')}>
          <div className={cn('scroll flex min-h-0 flex-col gap-2.5 overflow-auto pb-5 max-[760px]:overflow-visible max-[760px]:p-0', wide && 'col-span-2 w-full max-w-[min(640px,calc((100dvh-260px)*16/9))] overflow-visible')}>
            <ShotPlayer ref={player} aspect={state.film.aspect} path={videoPath} shots={shots} sel={cur} total={ts?.seconds} phone={phone} onTell={tellPlayer} onShot={(i) => select(i, false)}
              badge={cur ? `Shot ${cur.label}${cur.t0 !== undefined ? ` · ${(cur.t1! - cur.t0).toFixed(1)} s` : ''}` : `Whole take${secs ? ` · ${secs.toFixed(1)} s` : ''}`}
              standing={found?.t.stopped ? `No clip: the video service ${found.t.stopped === 'blocked' ? 'refused' : 'failed on'} this take.` : found && !found.t.path ? 'Being made: the clip appears when it lands.' : undefined} />
            {!matched && rec && count > 0 && (
              <p className="m-0 text-[11.5px] leading-[1.45] text-warn">The prompt has {m?.shotSecs.length ?? 0} shot {m?.shotSecs.length === 1 ? 'part' : 'parts'}; the clip was cut into {count}. They cannot be matched, so the prompt is shown whole.</p>
            )}
          </div>

          {rec && plain.length > 0 && (
            <div className="hidden flex-wrap items-baseline text-[13px] text-sub max-[760px]:flex">
              {plain.map((p, i) => <span key={p} className="whitespace-nowrap">{i > 0 && <span className="mx-[7px] text-faint">·</span>}{p}</span>)}
            </div>
          )}

          {m ? (
            <>
              <ShotPrompt ref={prompt} m={m} on={matched ? cur?.sec?.id : undefined} shots={shots} phone={phone} touch={touch} ev={ev} pathOf={pathOf} panelImg={panelImg} matched={matched}
                onJump={(s) => { if (s.kind === 'shot') { const k = m.shotSecs.indexOf(s) + 1; if (matched && k) { select(k, true); return; } } prompt.current?.scrollTo(s.id, true); }} />
              <ShotInputs ref={inputs} m={m} sel={cur} matched={matched} shots={shots} extra={extra} panelsKnown={extra?.panels} phone={phone} touch={touch}
                hot={hot} lit={lit.orders} pathOf={pathOf} onHot={onHotInput} onShot={(i) => select(i, true)} tell={tellRef} tellPreviz={tellPreviz} previz={pv} />
            </>
          ) : (
            <div className="col-span-2 flex flex-col gap-2 pt-1">
              <h2 className="m-0 text-[13.5px] font-semibold">The prompt as sent</h2>
              <p className="m-0 max-w-[560px] text-[13px] leading-normal text-sub">{noRecord ?? (sent.loading ? 'Reading what was sent…' : 'Nothing to show yet.')}</p>
            </div>
          )}
        </div>
      </div>

      {card && m && !phone && <HoverCard m={m} mn={card.mn} at={card.r} pathOf={pathOf} panelImg={panelImg} extra={extra} />}
    </>
  );
}

function StripTile({ on, label, d, img, whole, phone, wide, title, onClick, pick }: { on: boolean; label: string; d?: number; img?: string; whole?: boolean; phone: boolean; wide?: boolean; title?: string; onClick: () => void; pick: ReturnType<typeof pickProps> }) {
  return (
    <button type="button" role="tab" aria-selected={on} title={title} {...pick} onClick={(e) => { if (!e.altKey) onClick(); }}
      className={cn('flex min-w-0 cursor-pointer items-center gap-[7px] rounded-[9px] border p-[5px] text-left transition-[border-color,background-color] duration-200',
        on ? 'border-ink bg-raised' : 'border-edge bg-panel hover:border-edge-strong', phone && (wide ? (whole ? 'w-[124px] flex-none' : 'w-[104px] flex-none') : whole ? 'w-[98px] flex-none' : 'w-[78px] flex-none'), PICK)}>
      {img ? <img alt="" src={img} className={cn('flex-none rounded-[4px] bg-black object-cover', wide ? 'aspect-video w-[48px]' : 'aspect-[9/16] w-[30px]')} /> : <span className={cn('flex-none rounded-[4px] bg-tile', wide ? 'aspect-video w-[48px]' : 'aspect-[9/16] w-[30px]')} />}
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className={cn('font-semibold leading-none', whole ? 'text-[12.5px] leading-[1.1]' : 'text-[14px]')}>{label}</span>
        {d !== undefined && <span className="whitespace-nowrap font-mono text-[10.5px] text-mute">{d.toFixed(1)} s</span>}
      </span>
    </button>
  );
}

function TechDetails({ rows, tell }: { rows: [string, string][]; tell: (w: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="ml-3.5 inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-[12.5px] text-mute hover:text-ink">
        Technical details <IconChevronDown size={11} className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div className={cn('grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="min-h-0 overflow-hidden">
          <dl className="m-0 mt-1.5 grid max-w-[680px] grid-cols-[max-content_1fr] gap-x-3.5 gap-y-1 rounded-[9px] border border-line bg-well px-3 py-2.5 text-[12px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-mute">{k}</dt>
                <dd {...pickProps(() => tell(`${k}: ${v}`))} className={cn('m-0 break-all font-mono text-[11.5px] text-ink-3', PICK)}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}

/** The card a name shows while pointed at: the input (a clip plays muted), how often and where it is named, its words. */
function HoverCard({ m, mn, at, pathOf, panelImg, extra }: { m: Model; mn: Mention; at: DOMRect; pathOf: (r?: string) => string | undefined; panelImg: (n: number) => string | undefined; extra?: ShotDetailsExtra }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>();
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const W = 300, H = el.offsetHeight;
    const col = (document.querySelector('[data-prompt-doc]') as HTMLElement | null)?.getBoundingClientRect();
    // beside the name, kept to the prompt's column; above it when there is no room below, never over the line itself
    const left = Math.max(col?.left ?? 8, Math.min(at.left - 8, (col?.right ?? window.innerWidth) - W - 4));
    let top = at.bottom + 6;
    if (top + H > window.innerHeight - 8) top = at.top - H - 6;
    if (top < 8) top = Math.min(window.innerHeight - H - 8, at.bottom + 6);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- placed once it is measured
    setPos({ left, top });
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [at]);
  const places = (o: number) => m.byRef.get(o) ?? [];
  const shotsTxt = (o: number) => { const p = places(o); return p.length ? `in shot${p.length > 1 ? 's' : ''} ${p.join(', ')}` : 'in no shot'; };
  let body: React.ReactNode;
  if (mn.kind === 'ref') {
    const r = m.byOrder.get(mn.orders[0])!;
    const path = pathOf(r.file);
    const n = m.counts.get(r.order) ?? 0;
    body = (
      <>
        <div className={cn('h-[200px] overflow-hidden bg-black', r.page !== undefined && 'bg-white')}>
          {path && !r.missing ? (r.kind === 'VIDEO' ? <video src={mediaUrl(path)} autoPlay muted loop playsInline className="size-full object-cover" />
            : r.kind === 'AUDIO' ? <span className="flex size-full items-center justify-center bg-tile text-[12px] text-sub">A sound file</span>
              : <img alt="" src={mediaUrl(path, { w: 640 })} className={cn('size-full', r.page !== undefined ? 'object-contain' : 'object-cover')} />)
            : <span className="flex size-full items-center justify-center bg-tile text-[12px] text-mute">{r.missing ? 'The file is missing' : 'No file'}</span>}
        </div>
        <div className="flex flex-col gap-1 px-3 pb-[11px] pt-2.5">
          <div className="text-[14px] text-ink-2"><b className="font-semibold text-ink">{r.name}</b> {r.tag ? tagName(r, m) : ''}</div>
          <span className="text-[12px] text-ink-3">Named {n} {n === 1 ? 'time' : 'times'}, {shotsTxt(r.order)}</span>
          {r.desc && <span className="line-clamp-4 text-[12px] leading-[1.45] text-sub">{shortDesc(r.desc)}</span>}
          <span className="break-all font-mono text-[10.5px] text-mute">{r.what} · {r.file?.split('/').pop() ?? 'no file'}</span>
        </div>
        <div className="border-t border-line px-3 py-[7px] text-[11px] text-mute">Click to find it in the inputs{r.kind === 'VIDEO' ? ' · sound off here' : ''}</div>
      </>
    );
  } else if (mn.kind === 'range') {
    const rs = mn.orders.map((o) => m.byOrder.get(o)!).filter(Boolean);
    body = (
      <>
        <div className="grid grid-cols-4 gap-[3px] bg-black p-[3px]">{rs.map((r) => { const p = pathOf(r.file); return p ? <img key={r.order} alt="" src={mediaUrl(p, { w: 160 })} className="w-full bg-white" /> : null; })}</div>
        <div className="flex flex-col gap-1 px-3 pb-[11px] pt-2.5">
          <div className="text-[14px] text-ink-2"><b className="font-semibold text-ink">{rs.length ? `${rs[0].name} to ${rs[rs.length - 1].n}` : mn.text}</b>{rs.some((r) => r.page !== undefined) ? ` · storyboard${m.rec.layout?.storyboardVersion ? ` ${m.rec.layout.storyboardVersion}` : ''}` : ''}</div>
          <span className="text-[12px] text-ink-3">Named together, as a run</span>
          {rs.some((r) => r.page !== undefined) && <span className="text-[12px] leading-[1.45] text-sub">Each shot reaches its own page through its panel numbers.</span>}
        </div>
        <div className="border-t border-line px-3 py-[7px] text-[11px] text-mute">Click to find them in the inputs</div>
      </>
    );
  } else {
    const ps = mn.panels ?? [];
    const pages = mn.orders.map((o) => m.byOrder.get(o)!).filter(Boolean);
    const imgs = ps.map((n) => panelImg(n)).filter(Boolean) as string[];
    body = (
      <>
        <div className="h-[200px] overflow-hidden bg-black">
          {imgs.length && ps.length <= 4 ? <div className="flex h-full gap-0.5">{imgs.map((s) => <img key={s} alt="" src={s} className="h-full min-w-0 flex-1 object-cover" />)}</div>
            : <div className="grid h-full grid-cols-2 gap-[3px] p-[3px]">{pages.map((r) => { const p = pathOf(r.file); return p ? <img key={r.order} alt="" src={mediaUrl(p, { w: 320 })} className="size-full bg-white object-contain" /> : null; })}</div>}
        </div>
        <div className="flex flex-col gap-1 px-3 pb-[11px] pt-2.5">
          <div className="text-[14px] text-ink-2"><b className="font-semibold text-ink">Panel{ps.length > 1 ? 's' : ''} {ps.join(', ')}</b></div>
          <span className="text-[12px] text-ink-3">{pages.length ? `On ${pages.map((r) => `page ${r.page ?? pageOfPanel(m.ctx, ps[0])} (${r.name})`).join(', ')}` : 'No page of the storyboard was sent for these'}</span>
          <span className="text-[12px] leading-[1.45] text-sub">{extra?.panels ? 'The whole page was sent, not the panel on its own; it is cut out here so you can see it.' : 'The whole page was sent; the panel is on it.'}</span>
        </div>
        <div className="border-t border-line px-3 py-[7px] text-[11px] text-mute">Click to find the page in the inputs</div>
      </>
    );
  }
  return (
    <div ref={box} role="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      className={cn('pointer-events-none fixed z-[60] w-[300px] overflow-hidden rounded-[12px] border border-edge-strong bg-panel shadow-[0_18px_50px_rgba(0,0,0,.75)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none', on ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')}>
      {body}
    </div>
  );
}
