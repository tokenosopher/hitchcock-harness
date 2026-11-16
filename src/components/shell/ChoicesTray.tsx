'use client';
// "Done picking": the foot of every page of a film while choices are set aside (data/choices.ts). It lists them and
// sends them all with one press, as one message to Alma. A go for a paid job is named with its quote before it is sent.
import { useEffect, useState } from 'react';
import { useFilm } from '@/components/data/film';
import { unchoose, useChoices } from '@/components/data/choices';
import { Btn } from './atoms';
import { IconX } from './icons';
import { usePresence } from './Reveal';
import { cn } from '@/lib/utils';

export function ChoicesTray({ film }: { film: string }) {
  const all = useChoices(film);
  const { state } = useFilm();
  const [p, setP] = useState<{ k: 'idle' | 'confirm' | 'busy' } | { k: 'error'; text: string } | { k: 'sent'; n: number }>({ k: 'idle' });
  // a card that was answered some other way (in the thread, on another device) no longer asks: its choice is dropped
  const open = state?.feed ? new Set(state.feed.asks.map((c) => c.key)) : undefined;
  const list = all.filter((c) => !c.answer || !open || open.has(c.answer.card));
  const goes = list.filter((c) => c.answer?.kind === 'go');
  // "Sent" stays a few seconds, then fades away (it stayed at the foot of the page until the next choice)
  const sent = p.k === 'sent' ? p.n : 0;
  const [sentN, setSentN] = useState(0);
  if (sent && sent !== sentN) setSentN(sent);
  const note = usePresence(!!sent);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setP({ k: 'idle' }), 5000);
    return () => clearTimeout(t);
  }, [sent]);
  if (!list.length) {
    if (!note.mounted) return null;
    return (
      <div role="status" onTransitionEnd={(e) => { if (e.target === e.currentTarget) note.done(); }}
        className={cn('sticky bottom-0 z-20 mt-auto border-t border-line bg-bg/95 px-6 py-3 text-[12.5px] text-ink-3 backdrop-blur transition-opacity duration-300 motion-reduce:transition-none max-[760px]:bottom-[112px] max-[760px]:px-4', note.shown ? 'opacity-100' : 'opacity-0')}>
        Sent {sentN === 1 ? 'your choice' : `your ${sentN} choices`} to Alma as one message. She applies them and carries on.
      </div>
    );
  }
  const send = async () => {
    setP({ k: 'busy' });
    try {
      const r = await fetch(`/api/films/${film}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        answers: list.filter((c) => c.answer).map((c) => ({ card: c.answer!.card, option: c.answer!.option })),
        picks: list.filter((c) => c.pick).map((c) => c.pick),
      }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setP({ k: 'error', text: j.error ?? `Not sent (${r.status})` }); return; }
      const n = list.length;
      unchoose(film, all.map((c) => c.id));
      setP({ k: 'sent', n });
    } catch {
      setP({ k: 'error', text: 'The harness server is not answering' });
    }
  };
  return (
    <div aria-label="Your choices, not sent yet" className="sticky bottom-0 z-20 mt-auto flex flex-col gap-2 border-t border-edge-strong bg-bg/95 px-6 py-3 backdrop-blur duration-200 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none max-[760px]:bottom-[112px] max-[760px]:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="lbl flex-none">{list.length === 1 ? '1 choice' : `${list.length} choices`} · not sent yet</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {p.k === 'confirm' ? (
            <>
              <Btn primary onClick={() => void send()}>Confirm · send {list.length === 1 ? 'it' : `all ${list.length}`}</Btn>
              <Btn ghost onClick={() => setP({ k: 'idle' })}>Cancel</Btn>
            </>
          ) : (
            <>
              <Btn ghost disabled={p.k === 'busy'} onClick={() => { unchoose(film, all.map((c) => c.id)); setP({ k: 'idle' }); }}>Clear</Btn>
              <Btn primary disabled={p.k === 'busy'} onClick={() => setP({ k: 'confirm' })}>{p.k === 'busy' ? 'Sending…' : 'Done picking · send to Alma'}</Btn>
            </>
          )}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {list.map((c) => (
          <li key={c.id} className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-[6px] border border-edge bg-raised pl-2 pr-1 text-[12px] text-ink">
            <span className="truncate" title={c.label}>{c.label}</span>
            <button type="button" onClick={() => unchoose(film, c.id)} aria-label={`Take back: ${c.label}`} className="flex size-[18px] flex-none cursor-pointer items-center justify-center text-sub hover:text-ink"><IconX size={10} /></button>
          </li>
        ))}
      </ul>
      {p.k === 'confirm' && (
        <p className="m-0 text-[12px] leading-normal text-sub">
          Each pick is written to the film and to taste.md, then Alma gets them all in one message.
          {goes.length > 0 && <span className="text-ink-3"> This includes {goes.length === 1 ? 'a go for a paid job' : `${goes.length} goes for paid jobs`}: {goes.map((c) => c.answer!.cost ?? c.label).join('; ')}.</span>}
        </p>
      )}
      {p.k === 'error' && <p role="alert" className="m-0 text-[12px] text-bad">{p.text} Nothing was sent.</p>}
    </div>
  );
}
