'use client';
// The composer: "Alma sees" chips, the message box, Attach and Send (the page's quick messages are not shown, 14 Nov).
// Every message carries the HarnessContext built from the chips; once it is out, the removable chips it
// carried clear (the thread shows them under the message) and only the pinned chip, and a chip a page keeps, stay.
// Enter sends, Shift+Enter is a new line. While Alma works an empty composer's button is Stop; typing turns it
// back into Send, which queues the message behind her turn.
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { useUI, useDraft } from '@/components/data/ui';
import { useThread } from '@/components/data/thread';
import { Chips } from './Chips';
import { IconSend, IconStop } from './icons';
import { cn } from '@/lib/utils';
import { isUploadChip, sendUpload, UPLOAD_PART } from '@/components/lib/uploads';
import { useSize } from '@/components/lib/sizes';
import { Edge } from './Edge';

export const DEFAULT_PLACEHOLDER = 'Pick, or tell Alma what to change…';

export function Composer({ film, compact }: { film: string; compact?: boolean }) {
  const { setDraft, prefill, undoDraft, redoDraft, hint, pinned, chips, addChip, removeChips, playhead, composerRef } = useUI();
  const draft = useDraft();
  const { send, sending, stop, workingSince } = useThread();
  const [stopping, setStopping] = useState(false);
  const working = workingSince !== undefined;
  const page = usePathname();
  const [focus, setFocus] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string>();
  // the file being sent and how much of it is in, for a file that goes in parts
  const [progress, setProgress] = useState<{ name: string; done: number }>();
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const boxH = useSize('box');
  const attached = chips.filter(isUploadChip).length;
  const has = draft.trim().length > 0 || attached > 0;
  const showAll = !compact || focus || has || uploading > 0;
  // with no height set by hand, the box grows with its words, up to a third of the window
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el || boxH) return;
    if (!showAll) { el.style.height = ''; return; }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight / 3))}px`;
  });

  /** Sends each file to the harness, which keeps it and answers with its path; it then rides along as a chip. */
  async function attach(files: File[]) {
    if (!files.length) return;
    setUploadError(undefined);
    setUploading((n) => n + files.length);
    for (const f of files) {
      const big = f.size > UPLOAD_PART;
      if (big) setProgress({ name: f.name || 'the file', done: 0 });
      try {
        const r = await sendUpload(film, f, big ? (done) => setProgress({ name: f.name || 'the file', done }) : undefined);
        if (r.ok) addChip({ id: `upload:${film}/${r.file.file}`, label: r.file.name ?? r.file.file, ref: r.file.path });
        else setUploadError(r.error);
      } finally {
        setProgress(undefined);
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit() {
    // a message can be only a file: Alma is told to look at it
    const text = draft.trim() || (attached ? (attached === 1 ? 'Look at the attached file.' : 'Look at the attached files.') : '');
    if (!text || sending || uploading > 0) return;
    const selected = chips;
    const ok = await send(text, { film, page, pinned, selected, playhead });
    if (ok) {
      setDraft('');
      // a chip a page keeps ("keep:…", the takes marked for Seedance) goes with every message and stays
      removeChips(selected.filter((c) => !c.id.startsWith('keep:')).map((c) => c.id));
    }
  }
  async function halt() {
    if (stopping) return;
    setStopping(true);
    try { await stop(); } finally { setStopping(false); }
  }
  const asStop = working && !has;
  // The page's quick messages ("What changed?", "Render the 480p of this version") are not shown (the user, 14 Nov:
  // "those options make no sense, so I wouldn't actually keep those right now"). Pages still state them through
  // usePage, so they can come back; the box has the message, Attach and Send.
  const quick: string[] = [];

  return (
    <div className="flex flex-col gap-2">
      {showAll && <Chips />}
      {(uploading > 0 || uploadError) && (
        <div role="status" className="line-in flex flex-col gap-1 px-0.5 text-[11.5px] text-sub">
          <span>{uploading > 0
            ? (progress ? `Attaching ${progress.name}… ${Math.floor(progress.done * 100)}%` : `Attaching ${uploading === 1 ? 'the file' : `${uploading} files`}…`)
            : uploadError}</span>
          {uploading > 0 && progress && (
            <span aria-hidden="true" className="line-in h-px w-full overflow-hidden rounded-full bg-edge">
              <span className="block h-full bg-ink transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${Math.round(progress.done * 100)}%` }} />
            </span>
          )}
        </div>
      )}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); void attach(Array.from(e.dataTransfer.files)); }}
        className={cn('relative flex rounded-xl border bg-well transition-colors duration-150', over ? 'border-ink' : 'border-edge has-[textarea:focus]:border-sub', showAll ? 'flex-col' : 'flex-row items-center')}>
        {showAll && <Edge name="box" axis="y" sign={-1} label="The height of the message box" className="-top-[5px]" measure={() => composerRef.current?.offsetHeight ?? 0} />}
        <input ref={picker} type="file" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <label htmlFor="composer" className="sr-only">Message Alma</label>
        <textarea
          id="composer"
          ref={composerRef}
          rows={showAll ? 2 : 1}
          style={showAll ? { height: boxH ? Math.max(boxH, 44) : undefined, maxHeight: '60dvh' } : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 200)}
          onPaste={(e) => {
            // a pasted picture or file is attached
            const files = Array.from(e.clipboardData.files);
            if (files.length) { e.preventDefault(); void attach(files); return; }
            // Pasted words are put in here, from the paste event itself. Left to the browser, it reads the
            // clipboard a second time a moment later, and a dictation tool that pastes (Wispr Flow) has by then
            // put the old clipboard back: the recorder showed the words arriving and nothing being inserted
            // (13 Nov 2026).
            const text = e.clipboardData.getData('text/plain');
            if (!text) return;
            e.preventDefault();
            const el = e.currentTarget;
            const before = el.value;
            const at = el.selectionStart ?? before.length;
            const end = el.selectionEnd ?? at;
            const want = before.slice(0, at) + text + before.slice(end);
            // insertText keeps undo and tells React. If the browser refuses or does nothing (the recorder showed
            // it doing nothing after the first pastes), the words are written into the box directly.
            const done = document.execCommand('insertText', false, text);
            if (!done || el.value !== want) {
              setDraft(want);
              requestAnimationFrame(() => el.setSelectionRange(at + text.length, at + text.length));
            }
          }}
          onKeyDown={(e) => {
            // Command-Z when the box holds exactly what a button just wrote: back to what you had typed before it.
            // Typing after the button is undone by the browser first; once the button's own text is all that is
            // left, the next Command-Z is this one. Shift-Command-Z goes forward again.
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
              const to = e.shiftKey ? redoDraft(e.currentTarget.value) : undoDraft(e.currentTarget.value);
              if (to !== undefined) { e.preventDefault(); e.stopPropagation(); setDraft(to); }
              return;
            }
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submit();
          }}
          placeholder={chips.find((c) => c.placeholder)?.placeholder ?? hint.placeholder ?? DEFAULT_PLACEHOLDER}
          className={cn('w-full resize-none border-0 bg-transparent text-[14px] leading-normal text-ink outline-none placeholder:text-mute', showAll ? 'px-[13px] pb-1 pt-[11px]' : 'h-11 overflow-hidden whitespace-nowrap px-3 py-[11px]')}
        />
        <div className={cn('flex items-center justify-between gap-2', showAll ? 'px-2 pb-2 pt-1.5' : 'py-1.5 pr-1.5')}>
          {showAll && (
            <div className="flex min-w-0 flex-wrap gap-1">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => prefill(q)} className="h-7 cursor-pointer whitespace-nowrap rounded-[7px] border border-edge px-[9px] text-[12px] font-medium text-ink-3 hover:bg-raised">{q}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => picker.current?.click()} aria-label="Attach a file" title="Attach a picture or a file. You can also paste one or drop it here."
            className={cn('flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg text-sub hover:bg-raised hover:text-ink', showAll && 'ml-auto')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.9-8.9a3.7 3.7 0 015.2 5.2l-8.9 8.9a1.8 1.8 0 01-2.6-2.6l8.2-8.2" /></svg>
          </button>
          {asStop ? (
            <button type="button" onClick={() => void halt()} aria-label="Stop Alma" title="Stop Alma’s turn" disabled={stopping}
              className="flex h-8 flex-none cursor-pointer items-center gap-1.5 rounded-lg border border-edge-strong bg-raised px-2.5 text-[12px] font-medium text-ink hover:bg-edge disabled:cursor-default disabled:opacity-60">
              <IconStop />Stop
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} aria-label={working ? 'Send (queued after Alma’s turn)' : 'Send'} disabled={sending || uploading > 0}
              className={cn('flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg', has ? 'bg-ink text-bg' : 'bg-edge text-sub')}>
              <IconSend />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
