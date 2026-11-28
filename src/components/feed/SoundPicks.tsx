'use client';
// The sound designer's pick card (Flow v3.3 - 11 Sound and music, steps 33 and 34). The user:
// "if you design three or four different sounds for me and I get to choose which ones ... I can go through each one
// and go, 'Yep, this is the one.'" One card per scene: each planned sound with where it sits on the cut (its times, a
// strip of the film with its place lit, the planned level and fades, the designer's reason) and its tries, each with a
// play button (the app's one sound player, as the Voices card has). Choosing a try, or "None of these", sets
// the choice aside like every other pick; "Done picking" sends it (the only confirm), and the pick runs the studio's
// own command when it has it (sfx.py --pick), which records it with the tries not picked. A line of why can go with
// each pick. "Hear it in the cut" opens the Edit page with the try in question in the sound's place, the playhead a
// second before it.
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { FeedCard, FeedSound } from '@/server/types';
import { choose, unchoose, useChoices } from '@/components/data/choices';
import { ClearChoice } from '@/components/shell/ClearChoice';
import { Reveal } from '@/components/shell/Reveal';
import type { PickBody } from '@/components/library/data';
import { cn } from '@/lib/utils';
import { kindWord, placeLine, stripOf, tryLabel } from './soundPick';
import { CutButton } from './CutButton';
import { FilmButton, HearInFilm, RingPlay, useHearData, Wave, type HearData, type HearHandle } from './SoundChoice';

type ToRepo = (rel: string) => string;

/** The film as a thin strip, the sound's place lit (where it sits in the cut, at a glance). */
function Strip({ s }: { s: FeedSound }) {
  const st = stripOf(s);
  if (!st) return null;
  return (
    <div aria-hidden="true" className="relative h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-edge">
      {st.scenes.map((x) => <span key={x.left} className="absolute inset-y-0 w-px bg-bg" style={{ left: `${x.left}%` }} />)}
      <span className="absolute inset-y-0 rounded-full bg-ink" style={{ left: `${st.left}%`, width: `${Math.max(st.width, 0.8)}%` }} />
    </div>
  );
}

function SoundRow({ film, card, s, toRepo, from, open, data }: { film: string; card: FeedCard; s: FeedSound; toRepo: ToRepo; from: string; open: boolean; data?: HearData }) {
  const cid = `pick:sfx:${s.name}`;
  const mine = useChoices(film).find((c) => c.id === cid);
  const sel = mine?.pick?.candidate;
  const [note, setNote] = useState(mine?.pick?.note ?? '');
  const scene = card.ids.find((x) => /^S\d+$/.test(x)) ?? s.scene;
  const set = (candidate: string, words = note) => {
    const body: PickBody = { kind: 'sfx', target: s.name, candidate, ...(s.prediction ? { prediction: String(s.prediction) } : {}), ...(words.trim() ? { note: words.trim() } : {}), card: card.key, from };
    choose(film, { id: cid, label: `${scene ? `${scene} · ` : ''}${s.name} · ${candidate === 'none' ? 'none of these' : `try ${candidate}`}`, pick: body });
  };
  // the chosen try tapped again is cleared, as "Clear choice" does; the note goes with it
  const clear = () => { setNote(''); unchoose(film, cid); };
  const tap = (candidate: string) => (sel === candidate ? clear() : set(candidate));
  // the last choice, kept while its line fades out after a clear
  const [lastSel, setLastSel] = useState(sel);
  if (sel && sel !== lastSel) setLastSel(sel);
  const answered = s.answer ?? (s.picked && !open ? { option: String(s.picked.n), note: s.picked.note } : undefined);
  const eff = s.effect;
  // heard in the film at its place in the plan
  const moment = card.hear?.moments.find((x) => x.id === s.name);
  const hearRef = useRef<HearHandle>(null);
  return (
    <div data-sound={s.name} className="flex min-w-0 flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13.5px] font-medium text-ink">{s.name}</span>
        {(eff?.kind || eff?.id) && <span className="font-mono text-[11.5px] text-sub">{[eff.id, kindWord(eff.kind)].filter(Boolean).join(' · ')}</span>}
        {s.prediction && open && <span className="ml-auto text-[12px] text-ink-3">Alma predicts <span className="font-mono text-ink">try {s.prediction}</span></span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[12.5px] tabular-nums text-ink-3">{placeLine(s)}</span>
        <Strip s={s} />
        {eff?.reason && <span className="max-w-[640px] text-[12.5px] leading-normal text-sub">{eff.reason}</span>}
        {/* the try in question heard in its place on the timeline: the one chosen, else kept, else Alma's, else the first */}
        {s.tries.length > 0 && <CutButton film={film} cut={{ sound: s.name, try: Number(sel && sel !== 'none' ? sel : answered && answered.option !== 'none' ? answered.option : s.prediction ?? s.tries[0].n) || s.tries[0].n, ...(eff?.startFrame !== undefined ? { at: eff.startFrame } : {}) }} className="mt-0.5" />}
      </div>
      {answered ? (
        <p className="m-0 text-[12.5px] text-ink-3 duration-200 animate-in fade-in-0">
          {answered.option === 'none' ? 'You took none of these' : `You picked try ${answered.option}`}{answered.note ? <span className="text-sub"> · “{answered.note}”</span> : null}
        </p>
      ) : null}
      <div role="radiogroup" aria-label={`The tries of ${s.name}`} className="flex flex-col gap-1.5">
        {s.tries.map((t) => {
          const on = sel === String(t.n);
          const kept = answered?.option === String(t.n);
          return (
            <div key={t.n} data-try={t.n} className={cn('flex min-w-0 items-center gap-2.5 rounded-lg border py-1.5 pl-1.5 pr-2 transition-colors duration-200', on || kept ? 'border-sub bg-raised' : 'border-edge')}>
              {t.file ? <RingPlay path={toRepo(t.file)} label={`${s.name} try ${t.n}`} /> : <span className="size-11 flex-none" />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <button type="button" role="radio" aria-checked={on} disabled={!open || !!answered} onClick={() => tap(String(t.n))}
                  className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink disabled:cursor-default">
                  {open && !answered && <span aria-hidden="true" className={cn('flex size-3.5 flex-none items-center justify-center rounded-full border', on ? 'border-ink' : 'border-mute')}>{on && <span className="size-1.5 rounded-full bg-ink" />}</span>}
                  <span className="min-w-0 truncate text-[13px]">{tryLabel(t)}</span>
                  {t.seconds !== undefined && <span className="flex-none font-mono text-[11px] text-sub">{t.seconds.toFixed(1)} s</span>}
                  {open && t.n === s.prediction && <span className="flex-none rounded-[4px] bg-ink px-1.5 py-px text-[10px] font-semibold text-bg">Alma</span>}
                </button>
                {t.prompt && <span className={cn('text-[12px] leading-snug text-sub', open && !answered && 'pl-6')} title={t.prompt}><span className="line-clamp-2">{t.prompt}</span></span>}
                {t.file && <Wave path={toRepo(t.file)} label={`${s.name} try ${t.n}`} peaks={data?.peaks[t.file]} seconds={t.seconds ?? data?.seconds[t.file]} className={cn('max-w-[480px]', open && !answered && 'pl-6')} />}
              </div>
              {moment?.places[String(t.n)] && <FilmButton label={`${s.name} try ${t.n}`} onClick={() => hearRef.current?.play(String(t.n))} />}
            </div>
          );
        })}
        {open && !answered && (
          <button type="button" role="radio" aria-checked={sel === 'none'} onClick={() => tap('none')}
            className={cn('flex min-w-0 flex-wrap cursor-pointer items-center gap-2.5 rounded-lg border bg-transparent px-3 py-2 text-left text-[13px] text-ink transition-colors duration-200', sel === 'none' ? 'border-sub bg-raised' : 'border-dashed border-edge')}>
            <span aria-hidden="true" className={cn('flex size-3.5 flex-none items-center justify-center rounded-full border', sel === 'none' ? 'border-ink' : 'border-mute')}>{sel === 'none' && <span className="size-1.5 rounded-full bg-ink" />}</span>
            <span className="whitespace-nowrap">None of these</span>
            <span className="text-[12px] text-sub max-[760px]:basis-full max-[760px]:pl-6">Alma makes 3 more, or uses your words</span>
          </button>
        )}
      </div>
      {moment && (
        <HearInFilm ref={hearRef} film={film} card={card.key} moments={[moment]} data={data} toRepo={toRepo} prediction={s.prediction ? String(s.prediction) : undefined}
          chosen={sel && sel !== 'none' ? sel : answered?.option} options={s.tries.filter((t) => moment.places[String(t.n)]).map((t) => ({ id: String(t.n), label: `try ${t.n}` }))} />
      )}
      <Reveal open={open && !answered && !!sel}>
        <div className="flex flex-col gap-1.5">
          <input value={note} maxLength={500} onChange={(e) => { setNote(e.target.value); if (sel) set(sel, e.target.value); }}
            placeholder={lastSel === 'none' ? 'What should it sound like? (your words for the prompt, optional)' : 'Why this one? (optional, kept with the pick)'}
            aria-label={lastSel === 'none' ? `Your words for the next tries of ${s.name}` : `Why try ${lastSel} of ${s.name}`}
            className="h-8 w-full max-w-[520px] rounded-lg border border-line bg-panel px-2.5 text-[13px] text-ink placeholder:text-mute" />
          <span className="flex flex-wrap items-center gap-2">
            <span data-chosen={sel ? '' : undefined} className="text-[12px] text-mute">Chosen: {lastSel === 'none' ? 'none of these' : `try ${lastSel}`} · goes with Done picking</span>
            <ClearChoice shown={!!sel} onClear={clear} />
          </span>
        </div>
      </Reveal>
    </div>
  );
}

/** Every sound of the card. `open`: the card still asks (the picks can be made); else what was picked, read only. */
export function SoundPicks({ film, card, toRepo, from, open }: { film: string; card: FeedCard; toRepo: ToRepo; from: string; open: boolean }) {
  const sounds = card.sounds ?? [];
  const all = useChoices(film);
  const mine = all.filter((c) => c.pick?.kind === 'sfx' && c.pick.card === card.key);
  const left = sounds.filter((s) => !s.answer).length;
  const data = useHearData(sounds.length ? film : '', card.key);
  if (!sounds.length) return null;
  return (
    <div data-sound-picks className="flex flex-col gap-3">
      {sounds.map((s) => <SoundRow key={s.name} film={film} card={card} s={s} toRepo={toRepo} from={from} open={open} data={data} />)}
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-[12.5px] text-sub">{mine.length ? `${mine.length} of ${left} chosen` : `${left === 1 ? 'One sound' : `${left} sounds`} to pick`} · they go with Done picking</span>
        </div>
      )}
    </div>
  );
}
