'use client';
// Alma on the Release pages (stage 2). The one place that says what she has not read ("Since Alma last read it: the
// credit line", with "Ask Alma to read it (1 change)"), the chip that carries those changes in "Alma sees", and the
// block of a release with a final and no texts yet ("Ask Alma to draft them"). Both buttons send the ask as the
// user's own message the way the composer does (useThread's send, with "Alma sees" as its context); nothing goes to
// her by itself.
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useThread } from '@/components/data/thread';
import { useUI, useUIActions } from '@/components/data/ui';
import { Btn } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import type { Chip } from '@/server/types';
import { changedSinceRead, fieldList } from './derive';
import type { Platform, ReleaseFinal } from './file';
import { draftAsk, editedChip, editedChipId, readAsk } from './alma';

/** Sends words to Alma as the user's own message, with what "Alma sees" holds (plus `extra`), as the composer does:
 *  the removable chips that went out leave, a chip a page keeps stays. The words in the message box are left alone. */
export function useSendAsUser(film: string) {
  const { send } = useThread();
  const { pinned, chips, removeChips, playhead } = useUI();
  const page = usePathname();
  return useCallback(async (text: string, extra: Chip[] = []) => {
    // a request sent at the press (a chip with `command`) goes alone: one a button left in the box earlier stays there
    const own = extra.some((e) => !!e.command);
    const selected = [...chips.filter((c) => !extra.some((e) => e.id === c.id) && !(own && (c.command || c.about))), ...extra];
    const ok = await send(text, { film, page, pinned, selected, ...(playhead ? { playhead } : {}) });
    if (ok) removeChips(selected.filter((c) => !c.id.startsWith('keep:')).map((c) => c.id));
    return ok;
  }, [send, chips, removeChips, film, page, pinned, playhead]);
}

/** "Since Alma last read it: the credit line, the tags" and its button; also keeps the platform's "Edited" chip in
 *  "Alma sees" while there are changes (it leaves with the page). */
export function SinceRead({ film, p }: { film: string; p: Platform }) {
  const changes = useMemo(() => changedSinceRead(p), [p]);
  const chip = useMemo(() => (changes.length ? editedChip(film, p, changes) : undefined), [film, p, changes]);
  const { addChip, removeChip } = useUIActions();
  const id = editedChipId(p.id);
  useEffect(() => { if (chip) addChip(chip); else removeChip(id); }, [chip, id, addChip, removeChip]);
  useEffect(() => () => removeChip(id), [id, removeChip]);
  const sendAs = useSendAsUser(film);
  // the changes this ask went out for: the button says so until she has read them or the text changes again
  const sig = changes.map((c) => `${c.field}\u0000${c.now}`).join('\u0001');
  const [asked, setAsked] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!chip || busy) return;
    setBusy(true);
    const ok = await sendAs(readAsk(p, changes), [chip]);
    setBusy(false);
    if (ok) { setAsked(sig); setError(undefined); } else setError('The message did not go. Try again.');
  };
  const n = changes.length;
  return (
    <Reveal open={n > 0}>
      <div data-since className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-line py-[5px] pl-[11px] pr-1.5 text-[12px] text-sub">
          <span className="min-w-0 flex-1">Since Alma last read it: <b data-since-fields className="font-medium text-ink">{fieldList(changes.map((c) => c.label))}</b></span>
          <Btn data-ask-read onClick={() => void ask()} disabled={busy || asked === sig} className="h-7 px-2.5 text-[12px] font-normal">
            {asked === sig ? 'Asked Alma to read it' : `Ask Alma to read it (${n} ${n === 1 ? 'change' : 'changes'})`}
          </Btn>
        </div>
        {error && <span role="alert" className="text-[11.5px] text-warn duration-200 animate-in fade-in-0">{error}</span>}
      </div>
    </Reveal>
  );
}

/** A release with a final and no platforms: one calm block, and while Alma works on it (her turn after the ask, or a
 *  task of hers about the release) it says so. */
export function NoTexts({ film, final }: { film: string; final: ReleaseFinal }) {
  const sendAs = useSendAsUser(film);
  const { workingSince, tasks } = useThread();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const releaseTask = tasks.some((t) => (t.state === 'running' || t.state === 'queued') && /release|texts?\b|caption/i.test(t.title));
  const working = (sent && workingSince !== undefined) || releaseTask;
  const ask = async () => {
    const ok = await sendAs(draftAsk(film, final));
    setSent(ok);
    setError(ok ? undefined : 'The message did not go. Try again.');
  };
  return (
    <div data-no-texts className="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-edge px-4 py-4 duration-200 animate-in fade-in-0">
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[13px] font-medium text-ink">Alma has not written the texts yet.</p>
        <p className="m-0 text-[12.5px] text-sub">She adds each platform with its texts, its account and when it goes out.</p>
      </div>
      <Btn data-ask-draft onClick={() => void ask()} disabled={working}>{sent ? 'Asked Alma' : 'Ask Alma to draft them'}</Btn>
      <Reveal open={working}><p data-no-texts-working className="m-0 text-[12.5px] text-sub">Alma is working on them. They appear here as she writes them.</p></Reveal>
      {error && <span role="alert" className="text-[11.5px] text-warn">{error}</span>}
    </div>
  );
}
