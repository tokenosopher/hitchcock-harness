// The thread's history from Claude Code's own record of the session:
// <account folder>/projects/<slug-of-cwd>/<session_id>.jsonl (~/.claude unless the film's Alma runs on another account,
// accounts.ts). Survives harness restarts; marks compaction points.
import { open, stat } from 'node:fs/promises';
import type { TaskCard, ThreadEvent } from '../types';
import { parseContextBlock } from '../context';
import { accountLineId, accountLinesFromPrompt, homeForSession, transcriptFile } from './accounts';
import { redact, redactDeep } from './redact';
import { oneLine, resultSummary, resultText, toolSummary } from './summarize';
import { resumedAgent, TaskTracker } from './tasks';
import { TurnTracker, startsTurn, type Turn } from './quietTurns';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** `home`: the account's config folder (claudeHome(film)); without it, the folder the session is recorded under. */
export function transcriptPath(cwd: string, sessionId: string, home: string = homeForSession(sessionId)): string {
  return transcriptFile(home, cwd, sessionId);
}

function tag(text: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return m ? m[1].trim() : undefined;
}

/** Prompts the CLI writes for itself (skill bodies, reminders, command echoes) are not the user's words. */
function isNoise(text: string): boolean {
  return /^\s*<(command-name|command-message|local-command-stdout|local-command-caveat|system-reminder|bash-input|bash-stdout)/.test(text)
    || text.startsWith('Base directory for this skill:')
    || text.startsWith('[Request interrupted');
}

export interface History {
  events: ThreadEvent[];
  tasks: TaskTracker;
  warnings: string[];
  /** The ids of the closed scheduled turns that changed nothing (quietTurns.ts): the chat does not show them. */
  hidden: ReadonlySet<string>;
  /** The turn still open at the end of the transcript (the one running now, or the last one if Alma is idle). */
  open: Turn | null;
  /** Every closed scheduled turn, shown or not, in order. */
  scheduled: readonly Turn[];
}

/** Reads the session's JSONL into ThreadEvents with the same ids the live stream uses, so the UI can merge them. */
// The transcript only grows, and a long thread's is tens of megabytes: read whole on every page load it held the
// server for two to four seconds (13 Nov 2026, 91 MB). What was read is kept, per transcript, and each call reads
// only the lines added since. One reader at a time per transcript, so no line is taken twice.
interface Kept {
  offset: number;                 // bytes of the file already read
  tail: Buffer;                   // the bytes after the last full line
  events: ThreadEvent[];
  tasks: TaskTracker;
  textCount: Map<string, number>;
  toolNames: Map<string, string>;
  sends: Map<string, string | undefined>;  // SendMessage tool_use id → its summary
  pendingCompaction: Extract<ThreadEvent, { kind: 'compaction' }> | null;
  bad: number;
  turns: TurnTracker;             // where each turn starts and whether a scheduled one changed anything
}
const PARSER = 4; // raise when the reading below changes, so kept state from older code is dropped
const hg = globalThis as unknown as { __historyKept?: Map<string, Kept>; __historyBusy?: Map<string, Promise<unknown>> };
const kept: Map<string, Kept> = (hg.__historyKept ??= new Map());
const busy: Map<string, Promise<unknown>> = (hg.__historyBusy ??= new Map());

export function readHistory(cwd: string, sessionId: string, home: string = homeForSession(sessionId)): Promise<History> {
  const file = transcriptPath(cwd, sessionId, home);
  const key = `${PARSER}:${file}`;
  const run = (busy.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => readMore(cwd, sessionId, file, key, home));
  busy.set(key, run);
  return run;
}

async function readMore(cwd: string, sessionId: string, file: string, key: string, home: string): Promise<History> {
  const warnings: string[] = [];
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return { events: [], tasks: new TaskTracker(), warnings: [`No transcript for session ${sessionId}`], hidden: new Set(), open: null, scheduled: [] };
  }
  let st = kept.get(key);
  if (!st || size < st.offset) {
    // first read, or the file was replaced by a shorter one: start again
    st = { offset: 0, tail: Buffer.alloc(0), events: [], tasks: new TaskTracker(), textCount: new Map(), toolNames: new Map(), sends: new Map(), pendingCompaction: null, bad: 0, turns: new TurnTracker() };
    if (kept.size > 8) kept.delete(kept.keys().next().value as string);
    kept.set(key, st);
  }
  let lines: string[] = [];
  if (size > st.offset) {
    const fh = await open(file, 'r');
    try {
      const buf = Buffer.alloc(size - st.offset);
      const { bytesRead } = await fh.read(buf, 0, buf.length, st.offset);
      const all = Buffer.concat([st.tail, buf.subarray(0, bytesRead)]);
      const end = all.lastIndexOf(0x0a);
      lines = end < 0 ? [] : all.subarray(0, end).toString('utf8').split('\n');
      st.tail = end < 0 ? all : Buffer.from(all.subarray(end + 1));
      st.offset += bytesRead;
    } finally {
      await fh.close();
    }
  }
  const { events, tasks, textCount, toolNames, sends, turns } = st;
  // an event shown inside the current turn is counted with it (the ids a quiet scheduled turn hides)
  const push = (ev: ThreadEvent) => { events.push(ev); turns.saw(ev); };
  let pendingCompaction = st.pendingCompaction;
  let bad = st.bad;

  for (const line of lines) {
    if (!line.trim()) continue;
    let e: Json;
    try {
      e = obj(JSON.parse(line));
    } catch {
      bad++;
      continue;
    }
    if (e.isSidechain === true) continue;
    const at = s(e.timestamp) ?? '';
    const uuid = s(e.uuid) ?? '';

    if (e.type === 'system' && e.subtype === 'compact_boundary') {
      const meta = obj(e.compactMetadata);
      const pre = typeof meta.preTokens === 'number' ? ` · ${Math.round(meta.preTokens / 1000)}k tokens before` : '';
      pendingCompaction = { kind: 'compaction', id: uuid, at, summary: `Thread compacted (${s(meta.trigger) ?? 'auto'})${pre}` };
      events.push(pendingCompaction);
      continue;
    }

    // a message (the user's, sent while Alma was busy, or another session's) delivered into the turn running then
    if (e.type === 'attachment' && obj(e.attachment).type === 'queued_command' && obj(e.attachment).commandMode !== 'task-notification') turns.delivered();

    // a background job's "finished" note is not always a user turn: when Alma is busy it is queued, and the
    // transcript keeps it as a queue entry or as an attachment to her next turn (12 Nov: such jobs read as running for ever)
    const queued = e.type === 'queue-operation' && e.operation === 'enqueue' ? s(e.content) : e.type === 'attachment' ? s(obj(e.attachment).prompt) : undefined;
    if (queued?.includes('<task-notification>')) {
      const card = tasks.notified(tag(queued, 'task-id'), tag(queued, 'tool-use-id'), tag(queued, 'status') ?? 'completed', tag(queued, 'summary'), tag(queued, 'result'), at);
      if (card) events.push({ kind: 'task', id: card.id, at, task: card });
      continue;
    }

    if (e.type === 'user') {
      const m = obj(e.message);
      if (startsTurn(e)) turns.start(s(e.turnOrigin), at);
      if (e.isCompactSummary === true) {
        if (pendingCompaction) {
          const body = typeof m.content === 'string' ? m.content : resultText(m.content);
          const first = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('This session is being continued') && !l.startsWith('<'));
          if (first) pendingCompaction.summary += ` · ${oneLine(first, 200)}`;
        }
        continue;
      }
      if (e.isMeta === true) continue;
      const content = m.content;
      const texts: string[] = typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((b) => obj(b).type === 'text').map((b) => s(obj(b).text) ?? '') : [];
      for (const text of texts) {
        if (text.includes('<task-notification>')) {
          const card = tasks.notified(tag(text, 'task-id'), tag(text, 'tool-use-id'), tag(text, 'status') ?? 'completed', tag(text, 'summary'), tag(text, 'result'), at);
          if (card) events.push({ kind: 'task', id: card.id, at, task: card });
          continue;
        }
        if (!text.trim() || isNoise(text)) continue;
        // the harness's own line that Alma moved to another account (its note rides on the next message)
        const lines = accountLinesFromPrompt(text);
        for (const l of lines) events.push({ kind: 'system', id: accountLineId(l), at, text: l });
        const { text: words, context } = parseContextBlock(text);
        // a message from the harness alone (Alma resumed after an account limit) is not the user's
        if (lines.length && !words.trim() && !context?.selected.some((c) => c.command)) continue;
        events.push({ kind: 'user', id: uuid, at, text: redact(words), ...(context ? { context } : {}) });
      }
      if (Array.isArray(content)) {
        for (const b of content.map(obj)) {
          if (b.type !== 'tool_result') continue;
          const tuid = s(b.tool_use_id) ?? '';
          const ok = b.is_error !== true;
          if (tasks.isAgent(tuid)) {
            const card = tasks.agentResult(tuid, b.content, !ok, e.toolUseResult, at);
            if (card) events.push({ kind: 'task', id: card.id, at, task: card });
          } else {
            push({ kind: 'tool_result', id: `result:${tuid}`, at, toolUseId: tuid, summary: resultSummary(b.content, ok), ok });
            if (sends.has(tuid)) {
              // SendMessage woke a finished sub-agent: its card runs again
              const summary = sends.get(tuid);
              sends.delete(tuid);
              const agentId = ok ? resumedAgent(b.content, e.toolUseResult) : undefined;
              const card = agentId ? tasks.resumed(tuid, agentId, summary, at) : undefined;
              if (card) events.push({ kind: 'task', id: card.id, at, task: card });
            }
            const body = resultText(b.content);
            if (!ok && body.startsWith('Permission for this tool use was denied')) {
              // the live stream's permission_denied line is not in the JSONL; rebuild it
              const what = /What required approval:\s*([^]*?)(?:\s+For security,|$)/.exec(body);
              events.push({ kind: 'system', id: `denied:${tuid}`, at, text: oneLine(`Permission denied · ${toolNames.get(tuid) ?? 'tool'}${what ? ` · ${what[1]}` : ''}`, 300) });
            }
          }
        }
      }
      continue;
    }

    if (e.type === 'assistant') {
      const m = obj(e.message);
      const mid = s(m.id) ?? uuid;
      for (const b of (Array.isArray(m.content) ? m.content : []).map(obj)) {
        if (b.type === 'text') {
          const n = (textCount.get(mid) ?? 0) + 1;
          textCount.set(mid, n);
          const text = s(b.text) ?? '';
          if (text.trim() && text.trim() !== 'No response requested.') push({ kind: 'assistant_text', id: `${mid}:t${n}`, at, text: redact(text) });
        } else if (b.type === 'tool_use') {
          const name = s(b.name) ?? '?';
          const tid = s(b.id) ?? uuid;
          toolNames.set(tid, name);
          turns.tool(name, b.input);
          if (name === 'Agent' || name === 'Task') {
            const card = tasks.spawn(tid, b.input, at);
            events.push({ kind: 'task', id: card.id, at, task: card });
          } else {
            push({ kind: 'tool_use', id: tid, at, name, summary: toolSummary(name, b.input), input: redactDeep(b.input) });
            if (name === 'SendMessage') sends.set(tid, s(obj(b.input).summary));
            if (name === 'TaskStop') {
              const card = tasks.stopped(s(obj(b.input).task_id) ?? s(obj(b.input).shell_id), at);
              if (card) events.push({ kind: 'task', id: card.id, at, task: card });
            }
          }
        }
      }
    }
  }
  st.pendingCompaction = pendingCompaction;
  st.bad = bad;
  if (bad) warnings.push(`${bad} transcript lines could not be parsed`);
  // the sub-agents' tool calls live in <session>/subagents/agent-<id>.jsonl: their cards get those steps back
  await tasks.fillFromSubagents(cwd, sessionId, home);
  await tasks.settleStale(cwd, sessionId, Date.now(), home);
  const withSteps = events.map((ev) => (ev.kind === 'task' && tasks.get(ev.id) ? { ...ev, task: { ...ev.task, steps: [...tasks.get(ev.id)!.steps], toolUses: tasks.get(ev.id)!.toolUses, liveLine: tasks.get(ev.id)!.liveLine } } : ev));
  return { events: collapseTasks(withSteps, (id) => tasks.get(id)), tasks, warnings, hidden: turns.hidden, open: turns.open(), scheduled: turns.scheduled };
}

/** Keeps one task event per card (its last state), at the place it was spawned. */
function collapseTasks(events: ThreadEvent[], finalOf?: (id: string) => TaskCard | undefined): ThreadEvent[] {
  const last = new Map<string, ThreadEvent>();
  for (const ev of events) if (ev.kind === 'task') last.set(ev.id, ev);
  const placed = new Set<string>();
  const out: ThreadEvent[] = [];
  for (const ev of events) {
    if (ev.kind !== 'task') { out.push(ev); continue; }
    if (placed.has(ev.id)) continue;
    placed.add(ev.id);
    const final = last.get(ev.id)!;
    const now = finalOf?.(ev.id);
    out.push(final.kind === 'task' && now ? { ...final, at: ev.at, task: { ...final.task, state: now.state, endedAt: now.endedAt, liveLine: now.liveLine } } : { ...final, at: ev.at });
  }
  return out;
}

type TaskEvent = Extract<ThreadEvent, { kind: 'task' }>;
const ended = (t: TaskCard): boolean => t.state === 'done' || t.state === 'failed';

/** Merges history and live events by id (live wins, except a job the transcript shows as ended), in first-seen order. */
export function mergeEvents(history: ThreadEvent[], live: ThreadEvent[]): ThreadEvent[] {
  const index = new Map<string, number>();
  const out: ThreadEvent[] = [];
  for (const ev of [...history, ...live]) {
    const key = `${ev.kind}:${ev.id}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(ev);
    } else {
      // a task card keeps the place (time) it was spawned at; its later updates only change its content
      out[at] = ev.kind === 'assistant_text' && ev.partial && out[at].kind === 'assistant_text' && !(out[at] as { partial?: boolean }).partial ? out[at]
        : ev.kind === 'task'
          ? (out[at].kind === 'task' && ended((out[at] as TaskEvent).task) && !ended(ev.task) ? out[at] : { ...ev, at: out[at].at })
          : ev;
    }
  }
  // live-only events (MCP status, denials) land where they happened, not after the transcript; the sort is stable
  const t = (e: ThreadEvent) => Date.parse(e.at) || 0;
  return out.map((e, i) => ({ e, i })).sort((a, b) => t(a.e) - t(b.e) || a.i - b.i).map((x) => x.e);
}
