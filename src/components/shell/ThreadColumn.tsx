'use client';
// The thread with Alma, always open: header, running tray, the messages from ThreadEvent[], the composer.
// Desktop: a 384px column. Phone (≤760px): a bottom panel that opens to the full thread.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ALMA_MODELS, type AlmaModel, type TaskCard as Task, type ThreadEvent } from '@/server/types';
import { useThread } from '@/components/data/thread';
import { useFilm } from '@/components/data/film';
import { useUI } from '@/components/data/ui';
import { fmtDate } from '@/components/lib/format';
import { Composer } from './Composer';
import { AlmaText } from './AlmaText';
import { TaskCard, taskChipLabel } from './TaskCard';
import { Dot } from './atoms';
import { IconX, IconPanel } from './icons';
import { cn } from '@/lib/utils';
import { NotifyToggle } from '@/components/notify/NotifyToggle';
import { useIsPhone } from './useIsPhone';
import { useTyping } from './typing';
import { useHydrated, useSize } from '@/components/lib/sizes';
import { Edge } from './Edge';
import { uploadImage } from '@/components/lib/uploads';
import { usePresence } from './Reveal';
import { isUsageLimitText } from '@/server/claude/limit';
import { UserWords } from './RefCard';
import { hasRefTags, splitRefTags, type InlineRef } from '@/lib/refs';
import type { Chip } from '@/server/types';

/** A selected chip ("Alma saw") that names the same thing as a chip in the words is shown once, in the words. */
function sameThing(c: Chip, refs: InlineRef[]): boolean {
  return refs.some((r) => (r.kind === 'clip' || r.kind === 'panel') && r.track && r.clip ? c.id === `clip:${r.track}:${r.clip}`
    : r.kind === 'take' && r.take ? c.id === `take:${r.take}`
      : r.kind === 'shot' && r.scene && r.shot && !r.take ? c.id === `shot:${r.scene}-${r.shot}`
        : r.kind === 'character' && r.character ? c.id === `char:${r.character}`
          : false);
}

type Row =
  | { kind: 'divider'; key: string; text: string }
  | { kind: 'event'; key: string; e: ThreadEvent }
  | { kind: 'alma'; key: string; text?: string; tasks: Task[]; tools: ThreadEvent[] };

/** Groups the flat event list into what the thread shows: date dividers, bubbles, Alma's turns with their cards. */
/** "MCP not connected: a (failed), plugin:design:x (failed)" without the design plugin's servers (lines written
 *  before the server dropped them); empty when nothing is left. */
function mcpText(text: string): string {
  const items = text.replace(/^MCP not connected:\s*/, '').split(/,\s*(?=[^()]*(?:\(|$))/).map((x) => x.trim()).filter((x) => x && !/^plugin:design:/i.test(x));
  return items.length ? `MCP not connected: ${items.join(', ')}` : '';
}

function rows(events: ThreadEvent[]): Row[] {
  const out: Row[] = [];
  const seenTask = new Set<string>();
  let lastDay = '';
  let turn: Extract<Row, { kind: 'alma' }> | undefined;
  // A task appears once, where it was first spawned; later updates replace it in place.
  const latest = new Map<string, Task>();
  for (const e of events) if (e.kind === 'task') latest.set(e.task.id, e.task);
  let lastMcp = '';
  for (const e of events) {
    // the MCP status line: once per process from the server; the same line again (a restarted process) is dropped
    if (e.kind === 'system' && /^MCP not connected:/.test(e.text)) {
      const text = mcpText(e.text);
      if (!text || text === lastMcp) continue;
      lastMcp = text;
    }
    const day = e.at.slice(0, 10);
    if (day !== lastDay && e.kind !== 'result') {
      out.push({ kind: 'divider', key: `d-${day}-${e.id}`, text: fmtDate(day) });
      lastDay = day;
      turn = undefined;
    }
    if (e.kind === 'assistant_text') {
      turn = { kind: 'alma', key: e.id, text: e.text, tasks: [], tools: [] };
      out.push(turn);
    } else if (e.kind === 'task') {
      if (seenTask.has(e.task.id)) continue;
      seenTask.add(e.task.id);
      if (!turn) { turn = { kind: 'alma', key: `t-${e.id}`, tasks: [], tools: [] }; out.push(turn); }
      turn.tasks.push(latest.get(e.task.id)!);
    } else if (e.kind === 'tool_use' || e.kind === 'tool_result') {
      if (e.kind === 'tool_use' && e.name === 'Agent') continue; // shown as its task card
      if (!turn) { turn = { kind: 'alma', key: `x-${e.id}`, tasks: [], tools: [] }; out.push(turn); }
      turn.tools.push(e);
    } else if (e.kind === 'result') {
      out.push({ kind: 'event', key: e.id, e });   // the turn's cost line
      turn = undefined;
    } else {
      out.push({ kind: 'event', key: e.id, e });
      turn = undefined;
    }
  }
  return out;
}

function Avatar({ empty }: { empty?: boolean }) {
  return <div className={cn('mt-px flex size-[22px] flex-none items-center justify-center rounded-full border text-[10.5px] font-semibold text-ink-3', empty ? 'border-transparent' : 'border-edge')}>{empty ? '' : 'A'}</div>;
}

/** "Alma is working…" with the seconds since the message went out, until the turn's result arrives. */
function Working({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <div role="status" className="flex items-center gap-2.5 pl-8 text-[11.5px] text-sub">
      <Dot state="running" />
      <span>Alma is working…</span>
      <span className="font-mono text-[11px]">{secs} s</span>
    </div>
  );
}

/** Beside the model picker, only while the reserve switch is on: Alma runs on the API credits, not the plan.
 *  It slides open and fades, both ways. */
function ReserveMarker({ reserve }: { reserve?: { on: boolean; onKey: boolean } }) {
  const open = !!reserve?.on;
  const { mounted, shown, done } = usePresence(open);
  // the words of the last open state stay while it closes
  const [pending, setPending] = useState(false);
  if (open && pending !== !reserve.onKey) setPending(!reserve.onKey);
  if (!mounted) return null;
  return (
    <span onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'opacity') done(); }}
      title="Alma is running on your API credits, not your plan. Turn it off in Settings."
      className={cn('flex-none cursor-default overflow-hidden text-right text-[11px] leading-[1.25] text-sub transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none', shown ? 'max-w-[96px] opacity-100' : 'max-w-0 opacity-0')}>
      <span className="block w-max max-w-[96px]">{pending ? 'API credits from her next turn' : 'API credits'}</span>
    </span>
  );
}

/** One line under a turn that a plan limit stopped, while a key is saved and the reserve is off. */
function ReserveOffer({ onUse }: { onUse: () => Promise<{ ok: boolean; error?: string }> }) {
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  return (
    <div className="flex flex-col gap-1.5 pl-8 text-[11.5px] leading-normal text-sub duration-200 animate-in fade-in motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span>The plan’s limit is reached. Alma can carry on with your API credits.</span>
        <button type="button" disabled={state.busy} onClick={async () => { setState({ busy: true }); const r = await onUse(); setState(r.ok ? {} : { error: r.error }); }}
          className="h-6 flex-none cursor-pointer rounded-[6px] border border-edge bg-transparent px-2 text-[11.5px] font-medium text-ink transition-colors hover:bg-raised disabled:cursor-default disabled:opacity-60">
          Use API credits
        </button>
      </div>
      {state.error && <span className="text-bad">{state.error}</span>}
    </div>
  );
}

/** True when the last turn (after the last user message) ended with Claude Code's usage-limit words. */
function lastTurnHitLimit(events: ThreadEvent[]): boolean {
  let i = events.length - 1;
  while (i >= 0 && events[i].kind !== 'user') i--;
  return events.slice(i + 1).some((e) => (e.kind === 'assistant_text' || e.kind === 'error' || e.kind === 'system') && isUsageLimitText(e.text));
}

export function ThreadColumn({ film, onCollapse }: { film: string; onCollapse?: () => void }) {
  const { events, loaded, tasks, error, workingSince, model, setModel, reserve, turnOnReserve } = useThread();
  const threadW = useSize('thread');
  const ready = useHydrated();
  const { state } = useFilm();
  const ui = useUI();
  const scroller = useRef<HTMLDivElement>(null);
  const all = useMemo(() => rows(events), [events]);
  // a long thread is thousands of elements: show the newest, the rest on a click (12 Nov: the page was slow to type in)
  const [more, setMore] = useState(0);
  const KEEP = 40;
  const hidden = Math.max(0, all.length - KEEP - more);
  const list = useMemo(() => (hidden ? all.slice(hidden) : all), [all, hidden]);
  const phone = useIsPhone();

  const running = tasks.filter((t) => t.state === 'running');
  const queued = tasks.filter((t) => t.state === 'queued');
  const tray = [...running, ...queued];
  const trayLabel = tray.length ? `${running.length} running${queued.length ? ` · ${queued.length} queued` : ''}` : 'Nothing running';
  const messages = events.filter((e) => e.kind === 'user' || e.kind === 'assistant_text').length;
  const stage = state?.film.stage;
  const lastUser = [...events].reverse().find((e) => e.kind === 'user');
  // one line that never wraps; the film's name is in the page header, so it is not repeated here
  const count = loaded || messages ? `${messages} ${messages === 1 ? 'message' : 'messages'}` : '';
  const sub = [count, stage ? `stage ${stage}` : ''].filter(Boolean).join(' · ');
  const title = film === 'library' ? 'Library · across films' : film === 'settings' ? 'Settings' : state?.film.title ?? film;
  const subTitle = `Thread · ${title}${lastUser ? ` · your last message ${fmtDate(lastUser.at)}` : ''}`;
  // the turn Alma is in now: its steps show as they come; a finished turn folds them to one grey line
  const liveKey = workingSince !== undefined ? [...list].reverse().find((r) => r.kind === 'alma')?.key : undefined;

  // Follow the newest message while the reader is at the bottom; leave them be when they scrolled up.
  const atBottom = useRef(true);
  const onScroll = () => {
    const el = scroller.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  const working = workingSince !== undefined;
  const hitLimit = useMemo(() => lastTurnHitLimit(events), [events]);
  const offerReserve = hitLimit && !working && !!reserve?.hasKey && !reserve.on;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [events, working]);
  // Stay at the newest message while what is above it grows after it was drawn (a picture loading, a code block,
  // the fonts): the thread opened a few lines short of its end on long threads.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);
  // On a phone the folded thread is a bar fixed over the page's end: its height, as --hh-phone-bar on <html>, is the
  // page's bottom padding (Shell's main), so the end of every page clears it whatever the bar holds (16 Nov: a fixed
  // 150px guess, and the Edit page's last line sat under the bar)
  const aside = useRef<HTMLElement>(null);
  const barOn = phone && !ui.threadOpen;
  // while the user types into the page (the story, a script line), the bar slides down out of the way (ASKS 64)
  const typing = useTyping();
  const away = barOn && typing;
  useLayoutEffect(() => {
    const el = aside.current;
    const html = document.documentElement;
    if (!el || !barOn) return;
    const put = () => html.style.setProperty('--hh-phone-bar', away ? '0px' : `${Math.ceil(el.getBoundingClientRect().height)}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => { ro.disconnect(); html.style.removeProperty('--hh-phone-bar'); };
  }, [barOn, away]);
  // Open at the newest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
  }, [ui.threadOpen]);

  function toggleTask(t: Task) {
    const open = ui.openTask === t.id;
    ui.setOpenTask(open ? undefined : t.id);
    ui.addChip({ id: `task:${t.id}`, label: taskChipLabel(t), ref: t.id });
  }
  function fromTray(t: Task) {
    ui.setOpenTask(t.id);
    ui.addChip({ id: `task:${t.id}`, label: taskChipLabel(t), ref: t.id });
    ui.setThreadOpen(true);
    setTimeout(() => document.getElementById(`task-${t.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }

  return (
    <aside ref={aside} aria-label="Thread with Alma" inert={away || undefined} data-away={away ? '' : undefined} style={{ '--thread-w': ready ? `${threadW}px` : 'var(--hh-thread-w, 384px)' } as React.CSSProperties}
      className={cn(
        'relative flex min-w-0 flex-col bg-bg',
        'min-[761px]:h-full min-[761px]:w-[var(--thread-w)] min-[761px]:max-w-[60vw] min-[761px]:flex-none min-[761px]:border-l min-[761px]:border-line',
        // on a phone the full thread rises from the bottom panel instead of replacing it in one frame
        away && 'max-[760px]:pointer-events-none max-[760px]:translate-y-full max-[760px]:opacity-0',
        barOn && 'max-[760px]:transition-[transform,opacity] max-[760px]:duration-200 max-[760px]:ease-out',
        ui.threadOpen ? 'max-[760px]:fixed max-[760px]:inset-0 max-[760px]:z-40 max-[760px]:duration-300 max-[760px]:animate-in max-[760px]:fade-in max-[760px]:slide-in-from-bottom-8 motion-reduce:animate-none' : 'max-[760px]:fixed max-[760px]:inset-x-0 max-[760px]:bottom-0 max-[760px]:z-30 max-[760px]:border-t max-[760px]:border-line',
        // on a phone the server draws the desktop composer (it cannot know the width); the panel waits for React,
        // which draws the phone's one-line box, instead of showing the tall one and shrinking a moment later
        !ready && 'max-[760px]:invisible',
      )}>
      {/* the frame draws the drag edge itself when the column can fold (it sits outside the frame's clip) */}
      {!onCollapse && <Edge name="thread" axis="x" sign={-1} label="The width of the thread" className="-left-[5px]" />}
      {/* Header */}
      <div className={cn('flex h-14 flex-none items-center justify-between gap-2.5 border-b border-line px-4 py-3', !ui.threadOpen && 'max-[760px]:hidden')}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold">{film === 'library' || film === 'settings' ? title : 'Thread'}</span>
          <span className="truncate text-[12px] text-sub" title={subTitle}>{sub || '\u00a0'}</span>
        </div>
        <NotifyToggle />
        <ReserveMarker reserve={reserve} />
        <label className="sr-only" htmlFor="alma-model">The model Alma runs on</label>
        <select id="alma-model" value={model.choice} onChange={(e) => void setModel(e.target.value as AlmaModel)}
          title={`The model Alma runs on, from her next turn. ${model.choice ? '' : `Default is Claude Code's own setting${model.fallback ? ` (${model.fallback})` : ''}. `}${model.served ? `Running now: ${model.served}.` : ''}`}
          className="h-8 max-w-[172px] flex-none cursor-pointer truncate rounded-lg border border-edge bg-bg px-2 text-[12px] text-ink outline-none hover:bg-raised focus-visible:border-edge-strong">
          {ALMA_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.id ? m.label : `Default${model.fallback ? ` · ${model.fallback}` : ''}`}</option>
          ))}
        </select>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="Hide Alma" title="Hide Alma"
            className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-sub transition-colors hover:bg-raised hover:text-ink max-[760px]:hidden">
            <span className="flex -scale-x-100"><IconPanel size={16} /></span>
          </button>
        )}
        <button type="button" aria-label="Close the thread" onClick={() => ui.setThreadOpen(false)} className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-edge text-ink min-[761px]:hidden"><IconX size={13} /></button>
      </div>

      {/* Running tray */}
      <div className={cn('flex flex-none flex-col gap-2 border-b border-edge px-4 pb-3 pt-2.5', !ui.threadOpen && 'max-[760px]:hidden')}>
        <span className="lbl">{trayLabel}</span>
        {tray.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tray.map((t) => {
              const on = ui.openTask === t.id;
              return (
                <button key={t.id} type="button" onClick={() => fromTray(t)} aria-pressed={on}
                  className={cn('inline-flex h-6 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-[11.5px] text-ink-3', on ? 'border-faint bg-raised' : 'border-edge bg-panel')}>
                  <Dot state={t.state === 'queued' ? 'queued' : 'running'} />
                  {taskChipLabel(t)}{t.state === 'queued' ? ' · queued' : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className={cn('relative flex min-h-0 flex-1 flex-col', !ui.threadOpen && 'max-[760px]:hidden')}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-10 bg-gradient-to-b from-hdr to-transparent" style={{ right: 6 }} />
        <div ref={scroller} onScroll={onScroll} className="scroll min-h-0 flex-1 overflow-y-auto">
          <div ref={content} className="flex flex-col gap-3 p-4">
            {error && <div className="rounded-lg border border-dashed border-edge-strong p-3 text-[12px] text-sub">{error}</div>}
            {hidden > 0 && (
              <button type="button" onClick={() => setMore((m) => m + 80)} className="mx-auto cursor-pointer rounded-full border border-edge bg-transparent px-3 py-1 text-[12px] text-sub hover:bg-raised hover:text-ink">
                Show earlier messages · {hidden} more
              </button>
            )}
            {list.map((r) => {
              if (r.kind === 'divider') {
                return (
                  <div key={r.key} className="flex items-center gap-2.5 text-[11.5px] text-sub">
                    <span className="h-px flex-1 bg-line" />{r.text}<span className="h-px flex-1 bg-line" />
                  </div>
                );
              }
              if (r.kind === 'alma') {
                return (
                  <div key={r.key} className="flex gap-2.5">
                    <Avatar empty={!r.text} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {r.text && <AlmaText text={r.text} film={film} />}
                      {r.tools.length > 0 && (() => {
                        const live = r.key === liveKey;
                        const lines = r.tools.map((t) => (
                          <span key={t.id} className={cn('flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px]', live && t.kind === 'tool_result' && !t.ok ? 'text-bad' : live ? 'text-sub' : 'text-mute')}>
                            <span className="size-1 flex-none rounded-full bg-current" />
                            <span className="min-w-0 truncate">{t.kind === 'tool_use' ? (t.summary.startsWith(t.name) ? t.summary : `${t.name} · ${t.summary}`) : t.kind === 'tool_result' ? `${t.ok ? 'ok' : 'failed'} · ${t.summary}` : ''}</span>
                          </span>
                        ));
                        if (live) return lines;
                        // what Alma did to get here: counted, and open on a click
                        const steps = r.tools.filter((t) => t.kind === 'tool_use').length || r.tools.length;
                        const failed = r.tools.filter((t) => t.kind === 'tool_result' && !t.ok).length;
                        return (
                          <details className="text-[11.5px] text-mute">
                            <summary className="cursor-pointer list-none hover:text-ink-3 [&::-webkit-details-marker]:hidden">{steps} {steps === 1 ? 'step' : 'steps'}{failed ? ` · ${failed} did not go through` : ''}</summary>
                            <div className="flex flex-col gap-1.5 pt-1.5">{lines}</div>
                          </details>
                        );
                      })()}
                      {r.tasks.map((t) => (
                        <TaskCard key={t.id} task={t} film={film} open={ui.openTask === t.id} inContext={ui.hasChip(`task:${t.id}`)}
                          onToggle={() => toggleTask(t)} onOpenResult={() => ui.setThreadOpen(false)} />
                      ))}
                    </div>
                  </div>
                );
              }
              const e = r.e;
              if (e.kind === 'user') {
                return (
                  <div key={r.key} className="flex max-w-[88%] flex-col items-end gap-[5px] self-end">
                    {/* the user's words, with the things they put into them drawn as chips */}
                    <div className={cn('max-w-full whitespace-pre-wrap rounded-[14px_14px_4px_14px] [overflow-wrap:anywhere] bg-bubble px-[13px] py-[9px] text-[13.5px] text-ink', hasRefTags(e.text) ? 'leading-[1.6]' : 'leading-normal')}><UserWords text={e.text} film={film} /></div>
                    {/* what Alma saw with this message: the chips that went with it */}
                    {e.context && e.context.selected.length > 0 && (() => {
                      const inline = hasRefTags(e.text) ? splitRefTags(e.text).filter((p): p is InlineRef => typeof p !== 'string') : [];
                      const pictures = e.context.selected.filter((c) => uploadImage(c));
                      const seen = e.context.selected.filter((c) => !uploadImage(c) && !sameThing(c, inline));
                      // pictures the user attached show as pictures, above the rest
                      const shown = pictures.length > 0 && (
                        <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                          {pictures.map((c) => (
                            // eslint-disable-next-line @next/next/no-img-element -- a file the user attached, served as it is
                            <img key={c.id} src={uploadImage(c)} alt={c.label} title={c.label} data-zoom={uploadImage(c)} data-zoom-alt={c.label} loading="lazy"
                              className="max-h-[132px] max-w-[176px] cursor-zoom-in rounded-lg border border-line object-cover" />
                          ))}
                        </div>
                      );
                      if (!seen.length) return shown;
                      const list = (
                        <ul aria-label="Alma saw" className="flex max-w-full flex-wrap justify-end gap-1">
                          {seen.map((c) => (
                            <li key={c.id} title={c.ref ?? c.label} className="inline-flex h-[18px] min-w-0 max-w-full items-center gap-1 rounded-[5px] border border-line px-1.5 text-[10.5px] text-mute">
                              <span className="size-1 flex-none rounded-full bg-mute" /><span className="truncate">{c.label}</span>
                            </li>
                          ))}
                        </ul>
                      );
                      // a long selection folds to one line, so the thread reads as a conversation
                      if (seen.length <= 3) return <>{shown}{list}</>;
                      return (
                        <>
                          {shown}
                          <details className="flex max-w-full flex-col items-end">
                            <summary className="cursor-pointer list-none text-right text-[10.5px] text-mute hover:text-ink-3 [&::-webkit-details-marker]:hidden">with {seen.length} things in view</summary>
                            <div className="pt-1">{list}</div>
                          </details>
                        </>
                      );
                    })()}
                  </div>
                );
              }
              if (e.kind === 'system' && /^MCP not connected:/.test(e.text)) {
                // folded: which MCP servers this Alma process started without
                const text = mcpText(e.text);
                const n = text.replace(/^MCP not connected:\s*/, '').split(/,\s*(?=[^()]*(?:\(|$))/).length;
                return (
                  <details key={r.key} className="group pl-8 text-[11.5px] leading-normal text-sub">
                    <summary className="flex cursor-pointer list-none items-center gap-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                      <span className="size-1.5 flex-none rounded-full border border-mute" />{n} MCP {n === 1 ? 'server' : 'servers'} not connected
                    </summary>
                    <span className="block break-words pl-3.5 pt-1 text-mute">{text.replace(/^MCP not connected:\s*/, '')}</span>
                  </details>
                );
              }
              if (e.kind === 'system' && /^Permission denied · /.test(e.text)) {
                // a step the permission mode refused: one quiet line, the command behind a click
                const [, tool, ...rest] = e.text.split(' · ');
                return (
                  <details key={r.key} className="pl-8 text-[11.5px] leading-normal text-mute">
                    <summary className="cursor-pointer list-none hover:text-ink-3 [&::-webkit-details-marker]:hidden">1 step was not allowed · {tool}</summary>
                    <span className="block break-words pt-1 font-mono text-[11px]">{rest.join(' · ') || e.text}</span>
                  </details>
                );
              }
              if (e.kind === 'system' || e.kind === 'error') {
                return (
                  <div key={r.key} className={cn('flex items-start gap-2 pl-8 text-[11.5px] leading-normal', e.kind === 'error' ? 'text-bad' : 'text-sub')}>
                    <span className={cn('mt-[5px] size-1.5 flex-none rounded-full border', e.kind === 'error' ? 'border-bad bg-bad' : 'border-mute')} /><span className="min-w-0 break-words">{e.text}</span>
                  </div>
                );
              }
              if (e.kind === 'result') {
                // the turn's share of the plan's list-price estimate: the Max plan does not charge it
                const parts = [e.costUsd !== undefined ? `$${e.costUsd.toFixed(2)} · plan estimate` : '', e.durationMs !== undefined ? `${Math.round(e.durationMs / 1000)} s` : ''].filter(Boolean);
                return (
                  <div key={r.key} className={cn('pl-8 font-mono text-[11px]', e.ok ? 'text-mute' : 'text-bad')}>
                    {e.ok ? parts.join(' · ') || 'done' : `turn failed${parts.length ? ` · ${parts.join(' · ')}` : ''}`}
                  </div>
                );
              }
              if (e.kind === 'compaction') {
                return (
                  <details key={r.key} className="group text-[11.5px] text-sub">
                    <summary className="flex cursor-pointer list-none items-center gap-2.5">
                      <span className="h-px flex-1 border-t border-dashed border-edge-strong" />Compacted here · Alma’s memory starts again from a summary<span className="h-px flex-1 border-t border-dashed border-edge-strong" />
                    </summary>
                    <p className="mt-2 rounded-lg border border-line bg-panel p-2.5 leading-normal">{e.summary}</p>
                  </details>
                );
              }
              return <Fragment key={r.key} />;
            })}
            {offerReserve && <ReserveOffer onUse={turnOnReserve} />}
            {working && <Working since={workingSince} />}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="flex flex-col gap-2 border-t border-line px-3 pb-3.5 pt-2.5 max-[760px]:border-t-0 max-[760px]:pb-[max(12px,env(safe-area-inset-bottom))]">
        {!ui.threadOpen && (
          <div className="flex items-center justify-between gap-2 px-0.5 pb-0.5 min-[761px]:hidden">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-sub">
              {tray.length > 0 && <Dot state="running" />}{tray.length ? trayLabel : count}
            </span>
            <button type="button" onClick={() => ui.setThreadOpen(true)} className="h-7 cursor-pointer rounded-[7px] border border-edge px-2.5 text-[12px] font-medium text-ink">Open thread</button>
          </div>
        )}
        <Composer film={film} compact={phone && !ui.threadOpen} />
      </div>
    </aside>
  );
}
