'use client';
// The script on the Story page (ASKS 64, design/boards/Story-2.dc.html): its versions, the lock block with what the
// lock starts, and the lines, edited in place before the lock. Words only: click a line or a direction (or Tab to it and
// press Enter), type, Enter keeps and Esc puts back; one save for the whole sitting is the next script version, marked as
// yours, the one before kept word for word under "## Earlier drafts" (src/lib/script-edit.ts; the save is
// src/server/actions/script.ts). If script.md changes while the user types, each edit is checked against the newer text:
// one that still fits goes on top; one on a line Alma changed too is chosen; Lock waits until the edits are saved or
// discarded. After the lock the lines are read only and a click hands a line to Alma, as before.
// The cards (title card, a card between scenes, end card; src/lib/script-cards.ts) show in their place in the film,
// and their words are edited as a line is ("it should be as editable as everything else that's in the
// script"): click its first line or the line under it, type, Enter keeps; the same save, version and word to Alma.
// After the lock, or on an earlier version, a click hands the card to Alma. A card a version changed is marked the way
// a changed line is.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { FilmState, TaskCard } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { clothingDone, faceDone, faceState, lastRound, locationState, roundProgress, scriptScenes, taskFor, type ScriptScene } from '@/components/lib/derive';
import { fmtClock, fmtDate } from '@/components/lib/format';
import { FILM_TARGET, openOf, qcEntry } from '@/components/lib/qc';
import { Btn, Card, Dot, type DotState } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';
import { IconCheck, IconChevronLeft } from '@/components/shell/icons';
import { useTypingAway } from '@/components/shell/typing';
import { cardChanges, cardLineLabel, scriptCards, type CardChange, type ScriptCard } from '@/lib/script-cards';
import { checkEdits, earlierAsScript, fingerprint, sceneTableWords, scriptRows, idRows, type EditCheck, type ScriptEdit } from '@/lib/script-edit';
import { cn } from '@/lib/utils';
import { filmPath } from './common';
import { ToConfirm } from './postCommon';
import { isSaveKey, SaveBar } from './SaveBar';
import { IconClock, IconLink, IconLock, IconPen } from './storyIcons';
import { almaFetch } from '@/components/data/almaOutbox';
import { markSent } from '@/components/data/choices';
import { storySent } from '@/components/lib/sent';
import { refData } from '@/components/lib/refPick';
import { capWords } from '@/components/lib/refBlock';
import type { InlineRef } from '@/lib/refs';

/** A spoken line or a direction of the script as a thing for Alma's message box (Option-click): its scene, its number
 *  among the scene's lines (a direction has none), the speaker and the words shown, of the version on screen. */
function lineRefOf(scene: string, r: { id: string; kind: string; n?: number; speaker?: string }, words: string, version?: string): InlineRef {
  const spoken = r.kind === 'line';
  return { kind: 'line', label: `${scene} · ${spoken ? `line ${r.n}` : 'direction'}`, scene, item: r.id, ...(spoken && r.n !== undefined ? { line: r.n, title: r.speaker } : {}), page: 'story',
    words: capWords(words), ...(version ? { section: `script ${version}` } : {}) };
}

/** "v4" → 4; drafts ("Draft 2") sort before the numbered versions of the same day. */
const order = (v: string) => (/^v(\d+(?:\.\d+)?)/.exec(v) ? 100 + parseFloat(v.slice(1)) : parseFloat(/\d+/.exec(v)?.[0] ?? '0'));

/** The lock note in script.md's italic paragraph: the user's words and the change from the version before. */
function lockNote(md?: string): { words?: string; change?: string } | undefined {
  const p = /^\*(v[\d.]+,\s*LOCKED[\s\S]*?)\*$/m.exec(md ?? '')?.[1];
  if (!p) return undefined;
  const words = /LOCKED[^(]*\("([^"]+)"\)/.exec(p)?.[1];
  const rest = p.replace(/^v[\d.]+,\s*LOCKED[^)]*\)\.\s*/, '');
  const change = /^\d{4}-\d\d-\d\d:\s*([\s\S]*?)(?=\s+v[\d.]+,\s+(?:\d{4}-|draft\b|LOCKED\b)|$)/.exec(rest)?.[1];
  return { words, change: change ? change.replace(/^the user's /, 'your ') : undefined };
}

interface ChainRow { label: string; status: string; dot: DotState }
/** What the lock starts: chain A (the places) and chain B (the people), from the film as it stands; before anything
 *  exists, from the script's ID table, as "starts at the lock". */
function chains(s: FilmState, tasks: TaskCard[]): { a: ChainRow[]; b: ChainRow[]; fromIds: boolean } {
  const a = s.locations.map((l): ChainRow => {
    const st = locationState(l.styleImages, l.master?.picked);
    const p = roundProgress(lastRound(l.styleImages));
    return { label: `${l.id} · style image`, status: st === 'picked' ? 'picked' : st === 'running' ? `${p.landed} of ${p.asked}` : st === 'ready' ? `${p.landed} landed` : 'not started', dot: st === 'running' ? 'running' : st === 'waiting' ? 'waiting' : 'done' };
  });
  const b: ChainRow[] = [];
  const speaking = s.characters.filter((c) => !c.extra);
  for (const c of speaking) {
    const st = faceState(c, tasks);
    const p = roundProgress(lastRound(c.face?.rounds));
    b.push({ label: `faces · ${c.id}`, status: st === 'picked' ? `picked ${c.face?.pick?.candidateId}` : st === 'ready' ? `${p.landed} landed` : st === 'running' ? `${p.landed} of ${p.asked}` : st, dot: st === 'running' ? 'running' : st === 'queued' ? 'queued' : st === 'waiting' ? 'waiting' : 'done' });
  }
  for (const c of speaking) {
    if (!c.wardrobe?.rounds.length || c.wardrobe.pick || clothingDone(c)) continue;
    b.push({ label: `clothing · ${c.id}`, status: faceDone(c) ? 'running' : 'waits for the face pick', dot: faceDone(c) ? 'running' : 'waiting' });
  }
  for (const c of speaking) {
    if (!c.voice?.rounds.length || c.voice.pick) continue;
    const t = taskFor(tasks, 'voices', c.id);
    b.push({ label: `voices · ${c.id}`, status: t?.state === 'running' ? 'running' : `${roundProgress(lastRound(c.voice.rounds)).landed} options`, dot: t?.state === 'running' ? 'running' : 'done' });
  }
  if (a.length || b.length) return { a, b, fromIds: false };
  const md = s.script?.markdown;
  return {
    a: idRows(md, 'location').map((l) => ({ label: `${l.id} ${l.name} · style image`, status: 'starts at the lock', dot: 'waiting' })),
    b: [...idRows(md, 'character').slice(0, 12).map((c) => ({ label: `faces · ${c.id} ${c.name}`, status: 'starts at the lock', dot: 'waiting' as DotState })),
      ...(idRows(md, 'character').length ? [{ label: 'clothing, then voices · each', status: 'after its face pick', dot: 'waiting' as DotState }] : [])],
    fromIds: true,
  };
}

function ChainRowView({ r }: { r: ChainRow }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12.5px]', r.dot === 'waiting' ? 'border-dashed border-edge-strong' : 'border-edge bg-well')}>
      <Dot state={r.dot} />
      <span className="min-w-0">{r.label}</span>
      <span className="ml-auto flex-none text-right text-[11.5px] text-sub">{r.status}</span>
    </div>
  );
}

const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
const keyOf = (scene: string, index: number) => `${scene}:${index}`;
/** A card's line: `card:<its place among the cards>:<0 first line, 1 the line under it>`. */
const cardKey = (index: number, part: number) => `card:${index}:${part}`;
const editKey = (e: Pick<ScriptEdit, 'scene' | 'index' | 'kind' | 'part'>) => (e.kind === 'card' ? cardKey(e.index, e.part ?? 0) : keyOf(e.scene, e.index));
const cardScene = (c: ScriptCard) => c.place.before ?? c.place.after ?? c.place.in ?? 'S1';
type Row = ScriptScene['rows'][number];
const rowWords = (r: Row) => (r.kind === 'line' ? r.text.replace(/^"|"$/g, '') : r.text);
const label = (sc: string, r: Row, rows: Row[]) => (r.kind === 'line' ? `${sc} line ${r.n}` : `${sc} direction ${rows.filter((x) => x.kind === 'action').indexOf(r) + 1}`);

export function ScriptPanel({ state, film, tasks, base, onEdits, version }: { state: FilmState; film: string; tasks: TaskCard[]; base: string; onEdits: (n: number) => void; /** The version to open at (a card's link). */ version?: string }) {
  const ui = useUI();
  const md = state.script?.markdown ?? '';
  // oldest first, as on the board (the reader lists them newest first)
  const versions = useMemo(() => [...(state.script?.versions ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || order(a.version) - order(b.version)), [state.script?.versions]);
  const current = state.script?.current ?? versions[versions.length - 1]?.version;
  const currentV = versions.find((v) => v.version === current);
  const lockedV = currentV?.locked ? currentV : undefined;
  const [tab, setTab] = useState<string | undefined>(() => (version && versions.some((v) => v.version === version) ? version : undefined));
  const shown = tab && tab !== current ? tab : current;

  // ---- the edits of this sitting
  const [edits, setEdits] = useState<Record<string, ScriptEdit>>({});
  const [editing, setEditing] = useState<{ key: string; value: string } | undefined>();
  const [baseFp, setBaseFp] = useState<{ version?: string; fingerprint: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<{ version: string; from: string; n: number; scenes: string[]; cards: boolean }>();
  const [chainsOpen, setChainsOpen] = useState(false);
  // "Lock vN" goes to Alma at once (ASKS 65): the press is the user's yes; the page then waits for the lock to show in script.md
  const [lockAsk, setLockAsk] = useState<{ version: string; sent?: boolean; error?: string }>();
  const lock = async () => {
    if (!current) return;
    setLockAsk({ version: current });
    try {
      const r = await almaFetch(film, `/api/films/${film}/script`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lock: current }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setLockAsk(r.ok ? { version: current, sent: true } : { version: '', error: j.error ?? `the harness answered ${r.status}` });
      // the script's item leaves "Waiting for you" (and the white dot goes) at once, until script.md shows the lock
      if (r.ok) markSent(film, [storySent('script', current)]);
    } catch {
      setLockAsk({ version: '', error: 'the harness did not answer' });
    }
  };
  const [flash, setFlash] = useState<string>();
  const list = Object.values(edits);
  const fp = useMemo(() => fingerprint(md), [md]);
  // script.md changed under the edits (Alma wrote, or another window saved): where each edit lands in the newer text
  const moved = list.length > 0 && !!baseFp && baseFp.fingerprint !== fp;
  const checks: EditCheck[] = useMemo(() => (moved ? checkEdits(md, list) : []), [moved, md, list]);
  const toChoose = checks.filter((c) => c.status === 'changed');
  const gone = checks.filter((c) => c.status === 'gone');
  useEffect(() => { onEdits(list.length + (editing ? 1 : 0)); }, [list.length, editing, onEdits]);
  useTypingAway('script-line', !!editing);
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(undefined), 9000); return () => clearTimeout(t); }, [saved]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(undefined), 900); return () => clearTimeout(t); }, [flash]);

  const scenes = scriptScenes(state);
  // an earlier version kept under "## Earlier drafts": read its scenes the same way
  const earlierMd = shown !== current ? earlierAsScript(md, shown ?? '') : undefined;
  const earlierScenes = earlierMd ? scriptScenes({ ...state, scenes: [], script: { versions: [], lines: [], markdown: earlierMd } }) : undefined;
  // the cards of the version shown, and what changed in them from the version before it (when its text is kept)
  const cards = scriptCards(earlierMd ?? md);
  const before = versions[versions.findIndex((v) => v.version === shown) - 1]?.version;
  const beforeMd = before ? earlierAsScript(md, before) : undefined;
  const cardDiff = beforeMd ? cardChanges(cards, scriptCards(beforeMd)) : cards.map(() => undefined);

  // the timing is not yet redone for this version: only for scenes whose words the user changed in it, and only while
  // the words the page counts differ from the words the scene's own table was written for
  const prev = (state.script?.versions ?? [])[1]?.version;
  const prevRows = currentV?.by === 'you' && prev ? scriptRows(earlierAsScript(md, prev) ?? '') : [];
  const nowRows = prevRows.length ? scriptRows(md) : [];
  const editedScenes = new Set(nowRows.filter((r, i) => prevRows[i] && prevRows[i].words !== r.words).map((r) => r.scene));
  const tableWords = sceneTableWords(md);
  const spoken = (sc: ScriptScene) => sc.rows.filter((r) => r.kind === 'line');
  const words = (sc: ScriptScene) => spoken(sc).reduce((n, r) => n + wc(r.text), 0);
  const notRetimed = (sc: ScriptScene) => editedScenes.has(sc.id) && tableWords[sc.id] !== undefined && tableWords[sc.id] !== words(sc);

  // ---- QC and the lock
  const note = lockNote(md);
  const scriptQC = qcEntry(state, 'script', FILM_TARGET)?.latest;
  const openMisses = scriptQC ? openOf(scriptQC) : [];
  const keepsText = (sub: string) => /^(ids?|id prefix|format|naming|file)$/i.test(sub.trim());
  const textMisses = openMisses.filter((m) => !keepsText(m.sub));
  const idMisses = openMisses.filter((m) => keepsText(m.sub));
  const missSubs = [...new Set(idMisses.map((m) => m.sub))].join(', ');
  const { a, b, fromIds } = chains(state, tasks);
  const waiting = (state.feed?.asks.length ?? 0);
  const running = [...a, ...b].filter((r) => r.dot === 'running').length;
  const picked = [...a, ...b].filter((r) => /^picked/.test(r.status)).length;

  // ---- editing
  const open = (scene: string, index: number, r: Row) => {
    if (lockedV || shown !== current) return;
    const k = keyOf(scene, index);
    setEditing({ key: k, value: edits[k]?.new ?? rowWords(r) });
    if (!baseFp) setBaseFp({ version: current, fingerprint: fp });
    setError(undefined);
  };
  const keep = (scene: string, index: number, r: Row, value: string) => {
    const k = keyOf(scene, index);
    const was = edits[k]?.old ?? rowWords(r);
    setEdits((e) => {
      const n = { ...e };
      if (value.replace(/\s+/g, ' ').trim() === was.replace(/\s+/g, ' ').trim() || !value.trim()) delete n[k];
      else n[k] = { scene, index, kind: r.kind, old: was, new: value.replace(/\s+/g, ' ').trim() };
      return n;
    });
    setEditing(undefined);
  };
  const openCard = (ci: number, part: number, c: ScriptCard) => {
    if (lockedV || shown !== current || c.lines[part] === undefined) return;
    const k = cardKey(ci, part);
    setEditing({ key: k, value: edits[k]?.new ?? c.lines[part] });
    if (!baseFp) setBaseFp({ version: current, fingerprint: fp });
    setError(undefined);
  };
  const keepCard = (ci: number, part: number, c: ScriptCard, value: string) => {
    const k = cardKey(ci, part);
    const was = edits[k]?.old ?? c.lines[part];
    setEdits((e) => {
      const n = { ...e };
      if (value.replace(/\s+/g, ' ').trim() === was.replace(/\s+/g, ' ').trim() || !value.trim()) delete n[k];
      else n[k] = { scene: cardScene(c), index: ci, kind: 'card', part, old: was, new: value.replace(/\s+/g, ' ').trim() };
      return n;
    });
    setEditing(undefined);
  };
  const putBack = () => setEditing(undefined);
  const discard = () => { setEdits({}); setEditing(undefined); setBaseFp(undefined); setError(undefined); };
  const choose = (c: EditCheck, mine: boolean) => {
    setEdits((e) => {
      const n = { ...e };
      delete n[editKey(c)];
      for (const [k, v] of Object.entries(n)) if (v.kind === c.kind && v.scene === c.scene && v.index === c.index && (v.part ?? 0) === (c.part ?? 0)) delete n[k];
      if (mine) n[editKey(c)] = { scene: c.scene, index: c.index, kind: c.kind, ...(c.kind === 'card' ? { part: c.part } : {}), old: c.theirs ?? c.old, new: c.new };
      return n;
    });
  };
  const dropGone = () => setEdits((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => !gone.some((g) => g.scene === v.scene && g.old === v.old))));
  const jump = (k: string) => {
    const el = document.querySelector<HTMLElement>(`[data-row="${k}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    setFlash(k);
  };

  const save = async () => {
    if (!list.length || busy || toChoose.length || gone.length) return;
    // edits whose rows moved in the newer text go to their new places; the save starts from the text on the page now
    const send = moved ? checks.filter((c) => c.status === 'applies').map(({ scene, index, kind, part, old, new: nw }) => ({ scene, index, kind, ...(kind === 'card' ? { part } : {}), old, new: nw })) : list;
    setBusy(true);
    setError(undefined);
    try {
      const r = await fetch(`/api/films/${film}/script`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits: send, base: { version: current, fingerprint: fp } }) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; version?: string; from?: string; changes?: { scene: string; kind?: string }[] };
      if (r.ok && d.version) {
        const ch = d.changes ?? send;
        setSaved({ version: d.version, from: d.from ?? current ?? '', n: send.length, scenes: [...new Set(ch.filter((c) => c.kind !== 'card').map((c) => c.scene))], cards: ch.some((c) => c.kind === 'card') });
        setEdits({}); setBaseFp(undefined); setEditing(undefined);
      } else {
        setError(r.status === 409 ? `${d.error ?? 'script.md changed'}. Your edits are still here; the note above shows where each one goes.` : d.error ?? `Not saved (${r.status})`);
      }
    } catch {
      setError('The harness server is not answering. Your edits are still here.');
    }
    setBusy(false);
  };
  // ⌘S / Ctrl+S anywhere on the page saves the script's edits (the story's own field handles its own)
  const saveRef = useRef(save);
  useLayoutEffect(() => { saveRef.current = save; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!isSaveKey(e)) return;
      const t = e.target as HTMLElement | null;
      if (t?.id === 'story-text') return;
      if (!list.length && !editing) return;
      e.preventDefault();
      void saveRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [list.length, editing]);

  if (!state.script) return null;
  const next = (() => { const p = (current ?? 'v0').slice(1).split('.').map(Number); p[p.length - 1] += 1; return `v${p.join('.')}`; })();
  const unsaved = list.length > 0 || !!editing;
  // the field open now counts once its words differ from what the row says (or said before this sitting)
  const openRow = editing && !editing.key.startsWith('card:') ? (() => { const [sc, i] = editing.key.split(':'); const r = scenes.find((x) => x.id === sc)?.rows[Number(i)]; return r ? { sc, i: Number(i), r } : undefined; })() : undefined;
  const openCardLine = editing?.key.startsWith('card:') ? (() => { const [, ci, part] = editing.key.split(':').map(Number); const c = cards[ci]; return c?.lines[part] !== undefined ? { c, part, words: c.lines[part] } : undefined; })() : undefined;
  const openWas = openRow ? rowWords(openRow.r) : openCardLine?.words;
  const openChanged = openWas !== undefined && !edits[editing!.key] && editing!.value.replace(/\s+/g, ' ').trim() !== openWas.replace(/\s+/g, ' ').trim();
  const count = list.length + (openChanged ? 1 : 0);
  const viewScenes = earlierScenes ?? scenes;
  const readOnly = !!lockedV || shown !== current;

  return (
    <div data-script-panel className="flex min-w-0 max-w-[760px] flex-col gap-5">
      <Card className="overflow-visible">
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3"><span className="lbl">The script</span><span className="font-mono text-[11px] text-sub">script.md</span></div>
        <div role="tablist" aria-label="Script versions" className="scroll flex gap-4 overflow-x-auto border-b border-line px-4">
          {versions.map((v) => (
            <button key={v.version} role="tab" type="button" aria-selected={shown === v.version && !unsaved} onClick={() => setTab(v.version)}
              title={`${v.by === 'you' ? 'Your edit' : 'Written by Alma'}${v.date ? ` · ${fmtDate(v.date)}` : ''}`}
              className={cn('-mb-px flex h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-medium max-[760px]:h-11 transition-colors duration-150 animate-in fade-in-0 slide-in-from-right-2', shown === v.version && !unsaved ? 'border-ink text-ink' : 'border-transparent text-sub hover:text-ink-3')}>
              {v.version}<span className="text-[11px] font-normal text-sub">{v.by === 'you' ? 'you' : 'Alma'}</span>
              {v.locked && <span className="rounded-[4px] border border-edge-strong px-1.5 py-px text-[10.5px] tracking-[0.04em] text-ink">LOCKED</span>}
            </button>
          ))}
          {unsaved && (
            <button role="tab" type="button" aria-selected={shown === current} onClick={() => setTab(undefined)} data-your-edit
              className={cn('-mb-px flex h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-medium max-[760px]:h-11 duration-200 animate-in fade-in-0 slide-in-from-right-2', shown === current ? 'border-ink text-ink' : 'border-transparent text-sub')}>
              Your edit<span className="text-[11px] font-normal text-sub">not saved</span>
            </button>
          )}
        </div>

        {shown !== current ? (
          <div className="flex items-start gap-2.5 px-4 pt-4 text-[12.5px] leading-normal text-ink-3 duration-200 animate-in fade-in-0">
            <IconClock className="mt-0.5 flex-none text-sub" />
            <span className="flex min-w-0 flex-col items-start gap-2">
              <span>{earlierScenes ? `${shown} is an earlier version, kept word for word under “Earlier drafts” in script.md. It is read here, not edited.` : `${shown} is an earlier draft, named in script.md's version note; its text is not kept in the file. The pages read ${current}; ask Alma what changed between them.`}</span>
              {/* the way back from an earlier version, drawn as the flow's other ways back (BackLink.tsx), as the story's */}
              <button type="button" onClick={() => setTab(undefined)} data-version-back
                className="inline-flex h-[30px] flex-none cursor-pointer items-center gap-1 rounded-lg border border-edge px-2.5 text-[12.5px] font-medium text-ink transition-colors duration-150 hover:bg-raised max-[760px]:h-11"><IconChevronLeft size={13} />Back to {current}</button>
            </span>
          </div>
        ) : (
          <>
            <Reveal open={moved}>
              <div role="status" data-script-moved className="mx-4 mt-4 flex items-start gap-2.5 rounded-[10px] border border-edge bg-panel px-3.5 py-2.5 text-[12.5px] leading-normal text-ink-3">
                <Dot state="queued" className="mt-1.5" />
                <div className="flex flex-col gap-1">
                  <span>
                    {current === baseFp?.version ? 'script.md changed' : `${current} was written`} while you were typing. Your {list.length === 1 ? 'change is' : `${list.length} changes are`} still here, not saved.
                    {checks.length - toChoose.length - gone.length > 0 && ` ${checks.length - toChoose.length - gone.length === 1 ? 'One goes' : `${checks.length - toChoose.length - gone.length} go`} on top of it as ${checks.length - toChoose.length - gone.length === 1 ? 'it is' : 'they are'}.`}
                    {toChoose.length > 0 && ` ${toChoose.map((c) => c.label).join(', ')}: changed there too; choose which words stay.`}
                    {gone.length > 0 && ` ${gone.map((c) => `“${c.new}”`).join(', ')}: its line is no longer there.`}
                  </span>
                  <span className="flex flex-wrap gap-x-4">
                    {gone.length > 0 && <button type="button" onClick={dropGone} className="cursor-pointer text-ink underline underline-offset-2">Drop {gone.length === 1 ? 'it' : 'them'}</button>}
                    <button type="button" onClick={discard} className="cursor-pointer text-sub underline underline-offset-2 hover:text-ink">Discard mine</button>
                  </span>
                </div>
              </div>
            </Reveal>

            {lockedV ? (
              <div role="status" data-lock-block className="mx-4 mt-4 flex gap-3 rounded-lg border border-faint bg-panel px-3.5 py-3">
                <IconCheck size={13} className="mt-0.5 flex-none text-ink" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] font-medium tracking-[0.01em]">
                    LOCKED · {lockedV.version}{lockedV.date ? ` · ${fmtDate(lockedV.date)}` : ''}
                    {idMisses.length > 0 && <span className="font-normal text-sub"> · {idMisses.length} QC {idMisses.length === 1 ? 'miss' : 'misses'} open ({missSubs})</span>}
                  </span>
                  <span className="text-[12.5px] leading-normal text-sub">
                    Locked{lockedV.date ? ` ${fmtDate(lockedV.date)}` : ''}{note?.words ? `, your words: “${note.words}”` : ''}. Every later stage reads it word for word{idMisses.length ? `; the open ${idMisses.length === 1 ? 'miss does' : 'misses do'} not change the text` : ''}.{note?.change ? ` The one change from the version before: ${note.change}` : ''}
                  </span>
                  {textMisses.length > 0 && (
                    <span className="text-[12.5px] leading-normal text-ink-3">
                      <span aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-bad align-middle" />
                      {textMisses.length} open QC {textMisses.length === 1 ? 'miss changes' : 'misses change'} the text ({[...new Set(textMisses.map((m) => m.sub))].join(', ')}): a lock cannot stand with {textMisses.length === 1 ? 'it' : 'them'}. Unlock to fix, or tell Alma why it stays.
                    </span>
                  )}
                  <span data-chains className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[12.5px] text-ink-3">
                    {running > 0 && <Dot state="running" />}
                    The lock started the two chains, places and people{running || picked ? `: ${[running ? `${running} running` : '', picked ? `${picked} picked` : ''].filter(Boolean).join(', ')}` : ''}.
                    <Link href={base} className="inline-flex min-h-6 items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">On the film’s board</Link>
                  </span>
                </div>
              </div>
            ) : current && (
              <div data-lock-block className="mx-4 mt-4 flex flex-wrap items-start gap-3 rounded-lg border border-dashed border-edge-strong px-3.5 py-3">
                <IconClock size={14} className="mt-0.5 flex-none text-sub" />
                <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
                  <span className="text-[13px] font-medium">{current} · draft{currentV?.date ? ` · ${fmtDate(currentV.date)}` : ''}{currentV?.by === 'you' ? ' · your edit' : ''}</span>
                  <span className="text-[12.5px] leading-normal text-sub">
                    The lock is the go for the first round of assets: location style images, faces, clothing, voices and the previz start without asking again.
                    {openMisses.length > 0 && ` Script QC has ${openMisses.length} open ${openMisses.length === 1 ? 'miss' : 'misses'}${textMisses.length ? `, ${textMisses.length} of them changing the text` : openMisses.length === 1 ? ' that does not change the text' : ' that do not change the text'}.`}
                  </span>
                </div>
                <span className="flex flex-col items-end gap-1 max-[520px]:w-full max-[520px]:items-start">
                  <Btn primary className="max-[760px]:h-11" disabled={unsaved || lockAsk?.version === current} title={unsaved ? 'Save or discard your edits first' : `Tells Alma to lock ${current}, at once`} data-lock
                    onClick={() => void lock()}>{lockAsk?.version === current && <Dot state="running" />}{lockAsk?.version === current && lockAsk.sent ? `Lock ${current} sent` : `Lock ${current}`}</Btn>
                  <Reveal open={unsaved}><span className="block pt-0.5 text-[11.5px] text-sub">Save or discard your edits first</span></Reveal>
                  <Reveal open={lockAsk?.version === current && !!lockAsk.sent}><span className="block pt-0.5 text-[11.5px] text-sub" data-lock-sent>Sent to Alma. She locks it and says so in the thread.</span></Reveal>
                  <Reveal open={!!lockAsk?.error}><span className="block pt-0.5 text-[11.5px] text-sub" role="alert" data-lock-error>Not sent: {lockAsk?.error}. <button type="button" className="cursor-pointer text-ink underline underline-offset-2" onClick={() => void lock()}>Try again</button></span></Reveal>
                </span>
                <div className="flex w-full flex-col border-t border-line pt-2.5">
                  <button type="button" onClick={() => setChainsOpen((o) => !o)} aria-expanded={chainsOpen} data-chains
                    className="flex min-h-8 w-full cursor-pointer items-start gap-2 text-left max-[760px]:min-h-11 text-[12.5px] leading-normal text-ink-3">
                    <IconLink className="mt-1 flex-none text-sub" />
                    <span className="flex-1">
                      Locking starts two chains at once: places{a.length ? ` (${a.length} style ${a.length === 1 ? 'image' : 'images'})` : ''} and people{b.length ? ` (${fromIds ? `${b.length - 1} faces, then clothing and voices` : `${b.length} steps`})` : ''}.
                      {' '}{waiting ? `Then the gate: ${waiting} ${waiting === 1 ? 'pick' : 'picks'} waiting.` : 'The gate is clear.'}
                    </span>
                    <span className="flex flex-none items-center gap-1 text-ink">{chainsOpen ? 'Hide' : 'What starts'}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={cn('transition-transform duration-200', chainsOpen && 'rotate-180')}><path d="M6 9l6 6 6-6" /></svg>
                    </span>
                  </button>
                  <Reveal open={chainsOpen}>
                    <div className="grid grid-cols-2 gap-3.5 pt-3 max-[620px]:grid-cols-1">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between"><span className="text-[13px] font-medium">Chain A · places</span><span className="text-[11.5px] text-sub">style image</span></div>
                        {a.length ? a.map((r) => <ChainRowView key={r.label} r={r} />) : <span className="text-[12px] text-sub">No locations yet</span>}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between"><span className="text-[13px] font-medium">Chain B · people</span><span className="text-[11.5px] text-sub">faces, clothing, voices</span></div>
                        {b.length ? b.map((r) => <ChainRowView key={r.label} r={r} />) : <span className="text-[12px] text-sub">No characters yet</span>}
                      </div>
                      <span className="col-span-full text-[12px] text-sub">The two chains meet at your picks. After the lock this line links to the film’s board, where they run.</span>
                    </div>
                  </Reveal>
                </div>
              </div>
            )}

            {lockedV ? (
              <p className="m-0 flex items-center gap-2 px-4 pt-3 text-[12.5px] text-sub"><IconLock className="flex-none" />Click a line to ask Alma about it.
                <Btn className="ml-auto max-[760px]:h-11" onClick={() => ui.about({ id: `unlock:${lockedV.version}`, label: `Unlock · script ${lockedV.version}` }, `Unlock script ${lockedV.version} to change a line. The user says which line and how`, 'Which line, and how should it change…')}>Unlock to change a line</Btn>
              </p>
            ) : saved ? (
              <div role="status" className="flex flex-col gap-1 px-4 pt-3 text-[12.5px] leading-normal duration-200 animate-in fade-in-0">
                <span className="flex items-center gap-2 text-ink-3"><Dot state="done" />Saved as {saved.version}, your edit: {saved.n} {saved.n === 1 ? 'change' : 'changes'}. {saved.from} is kept word for word under “Earlier drafts” in script.md.</span>
                <span className="pl-3.5 text-sub">Alma has your {saved.n === 1 ? 'change' : 'changes'}: {[saved.scenes.length ? `she re-times ${saved.scenes.join(' and ')} and checks the lines` : '', saved.cards ? `${saved.scenes.length ? 'and ' : 'she '}carries the card’s new words through the script` : ''].filter(Boolean).join(' ')}.</span>
              </div>
            ) : (
              <p className="m-0 flex items-start gap-2 px-4 pt-3 text-[12.5px] leading-normal text-sub"><IconPen className="mt-0.5 flex-none" />Click a line to change its words. New lines and cuts go through Alma.</p>
            )}
          </>
        )}

        <div className="pt-1.5">
          {viewScenes.map((sc, si) => {
            const file = state.scenes.find((x) => x.id === sc.id);
            const drift = shown === current && file?.seconds !== undefined && sc.scriptSeconds !== undefined && file.seconds !== sc.scriptSeconds;
            const len = sc.seconds ?? sc.scriptSeconds;
            const nChanged = list.filter((e) => e.kind !== 'card' && e.scene === sc.id).length;
            const choosing = toChoose.filter((c) => c.kind !== 'card' && c.scene === sc.id);
            const cardsAt = (pick: (c: ScriptCard) => boolean) => cards.map((c, ci) => ({ c, ci })).filter(({ c }) => pick(c))
              .map(({ c, ci }) => {
                const ask = () => ui.addChip({ id: `card:${c.kind}:${ci}`, label: `${c.label} · ${c.where}` });
                const parts = c.lines.map((_, part) => {
                  const k = cardKey(ci, part);
                  const clash = toChoose.find((x) => x.kind === 'card' && x.index === ci && (x.part ?? 0) === part);
                  return { key: k, edit: shown === current ? edits[k] : undefined, editing: editing?.key === k && shown === current ? editing.value : undefined, flash: flash === k, clash };
                });
                return (
                  <CardBlock key={`card-${shown}-${ci}`} card={c} change={cardDiff[ci]} version={shown} inline={c.place.in !== undefined} onAsk={ask}
                    editable={!readOnly} parts={parts} asked={ui.hasChip(`card:${c.kind}:${ci}`)} youVsWhom={current === baseFp?.version ? 'now' : 'alma'}
                    onOpen={(part) => openCard(ci, part, c)} onChange={(part, v) => setEditing({ key: cardKey(ci, part), value: v })}
                    onKeep={(part, v) => keepCard(ci, part, c, v)} onPutBack={putBack}
                    onSave={(part, v) => { keepCard(ci, part, c, v); setTimeout(() => void saveRef.current(), 0); }}
                    onChoose={(cl, mine) => choose(cl, mine)} />
                );
              });
            // a card placed by a scene this version does not have goes after the last scene
            const stray = si === viewScenes.length - 1 ? cardsAt((c) => ![c.place.before, c.place.after, c.place.in].some((id) => id && viewScenes.some((x) => x.id === id))) : [];
            const after = cardsAt((c) => c.place.after === sc.id);
            const lastBlock = si === viewScenes.length - 1 && !after.length && !stray.length;
            return (
              <div key={sc.id} className="contents">
              {cardsAt((c) => c.place.before === sc.id)}
              <div data-scene={sc.id} className={cn('border-line px-4 pb-3.5', !lastBlock && 'border-b')}>
                <button type="button" onClick={() => ui.addChip({ id: `scene:${sc.id}`, label: `${sc.id} · ${sc.title}` })} {...refData({ kind: 'scene', label: sc.id, scene: sc.id, title: sc.title, page: 'story' })}
                  className="sticky top-14 z-[1] -mx-4 mb-1.5 flex min-h-11 max-[760px]:top-0 w-[calc(100%+2rem)] cursor-pointer items-baseline gap-2 bg-panel px-4 pb-1.5 pt-3.5 text-left">
                  <span className="font-mono text-[12px] text-sub">{sc.id}</span>
                  <span className="text-[14px] font-semibold">{sc.title}</span>
                  <span className="ml-auto flex items-center text-[12px] text-sub">
                    {drift
                      ? <>{[sc.location, `${sc.scriptSeconds} s in the script table · ${file!.seconds} s in ${sc.id}-scene.md`].filter(Boolean).join(' · ')}<ToConfirm title={`script.md's table says ${sc.scriptSeconds} s; ${filmPath(state, `${file!.folder}/${sc.id}-scene.md`)} says ${file!.seconds} s. The scene file is the truth for length; the script table needs updating.`} /></>
                      : [sc.location, len !== undefined ? `${len} s` : ''].filter(Boolean).join(' · ')}
                    {shown === current && notRetimed(sc) && <span title="The words changed since this scene's timing table was written" className="ml-1"> · not re-timed yet</span>}
                    {nChanged + choosing.length > 0 && <span className="ml-1 text-ink"> · {choosing.length ? `${choosing.length} to choose` : `${nChanged} ${nChanged === 1 ? 'change' : 'changes'}`}</span>}
                  </span>
                </button>
                <div className="flex flex-col">
                  {sc.rows.map((r, i) => {
                    const k = keyOf(sc.id, i);
                    const e = shown === current ? edits[k] : undefined;
                    const isEditing = editing?.key === k && shown === current;
                    const clash = choosing.find((c) => c.index === i);
                    const text = e?.new ?? rowWords(r);
                    const grid = 'grid grid-cols-[32px_96px_minmax(0,1fr)] gap-x-2 max-[760px]:grid-cols-[30px_minmax(0,1fr)]';
                    const num = r.kind === 'line'
                      ? <span className="pl-1 font-mono text-[11.5px] leading-[1.9] text-sub">{r.n}</span>
                      : <span className="col-start-2 whitespace-nowrap pt-px font-mono text-[11.5px] text-sub max-[760px]:col-start-1 max-[760px]:text-[11.5px]">{r.seconds}</span>;
                    const who = r.kind === 'line' && <span className="text-[11.5px] font-medium uppercase leading-[1.9] tracking-[0.04em] text-sub">{r.speaker}</span>;
                    if (isEditing) {
                      const before = wc(e?.old ?? rowWords(r));
                      const now = wc(editing.value);
                      return (
                        <div key={r.id} data-row={k} data-editing className={cn(grid, 'relative py-1.5 pr-2 text-[13.5px] leading-[1.6] duration-150 animate-in fade-in-0')}>
                          {num}{who}
                          <span className={cn('min-w-0', r.kind === 'line' ? 'max-[760px]:col-start-2' : 'col-start-3 max-[760px]:col-start-2')}>
                            {r.kind === 'line' && r.direction && <span className="italic text-sub">({r.direction}) </span>}
                            <LineField value={editing.value} italic={r.kind === 'action'} label={`${label(sc.id, r, sc.rows)}${r.kind === 'line' ? `, ${r.speaker}` : ''}`}
                              onChange={(v) => setEditing({ key: k, value: v })} onKeep={(v) => keep(sc.id, i, r, v)} onPutBack={putBack} onSave={(v) => { keep(sc.id, i, r, v); setTimeout(() => void saveRef.current(), 0); }} />
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-sub">
                              <span><kbd className="rounded border border-edge-strong px-1 font-mono text-[11px]">⏎</kbd> keep</span>
                              <span><kbd className="rounded border border-edge-strong px-1 font-mono text-[11px]">esc</kbd> put back</span>
                              <span>{now === before ? `${now} ${now === 1 ? 'word' : 'words'}, as before.` : `Was ${before} ${before === 1 ? 'word' : 'words'}, now ${now}.`}{r.kind === 'action' ? ' The seconds stay; Alma re-times after the save.' : ' Alma re-times after the save.'}</span>
                              <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => ui.addChip({ id: `line:${r.id}`, label: `${sc.id} · ${r.kind === 'line' ? `line ${r.n}` : 'direction'}`, ref: r.id })} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">Ask Alma about it</button>
                            </span>
                          </span>
                        </div>
                      );
                    }
                    if (clash) {
                      return (
                        <div key={r.id} data-row={k} data-choose className={cn(grid, 'py-1.5 pr-2 text-[13.5px] leading-[1.6]')}>
                          {num}{who}
                          <div className={cn('flex flex-col gap-1.5 rounded-lg border border-edge-strong bg-well px-3 py-2', r.kind === 'line' ? 'max-[760px]:col-start-2' : 'col-start-3 max-[760px]:col-start-2')}>
                            <span className="text-[12px] text-sub">{current === baseFp?.version ? 'This line changed in script.md too.' : `Alma changed this line too, in ${current}.`} Which words stay?</span>
                            <span><span className="mr-1.5 text-[11.5px] text-sub">Yours</span>“{clash.new}”</span>
                            <span><span className="mr-1.5 text-[11.5px] text-sub">{current === baseFp?.version ? 'Now' : 'Alma’s'}</span>“{clash.theirs}”</span>
                            <span className="mt-0.5 flex gap-2"><Btn onClick={() => choose(clash, true)}>Keep mine</Btn><Btn onClick={() => choose(clash, false)}>Take {current === baseFp?.version ? 'the newer' : 'Alma’s'}</Btn></span>
                          </div>
                        </div>
                      );
                    }
                    const inside = cardsAt((c) => c.place.in === sc.id && c.place.afterRow === i);
                    const body = (
                      <span className={cn('min-w-0', r.kind === 'line' ? 'text-ink max-[760px]:col-start-2' : 'col-start-3 italic text-sub max-[760px]:col-start-2')}>
                        {r.kind === 'line' && r.direction && <span className="italic text-sub">({r.direction}) </span>}
                        {r.kind === 'line' ? `“${text}”` : text}
                        {e && <span className="mt-0.5 block text-[12px] not-italic text-sub line-through decoration-faint">{r.kind === 'line' ? `“${e.old}”` : e.old}</span>}
                      </span>
                    );
                    if (readOnly && shown !== current) return <div key={r.id} className="contents"><div className={cn(grid, 'py-1.5 pr-2 text-[13.5px] leading-[1.6]')}>{num}{who}{body}</div>{inside}</div>;
                    return (
                      <div key={r.id} className="contents">
                      <button type="button" data-row={k} data-line={r.kind === 'line' ? r.id : undefined} {...refData(lineRefOf(sc.id, r, text, shown))}
                        aria-label={lockedV ? undefined : `${label(sc.id, r, sc.rows)}${r.kind === 'line' ? `, ${r.speaker}` : ''}: change its words`}
                        onClick={() => (lockedV ? ui.addChip({ id: `line:${r.id}`, label: `${sc.id} · ${r.kind === 'line' ? `line ${r.n}` : 'direction'}`, ref: r.id }) : open(sc.id, i, r))}
                        className={cn(grid, 'group relative cursor-pointer rounded-md py-1.5 pr-9 text-left max-[760px]:min-h-11 text-[13.5px] leading-[1.6] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-raised focus-visible:bg-tile focus-visible:shadow-[0_0_0_2px_#A1A1AA]',
                          ui.hasChip(`line:${r.id}`) && 'bg-raised', flash === k && 'shadow-[0_0_0_2px_#A1A1AA]',
                          e && 'before:absolute before:-left-2.5 before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-sm before:bg-ink')}>
                        {num}{who}{body}
                        {!lockedV && <span aria-hidden="true" className="absolute right-0 top-0 flex size-11 items-center justify-center text-sub opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 max-[760px]:opacity-60"><IconPen /></span>}
                      </button>
                      {inside}
                      </div>
                    );
                  })}
                </div>
              </div>
              {after}
              {stray}
              </div>
            );
          })}
        </div>
      </Card>

      <SaveBar name="script" open={count > 0 && shown === current} busy={busy} error={error}
        text={<>{count} {count === 1 ? 'change' : 'changes'}, not saved{toChoose.length ? ` · ${toChoose.length} to choose` : ''} · {list.map((e, i) => {
          const sc = scenes.find((s) => s.id === e.scene);
          const r = e.kind === 'card' ? undefined : sc?.rows[e.index];
          const c = e.kind === 'card' ? cards[e.index] : undefined;
          return <span key={editKey(e)}>{i > 0 && ', '}<button type="button" data-jump onClick={() => jump(editKey(e))} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">{c ? cardLineLabel(c, e.part ?? 0) : r ? label(e.scene, r, sc!.rows) : e.scene}</button></span>;
        })}{openChanged && (openRow || openCardLine) && <span>{list.length > 0 && ', '}<button type="button" data-jump onClick={() => jump(editing!.key)} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">{openRow ? label(openRow.sc, openRow.r, scenes.find((x) => x.id === openRow.sc)!.rows) : cardLineLabel(openCardLine!.c, openCardLine!.part)}</button></span>}</>}
        sub={toChoose.length ? `Choose for ${toChoose.map((c) => c.label).join(', ')} first, then save as ${next}.` : gone.length ? 'One of your changes has no line to go on; drop it to save the rest.' : `A save makes ${next}, marked as your edit; ${current} is kept. Alma is told the old and new words.`}
        saveLabel={`Save as ${next}`} saveDisabled={toChoose.length > 0 || gone.length > 0} saveTitle={toChoose.length ? 'Choose which words stay first' : undefined}
        onSave={() => void save()} onDiscard={discard} />

      {viewScenes.length > 0 && shown === current && <TimingCard scenes={viewScenes} cards={cards} notRetimed={notRetimed} words={words} spoken={spoken} />}
    </div>
  );
}

/** One of a card's lines as the page holds it: its edit of this sitting, its field while open, a choice to make. */
interface CardPart { key: string; edit?: ScriptEdit; editing?: string; flash: boolean; clash?: EditCheck }

/** A card of the script (title card, a card between scenes, end card), in its place: its words on its two lines, its
 *  length and where it sits. Before the lock its words are edited as a line's are: each of its lines is a row of its own
 *  with the lines' hover, focus ring and pen, a click opens the same field (Enter keeps, Esc puts back, ⌘S saves), and
 *  a kept change shows the bar and the old words struck through. Locked or an earlier version: read only, a click hands
 *  it to Alma. Changed from the version before: marked as a changed line is. Between scenes it is a quiet block of its
 *  own; inside a scene, a row among the lines. */
function CardBlock({ card, change, version, inline, onAsk, editable, parts, asked, youVsWhom, onOpen, onChange, onKeep, onPutBack, onSave, onChoose }: {
  card: ScriptCard; change?: CardChange; version?: string; inline: boolean; onAsk: () => void;
  editable: boolean; parts: CardPart[]; asked: boolean; youVsWhom: 'now' | 'alma';
  onOpen: (part: number) => void; onChange: (part: number, v: string) => void; onKeep: (part: number, v: string) => void; onPutBack: () => void;
  onSave: (part: number, v: string) => void; onChoose: (c: EditCheck, mine: boolean) => void;
}) {
  const was = change?.was;
  const meta = (
    <span className="flex flex-wrap items-baseline gap-x-1 text-[12px] text-sub">
      {card.seconds !== undefined && <span>{card.seconds} s{change?.seconds && was?.seconds !== undefined && <span className="ml-1 line-through decoration-faint">{was.seconds} s</span>}</span>}
      {card.where && <span>{card.seconds !== undefined && '· '}{card.where}{change?.place && was?.where && <span className="ml-1 line-through decoration-faint">{was.where}</span>}</span>}
      {change && <span className="text-ink">· {change.isNew ? 'new' : 'changed'}{version ? ` in ${version}` : ''}</span>}
    </span>
  );
  const look = (part: number) => (part === 0 ? 'text-[14px] font-medium leading-[1.5] text-ink' : 'text-[13px] italic leading-[1.5] text-ink-3');
  const struck = change?.words && was && <span className="mt-0.5 text-[12px] text-sub line-through decoration-faint">{was.lines.filter((l, k) => l !== card.lines[k]).join(' / ')}</span>;
  const tag = <span className={cn('text-[11.5px] font-medium uppercase tracking-[0.04em] text-sub', inline && 'hidden max-[760px]:block')}>{card.label}</span>;
  const aria = `${card.label}, ${card.where}: ${card.lines.join(', then ')}. Cards change through Alma: ask her about it`;

  if (!editable) {
    const words = (
      <span className="flex min-w-0 flex-col">
        <span className={look(0)}>{card.lines[0]}</span>
        {card.lines[1] && <span className={look(1)}>{card.lines[1]}</span>}
        {struck}
      </span>
    );
    const box = cn('group relative w-full cursor-pointer rounded-lg border border-edge bg-well text-left outline-none transition-[background-color,box-shadow] duration-150 hover:bg-raised focus-visible:shadow-[0_0_0_2px_#A1A1AA] max-[760px]:min-h-11',
      change && 'before:absolute before:-left-2.5 before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-sm before:bg-ink');
    const ask = <span aria-hidden="true" className="absolute right-3 top-2.5 text-[11.5px] text-sub opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 max-[760px]:hidden">Ask Alma</span>;
    const button = (
      <button type="button" onClick={onAsk} aria-label={aria} title="Click to ask Alma about the card" className={cn(box, inline ? 'col-start-3 flex flex-col gap-1 px-3 py-2 max-[760px]:col-start-1 max-[760px]:col-span-2' : 'flex flex-col gap-1 px-3.5 py-2.5')}>
        {tag}{words}{meta}{ask}
      </button>
    );
    return inline ? (
      <div data-card={card.kind} className="grid grid-cols-[32px_96px_minmax(0,1fr)] gap-x-2 py-1.5 pr-2 duration-200 animate-in fade-in-0 max-[760px]:grid-cols-[30px_minmax(0,1fr)]">
        <span className="col-start-2 whitespace-nowrap pt-2.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-sub max-[760px]:hidden">{card.label}</span>
        {button}
      </div>
    ) : <div data-card={card.kind} className="border-b border-line px-4 py-3 duration-200 animate-in fade-in-0">{button}</div>;
  }

  // editable: the card is a quiet box; each of its lines is a row the user clicks to change
  const edited = parts.some((p) => p.edit);
  const lineOf = (part: number) => {
    const p = parts[part];
    const words = p.edit?.new ?? card.lines[part];
    const name = cardLineLabel(card, part);
    if (p.editing !== undefined) {
      const before = wc(p.edit?.old ?? card.lines[part]), now = wc(p.editing);
      return (
        <div key={p.key} data-row={p.key} data-editing className="flex flex-col py-0.5 duration-150 animate-in fade-in-0">
          <LineField value={p.editing} italic={part === 1} label={name} onChange={(v) => onChange(part, v)} onKeep={(v) => onKeep(part, v)} onPutBack={onPutBack} onSave={(v) => onSave(part, v)} />
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-sub">
            <span><kbd className="rounded border border-edge-strong px-1 font-mono text-[11px]">⏎</kbd> keep</span>
            <span><kbd className="rounded border border-edge-strong px-1 font-mono text-[11px]">esc</kbd> put back</span>
            <span>{now === before ? `${now} ${now === 1 ? 'word' : 'words'}, as before.` : `Was ${before} ${before === 1 ? 'word' : 'words'}, now ${now}.`} The card’s length and place stay; ask Alma to move it.</span>
            <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={onAsk} className="inline-flex min-h-6 cursor-pointer items-center text-ink underline underline-offset-2 max-[760px]:min-h-11">Ask Alma about it</button>
          </span>
        </div>
      );
    }
    if (p.clash) {
      return (
        <div key={p.key} data-row={p.key} data-choose className="flex flex-col gap-1.5 rounded-lg border border-edge-strong bg-panel px-3 py-2 text-[13.5px]">
          <span className="text-[12px] text-sub">{youVsWhom === 'now' ? 'This line of the card changed in script.md too.' : 'Alma changed this line of the card too.'} Which words stay?</span>
          <span><span className="mr-1.5 text-[11.5px] text-sub">Yours</span>“{p.clash.new}”</span>
          <span><span className="mr-1.5 text-[11.5px] text-sub">{youVsWhom === 'now' ? 'Now' : 'Alma’s'}</span>“{p.clash.theirs}”</span>
          <span className="mt-0.5 flex gap-2"><Btn onClick={() => onChoose(p.clash!, true)}>Keep mine</Btn><Btn onClick={() => onChoose(p.clash!, false)}>Take {youVsWhom === 'now' ? 'the newer' : 'Alma’s'}</Btn></span>
        </div>
      );
    }
    return (
      <button key={p.key} type="button" data-row={p.key} data-card-line={part} aria-label={`${name}: change its words`} onClick={() => onOpen(part)}
        className={cn('group/line relative -mx-1.5 flex min-w-0 cursor-pointer flex-col rounded-md px-1.5 py-0.5 pr-9 text-left outline-none transition-[background-color,box-shadow] duration-150 hover:bg-raised focus-visible:bg-tile focus-visible:shadow-[0_0_0_2px_#A1A1AA] max-[760px]:min-h-11 max-[760px]:justify-center',
          p.flash && 'shadow-[0_0_0_2px_#A1A1AA]')}>
        <span key={words} className={cn(look(part), 'duration-200 animate-in fade-in-0')}>{words}</span>
        {p.edit && <span className="mt-0.5 block text-[12px] not-italic font-normal text-sub line-through decoration-faint duration-200 animate-in fade-in-0">{p.edit.old}</span>}
        <span aria-hidden="true" className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-sub opacity-0 transition-opacity duration-150 group-hover/line:opacity-100 group-focus-visible/line:opacity-100 max-[760px]:opacity-60"><IconPen /></span>
      </button>
    );
  };
  const box = cn('relative flex w-full flex-col gap-1 rounded-lg border border-edge bg-well text-left transition-[background-color] duration-150',
    asked && 'bg-raised', (change || edited) && 'before:absolute before:-left-2.5 before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-sm before:bg-ink');
  const body = (
    <>
      {tag}
      <span className="flex min-w-0 flex-col">{card.lines.map((_, part) => lineOf(part))}{struck}</span>
      {meta}
    </>
  );
  return inline ? (
    <div data-card={card.kind} data-card-editable className="grid grid-cols-[32px_96px_minmax(0,1fr)] gap-x-2 py-1.5 pr-2 duration-200 animate-in fade-in-0 max-[760px]:grid-cols-[30px_minmax(0,1fr)]">
      <span className="col-start-2 whitespace-nowrap pt-2.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-sub max-[760px]:hidden">{card.label}</span>
      <div className={cn(box, 'col-start-3 px-3 py-2 max-[760px]:col-start-1 max-[760px]:col-span-2')}>{body}</div>
    </div>
  ) : (
    <div data-card={card.kind} data-card-editable className="border-b border-line px-4 py-3 duration-200 animate-in fade-in-0">
      <div className={cn(box, 'px-3.5 py-2.5')}>{body}</div>
    </div>
  );
}

/** The words of one row, in a field that grows with them. Enter keeps, Escape puts back, ⌘S keeps and saves. */
function LineField({ value, italic, label, onChange, onKeep, onPutBack, onSave }: { value: string; italic: boolean; label: string; onChange: (v: string) => void; onKeep: (v: string) => void; onPutBack: () => void; onSave: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gone = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // on a phone the keyboard takes the bottom of the screen: keep the field and its words above it
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  }, []);
  return (
    <textarea ref={ref} value={value} rows={1} aria-label={label} spellCheck data-line-field
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (isSaveKey(e)) { e.preventDefault(); gone.current = true; onSave(value); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gone.current = true; onKeep(value); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); gone.current = true; onPutBack(); }
      }}
      onBlur={() => { if (!gone.current) onKeep(value); }}
      className={cn('block min-h-9 w-full resize-none rounded-[7px] border border-sub/70 max-[760px]:min-h-11 bg-well px-2.5 py-1.5 text-[13.5px] leading-[1.6] text-ink shadow-[0_0_0_3px_rgba(161,161,170,0.12)] outline-none', italic && 'italic text-ink-3')} />
  );
}

function TimingCard({ scenes, cards, notRetimed, words, spoken }: { scenes: ScriptScene[]; cards: ScriptCard[]; notRetimed: (s: ScriptScene) => boolean; words: (s: ScriptScene) => number; spoken: (s: ScriptScene) => Row[] }) {
  const action = (sc: ScriptScene) => sc.rows.reduce((n, r) => n + (r.kind === 'action' && r.seconds ? parseFloat(r.seconds) : 0), 0);
  const len = (sc: ScriptScene) => sc.seconds ?? sc.scriptSeconds;
  const fromScript = scenes.filter((sc) => sc.seconds === undefined && sc.scriptSeconds !== undefined).length;
  // the cards with a length count in the film's clock, in their place (one inside a scene comes after that scene's row)
  type Entry = { sc: ScriptScene } | { card: ScriptCard };
  const timed = cards.filter((c) => c.seconds !== undefined);
  const entries: Entry[] = scenes.flatMap((sc): Entry[] => [
    ...timed.filter((c) => c.place.before === sc.id).map((card) => ({ card })),
    { sc },
    ...timed.filter((c) => c.place.in === sc.id || c.place.after === sc.id).map((card) => ({ card })),
  ]);
  const ends = entries.reduce<number[]>((a, e) => [...a, (a[a.length - 1] ?? 0) + ('sc' in e ? len(e.sc) ?? 0 : e.card.seconds ?? 0)], []);
  const clock = ends[ends.length - 1] ?? 0;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><span className="lbl">Timing · whole film</span><span className="font-mono text-[11px] text-sub">{!fromScript ? 'from the scene files' : fromScript === scenes.length ? 'from the script' : '* from the script, the rest from the scene files'}</span></div>
      <div className="scroll overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[420px] border-collapse text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[11.5px] text-sub">
              <th className="pb-2 font-medium">Generation</th><th className="pb-2 text-right font-medium">Lines</th><th className="pb-2 text-right font-medium">Words</th>
              <th className="pb-2 text-right font-medium">Action</th><th className="pb-2 text-right font-medium">≈ s</th><th className="pb-2 text-right font-medium">Ends</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => 'card' in e ? (
              <tr key={`card-${i}`} data-timing-card className="border-t border-line text-sub">
                <td className="py-1.5">{e.card.label} <span className="text-[11.5px]">· {e.card.where}</span></td>
                <td className="text-right">–</td><td className="text-right">–</td>
                <td className="text-right">{e.card.seconds} s</td><td className="text-right">{e.card.seconds}</td>
                <td className="text-right font-mono">{fmtClock(ends[i])}</td>
              </tr>
            ) : ((sc) => (
              <tr key={sc.id} className="border-t border-line">
                <td className="py-1.5"><span className="font-mono text-sub">{sc.id}</span> {sc.title}</td>
                <td className="text-right">{spoken(sc).length}</td><td className="text-right">{words(sc)}</td>
                <td className="text-right">{action(sc)} s</td>
                <td className="text-right" title={notRetimed(sc) ? 'The words changed since this figure was written' : sc.seconds === undefined && sc.scriptSeconds !== undefined ? 'From the script, until the scene file is written' : undefined}>
                  {len(sc) ?? '—'}{sc.seconds === undefined && sc.scriptSeconds !== undefined && <span className="text-sub">*</span>}{notRetimed(sc) && <span className="text-sub">, not re-timed</span>}
                </td>
                <td className="text-right font-mono">{fmtClock(ends[i])}</td>
              </tr>
            ))(e.sc))}
            <tr className="border-t border-edge font-medium">
              <td className="py-1.5">Total</td>
              <td className="text-right">{scenes.reduce((n, sc) => n + spoken(sc).length, 0)}</td>
              <td className="text-right">{scenes.reduce((n, sc) => n + words(sc), 0)}</td>
              <td /><td /><td className="text-right font-mono">{fmtClock(clock)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
