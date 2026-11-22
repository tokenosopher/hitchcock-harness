'use client';
// The pick, in two steps inside the page (the viewer shows no confirm() dialogs): "Pick r2-7", then
// "Confirm r2-7" writes the pick through POST /api/films/[film]/pick and tells Alma. The page then
// updates from the files through the watcher. "Save to the library" is one step: it only adds a copy.
import { useState } from 'react';
import { Btn } from '@/components/shell/atoms';
import { IconBookmark } from '@/components/shell/icons';
import { postPick, postSave, type LibraryItem, type LibraryKind, type PickBody } from './data';
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

/** "Save to the library": one press copies the candidate in; the film and its pick stay as they are. Once
 *  the candidate is in the library (`saved`, or saved here) it says so, and a line of the user's own can be added. */
export function SaveButton({ film, kind, refPath, label, saved, onSaved }: {
  film: string;
  kind: LibraryKind;
  refPath: string;
  label: React.ReactNode;
  saved?: LibraryItem;             // the entry this candidate already is in the library
  onSaved?: (it?: LibraryItem) => void;
}) {
  const [p, setP] = useState<Phase>({ k: 'idle' });
  const [entry, setEntry] = useState<LibraryItem | undefined>(saved);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const it = entry ?? saved;
  const go = async (withNote?: string) => {
    setP({ k: 'busy' });
    const r = await postSave(film, kind, refPath, withNote);
    if (!r.ok) { setP({ k: 'error', text: r.error ?? 'Not saved' }); return; }
    if (r.meta) setEntry(r.meta);
    setNoting(false);
    setP(withNote ? { k: 'done', text: 'Note kept with it' } : { k: 'idle' });   // the line "In the … library" says the rest
    onSaved?.(r.meta);
  };
  const noun = kind === 'face' ? 'faces' : kind === 'voice' ? 'voices' : kind === 'location' ? 'locations' : 'characters';
  if (!it) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Btn ghost disabled={p.k === 'busy'} onClick={() => void go()}><IconBookmark size={13} />{p.k === 'busy' ? 'Saving…' : label}</Btn>
        {p.k === 'error' && <span role="alert" className="text-[12px] text-bad">{p.text}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 duration-200 animate-in fade-in-0" data-library-saved={it.id}>
      <span role="status" className="inline-flex h-8 items-center gap-1.5 text-[12.5px] text-ink">
        <IconBookmark size={13} className="fill-current" />In the {noun} library
      </span>
      {it.note && !noting && <span className="min-w-0 max-w-full truncate text-[12px] text-sub">“{it.note}”</span>}
      {!noting && <Btn ghost onClick={() => { setNote(it.note ?? ''); setNoting(true); }}>{it.note ? 'Change the note' : 'Add a note'}</Btn>}
      {p.k === 'done' && !noting && <span className="text-[12px] text-ink-3 duration-200 animate-in fade-in-0">{p.text}</span>}
      {noting && (
        <form className="flex w-full min-w-0 flex-wrap items-center gap-2 duration-200 animate-in fade-in-0 slide-in-from-top-1"
          onSubmit={(e) => { e.preventDefault(); if (note.trim()) void go(note.trim()); }}>
          <input autoFocus value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} aria-label="A note to keep with it"
            placeholder="Why keep it, for a later film" onKeyDown={(e) => { if (e.key === 'Escape') setNoting(false); }}
            className="h-8 min-w-0 flex-1 basis-[220px] rounded-lg border border-line bg-panel px-2.5 text-[13px] text-ink placeholder:text-mute focus:border-edge-strong focus:outline-none" />
          <Btn type="submit" disabled={!note.trim() || p.k === 'busy'}>{p.k === 'busy' ? 'Saving…' : 'Keep the note'}</Btn>
          <Btn ghost onClick={() => setNoting(false)}>Cancel</Btn>
        </form>
      )}
      {p.k === 'error' && <span role="alert" className="text-[12px] text-bad">{p.text}</span>}
    </span>
  );
}
