'use client';
// The composer: "Alma sees" chips, the message box, Attach and Send (the page's quick messages are not shown, 14 Nov).
// Every message carries the HarnessContext built from the chips; once it is out, the removable chips it
// carried clear (the thread shows them under the message) and only the pinned chip, and a chip a page keeps, stay.
// Enter sends, Shift+Enter is a new line. While Alma works an empty composer's button is Stop; typing turns it
// back into Send, which queues the message behind her turn.
// References in the words: a thing put into the line as a chip, at the cursor, by Option-clicking it on the
// page, by the pick button and a click or tap, by Ctrl-M for the playhead's moment, or from the @ list. The box stays
// a plain text box: a chip is its label in the words, drawn as a pill by a copy of the text behind them, and is one
// piece (the cursor never stops inside it; a deletion that reaches it takes it out whole). Alma receives each chip
// as a <harness-ref …/> tag in its place (src/lib/refs.ts).
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useUI, useDraft, useDraftRefs } from '@/components/data/ui';
import { useThread } from '@/components/data/thread';
import { useFilm } from '@/components/data/film';
import { Chips } from './Chips';
import { IconSend, IconStop } from './icons';
import { cn } from '@/lib/utils';
import { isUploadChip, sendUpload, UPLOAD_PART } from '@/components/lib/uploads';
import { useSize } from '@/components/lib/sizes';
import { Edge } from './Edge';
import { useIsPhone } from './useIsPhone';
import {
  chipSpans, draftForAlma, draftMarkup, draftParts, draftPlain, editParts, insertRef, isRefPart, newRefKey, shownLabel, snapCaret,
  type DraftPart, type InlineRef,
} from '@/lib/refs';
import { momentRef, useHasMoment } from '@/components/lib/refPick';
import { allItems, filterItems, type RefItem } from './refItems';
import { RefList } from './RefList';
import { RefCard, useHoverCard } from './RefCard';
import { setPickingMark, usePickOnPage } from './refPicking';

export const DEFAULT_PLACEHOLDER = 'Pick, or tell Alma what to change…';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noSub = () => () => {};

function IconPick({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

/** The words behind the box: the same text, transparent, with each chip drawn as a pill and the @ being typed
 *  underlined. It wraps exactly as the box does and scrolls with it. */
function Backdrop({ parts, at, innerRef }: { parts: DraftPart[]; at?: { start: number; end: number }; innerRef: React.RefObject<HTMLDivElement | null> }) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  parts.forEach((p, i) => {
    if (isRefPart(p)) {
      const t = shownLabel(p.ref.label);
      out.push(<span key={p.key} data-box-chip={p.key} className="rounded-[5px] bg-raised shadow-[inset_0_0_0_1px_#3f3f46] [box-decoration-break:clone]">{t}</span>);
      pos += t.length;
      return;
    }
    const s = pos, e = pos + p.text.length;
    pos = e;
    if (!at || at.end <= s || at.start >= e) { out.push(<span key={i}>{p.text}</span>); return; }
    const a = Math.max(0, at.start - s), b = Math.min(p.text.length, at.end - s);
    out.push(<span key={i}>{p.text.slice(0, a)}<span className="underline decoration-sub decoration-dashed underline-offset-4">{p.text.slice(a, b)}</span>{p.text.slice(b)}</span>);
  });
  return (
    <div ref={innerRef} aria-hidden="true" data-box-backdrop=""
      className="pointer-events-none absolute left-0 top-0 overflow-hidden whitespace-pre-wrap px-[13px] pb-1 pt-[11px] text-[14px] leading-normal text-transparent [overflow-wrap:break-word]">
      {out}{'​'}
    </div>
  );
}

export function Composer({ film, compact }: { film: string; compact?: boolean }) {
  const { setDraft, setDraftRefs, prefill, undoDraft, redoDraft, hint, pinned, chips, addChip, removeChips, playhead, composerRef } = useUI();
  const draft = useDraft();
  const refs = useDraftRefs();
  const { send, sending, stop, workingSince } = useThread();
  const filmState = useFilm().state;
  const [stopping, setStopping] = useState(false);
  const working = workingSince !== undefined;
  const page = usePathname();
  const phone = useIsPhone();
  const mac = useSyncExternalStore(noSub, isMac, () => true);
  const hasMoment = useHasMoment();
  const [focus, setFocus] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string>();
  // the file being sent and how much of it is in, for a file that goes in parts
  const [progress, setProgress] = useState<{ name: string; done: number }>();
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const boxH = useSize('box');
  const attached = chips.filter(isUploadChip).length;

  // the words as parts (text and chips), what the box shows, and where the chips are in it
  const parts = useMemo(() => draftParts(draft, refs), [draft, refs]);
  const plain = useMemo(() => draftPlain(parts), [parts]);
  const hasRefs = parts.some(isRefPart);
  const partsNow = useRef(parts);
  const plainNow = useRef(plain);
  useLayoutEffect(() => { partsNow.current = parts; plainNow.current = plain; });
  const has = plain.trim().length > 0 || attached > 0;
  const showAll = !compact || focus || has || uploading > 0;
  // where the cursor goes after the box's words were set by us (a chip in or out), and where it stood last
  const caretAfter = useRef<number | undefined>(undefined);
  const lastCaret = useRef(0);
  const [caret, setCaret] = useState(0);
  const touched = useRef(false);   // the box has had the cursor since it was drawn: its selection is the user's
  const backdrop = useRef<HTMLDivElement>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const armedNow = useRef(false);
  useLayoutEffect(() => { armedNow.current = armed; setPickingMark(armed); }, [armed]);
  // Escape anywhere stops picking
  useEffect(() => {
    if (!armed) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmed(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [armed]);
  const [note, setNote] = useState<string>();
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (s: string) => { clearTimeout(noteTimer.current); setNote(s); noteTimer.current = setTimeout(() => setNote(undefined), 2600); };

  // with no height set by hand, the box grows with its words, up to a third of the window
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el || boxH) return;
    if (!showAll) { el.style.height = ''; return; }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight / 3))}px`;
  });
  // the cursor after a change of ours, and the pills' copy kept at the box's size and scroll
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (el && caretAfter.current !== undefined && el.value === plain) {
      const c = caretAfter.current;
      caretAfter.current = undefined;
      el.setSelectionRange(c, c);
      lastCaret.current = c;
    }
    const b = backdrop.current;
    if (el && b) {
      b.style.width = `${el.clientWidth}px`;
      b.style.height = `${el.clientHeight}px`;
      b.scrollTop = el.scrollTop;
    }
  });

  /** New parts for the box; `shown` is what the box holds now, so the cursor is put back only when they differ. */
  function commit(next: DraftPart[], c: number, shown?: string) {
    setDraft(draftMarkup(next));
    if (draftPlain(next) !== shown) caretAfter.current = c;
    lastCaret.current = c;
    setCaret(c);
  }

  /** Puts a thing into the words: over the selection when the box had one, else at the cursor, else at the end. */
  function putIn(r: InlineRef, range?: [number, number], refocus?: boolean) {
    const el = composerRef.current;
    const p = partsNow.current, len = plainNow.current.length;
    const [s, e] = range ?? (el && touched.current ? [el.selectionStart ?? len, el.selectionEnd ?? len] : [len, len]);
    const key = newRefKey();
    const out = insertRef(p, s, e, key, r);
    setDraftRefs((m) => ({ ...m, [key]: r }));
    commit(out.parts, out.caret);
    touched.current = true;
    if (refocus && el && document.activeElement !== el) el.focus({ preventScroll: true });
    // Alma's column may be folded away: a chip put in brings it back
    window.dispatchEvent(new Event('hh:alma-show'));
  }

  usePickOnPage(composerRef, () => armedNow.current, (r, hadBox) => putIn(r, undefined, hadBox), () => setArmed(false));

  // the @ list: open while the words before the cursor end in "@" and a few letters, unless closed there
  const [closedAt, setClosedAt] = useState<number>();
  const [active, setActive] = useState(0);
  const at = useMemo(() => {
    if (!focus) return undefined;
    const before = plain.slice(0, caret);
    const m = /(^|[\s(])@([^\s@]{0,24})$/.exec(before);
    if (!m) return undefined;
    const start = caret - m[2].length - 1;
    if (closedAt === start || chipSpans(parts).some((sp) => start >= sp.start && start < sp.end)) return undefined;
    return { start, end: caret, query: m[2] };
  }, [focus, plain, caret, closedAt, parts]);
  const items = useMemo<RefItem[]>(() => (at ? filterItems(allItems(filmState), at.query) : []), [at, filmState]);
  const [seenQuery, setSeenQuery] = useState<string>();
  if ((at?.query ?? undefined) !== seenQuery) { setSeenQuery(at?.query); setActive(0); }
  const pickedOn = Math.min(active, Math.max(0, items.length - 1));
  function choose(it: RefItem) {
    if (!at) return;
    // the playhead is read again as it is put in
    const r = it.ref.kind === 'moment' ? momentRef() ?? it.ref : it.ref;
    putIn(r, [at.start, at.end]);
  }

  // a chip's card: hover a chip in the box (the pointer's place over the pills' copy), or tap it on a touch screen
  const card = useHoverCard<{ key: string; rect: DOMRect; along?: DOMRect }>();
  const chipAt = (x: number, y: number): { key: string; rect: DOMRect; along?: DOMRect } | undefined => {
    for (const s of backdrop.current?.querySelectorAll<HTMLElement>('[data-box-chip]') ?? []) {
      for (const r of s.getClientRects()) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { key: s.dataset.boxChip!, rect: r, along: boxEl.current?.getBoundingClientRect() };
      }
    }
    return undefined;
  };
  const lastPointer = useRef('mouse');
  const cardRef = card.open ? refs[card.open.key] : undefined;

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
    // a message can be only a file: Alma is told to look at it; a message of chips alone is their tags
    const words = draftForAlma(parts).trim();
    const text = words || (attached ? (attached === 1 ? 'Look at the attached file.' : 'Look at the attached files.') : '');
    if (!text || sending || uploading > 0) return;
    const selected = chips;
    const ok = await send(text, { film, page, pinned, selected, playhead });
    if (ok) {
      setDraft('');
      setDraftRefs(() => ({}));
      card.setOpen(undefined);
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
  const opt = mac ? '⌥' : 'Alt';
  const ctrlM = mac ? '⌃M' : 'Ctrl M';
  const hintWords = `${opt} click a thing${hasMoment ? ` · ${ctrlM} playhead` : ''} · @ find`;

  const pickButton = (
    <button type="button" data-ref-skip="" aria-pressed={armed} aria-label={armed ? 'Stop picking' : 'Pick a thing on the page to put in the message'}
      title={armed ? 'Stop picking (Esc)' : `Pick a clip, take, panel, card or character on the page to put in the message (or ${opt}-click it while you write)`}
      onMouseDown={(e) => e.preventDefault()} onClick={() => setArmed((a) => !a)}
      className={cn('flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-150', armed ? 'bg-raised text-ink shadow-[inset_0_0_0_1px_#a1a1aa]' : 'text-sub hover:bg-raised hover:text-ink')}>
      <IconPick />
    </button>
  );

  return (
    <div className="flex flex-col gap-2" data-ref-skip="">
      {armed && (
        <div role="status" className="flex items-center gap-2 px-0.5 text-[12px] text-ink-3 duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
          <IconPick size={13} />
          <span className="min-w-0 flex-1 truncate">{phone ? 'Tap' : 'Click'} a clip, take or card to add it</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setArmed(false)}
            className="h-[26px] flex-none cursor-pointer rounded-[7px] border border-edge bg-transparent px-2.5 text-[12px] text-ink hover:bg-raised">Cancel</button>
        </div>
      )}
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
      <div ref={boxEl}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); void attach(Array.from(e.dataTransfer.files)); }}
        className={cn('relative flex rounded-xl border bg-well transition-colors duration-150', over ? 'border-ink' : 'border-edge has-[textarea:focus]:border-sub', showAll ? 'flex-col' : 'flex-row items-center')}>
        {showAll && <Edge name="box" axis="y" sign={-1} label="The height of the message box" className="-top-[5px]" measure={() => composerRef.current?.offsetHeight ?? 0} />}
        {at && <RefList items={items} query={at.query} active={pickedOn} onActive={setActive} onChoose={choose} />}
        <input ref={picker} type="file" multiple hidden aria-hidden="true" tabIndex={-1} onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <label htmlFor="composer" className="sr-only">Message Alma</label>
        <div className={cn('relative', showAll ? 'w-full' : 'min-w-0 flex-1')}>
          {showAll && (hasRefs || at) && <Backdrop parts={parts} at={at} innerRef={backdrop} />}
          <textarea
            id="composer"
            ref={composerRef}
            rows={showAll ? 2 : 1}
            style={showAll ? { height: boxH ? Math.max(boxH, 44) : undefined, maxHeight: '60dvh' } : undefined}
            value={plain}
            role={at ? 'combobox' : undefined}
            aria-expanded={at ? true : undefined}
            aria-controls={at ? 'ref-list' : undefined}
            aria-activedescendant={at && items.length ? `ref-row-${pickedOn}` : undefined}
            onChange={(e) => {
              const el = e.currentTarget;
              const out = editParts(parts, el.value, el.selectionEnd ?? el.value.length);
              commit(out.parts, out.caret, el.value);
            }}
            onSelect={(e) => {
              // the cursor never stands inside a chip: moving forward it lands after the chip, back before it; a
              // selection takes whole chips
              const el = e.currentTarget;
              const s = el.selectionStart ?? 0, en = el.selectionEnd ?? s;
              if (s === en) {
                const to = snapCaret(parts, s, s >= lastCaret.current);
                if (to !== s) el.setSelectionRange(to, to);
                lastCaret.current = to;
                if (to !== caret) setCaret(to);
              } else {
                const a = snapCaret(parts, s, false), b = snapCaret(parts, en, true);
                if (a !== s || b !== en) el.setSelectionRange(a, b, el.selectionDirection);
                if (b !== caret) setCaret(b);
              }
            }}
            onScroll={(e) => { if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop; }}
            onFocus={() => { setFocus(true); touched.current = true; }}
            onBlur={() => setTimeout(() => setFocus(false), 200)}
            onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse' || !hasRefs) return;
              const hit = chipAt(e.clientX, e.clientY);
              if (hit) { if (card.open?.key !== hit.key) card.show(hit); else card.keep(); } else if (card.open) card.hide();
            }}
            onPointerLeave={() => { if (card.open) card.hide(); }}
            onClick={(e) => {
              // on a touch screen a tap on a chip opens its card (the cursor goes beside the chip, as ever)
              if (lastPointer.current === 'mouse' || !hasRefs) return;
              const hit = chipAt(e.clientX, e.clientY);
              if (hit) card.setOpen(card.open?.key === hit.key ? undefined : hit);
              else if (card.open) card.setOpen(undefined);
            }}
            onPaste={(e) => {
              // a pasted picture or file is attached
              const files = Array.from(e.clipboardData.files);
              if (files.length) { e.preventDefault(); void attach(files); return; }
              // Pasted words are put in here, from the paste event itself. Left to the browser, it reads the
              // clipboard a second time a moment later, and a dictation tool that pastes (Wispr Flow) has by then
              // put the old clipboard back: the recorder showed the words arriving and nothing being inserted.
              const text = e.clipboardData.getData('text/plain');
              if (!text) return;
              e.preventDefault();
              const el = e.currentTarget;
              const before = el.value;
              const at0 = el.selectionStart ?? before.length;
              const end = el.selectionEnd ?? at0;
              const want = before.slice(0, at0) + text + before.slice(end);
              // insertText keeps undo and tells React. If the browser refuses or does nothing (the recorder showed
              // it doing nothing after the first pastes), the words are written into the box directly, the chips
              // they do not touch kept.
              const done = document.execCommand('insertText', false, text);
              if (!done || el.value !== want) {
                const out = editParts(partsNow.current, want, at0 + text.length);
                commit(out.parts, out.caret);
              }
            }}
            onKeyDown={(e) => {
              // the @ list takes the arrows, Enter, Tab and Escape while it is open
              if (at && !e.nativeEvent.isComposing) {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
                  e.preventDefault();
                  setActive((pickedOn + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
                  return;
                }
                if (((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') && items.length) { e.preventDefault(); choose(items[pickedOn]); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setClosedAt(at.start); return; }
              }
              // Ctrl-M: the playhead's moment, with the cut's version (a key no one types by accident)
              if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.code === 'KeyM') {
                e.preventDefault();
                const m = momentRef();
                if (m) putIn(m); else say('There is no playhead on this page');
                return;
              }
              if (e.key === 'Escape' && armed) { e.preventDefault(); setArmed(false); return; }
              // Command-Z when the box holds exactly what a button just wrote: back to what you had typed before it.
              // Typing after the button is undone by the browser first; once the button's own text is all that is
              // left, the next Command-Z is this one. Shift-Command-Z goes forward again.
              if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') {
                const to = e.shiftKey ? redoDraft(draft) : undoDraft(draft);
                if (to !== undefined) { e.preventDefault(); e.stopPropagation(); setDraft(to); }
                return;
              }
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              void submit();
            }}
            placeholder={chips.find((c) => c.placeholder)?.placeholder ?? hint.placeholder ?? DEFAULT_PLACEHOLDER}
            className={cn('relative w-full resize-none border-0 bg-transparent text-[14px] leading-normal text-ink outline-none placeholder:text-mute', showAll ? 'block px-[13px] pb-1 pt-[11px]' : 'block h-11 overflow-hidden whitespace-nowrap px-3 py-[11px]')}
          />
        </div>
        <div className={cn('flex items-center justify-between gap-2', showAll ? 'px-2 pb-2 pt-1.5' : 'py-1.5 pr-1.5')}>
          {showAll && (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => prefill(q)} className="h-7 cursor-pointer whitespace-nowrap rounded-[7px] border border-edge px-[9px] text-[12px] font-medium text-ink-3 hover:bg-raised">{q}</button>
              ))}
              {/* the quiet hint, or a line about the last key (no playhead here) for a moment */}
              {!phone && (
                <span key={note ?? 'hint'} className={cn('min-w-0 truncate pl-[5px] text-[11px] leading-7 duration-200 animate-in fade-in-0 motion-reduce:animate-none', note ? 'text-sub' : 'text-mute')}>
                  {note ?? hintWords}
                </span>
              )}
              {phone && note && <span className="min-w-0 truncate pl-[5px] text-[11px] leading-7 text-sub duration-200 animate-in fade-in-0">{note}</span>}
            </div>
          )}
          {pickButton}
          <button type="button" onClick={() => picker.current?.click()} aria-label="Attach a file" title="Attach a picture or a file. You can also paste one or drop it here."
            className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg text-sub hover:bg-raised hover:text-ink">
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
        {cardRef && card.open && (
          <RefCard r={cardRef} film={film} place={{ anchor: card.open.rect, along: card.open.along }}
            onEnter={card.keep} onLeave={() => card.hide()} onGo={() => card.setOpen(undefined)} />
        )}
      </div>
    </div>
  );
}
