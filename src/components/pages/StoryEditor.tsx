'use client';
// The story before the script (stage 1): prose with the dialogue inside it, shown as text the user edits in place
// (design/boards/Story-2.dc.html, ASKS 64: it sits on a bordered page that looks like one to type into).
// Each save is the next story/v<n>.md; Alma writes versions the same way when asked in the thread. Nothing is
// written over. "Settle" tells Alma to write the script from the newest version. Once the script is locked,
// or on a finished film, the story is a record and no longer editable. A film made before the story step shows
// the Story section of its script.md instead, read only.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FilmState } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { fmtDate } from '@/components/lib/format';
import { Btn, Card, Dot } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import { useTypingAway } from '@/components/shell/typing';
import { cn } from '@/lib/utils';
import { IconPen } from './storyIcons';
import { isSaveKey, SaveBar } from './SaveBar';

/** The "## Story" section of script.md, without its heading: what an earlier film's story was. */
export function scriptStory(md?: string): { text: string; note?: string } | undefined {
  const m = /^## Story\b[^\n]*\n([\s\S]*?)(?=^## )/m.exec(md ?? '');
  const text = m?.[1].trim();
  if (!text) return undefined;
  return { text, note: /^## Story\s*\(([^\n]*)\)\s*$/m.exec(md ?? '')?.[1] };
}

/** The few marks an older story carries (**bold**, *italic*), shown as type instead of asterisks. */
function marked(t: string): React.ReactNode[] {
  return t.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : /^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : part);
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const paras = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
/** How many paragraphs differ between two texts: the ones in either that the other does not have, the larger side. */
function changedParas(a: string, b: string): number {
  const x = paras(a), y = paras(b);
  const inX = new Set(x), inY = new Set(y);
  const n = Math.max(y.filter((p) => !inX.has(p)).length, x.filter((p) => !inY.has(p)).length);
  return Math.max(n, a.trim() !== b.trim() ? 1 : 0);
}
/** The elements that scroll around `el`, nearest first, and the page itself. */
function scrollers(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let e = el.parentElement; e; e = e.parentElement) if (/(auto|scroll)/.test(getComputedStyle(e).overflowY)) out.push(e);
  const root = document.scrollingElement as HTMLElement | null;
  if (root && !out.includes(root)) out.push(root);
  return out;
}
/** Scrolls the nearest scroller the least it takes to show the caret's line above the story's save bar. */
function keepCaretInView(el: HTMLTextAreaElement): void {
  const s = scrollers(el)[0];
  if (!s) return;
  const cs = getComputedStyle(el);
  const m = document.createElement('div');
  for (const k of ['font', 'letterSpacing', 'lineHeight', 'wordSpacing', 'tabSize', 'padding', 'borderWidth', 'boxSizing'] as const) m.style[k] = cs[k];
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${el.offsetWidth}px` });
  m.textContent = el.value.slice(0, el.selectionEnd);
  const mark = m.appendChild(document.createElement('span'));
  mark.textContent = '\u200b';
  document.body.appendChild(m);
  const line = parseFloat(cs.lineHeight) || 28;
  const y = el.getBoundingClientRect().top + mark.offsetTop;
  m.remove();
  const box = s.getBoundingClientRect();
  const bar = document.querySelector('[data-save-bar="story"] > div')?.getBoundingClientRect();
  const top = Math.max(box.top, 0) + 8;
  const bottom = Math.min(box.bottom, window.innerHeight, bar && bar.height ? bar.top : Infinity) - 8;
  if (y + line > bottom) s.scrollTop += y + line - bottom;
  else if (y < top) s.scrollTop -= top - y;
}
const draftKey = (film: string) => `hh-story-draft:${film}`;

interface Draft { base?: string; text: string }

function loadDraft(film: string): Draft | undefined {
  try {
    const d = JSON.parse(window.localStorage.getItem(draftKey(film)) ?? 'null') as Draft | null;
    return d && typeof d.text === 'string' ? d : undefined;
  } catch {
    return undefined;
  }
}
function keepDraft(film: string, d?: Draft): void {
  try {
    if (d) window.localStorage.setItem(draftKey(film), JSON.stringify(d));
    else window.localStorage.removeItem(draftKey(film));
  } catch { /* a private window: the draft lives in the page only */ }
}

export function StoryEditor({ state, film, locked, hasScript }: { state: FilmState; film: string; locked: boolean; hasScript: boolean }) {
  const ui = useUI();
  const story = state.story;
  const old = story ? undefined : scriptStory(state.script?.markdown);
  const record = state.film.status === 'delivered' || locked;
  const current = story?.current;
  // an unsent edit survives a reload (the editor is keyed by film and mounts in the browser, once the film is read)
  const [draft, setDraft] = useState<Draft | undefined>(() => {
    const d = loadDraft(film);
    return d && !record && d.text.trim() !== (story?.text ?? '').trim() ? d : undefined;
  });
  const [viewing, setViewing] = useState<string>();           // an earlier version being read
  const [earlier, setEarlier] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'settle'>();
  const [error, setError] = useState<{ text: string; conflict?: boolean; settle?: boolean }>();
  const [saved, setSaved] = useState<string>();               // the version this visit just saved
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useTypingAway('story', focused);

  const dirty = draft !== undefined && draft.text.trim() !== (story?.text ?? '').trim();
  // while an edit is open, the newest saved version can be read beside it without losing the edit
  const peek = dirty && !!current && viewing === current;
  const shownV = viewing && (viewing !== current || peek) ? viewing : undefined;
  const text = peek ? story?.text ?? '' : shownV ? earlier[shownV] ?? '' : draft?.text ?? story?.text ?? old?.text ?? '';
  const moved = dirty && !!current && draft?.base !== current;  // Alma (or another tab) wrote a version since this edit began
  const settled = !!story?.settled && story.settled.version === current;

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    // 'auto' collapses the page for a moment and the browser clamps its scroll (the page shot up on each key,
    // 20 Nov 2026): the scroll is put back as it was, then the caret is kept clear of the save bar
    const kept = scrollers(el).map((s) => [s, s.scrollTop] as const);
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight + 2, 220)}px`;
    for (const [s, top] of kept) if (s.scrollTop !== top) s.scrollTop = top;
    if (document.activeElement === el) keepCaretInView(el);
  }, [text, shownV]);

  useEffect(() => {
    if (!shownV || peek || earlier[shownV] !== undefined) return;
    let live = true;
    fetch(`/api/films/${film}/story?v=${shownV}`, { cache: 'no-store' })
      .then(async (r) => { const d = (await r.json()) as { text?: string }; if (live) setEarlier((e) => ({ ...e, [shownV]: r.ok ? d.text ?? '' : '' })); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [film, shownV, peek, earlier]);

  // "Saved as v8" stays a few seconds, then fades
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(undefined), 6000);
    return () => clearTimeout(t);
  }, [saved]);

  const edit = (t: string) => {
    const d = { base: draft?.base ?? current, text: t };
    setDraft(d);
    keepDraft(film, d);
    setError(undefined);
  };
  const discard = () => { setDraft(undefined); keepDraft(film); setError(undefined); setViewing(undefined); };

  const post = useCallback(async (body: Record<string, unknown>): Promise<{ ok: boolean; status: number; error?: string; version?: string }> => {
    try {
      const r = await fetch(`/api/films/${film}/story`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; version?: string };
      return { ok: r.ok, status: r.status, error: d.error, version: d.version };
    } catch {
      return { ok: false, status: 0, error: 'The harness server is not answering. Your text is still here and in this browser.' };
    }
  }, [film]);

  const save = async (force = false) => {
    if (!draft || busy) return;
    setBusy('save');
    const r = await post({ text: draft.text, base: draft.base, force: force || moved });
    setBusy(undefined);
    if (r.ok) { setDraft(undefined); keepDraft(film); setError(undefined); setViewing(undefined); setSaved(r.version); return; }
    setError({ text: r.error ?? `Not saved (${r.status})`, conflict: r.status === 409 });
  };
  const settle = async () => {
    if (!current || dirty) return;
    setBusy('settle');
    const r = await post({ settle: current });
    setBusy(undefined);
    if (!r.ok) setError({ text: r.error ?? `Not settled (${r.status})`, settle: true });
  };
  const askAbout = () => {
    const t = sel.trim();
    if (!t) return;
    ui.addChip({ id: `story:${t.length}:${t.slice(0, 24)}`, label: `story · “${t.slice(0, 32)}${t.length > 32 ? '…' : ''}”`, ref: t.slice(0, 1200) });
    setSel('');
  };

  // a film from before the story step: its story as it went into the script, to read
  if (!story && (record || old)) {
    if (!old) return null;
    return (
      <Card>
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span className="lbl">The story · as it went into the script</span>
            <span className="font-mono text-[11px] text-sub">script.md · {words(old.text)} words</span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            {old.note && <p className="m-0 mb-3 text-[12px] leading-normal text-sub">{old.note}</p>}
            <div className="max-w-[36em] whitespace-pre-wrap text-[16px] leading-[1.75] text-ink-2">{marked(old.text)}</div>
          </div>
        </details>
      </Card>
    );
  }

  const v = story?.versions.find((x) => x.version === (shownV ?? current));
  const nv = (story?.versions ?? []).find((x) => x.version === current);
  const next = `v${Math.max(0, ...(story?.versions ?? []).map((x) => Number(x.version.slice(1)))) + 1}`;
  const readOnly = record || !!shownV;
  const changed = dirty ? changedParas(story?.text ?? '', draft!.text) : 0;
  const hint = record
    ? (locked ? 'The script is locked; the story is kept as it was.' : 'Kept as it was.')
    : shownV ? undefined
    : dirty ? `Editing from ${draft?.base ?? 'a new story'}. Your words are kept in this browser until you save or discard.`
    : story ? `Click into the text and type. A save makes ${next}; ${current} stays as it is.` : undefined;

  return (
    <div data-story-panel className="flex min-w-0 max-w-[660px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-1">
        <span className="lbl">The story</span>
        <span className="font-mono text-[11px] text-sub">{story ? `story/${shownV ?? current}.md${dirty && !shownV ? ' · editing' : ''}` : 'story/v1.md · not written yet'}</span>
      </div>
      {story && story.versions.length > 0 && (
        <div role="tablist" aria-label="Story versions" className="scroll flex gap-4 overflow-x-auto border-b border-line">
          {story.versions.map((x) => {
            const on = (shownV ?? current) === x.version && !(dirty && !shownV);
            return (
              <button key={x.version} role="tab" type="button" aria-selected={on} onClick={() => setViewing(x.version === current && !dirty ? undefined : x.version)}
                title={`${x.by === 'you' ? 'Saved by you' : 'Written by Alma'}${x.date ? ` · ${fmtDate(x.date)}` : ''}`}
                className={cn('-mb-px flex h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-medium max-[760px]:h-11 transition-colors duration-150 animate-in fade-in-0 slide-in-from-right-2', on ? 'border-ink text-ink' : 'border-transparent text-sub hover:text-ink-3')}>
                {x.version}<span className="text-[11px] font-normal text-sub">{x.by === 'you' ? 'you' : 'Alma'}</span>
                {story.settled?.version === x.version && <span className="rounded-[4px] border border-edge-strong px-1.5 py-px text-[10.5px] tracking-[0.04em] text-ink">SETTLED</span>}
              </button>
            );
          })}
          {dirty && (
            <button role="tab" type="button" aria-selected={!shownV} onClick={() => setViewing(undefined)} data-your-edit
              className={cn('-mb-px flex h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-medium max-[760px]:h-11 duration-200 animate-in fade-in-0 slide-in-from-right-2', !shownV ? 'border-ink text-ink' : 'border-transparent text-sub')}>
              Your edit<span className="text-[11px] font-normal text-sub">not saved</span>
            </button>
          )}
        </div>
      )}

      <Reveal open={!!shownV}>
        <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-edge px-3.5 py-2.5 text-[12.5px] leading-normal text-ink-3">
          <div className="flex flex-col gap-1">
            <span>{peek ? `${shownV} as it was saved. Your edit is kept.` : `You are reading ${shownV}, ${v?.by === 'you' ? 'saved by you' : 'written by Alma'}${v?.date ? ` on ${fmtDate(v.date)}` : ''}, kept as it was. Earlier versions are read, not edited.`}</span>
            <span className="flex flex-wrap gap-x-4">
              <button type="button" onClick={() => setViewing(undefined)} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">{dirty ? 'Back to my edit' : `Back to ${current}`}</button>
              {!record && !dirty && shownV && <button type="button" onClick={() => { edit(earlier[shownV] ?? ''); setViewing(undefined); }} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">Start again from {shownV}</button>}
            </span>
          </div>
        </div>
      </Reveal>
      <Reveal open={moved && !shownV}>
        <div role="status" data-story-moved className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-edge bg-panel px-3.5 py-2.5 text-[12.5px] leading-normal text-ink-3">
          <Dot state="queued" className="mt-1.5" />
          <div className="flex flex-col gap-1">
            <span>{nv?.by === 'you' ? `${current} was saved in another window` : `Alma wrote ${current}`} while you were typing. Your text below is untouched; nothing is lost either way.</span>
            <span className="flex flex-wrap gap-x-4">
              <button type="button" onClick={() => setViewing(current)} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">Read {current}</button>
              <button type="button" onClick={() => void save(true)} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">Save mine as {next}</button>
              <button type="button" onClick={discard} className="inline-flex min-h-6 cursor-pointer items-center text-sub underline underline-offset-2 hover:text-ink max-[760px]:min-h-11">Discard mine</button>
            </span>
          </div>
        </div>
      </Reveal>

      {!story && !record && (
        <p className="m-0 mt-3 flex items-start gap-2 text-[12.5px] leading-normal text-sub">
          <IconPen className="mt-0.5 flex-none" />Alma writes the first telling here from your idea, as a short story with the dialogue in it. You can also write or paste it yourself and save.
        </p>
      )}
      {hint && (
        <p data-story-hint className="m-0 mt-3 flex items-start gap-2 text-[12.5px] leading-normal text-sub">
          {!record && <IconPen className="mt-0.5 flex-none" />}{hint}
        </p>
      )}
      <Reveal open={!!saved && !dirty}>
        <p role="status" className="m-0 mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-3"><Dot state="done" />Saved as {saved}, by you. {story?.versions.length && saved ? `${story.versions[story.versions.length - 2]?.version ?? ''} is kept as it was.` : ''}</p>
      </Reveal>

      <label htmlFor="story-text" className="sr-only">The story</label>
      <div className={cn('mt-3 rounded-[10px] border transition-[border-color,box-shadow,background-color,padding] duration-150',
        readOnly && shownV ? 'border-transparent bg-transparent px-0 py-1'
          : readOnly ? 'border-line bg-transparent px-5 py-4 sm:px-7'
          : focused ? 'border-sub/60 bg-well px-4 py-4 shadow-[0_0_0_3px_rgba(161,161,170,0.12)] sm:px-7 sm:py-5'
          : 'border-edge bg-well px-4 py-4 hover:border-edge-strong sm:px-7 sm:py-5',
        busy === 'save' && 'opacity-60')}>
        <textarea id="story-text" ref={area} value={text} readOnly={readOnly || busy === 'save'} spellCheck
          onChange={(e) => edit(e.target.value)}
          onFocus={() => setFocused(!readOnly)} onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (isSaveKey(e)) { e.preventDefault(); if (dirty) void save(); } }}
          onSelect={(e) => { const el = e.currentTarget; setSel(el.selectionEnd > el.selectionStart ? el.value.slice(el.selectionStart, el.selectionEnd) : ''); }}
          placeholder="The scene opens with…"
          className={cn('block w-full max-w-[36em] resize-none border-0 bg-transparent p-0 text-[16px] leading-[1.75] outline-none placeholder:text-sub',
            readOnly ? 'cursor-default text-sub' : 'cursor-text text-ink-2', readOnly && !shownV && 'text-ink-3')} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] tabular-nums text-sub">
          {words(text)} words{v ? ` · ${v.by === 'you' ? 'saved by you' : 'written by Alma'}${v.date ? ` ${fmtDate(v.date)}` : ''}` : ''}
        </span>
        {sel.trim() && <Btn onClick={askAbout} title="Puts the selected words in what Alma sees with your next message">Ask Alma about the selection</Btn>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {!record && !shownV && story && !dirty && (settled
            ? <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><Dot state="done" />Settled at {current}{hasScript ? ' · the script is written from it' : ' · Alma writes the script from it'}</span>
            : <Btn primary onClick={() => void settle()} disabled={!!busy} title={`Tells Alma to write the script from ${current}`} data-settle>
                {busy === 'settle' && <Dot state="running" />}Settle {current} and write the script
              </Btn>)}
        </span>
      </div>
      {error?.settle && (
        <p role="alert" className="m-0 mt-2 flex items-center gap-2 text-[12.5px] text-ink-3"><Dot state="failed" />{error.text}</p>
      )}

      <SaveBar name="story" open={!readOnly && (dirty || (!story && !!draft?.text.trim()))} busy={busy === 'save'}
        error={error && !error.settle ? (error.conflict ? `${error.text}.` : error.text) : undefined}
        text={`Edited, not saved${story ? ` · ${changed} ${changed === 1 ? 'paragraph' : 'paragraphs'} changed` : ''}`}
        sub={story ? (hasScript ? `The script was written from ${story.settled?.version ?? 'an earlier story'}. Save as ${next}, then settle it, and Alma writes the next script draft from it.` : `Saves ${next}; ${current} stays as it is.`) : 'Saves story/v1.md.'}
        saveLabel={`Save as ${next}`} onSave={() => void save(error?.conflict)} onDiscard={discard} saveDisabled={!text.trim()} />
    </div>
  );
}
