'use client';
// The Renders tab under the timeline (14 Nov 2026, ASKS 39; the user: "when I click render master, I want that to
// be in the same view, maybe lower down in the page"). Every file rendered from the version on screen, newest first:
// the master, its 480p, and every "More renders" file; a render still running at the top,
// with its progress; one that failed says what failed, with "Try again". Under a quiet line, the masters and "More
// renders" files of the other versions, folded when there are more than a few. A click on a row plays that file in
// the page's own player (RenderPlayer.tsx), its own picture and sound. The list itself: renderList.ts.
// Since 14 Nov (ASKS 44) the 480p is made only when asked for: when the version on screen has none, a quiet row at the
// top says so, with "Render it"; at the bottom one line counts the 480p files of other versions already on disk (made
// after every change until then), with their size and the folder's path. Nothing is deleted from here.
// Only this tab, the pill and the master button follow a running render's percent (useCut.ts RendersStore), so the
// page and its timeline are not drawn again on each step.
// A queued or running render has a quiet
// "Cancel" (DELETE …/cut/render, one tap, no confirm: it is free to ask again); the row then reads "Cancelled" with
// "Render it".
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RenderInfo, RenderKind, RenderOptions, RenderState, Timeline } from '@/server/types';
import { fmtDate } from '@/components/lib/format';
import { Btn, Dot } from '@/components/shell/atoms';
import { IconChevronDown } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { baseName } from './renderAsk';
import { clockLen, renderLists, tookWords, type RenderFile, type RenderRow } from './renderList';
import { SoundMark } from './RenderPlayer';
import { useRenderVariants, useRendersLive, type RendersStore } from './useCut';
import { textsSaid, useNameFinal, useRelease } from '@/components/release/ui';

const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${fmtDate(iso)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** A render's own id, the same while it runs and once it is a file: its version, kind and options. */
const idOf = (r: Pick<RenderRow, 'version' | 'kind' | 'tag'>) => `${r.version}/${r.kind}/${r.tag ?? ''}`;
const FOLD = 4;

/** "Render master": its words follow the master's percent, so only this button is drawn again as it runs. `hint`:
 *  what the master would scale up from 480p (fullsize.ts scaledUpWords), said on hover; nothing stops the render.
 *  `stale`: the master there is out of date (masters.ts masterAge): the button reads "Render master again", its
 *  tooltip says why, and a press makes a new master beside the one there. */
export function MasterButton({ store, version, hint, stale, onClick, blocked }: { store: RendersStore; version: string; hint?: string; stale?: string; onClick: () => void; /** Why it cannot render yet (15 Nov). */ blocked?: string }) {
  const m = useRendersLive(store).master;
  const mine = m && m.version === version ? m : undefined;
  const busy = mine?.state === 'queued' || mine?.state === 'running';
  const cap = (x: string) => x.replace(/^\w/, (c) => c.toUpperCase());
  const title = stale && !busy
    ? `${cap(stale)}. Render master again makes a new file beside it; the one there stays.${hint ? ` ${cap(hint)}.` : ''}`
    : `ffmpeg at full size, each shot from the full-size picture the 1080p view shows (no credits)${hint ? `. ${cap(hint)}` : ''}`;
  const words = mine?.state === 'running' ? `Rendering master · ${Math.round(mine.percent ?? 0)}%` : mine?.state === 'queued' ? 'Master queued' : stale ? 'Render master again' : 'Render master';
  // the words fade when they change from one kind to another (not on every percent)
  const kind = mine?.state === 'running' ? 'running' : words;
  return (
    <Btn onClick={onClick} disabled={busy || !!blocked} title={blocked ?? title} data-render-blocked={blocked ? '' : undefined} data-scaled-up={hint ? '' : undefined} data-master-stale={stale && !busy ? '' : undefined}>
      <span key={kind} className="duration-200 animate-in fade-in-0">{words}</span>
    </Btn>
  );
}

/** The files on disk (GET …/cut/renders), asked again when a render of the version on screen lands; with them, the
 *  480p file of each version, counted from the same reading of the folder. */
interface ProxyFile { version: string; bytes: number }
function useRenderFiles(film: string, bump: string): { files?: RenderFile[]; proxies?: ProxyFile[]; error?: string } {
  const [got, setGot] = useState<{ files?: RenderFile[]; proxies?: ProxyFile[]; error?: string }>({});
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`/api/films/${film}/cut/renders`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { files?: RenderFile[]; proxies?: ProxyFile[]; error?: string };
        if (!live) return;
        setGot(r.ok ? { files: j.files ?? [], proxies: j.proxies ?? [] } : (cur) => ({ ...cur, error: j.error ?? `The server answered ${r.status}` }));
      } catch {
        if (live) setGot((cur) => ({ ...cur, error: 'The harness server is not answering' }));
      }
    })();
    return () => { live = false; };
  }, [film, bump]);
  return got;
}

/** "1.4 GB", "820 MB". */
const sizeWords = (bytes: number): string => (bytes >= 1e9 ? `${(Math.round(bytes / 1e8) / 10).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

/** The 480p of a version other than the current one, asked for from here: followed by this tab alone. */
function useOtherProxy(film: string, version: string, on: boolean) {
  const [st, setSt] = useState<RenderState>();
  const mine = on && st?.version === version ? st : undefined;
  const busy = mine?.state === 'queued' || mine?.state === 'running';
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/films/${film}/cut/render/${encodeURIComponent(version)}`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { proxy?: RenderState };
        if (r.ok && j.proxy) setSt(j.proxy);
      } catch { /* the next tick tries again */ }
    }, 1000);
    return () => clearInterval(t);
  }, [busy, film, version]);
  return { state: mine, set: setSt };
}

export function RendersTab({ film, tl, current, edited, seconds, store, recorded, playing, follow, fixture, mediaOf, absOf, onPlay, renderWith, onRenderProxy, onRetryMaster, onRenderAgain, masterHint, masterStale }: {
  film: string;
  /** The version on screen (the one being viewed, else the current one). */
  tl: Timeline;
  /** The current version (a render of another one is older or newer than the cut). */
  current?: string;
  /** The cut has edits since `current` (stage 2): its renders are of the cut as saved, and "Render it" renders this
   *  cut (the page saves it as a version first). */
  edited?: boolean;
  /** The length of the version on screen. */
  seconds: number;
  store: RendersStore;
  /** What the version file recorded of its renders. */
  recorded?: { proxy?: RenderInfo; master?: RenderInfo };
  /** The path of the file in the player, if any. */
  playing?: string;
  /** Goes up each time a render is asked for from the page: the tab brings that render's row into view. */
  follow: number;
  fixture: boolean;
  /** /api/media for a path relative to the film folder, and the file's place on disk. */
  mediaOf: (rel: string, o?: { w?: number; t?: number }) => string;
  absOf: (rel: string) => string;
  onPlay: (r: RenderRow) => void;
  renderWith: (version: string, kind: RenderKind, options: RenderOptions, retry?: boolean) => Promise<{ state?: RenderState; error?: string }>;
  /** The 480p of a version, asked for ("Render it", and "Try again" on one that failed). */
  onRenderProxy: (version: string, o?: { retry?: boolean }) => Promise<{ state?: RenderState; error?: string }>;
  onRetryMaster: () => void;
  /** What a master of the current version would scale up from 480p, in words (the running row says it). */
  masterHint?: string;
  /** The master of the current version, when it is out of date: its path and why (its row says it in amber). */
  masterStale?: { path: string; reason: string };
  /** "Render again" on that row. */
  onRenderAgain: () => void;
}) {
  const shown = tl.version;
  const cutR = useRendersLive(store);
  const { variants, put, refresh } = useRenderVariants(film, shown, true);
  const names = useMemo(() => new Map(tl.tracks.map((t) => [t.id, t.name])), [tl]);
  // the version on screen is the current one: its live 480p and master; an older one viewed: what its file recorded
  const live = shown === current;
  // the 480p of an older version viewed, when it is asked for from here
  const other = useOtherProxy(film, shown, !live);
  const proxyNow = live ? cutR.proxy : other.state;
  const doneKey = [proxyNow, cutR.master, ...(variants ?? [])].filter((s) => s?.state === 'done').map((s) => `${s!.version}/${s!.kind}/${s!.tag ?? ''}`).join('|');
  const { files, proxies, error } = useRenderFiles(film, doneKey);
  const lists = useMemo(() => renderLists({
    shown, width: tl.width, height: tl.height, seconds, proxy: proxyNow, master: live ? cutR.master : undefined, recorded,
    variants: variants ?? [], files: files ?? [], trackName: (id) => names.get(id), masterHint: live ? masterHint : undefined, masterStale: live ? masterStale : undefined,
  }), [shown, tl.width, tl.height, seconds, live, proxyNow, cutR.master, recorded, variants, files, names, masterHint, masterStale]);
  // the version on screen has no 480p (and none is running or failed): the normal state since 14 Nov, said quietly
  const no480 = (live && !!edited) || !lists.shown.some((r) => r.kind === 'proxy' && !r.tag);
  // the 480p files of the other versions, on disk from before (one per change until 14 Nov)
  const oldProxies = useMemo(() => {
    const xs = (proxies ?? []).filter((p) => p.version !== shown);
    return xs.length ? { n: xs.length, bytes: xs.reduce((a, p) => a + p.bytes, 0) } : undefined;
  }, [proxies, shown]);

  // a render that was running and is now a file: its rows light up once (the class is on the new row only)
  const liveIds = lists.shown.filter((r) => r.state === 'running' || r.state === 'queued').map(idOf).join('|');
  const [wasLive, setWasLive] = useState(liveIds);
  const [lit, setLit] = useState<string[]>([]);
  if (wasLive !== liveIds) {
    const ended = wasLive.split('|').filter((x) => x && !liveIds.split('|').includes(x));
    setWasLive(liveIds);
    if (ended.length) setLit((l) => [...l, ...ended]);
  }

  // a render asked for from the page: its row comes into view as soon as it is listed
  const list = useRef<HTMLDivElement>(null);
  const followed = useRef(0);
  useEffect(() => {
    if (!follow || followed.current === follow) return;
    const el = list.current?.querySelector<HTMLElement>('[data-row-state="running"], [data-row-state="queued"]');
    if (!el) return;
    followed.current = follow;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [follow, liveIds]);

  const others = lists.earlier;
  const [openOthers, setOpenOthers] = useState<boolean>();
  const othersOpen = openOthers ?? others.length <= FOLD;
  const newer = others.some((r) => Number(r.version.slice(1)) > Number(shown.slice(1)));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string>();
  // the final (Release, 14 Nov): a whole-film master can be named from its row, until anything is posted
  const rel = useRelease(film, { light: true });
  const nameFinal = useNameFinal(rel.run, film);
  const relFile = rel.view?.file;
  const out = relFile?.platforms.filter((p) => p.send.posted).map((p) => p.name) ?? [];
  const finalLock = out.length ? `${out.join(' and ')} already ${out.length > 1 ? 'have' : 'has'} the final: it cannot change now.` : undefined;
  // naming the final asks Alma for the platforms' texts when there are none: a quiet line says it went
  const [sent, setSent] = useState<string>();
  const makeFinal = async (path: string) => {
    const r = await nameFinal(path);
    setSaid(r.ok ? undefined : r.error);
    setSent(r.ok ? textsSaid(r.texts, r.file.final?.version) : undefined);
  };

  /** "Render it": the 480p of the version on screen. The current one is followed by the page's store (the pill and
   *  this list), an older one viewed by this tab. */
  const askProxy = async (retry = false) => {
    setBusy(true);
    if (!live) other.set({ version: shown, kind: 'proxy', state: 'queued' });
    const got = await onRenderProxy(shown, { retry });
    setBusy(false);
    if (got.error) { setSaid(got.error); if (!live) other.set(undefined); }
    else { setSaid(undefined); if (!live && got.state) other.set(got.state); }
  };

  const retry = async (r: RenderRow) => {
    if (!r.retry) return;
    if (!r.tag && r.kind === 'proxy') { void askProxy(true); return; }
    if (!r.tag) { onRetryMaster(); return; }
    if (!r.retry.options) return;
    setBusy(true);
    const got = await renderWith(r.version, r.retry.kind, r.retry.options, true);
    setBusy(false);
    if (got.error) setSaid(got.error);
    else if (got.state) { put(got.state); setSaid(undefined); }
    refresh();
  };

  /** "Cancel" on a queued or running render: the server stops it (render.ts cancelRender) and answers its state, shown
   *  at once where the row's state comes from (the page's store, this tab's other 480p, or the variants). */
  const cancel = async (r: RenderRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/films/${film}/cut/render`, { method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: r.version, kind: r.kind, ...(r.tag && r.retry?.options ? { options: r.retry.options } : {}) }) });
      const j = (await res.json().catch(() => ({}))) as { cancelled?: boolean; state?: RenderState; said?: string; error?: string };
      if (!res.ok) { setSaid(j.error ?? `The server answered ${res.status}`); return; }
      const st = j.state;
      if (st) {
        if (r.tag) put(st);
        else if (!live && r.kind === 'proxy') other.set(st);
        else store.set((p) => (p[r.kind]?.version === r.version ? { ...p, [r.kind]: st } : p));
      }
      setSaid(j.cancelled ? undefined : j.said);
    } catch {
      setSaid('The harness server is not answering; nothing was cancelled');
    } finally {
      setBusy(false);
      if (r.tag) refresh();
    }
  };

  const row = (r: RenderRow) => (
    <Row key={r.key} r={r} playing={!!r.path && r.path === playing} lit={r.state === 'done' && lit.includes(idOf(r))} aspect={`${tl.width} / ${tl.height}`}
      mediaOf={mediaOf} absOf={absOf} onPlay={onPlay} onRetry={() => void retry(r)} onCancel={() => void cancel(r)} busy={busy} canRetry={!r.tag ? r.kind === 'proxy' || r.version === current : !!r.retry?.options} onAgain={onRenderAgain}
      finalPath={relFile?.final?.path} finalLock={finalLock} onFinal={rel.view ? makeFinal : undefined} />
  );

  return (
    <section aria-label="Renders" data-renders-tab className="flex min-w-0 flex-col gap-3">
      <style>{'@keyframes hh-render-lit { from { background-color: rgb(250 250 250 / 0.09); } to { background-color: transparent; } }'}</style>
      <span className="text-[12.5px] leading-normal text-sub">
        Every file rendered from cut {shown}, newest first. Click one to watch it in the player, with its own sound.{fixture ? ' Sample data: every file plays the same test video.' : ''}
      </span>
      {said && <span className="text-[12px] text-bad duration-200 animate-in fade-in-0">{said}</span>}
      {sent && <span key={sent} role="status" data-texts-sent className="text-[12px] text-sub duration-200 animate-in fade-in-0">{sent}</span>}
      <div ref={list} className="flex flex-col gap-2">
        {no480 && (files || error) && (
          // a quiet row, not a warning: the 480p is made when asked for
          <div data-proxy-ask className="flex items-center gap-3 rounded-[10px] border border-dashed border-line px-2.5 py-1.5 duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
            <span className="w-[30px] flex-none" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{live && edited ? <>480p of the cut with your edits <span className="text-mute">· saved as a version first</span></> : <>480p of cut {shown} <span className="text-mute">· not made yet</span></>}</span>
            <button type="button" disabled={busy} onClick={() => void askProxy()} data-proxy-render title={live && edited ? 'Saves the cut as a version, then renders its 480p from the takes (quick)' : 'A 480p file of this version, rendered from the takes (quick)'}
              className="inline-flex h-7 flex-none cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40">Render it</button>
          </div>
        )}
        {!files && !error && !lists.shown.length ? (
          <p className="m-0 text-[12.5px] text-sub" role="status">Reading…</p>
        ) : !lists.shown.length ? (
          !no480 && <p className="m-0 text-[12.5px] text-sub" role="status">Nothing rendered from {shown} yet. Render master and More renders, at the top of the page, make the files that are listed here.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={`Renders of ${shown}`}>{lists.shown.map(row)}</ul>
        )}
        {error && <p className="m-0 text-[12px] text-sub" role="status">The other versions’ files could not be read: {error}</p>}
      </div>
      {others.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          <button type="button" aria-expanded={othersOpen} onClick={() => setOpenOthers(!othersOpen)} data-renders-earlier
            className="flex cursor-pointer items-center gap-1.5 self-start rounded-md py-0.5 text-[12.5px] text-sub transition-colors duration-150 hover:text-ink">
            <IconChevronDown size={12} className={cn('transition-transform duration-200', !othersOpen && '-rotate-90')} />
            {newer ? 'Other versions' : 'Earlier versions'} <span className="text-mute">· {others.length} {others.length === 1 ? 'file' : 'files'}</span>
          </button>
          <div className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', othersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')} inert={!othersOpen}>
            <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-hidden p-0" aria-label="Renders of other versions">{others.map(row)}</ul>
          </div>
        </div>
      )}
      {oldProxies && <OldProxies n={oldProxies.n} bytes={oldProxies.bytes} path={absOf('cut/renders')} />}
    </section>
  );
}

/** One quiet line under everything: the 480p files of other versions already on disk, their size, the folder. */
function OldProxies({ n, bytes, path }: { n: number; bytes: number; path: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  const copy = async () => { try { await navigator.clipboard.writeText(path); setCopied(true); } catch { /* no clipboard: the path is on hover */ } };
  return (
    <div data-old-proxies className="flex items-center justify-between gap-3 border-t border-line pt-2.5 text-[12px] text-mute duration-200 animate-in fade-in-0">
      <span className="min-w-0 truncate" title={path}>{n} earlier 480p {n === 1 ? 'file' : 'files'} of other versions · {sizeWords(bytes)} in cut/renders</span>
      <button type="button" onClick={() => void copy()} title={path}
        className="inline-flex h-7 w-[78px] flex-none cursor-pointer items-center justify-center rounded-md px-2 text-[12px] text-sub transition-colors duration-150 hover:bg-raised hover:text-ink">
        <span key={copied ? 'y' : 'n'} className="duration-200 animate-in fade-in-0">{copied ? 'Copied' : 'Copy path'}</span>
      </button>
    </div>
  );
}

function Row({ r, playing, lit, aspect, mediaOf, absOf, onPlay, onRetry, onCancel, busy, canRetry, onAgain, finalPath, finalLock, onFinal }: {
  r: RenderRow; playing: boolean; lit: boolean; aspect: string; mediaOf: (rel: string, o?: { w?: number; t?: number }) => string; absOf: (rel: string) => string;
  onPlay: (r: RenderRow) => void; onRetry: () => void; onCancel: () => void; busy: boolean; canRetry: boolean; onAgain: () => void;
  /** The final's path (social/release.json), why it cannot change, and naming this master as the final. */
  finalPath?: string; finalLock?: string; onFinal?: (path: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  const done = r.state === 'done' && !!r.path;
  // a whole film at full size, the master of its version, made from what the page would use now
  const wholeMaster = done && r.kind === 'master' && !r.sound && !r.earlier && !r.stale && /\.mp4$/i.test(r.path!) && !/\.picture\.mp4$/i.test(r.path!);
  const isFinal = !!finalPath && r.path === finalPath;
  const [naming, setNaming] = useState(false);
  const pct = Math.round(r.percent ?? 0);
  const facts = [r.size, clockLen(r.seconds)].filter(Boolean).join(' · ');
  const madeLine = done ? [r.at ? `Made ${when(r.at)}` : '', r.took !== undefined ? `in ${tookWords(r.took)}` : ''].filter(Boolean).join(' ') : '';
  const copy = async () => {
    if (!r.path) return;
    try { await navigator.clipboard.writeText(absOf(r.path)); setCopied(true); } catch { /* no clipboard: the path is on the row */ }
  };
  const link = 'inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[12px] text-sub no-underline transition-colors duration-150 hover:bg-raised hover:text-ink';
  return (
    // a row fades in when it arrives; a click plays the file (the buttons at the right do their own thing)
    <li data-render-row={r.path ?? r.key} data-row-state={r.state} data-version={r.version} data-playing={playing ? '' : undefined}
      onClick={done ? () => onPlay(r) : undefined}
      style={lit ? { animation: 'hh-render-lit 1.8s ease-out' } : undefined}
      className={cn('group/row flex items-center gap-3 rounded-[10px] border px-2.5 py-1.5 transition-[opacity,translate,border-color,background-color] duration-200 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none',
        playing ? 'border-ink bg-raised/60' : 'border-line', done && 'cursor-pointer hover:border-edge-strong')}>
      {/* a still from the file, or a plain mark for a sound file */}
      <span className="relative flex w-[30px] flex-none items-center justify-center overflow-hidden rounded-[5px] border border-line bg-black" style={{ aspectRatio: aspect }}>
        {done && !r.sound ? (
          // eslint-disable-next-line @next/next/no-img-element -- a WebP still from /api/media
          <img alt="" src={mediaOf(r.path!, { w: 160, t: Math.min(2, (r.seconds ?? 4) / 2) })} loading="lazy" onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            className="absolute inset-0 size-full object-cover transition-opacity duration-200" />
        ) : r.sound ? <SoundMark className="text-sub" size={16} /> : null}
        {playing && <span aria-label="Playing" className="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_2px_#000] duration-200 animate-in fade-in-0" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
          <span className="truncate font-medium text-ink" title={r.what}>{r.title}</span>
          {facts && <span className="flex-none text-[12px] text-sub">· {facts}</span>}
        </span>
        {r.state === 'running' || r.state === 'queued' ? (
          <span className="flex flex-col gap-1 pt-0.5">
            <span className="flex items-center gap-1.5 text-[12px] text-sub" data-row-doing>
              <Dot state={r.state === 'running' ? 'running' : 'queued'} />
              {r.state === 'running' ? `Rendering · ${pct}%` : 'Waiting for the render before it'}
            </span>
            {r.warn && <span className="text-[12px] leading-[1.45] text-warn duration-200 animate-in fade-in-0" data-row-warn>{r.warn.replace(/^\w/, (c) => c.toUpperCase())}</span>}
            <span className="h-[2px] w-full max-w-[320px] overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-sub transition-[width] duration-500 ease-out" style={{ width: `${r.state === 'running' ? pct : 0}%` }} />
            </span>
          </span>
        ) : r.state === 'cancelled' ? (
          <span className="text-[12px] text-sub duration-200 animate-in fade-in-0" data-row-cancelled>Cancelled</span>
        ) : r.state === 'failed' ? (
          <span className="text-[12px] leading-[1.45] text-bad" data-row-error>Failed: {r.error ?? `the render stopped without saying why (its log is cut/renders/${r.version}.log)`}</span>
        ) : (r.extra || madeLine || r.made || r.earlier || r.stale) && (
          <>
            {r.stale && (
              // the master of the version on screen is out of date: why, in amber (masters.ts masterAge)
              <span className="text-[12px] leading-[1.45] text-warn duration-200 animate-in fade-in-0" data-row-stale>{r.stale}</span>
            )}
            {r.earlier && (
              // a newer master of the same version is on disk: this one is kept, and marked
              <span className="truncate text-[12px] text-mute duration-200 animate-in fade-in-0" data-row-earlier>{r.earlier}</span>
            )}
            {r.made && (
              // what the master's picture was made from; the part scaled up from 480p in amber
              <span className="truncate text-[12px] text-ink-3" data-row-made title={r.made.map((m) => m.text).join(' · ')}>
                {r.made.map((m, i) => <span key={m.text}>{i > 0 ? ' · ' : ''}<span className={m.warn ? 'text-warn' : undefined}>{m.text}</span></span>)}
              </span>
            )}
            {(r.extra || madeLine) && (
              <span className="truncate text-[12px] text-sub" title={r.what}>
                {r.extra && <span className="text-ink-3">{r.extra}</span>}{r.extra && madeLine ? ' · ' : ''}{madeLine}
              </span>
            )}
          </>
        )}
        {r.path && <span className="truncate font-mono text-[10.5px] text-mute" title={r.path}>{baseName(r.path)}</span>}
      </span>
      <span className="flex flex-none items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {(r.state === 'running' || r.state === 'queued') && (
          // quiet, one tap, no confirm: a cancelled render is asked for again with "Render it"
          <button type="button" disabled={busy} onClick={onCancel} data-render-cancel title="Stops this render; nothing is written. Render it asks for it again."
            className={cn(link, 'duration-200 animate-in fade-in-0 disabled:cursor-not-allowed disabled:opacity-40')}>Cancel</button>
        )}
        {(r.state === 'failed' || r.state === 'cancelled') && (
          <button type="button" disabled={busy || !canRetry} onClick={onRetry} title={canRetry ? undefined : 'Only the current version’s master is rendered from here'} data-render-retry
            className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-200 animate-in fade-in-0 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40">{r.state === 'cancelled' ? 'Render it' : 'Try again'}</button>
        )}
        {wholeMaster && isFinal && <span data-render-final className="px-2 text-[12px] text-ink-3 duration-200 animate-in fade-in-0">The final</span>}
        {wholeMaster && !isFinal && onFinal && (
          <button type="button" disabled={naming || !!finalLock} title={finalLock ?? 'Every platform gets this file. Its copy without subtitles, the smaller file for posting and the subtitle file are made too; nothing is spent.'} data-make-final
            onClick={async () => { setNaming(true); await onFinal(r.path!); setNaming(false); }}
            className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-200 animate-in fade-in-0 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40">Make this the final</button>
        )}
        {done && r.stale && (
          <button type="button" onClick={onAgain} data-render-again title="A new master beside this one; this one stays"
            className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-edge-strong px-2.5 text-[12px] text-ink transition-colors duration-200 animate-in fade-in-0 hover:bg-raised">Render again</button>
        )}
        {done && (
          <>
            <a href={`${mediaOf(r.path!)}&download=1`} download={baseName(r.path!)} className={link}>Download</a>
            <button type="button" onClick={() => void copy()} className={cn(link, 'w-[78px] justify-center')} title={absOf(r.path!)}>
              <span key={copied ? 'y' : 'n'} className="duration-200 animate-in fade-in-0">{copied ? 'Copied' : 'Copy path'}</span>
            </button>
          </>
        )}
      </span>
    </li>
  );
}
