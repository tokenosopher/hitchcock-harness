'use client';
// Saying why . The user: "I did this because of this, I did this because of this, and then
// you can take that information and learn." One question, a few likely answers to tap, a box for the user's own words,
// and a skip: on Alma's why card after a run of edits (Flow v3.3 - 9 Edit step 8) and on every question of the
// debrief page (Flow v3.3 - 12 Release, step 40). The why card's answer is set aside like any choice and goes with
// "Done picking", the only confirm; the debrief keeps each answer as it is given (DebriefPage.tsx).
import { useState } from 'react';
import type { FeedCard } from '@/server/types';
import { Btn } from '@/components/shell/atoms';
import { choose, unchoose, useChoice } from '@/components/data/choices';
import { cn } from '@/lib/utils';

/** The likely answers as chips to tap, and the box. Controlled: the caller keeps what is chosen and the words. */
export function WhyQuestion({ id, answers, picked, words, multi, disabled, onPick, onWords, onBlur, placeholder = 'Or in your own words' }: {
  id: string; answers: string[]; picked: string[]; words: string; multi?: boolean; disabled?: boolean;
  onPick: (picked: string[]) => void; onWords: (w: string) => void; onBlur?: () => void; placeholder?: string;
}) {
  const toggle = (a: string) => onPick(picked.includes(a) ? picked.filter((x) => x !== a) : multi ? [...picked, a] : [a]);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {answers.length > 0 && (
        <div role={multi ? 'group' : 'radiogroup'} aria-label="Likely answers" className="flex flex-wrap gap-1.5">
          {answers.map((a) => {
            const on = picked.includes(a);
            return (
              <button key={a} type="button" disabled={disabled} role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(a)}
                className={cn('min-h-8 cursor-pointer rounded-full border px-3 py-1 text-left text-[12.5px] leading-snug transition-colors duration-200 disabled:cursor-default max-[760px]:min-h-11',
                  on ? 'border-ink bg-ink text-bg' : 'border-edge-strong bg-transparent text-ink-2 hover:border-sub hover:text-ink')}>
                {a}
              </button>
            );
          })}
        </div>
      )}
      <textarea id={`why-${id}`} value={words} disabled={disabled} rows={2} maxLength={2000} onChange={(e) => onWords(e.target.value)} onBlur={onBlur}
        placeholder={placeholder} aria-label={placeholder}
        className="min-h-[56px] w-full max-w-[640px] resize-y rounded-lg border border-line bg-panel px-2.5 py-2 text-[13px] leading-normal text-ink placeholder:text-mute disabled:opacity-60" />
    </div>
  );
}

/** The why card's answer (`"ask": "why"`): tap, write, or skip; set aside until "Done picking", the only confirm. */
export function WhyPanel({ film, card }: { film: string; card: FeedCard; from: string }) {
  const ask = card.ask!;
  const cid = `card:${card.key}`;
  const mine = useChoice(film, cid);
  const opts = ask.options;
  const [picked, setPicked] = useState<string[]>(() => { const o = opts.find((x) => x.id === mine?.answer?.option); return o ? [o.label] : []; });
  const [words, setWords] = useState(mine?.answer?.note ?? '');
  const skipped = mine?.answer?.option === 'skip';
  const label = (o?: string, w?: string) => `${card.id ?? 'why'} · ${o === 'skip' ? 'skipped' : [opts.find((x) => x.id === o)?.label, w?.trim() ? `“${w.trim().slice(0, 40)}”` : ''].filter(Boolean).join(' · ')}`;
  const keep = (pk: string[], w: string) => {
    const o = opts.find((x) => x.label === pk[0])?.id;
    if (!o && !w.trim()) { unchoose(film, cid); return; }
    choose(film, { id: cid, label: label(o, w), answer: { card: card.key, kind: 'why', ...(o ? { option: o } : {}), ...(w.trim() ? { note: w.trim() } : {}) } });
  };
  const has = !!picked.length || !!words.trim();
  return (
    <div className="flex flex-col gap-3">
      <WhyQuestion id={card.key} answers={opts.map((o) => o.label)} picked={skipped ? [] : picked} words={skipped ? '' : words}
        onPick={(pk) => { setPicked(pk); keep(pk, words); }} onWords={(w) => { setWords(w); keep(picked, w); }} />
      <div className="flex flex-wrap items-center gap-2">
        {skipped || has
          ? <span data-chosen className="inline-flex items-center gap-1.5 text-[12.5px] text-ink duration-200 animate-in fade-in-0"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />Chosen{skipped ? ': skip' : ''} · goes with Done picking</span>
          : <span className="text-[12.5px] text-sub">Tap one, write a line, or skip.</span>}
        {/* tapped again, the skip is taken back */}
        <Btn ghost aria-pressed={skipped} onClick={() => { if (skipped) { unchoose(film, cid); return; } setPicked([]); setWords(''); choose(film, { id: cid, label: label('skip'), answer: { card: card.key, kind: 'why', option: 'skip' } }); }}>{skipped ? 'Skipped' : 'Skip'}</Btn>
      </div>
    </div>
  );
}
