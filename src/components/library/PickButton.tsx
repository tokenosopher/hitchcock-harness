'use client';
// The pick, in two steps inside the page (the viewer shows no confirm() dialogs): "Pick r2-7", then
// "Confirm r2-7" writes the pick through POST /api/films/[film]/pick and tells Alma. The page then
// updates from the files through the watcher. "Save to the library" is one step: it only adds a copy.
import { useState } from 'react';
import { Btn } from '@/components/shell/atoms';
import { IconBookmark } from '@/components/shell/icons';
import { postPick, postSave, type LibraryKind, type PickBody } from './data';
import { cn } from '@/lib/utils';
import { choose, unchoose, useChoice } from '@/components/data/choices';

type Phase = { k: 'idle' } | { k: 'confirm' } | { k: 'busy' } | { k: 'done'; text: string } | { k: 'error'; text: string };

export function PickButton({ film, body, label, what, disabled, reason, onPicked, className }: {
  film: string;
  body: PickBody;
  label: React.ReactNode;          // "Pick r2-7", "Use for C01"
  what: string;                    // "r2-7 for C01's face": said on the confirm step and after
  disabled?: boolean;
  reason?: string;                 // why it is disabled
  onPicked?: () => void;
  className?: string;
}) {
  const [p, setP] = useState<Phase>({ k: 'idle' });
  // one choice per thing picked (C01's face, L01's master): pressing only sets it aside, "Done picking" sends them all
  const cid = `pick:${body.kind}:${body.target}`;
  const mine = useChoice(film, cid);
  const chosenHere = !!mine && mine.pick?.candidate === body.candidate && mine.pick?.libraryId === body.libraryId;
  const go = async () => {
    setP({ k: 'busy' });
    const r = await postPick(film, body);
    if (r.ok) {
      unchoose(film, cid);
      setP({ k: 'done', text: `Picked ${what}. Written to the film and taste.md; Alma carries on.` });
      onPicked?.();
    } else setP({ k: 'error', text: r.error ?? 'The pick failed' });
  };
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      {p.k === 'idle' || p.k === 'error' || p.k === 'done' ? (
        chosenHere ? (
          <>
            <span className="inline-flex h-8 items-center gap-1.5 text-[12.5px] text-ink"><span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />Chosen: {what}</span>
            <Btn ghost onClick={() => unchoose(film, cid)}>Take it back</Btn>
            <Btn ghost onClick={() => setP({ k: 'confirm' })} title="Makes this one pick now, by itself">Send only this now</Btn>
          </>
        ) : (
          <Btn disabled={disabled} title={disabled ? reason : undefined} onClick={() => { choose(film, { id: cid, label: what, pick: body }); setP({ k: 'idle' }); }}>{label}</Btn>
        )
      ) : p.k === 'confirm' ? (
        <>
          <Btn primary onClick={go} aria-label={`Confirm the pick: ${what}`}>Confirm · {what}</Btn>
          <Btn ghost onClick={() => setP({ k: 'idle' })}>Cancel</Btn>
        </>
      ) : (
        <Btn disabled>Picking…</Btn>
      )}
      {p.k === 'confirm' && <span className="text-[12px] text-sub">Writes the pick into the film and taste.md, then tells Alma.</span>}
      {disabled && reason && p.k === 'idle' && <span className="text-[12px] text-mute">{reason}</span>}
      {chosenHere && p.k === 'idle' && <span className="basis-full text-[12px] text-mute">It goes to Alma with your other choices when you press Done picking, at the foot of the page.</span>}
      {p.k === 'done' && <span role="status" className="text-[12px] text-ink-3">{p.text}</span>}
      {p.k === 'error' && <span role="alert" className="text-[12px] text-bad">{p.text}</span>}
    </span>
  );
}

export function SaveButton({ film, kind, refPath, label }: { film: string; kind: LibraryKind; refPath: string; label: React.ReactNode }) {
  const [p, setP] = useState<Phase>({ k: 'idle' });
  const go = async () => {
    setP({ k: 'busy' });
    const r = await postSave(film, kind, refPath);
    setP(r.ok ? { k: 'done', text: r.created ? 'Saved to the library' : 'Already in the library' } : { k: 'error', text: r.error ?? 'Not saved' });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Btn ghost disabled={p.k === 'busy'} onClick={go}><IconBookmark size={13} />{p.k === 'busy' ? 'Saving…' : label}</Btn>
      {p.k === 'done' && <span role="status" className="text-[12px] text-ink-3">{p.text}</span>}
      {p.k === 'error' && <span role="alert" className="text-[12px] text-bad">{p.text}</span>}
    </span>
  );
}
