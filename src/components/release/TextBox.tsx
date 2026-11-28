'use client';
// One box of "The text" (Release, ASKS 57, 14 Nov 2026): one thing the platform itself has ("Title", "Description",
// "Caption", "First comment", "Tags"), named with its word, holding the whole text of that part exactly as it will be
// posted, in one text area that grows with it. Under it one quiet line: the count against the platform's limit and
// Alma's one aim (derive.ts boxCount); for the Tags box, where the tags go; for X's Reply, how it goes out (ASKS 58). Above it, when the box is shared, one line
// with "Only here" (or "Only TikTok has this caption." with "Link again"). Under it, each field's candidates as radio
// options with their whole text (Candidates.tsx), then Alma's notes about its fields.
//
// Typing is kept in the box (nothing else redraws per key but the count and the preview, drafts.ts) and saved after
// a short pause and on leaving the box: a box of one field with `setText`, a box of several with `setPartText` (the
// first field holds it all, the others are emptied; Command-Z back to the text it started from puts the fields back
// as they were, `back`). A refusal slides the text back and says why on the box's own line. An edit that would be this
// platform's only (a partner locked, or a box shared only in part) asks first, before anything is kept. Facts show as
// tokens; an unconfirmed one opens its own small field (`confirm`). A locked platform's box is read-only.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import { cn } from '@/lib/utils';
import { appName, boxCount, boxOverride, boxShare, boxText, editableText, factPieces, fromEditable, nameList, type Box, type Piece } from './derive';
import { factIdsIn, type Platform, type ReleaseFile } from './file';
import { draftsOf } from './drafts';
import { FieldNotes } from './FieldNotes';
import { Candidates } from './Candidates';
import { refData } from '@/components/lib/refPick';
import { fieldRef } from './refs';
import { FactField } from './ReleaseOpen';
import type { useRelease } from './ui';
import type { ReleaseOp } from './ops';

type Run = ReturnType<typeof useRelease>['run'];
export interface BoxCtx { film: string; file: ReleaseFile; p: Platform; now: Date; run: Run; base: string; qs: string; locked: boolean; phone?: boolean }
type Was = Record<string, { text: string; own?: boolean; pick?: string }>;

/** How long the typing rests before it is saved. */
const SAVE_MS = 700;

export function LinkIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn('flex-none', className)}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}

/** A text with its facts as tokens: a confirmed one as its value, one to confirm in amber (a button when `open`). */
export function Pieces({ pieces, open, onFact, plain }: { pieces: Piece[]; open?: string; onFact?: (id: string) => void; plain?: boolean }) {
  return (
    <>
      {pieces.map((x, i) => ('text' in x ? <span key={i}>{x.text}</span>
        : x.fact.confirmedAt
          ? <span key={i} data-token={x.fact.id} data-token-confirmed title={`${x.fact.label}, confirmed`} className={plain ? undefined : 'border-b border-dotted border-sub'}>{x.shown}</span>
          : onFact
            ? <button key={i} type="button" data-token={x.fact.id} aria-expanded={open === x.fact.id} aria-label={`${x.fact.label}, not confirmed yet`}
                onClick={(e) => { e.stopPropagation(); onFact(x.fact.id); }}
                className="inline cursor-pointer whitespace-nowrap rounded-[4px] border border-dashed border-warn/65 bg-warn/10 px-[5px] font-[inherit] text-warn transition-colors duration-150 hover:bg-warn/20">{x.shown}</button>
            : <span key={i} data-token={x.fact.id} className="whitespace-nowrap rounded-[4px] border border-dashed border-warn/65 bg-warn/10 px-[5px] text-warn">{x.shown}</span>))}
    </>
  );
}

const quietBtn = 'ml-auto inline-flex h-7 flex-none cursor-pointer items-center whitespace-nowrap border-l border-edge-strong pl-[7px] text-[11.5px] text-ink underline decoration-faint underline-offset-2 transition-colors duration-150 hover:decoration-ink disabled:cursor-default';

export function TextBox({ ctx, b }: { ctx: BoxCtx; b: Box }) {
  const { film, file, p, now, run, base, qs, locked } = ctx;
  const drafts = draftsOf(film, p.id);
  const value = boxText(b);
  // the words in the box: the file's, until the user types; the file's again when it changes and nothing is unsaved
  const [local, setLocal] = useState(value);
  const [held, setHeld] = useState(value);
  if (held !== value) {
    setHeld(value);
    if (local === held || local === value) setLocal(value);
  }
  const [asking, setAsking] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [said, setSaid] = useState<string>();
  const [bounce, setBounce] = useState(0);
  const [factOpen, setFactOpen] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // the fields as they were before the first edit here, for Command-Z back to that text (several fields only)
  const [orig, setOrig] = useState<{ text: string; was: Was }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(value);
  const box = useRef<HTMLTextAreaElement>(null);
  const onlyHere = useRef<HTMLButtonElement>(null);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (editing) box.current?.focus(); }, [editing]);

  const share = locked ? undefined : boxShare(file, p.id, b.key, now);
  const asksFirst = !!share && (share.state === 'some' || share.locked.length > 0);
  const lockedPartner = share?.locked[0];
  const count = boxCount(file, p.id, b.key, local)!;
  const name = appName(p);
  const lbl = b.label.charAt(0).toLowerCase() + b.label.slice(1);
  const own = b.fields.some((f) => f.own);
  const many = b.fields.length > 1;
  const ids = b.fields.map((f) => f.id);
  // the box as a thing for Alma's message box (Option-click): its field and the words in it now
  const mark = refData(fieldRef(p, b.fields, b.label, local));

  const clearDraft = (t?: string) => { const d = drafts.get(); if (d?.field === b.fields[0].id && (t === undefined || d.text === t)) drafts.clear(b.fields[0].id); };
  const opFor = (t: string, only: boolean): ReleaseOp => {
    const extra = { ...(only ? { only: true } : {}), ...(b.kind === 'tags' ? { tags: true } : {}) };
    if (!many) return { op: 'setText', platform: p.id, field: b.fields[0].id, text: t, ...extra };
    const cur = Object.fromEntries(b.fields.map((f) => [f.id, f.text]));
    const back = orig && t === orig.text && ids.some((id) => orig.was[id].text !== cur[id]) ? orig.was : undefined;
    return { op: 'setPartText', platform: p.id, part: b.part.id, text: t, ...extra, ...(back ? { back } : {}) };
  };
  const save = async (t: string, only = false) => {
    clearTimeout(timer.current);
    if (t === latest.current && !only) { clearDraft(t); return; }
    const r = await run(opFor(t, only));
    clearDraft(t);
    if (!r.ok) { setLocal(latest.current); setSaid(r.error); setBounce((x) => x + 1); } else setSaid(undefined);
  };
  const onType = (raw: string) => {
    const t = fromEditable(file, raw);
    if (many && !orig) setOrig({ text: value, was: Object.fromEntries(b.fields.map((f) => [f.id, { text: f.text, ...(f.own ? { own: true } : {}), ...(f.pick ? { pick: f.pick } : {}) }])) });
    setLocal(t);
    drafts.set(boxOverride(b, t));
    setSaid(undefined);
    clearTimeout(timer.current);
    // a change that will be this platform's only: ask before anything is kept
    if (asksFirst) { setAsking(true); return; }
    timer.current = setTimeout(() => void save(t), SAVE_MS);
  };
  const keepOnly = async () => { setAsking(false); await save(local, true); };
  const putBack = () => { setAsking(false); setLocal(latest.current); clearDraft(); };
  const unlink = async () => {
    setUnlinkOpen(false);
    setBusy(true);
    const r = await run({ op: 'unlink', platform: p.id, field: ids[0], ...(many ? { fields: ids.slice(1) } : {}) });
    setBusy(false);
    setSaid(r.ok ? undefined : r.error);
  };
  const linkAgain = async () => {
    if (!share?.with[0]) return;
    setBusy(true);
    const r = await run({ op: 'link', platform: p.id, field: ids[0], with: share.with[0].id, ...(many ? { fields: ids.slice(1) } : {}) });
    setBusy(false);
    setSaid(r.ok ? undefined : r.error);
  };
  const onBlur = () => {
    setEditing(false);
    if (!asking && local !== latest.current) void save(local);
  };

  // ---- pieces of the box

  const header = (
    <div {...mark} className="flex min-h-[24px] flex-wrap items-baseline gap-x-2 text-[12px] text-sub">
      <b className="text-[12.5px] font-medium text-ink">{b.label}</b>
    </div>
  );
  const ownTag = own && <span data-own-tag className="mt-[2px] whitespace-nowrap text-[11px] leading-[1.3] text-sub duration-200 animate-in fade-in-0">your own text</span>;

  const shareLine = share?.line && (
    <div key={`${share.state}:${share.line}`} data-share-line={share.state} className="flex min-h-7 items-center gap-2 text-[11.5px] leading-[1.4] text-sub duration-200 animate-in fade-in-0">
      <span className="flex min-w-0 items-start gap-2">{share.state === 'shared' && <LinkIcon className="mt-[2px]" />}<span data-share-words>{share.line}</span></span>
      {share.state === 'shared' && <button ref={onlyHere} type="button" data-only-here aria-expanded={unlinkOpen} disabled={busy} onClick={() => setUnlinkOpen(!unlinkOpen)} className={quietBtn}>Only here</button>}
      {share.state === 'only' && <button type="button" data-link-again disabled={busy} onClick={() => void linkAgain()} className={quietBtn}>Link again</button>}
    </div>
  );

  const unlinkBox = share?.state === 'shared' && (
    <Reveal open={unlinkOpen}>
      <div data-unlink-confirm className="mb-1 flex flex-col gap-2 rounded-[10px] border border-[#3a3a41] bg-raised px-3 py-2.5 text-[12.5px] leading-[1.45] text-ink-2">
        <p className="m-0">{name} keeps {/s$/.test(lbl) ? 'these' : 'this'} {lbl}. {nameList(share.with.map(appName))} {share.with.length > 1 ? 'keep their' : 'keeps its'} own from now on.</p>
        <div className="flex gap-1.5">
          <Btn data-unlink-yes onClick={() => void unlink()} className="h-7 px-2.5 text-[12px]">Only here</Btn>
          <Btn ghost onClick={() => setUnlinkOpen(false)} className="h-7 px-2 text-[12px] font-normal">Keep them linked</Btn>
        </div>
      </div>
    </Reveal>
  );

  const scheduledPartner = lockedPartner && (lockedPartner.st.state === 'scheduled' || lockedPartner.st.state === 'waiting') ? lockedPartner : undefined;
  const question = (
    <Reveal open={asking}>
      <div data-ask-locked role="alertdialog" aria-label="A change that will be this platform's only" className="flex flex-col gap-2 rounded-[10px] border border-warn/40 bg-warn/5 px-3 py-2.5 text-[12.5px] leading-[1.45] text-ink-2">
        <p className="m-0">{share?.ask}</p>
        <div className="flex flex-wrap gap-1.5">
          <Btn data-keep-only onClick={() => void keepOnly()} className="h-7 px-2.5 text-[12px]">Keep it {name}&apos;s only</Btn>
          {scheduledPartner ? (
            <Link data-unschedule-first href={`${base}/release/${scheduledPartner.p.id}${qs}`} onClick={putBack}
              className="inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] text-sub no-underline transition-colors duration-150 hover:bg-raised hover:text-ink">
              {scheduledPartner.st.state === 'scheduled' ? `Unschedule ${appName(scheduledPartner.p)} first` : `Cancel ${appName(scheduledPartner.p)}'s ask first`}
            </Link>
          ) : (
            <Btn ghost data-put-back onClick={putBack} className="h-7 px-2 text-[12px] font-normal">Leave it as it was</Btn>
          )}
        </div>
      </div>
    </Reveal>
  );

  const countLine = (
    <p data-count data-count-state={count.state} className={cn('m-0 min-h-[18px] text-[11.5px] leading-[1.45] tabular-nums transition-colors duration-200', count.state === 'over' ? 'text-bad' : count.state === 'ok' ? 'text-sub' : 'text-warn')}>
      {(() => { const m = /^[\d,]+/.exec(count.words); return m ? <><b className={cn('font-medium', count.state === 'ok' && 'text-ink-3')}>{m[0]}</b>{count.words.slice(m[0].length)}</> : count.words; })()}
      {count.fact && <>{count.words.endsWith('.') ? ' ' : '. '}<span key={count.fact} data-count-fact className="text-sub duration-200 animate-in fade-in-0">{count.fact}</span></>}
    </p>
  );

  const status = (
    <Reveal open={!!said}>
      <p role="alert" data-field-said className="m-0 text-[11.5px] leading-[1.45] text-warn">{said}</p>
    </Reveal>
  );

  const openFact = factOpen ? file.facts.find((x) => x.id === factOpen) : undefined;
  const factBox = (
    <Reveal open={!!openFact && !openFact.confirmedAt}>
      {openFact && <div data-fact-box className="rounded-[10px] border border-edge px-3 py-2.5"><FactField f={openFact} file={file} run={run} /></div>}
    </Reveal>
  );
  const notes = b.fields.map((f) => <FieldNotes key={f.id} file={file} p={p} f={f} run={run} locked={locked} />);

  // ---- locked: read-only, quiet

  if (locked) {
    return (
      <div data-box={b.key} data-box-kind={b.kind} data-box-locked className="flex flex-col gap-1.5">
        {header}
        <div {...mark} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg border border-line bg-[#0a0a0a] px-2.5 py-[7px]">
          <div data-locked-text className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-ink-3">
            {value ? <Pieces pieces={factPieces(file, value)} plain /> : <span className="text-mute">No text</span>}
          </div>
          {ownTag}
        </div>
        {countLine}
        {notes}
      </div>
    );
  }

  // ---- the box

  const hasFacts = factIdsIn(local).length > 0;
  const textCls = 'block w-full min-w-0 whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-ink';
  const editor = hasFacts && !editing ? (
    <div data-editor data-editor-display role="textbox" aria-label={`${b.label}, press to type`} tabIndex={0}
      onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true); } }}
      className={cn(textCls, 'min-h-[19px] cursor-text outline-none')}>
      <Pieces pieces={factPieces(file, local)} open={factOpen} onFact={(id) => setFactOpen(factOpen === id ? undefined : id)} />
    </div>
  ) : (
    <textarea key={bounce} ref={box} data-editor aria-label={b.label} rows={1} value={editableText(file, local)} placeholder="Write it here"
      onChange={(e) => onType(e.target.value)} onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }}
      className={cn(textCls, 'm-0 min-h-[19px] resize-none overflow-hidden border-0 bg-transparent p-0 outline-none [field-sizing:content] placeholder:text-mute',
        bounce > 0 && 'duration-200 animate-in fade-in-0 slide-in-from-left-1')} />
  );

  // Escape closes the "Only here" question (nothing changes) and gives the keyboard back to its button
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !unlinkOpen) return;
    e.stopPropagation();
    setUnlinkOpen(false);
    onlyHere.current?.focus();
  };
  return (
    <div data-box={b.key} data-box-kind={b.kind} onKeyDown={onKey} className="flex flex-col gap-1.5">
      {header}
      {shareLine}
      {unlinkBox}
      {/* the whole frame takes the press, not only the line of text inside it (19 px): a press on its edge types there too */}
      <div data-box-frame {...mark} onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (box.current) { box.current.focus(); const n = box.current.value.length; box.current.setSelectionRange(n, n); } else setEditing(true);
      }} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg border border-edge-strong bg-black px-2.5 py-[7px] transition-colors duration-150 focus-within:border-ink hover:border-[#52525b] focus-within:hover:border-ink', ctx.phone && 'min-h-[44px] py-[11px]')}>
        {editor}
        {ownTag}
      </div>
      {factBox}
      {question}
      {countLine}
      {status}
      {b.fields.map((f) => <Candidates key={f.id} ctx={ctx} f={f} text={many ? undefined : local} label={many} />)}
      {notes}
    </div>
  );
}
