'use client';
// Alma's notes under a field (Release, stage 2; board 17): her words, her proposal quoted when she gave one, and the
// buttons she wrote with the note, the one she recommends first, each with its small line. A button applies the
// note's effects (the `answer` operation: on every platform the effects name); the note is then replaced by one line
// saying what was done, with "Undo" on the last one answered (`undoAnswer`). The page knows no rule: the words and
// the effects are hers, from the file.
import { useState } from 'react';
import { Btn } from '@/components/shell/atoms';
import { cn } from '@/lib/utils';
import { answerWords, lastAnswered } from './derive';
import type { Field, Note, Platform, ReleaseFile } from './file';
import type { useRelease } from './ui';

type Run = ReturnType<typeof useRelease>['run'];

export function FieldNotes({ file, p, f, run, locked }: { file: ReleaseFile; p: Platform; f: Field; run: Run; locked: boolean }) {
  const notes = f.notes ?? [];
  if (!notes.length) return null;
  const last = lastAnswered(file);
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <NoteBox key={n.id} file={file} p={p} f={f} n={n} run={run} locked={locked}
          undoable={!!last && last.platform === p.id && last.field === f.id && last.note === n.id} />
      ))}
    </div>
  );
}

function NoteBox({ file, p, f, n, run, locked, undoable }: { file: ReleaseFile; p: Platform; f: Field; n: Note; run: Run; locked: boolean; undoable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string>();
  const press = async (action: string) => {
    setBusy(true);
    const r = await run({ op: 'answer', platform: p.id, field: f.id, note: n.id, action });
    setBusy(false);
    setSaid(r.ok ? undefined : r.error);
  };
  const undo = async () => {
    setBusy(true);
    const r = await run({ op: 'undoAnswer' });
    setBusy(false);
    setSaid(r.ok ? undefined : r.error);
  };
  if (n.answered) {
    const a = n.actions.find((x) => x.id === n.answered!.action);
    return (
      <div data-note={n.id} data-answered className="flex flex-col gap-1 duration-200 animate-in fade-in-0">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12px] leading-[1.45] text-ink-3">
          <span data-note-done>{a ? answerWords(file, a) : 'Answered.'}</span>
          {undoable && <button type="button" data-note-undo disabled={busy} onClick={() => void undo()} className="inline-flex min-h-7 cursor-pointer items-center text-ink underline decoration-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink disabled:opacity-50">Undo</button>}
        </p>
        {said && <span role="alert" className="text-[11.5px] text-warn duration-200 animate-in fade-in-0">{said}</span>}
      </div>
    );
  }
  return (
    <div data-note={n.id} className="relative flex flex-col gap-2.5 rounded-[10px] border border-edge-strong bg-[#0f0f11] px-3 py-2.5 duration-200 animate-in fade-in-0">
      <span aria-hidden className="absolute -top-[5px] left-[22px] size-2 rotate-45 border-l border-t border-edge-strong bg-[#0f0f11]" />
      <div className="flex items-start gap-[9px]">
        <span aria-hidden className="grid size-[18px] flex-none place-items-center rounded-full border border-edge-strong text-[10px] text-sub">A</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p data-note-text className="m-0 text-[12.5px] leading-[1.45] text-ink-2">{n.text}</p>
          {n.proposal && <p data-note-proposal className="m-0 whitespace-pre-line border-l-2 border-edge-strong pl-2.5 text-[12.5px] leading-[1.45] text-ink">“{n.proposal}”</p>}
        </div>
      </div>
      {!locked && n.actions.length > 0 && (
        <div className="flex flex-wrap items-start gap-1.5 pl-[27px]">
          {n.actions.map((a, i) => (
            <div key={a.id} className="flex min-w-0 max-w-[260px] flex-col gap-1">
              <Btn data-note-action={a.id} disabled={busy} onClick={() => void press(a.id)} className={cn('h-auto min-h-7 max-w-full self-start whitespace-normal px-2.5 py-1 text-left text-[12px]', i === 0 ? 'font-medium' : 'font-normal')}>{a.label}</Btn>
              {a.small && <span className="text-[11px] leading-[1.35] text-mute">{a.small}</span>}
            </div>
          ))}
        </div>
      )}
      {said && <span role="alert" className="pl-[27px] text-[11.5px] text-warn duration-200 animate-in fade-in-0">{said}</span>}
    </div>
  );
}
