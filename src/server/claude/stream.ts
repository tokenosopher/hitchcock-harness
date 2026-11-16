// claude -p stream-json lines → ThreadEvents. One parser per Alma process; it keeps the state that
// partial text and sub-agent cards need (which message a delta belongs to, which tool_use is an Agent).
import { randomUUID } from 'node:crypto';
import type { ThreadEvent } from '../types';
import { redact, redactDeep } from './redact';
import { oneLine, resultSummary, toolSummary } from './summarize';
import { TaskTracker } from './tasks';

type Json = Record<string, unknown>;

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}
function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function now(): string {
  return new Date().toISOString();
}

/** What the parser learned besides the events: the session id, and when a turn ended. */
export interface StreamSignals {
  sessionId?: string;
  init?: { model?: string; cwd?: string; permissionMode?: string; mcp: { name: string; status: string }[]; tools: number; skills: number };
  result?: { ok: boolean; totalCostUsd?: number; durationMs?: number; sessionId: string };
  controlRequest?: { requestId: string; subtype?: string };
}

const AGENT_TOOLS = new Set(['Agent', 'Task']);

export class StreamParser {
  readonly tasks: TaskTracker;
  private currentMessage = new Map<string, string>();               // parent ('' = main) → message id being streamed
  private blockText = new Map<string, { id: string; text: string }>(); // `${msgId}:${index}` → text so far
  private textCount = new Map<string, number>();                     // msgId → text blocks numbered so far (partials)
  private finalTextCount = new Map<string, number>();                // msgId → text blocks numbered so far (finals)
  private seenDenials = new Set<string>();
  private initSeen = false;

  constructor(tasks?: TaskTracker) {
    // a tracker made by an older version of the class (process.ts keeps it across dev hot reloads) takes on the new methods
    if (tasks && !(tasks instanceof TaskTracker)) Object.setPrototypeOf(tasks, TaskTracker.prototype);
    this.tasks = tasks ?? new TaskTracker();
  }

  /** Parses one stdout line. Lines that are not JSON come back as nothing (the caller logs them, redacted). */
  line(raw: string): { events: ThreadEvent[]; signals: StreamSignals } {
    const signals: StreamSignals = {};
    let msg: Json;
    try {
      msg = obj(JSON.parse(raw));
    } catch {
      return { events: [], signals };
    }
    return { events: this.message(msg, signals), signals };
  }

  message(msg: Json, signals: StreamSignals = {}): ThreadEvent[] {
    const at = now();
    const sid = s(msg.session_id);
    if (sid) signals.sessionId = sid;
    switch (msg.type) {
      case 'system':
        return this.system(msg, at, signals);
      case 'stream_event':
        return this.partial(msg, at);
      case 'assistant':
        return this.assistant(msg, at);
      case 'user':
        return this.user(msg, at);
      case 'result':
        return this.result(msg, at, signals);
      case 'control_request': {
        signals.controlRequest = { requestId: s(msg.request_id) ?? '', subtype: s(obj(msg.request).subtype) };
        return [];
      }
      default:
        return [];
    }
  }

  private system(msg: Json, at: string, signals: StreamSignals): ThreadEvent[] {
    const id = s(msg.uuid) ?? randomUUID();
    switch (msg.subtype) {
      case 'init': {
        const mcp = Array.isArray(msg.mcp_servers) ? msg.mcp_servers.map((m) => ({ name: s(obj(m).name) ?? '?', status: s(obj(m).status) ?? '?' })) : [];
        signals.init = {
          model: s(msg.model), cwd: s(msg.cwd), permissionMode: s(msg.permissionMode), mcp,
          tools: Array.isArray(msg.tools) ? msg.tools.length : 0, skills: Array.isArray(msg.skills) ? msg.skills.length : 0,
        };
        // the CLI sends init again on every turn; report the MCP servers that are down once per process
        if (this.initSeen) return [];
        this.initSeen = true;
        // the design plugin's servers (plugin:design:*) have nothing to do with films: never reported
        const down = mcp.filter((m) => m.status !== 'connected' && m.status !== 'pending' && !/^plugin:design:/i.test(m.name));
        if (!down.length) return [];
        return [{ kind: 'system', id, at, text: oneLine(`MCP not connected: ${down.map((m) => `${m.name} (${m.status})`).join(', ')}`, 300) }];
      }
      case 'compact_boundary': {
        const meta = obj(msg.compact_metadata);
        const pre = typeof meta.pre_tokens === 'number' ? ` · ${Math.round(meta.pre_tokens / 1000)}k tokens before` : '';
        return [{ kind: 'compaction', id, at, summary: `Thread compacted (${s(meta.trigger) ?? 'auto'})${pre}` }];
      }
      case 'status':
        return msg.status === 'compacting' ? [{ kind: 'system', id, at, text: 'Compacting the thread…' }] : [];
      case 'permission_denied': {
        const tuid = s(msg.tool_use_id) ?? id;
        this.seenDenials.add(tuid);
        const what = /What required approval:\s*([^]*?)(?:\s+For security,|$)/.exec(s(msg.message) ?? '');
        const reason = what?.[1] ?? s(msg.decision_reason) ?? s(msg.message) ?? '';
        // the same id the transcript reader gives this denial, so history and live merge into one line
        return [{ kind: 'system', id: `denied:${tuid}`, at, text: oneLine(`Permission denied · ${s(msg.tool_name) ?? 'tool'}${reason ? ` · ${reason}` : ''}`, 300) }];
      }
      case 'api_retry':
        return [{ kind: 'system', id, at, text: `Retrying (attempt ${String(msg.attempt)} of ${String(msg.max_retries)}) · ${s(msg.error) ?? 'error'}` }];
      case 'task_started': {
        const card = this.tasks.started(s(msg.task_id) ?? '', s(msg.tool_use_id), s(msg.description));
        return card ? [{ kind: 'task', id: card.id, at, task: card }] : [];
      }
      case 'task_progress': {
        // {task_id, tool_use_id, description: "Running <the call's description>", last_tool_name, usage: {total_tokens, tool_uses, duration_ms}}
        const usage = obj(msg.usage);
        const card = this.tasks.progress(s(msg.task_id), s(msg.tool_use_id), {
          summary: s(msg.summary), description: s(msg.description), lastTool: s(msg.last_tool_name),
          toolUses: typeof usage.tool_uses === 'number' ? usage.tool_uses : undefined,
        }, at);
        return card ? [{ kind: 'task', id: card.id, at, task: card }] : [];
      }
      case 'task_updated': {
        // a terminal status here; the task_notification that follows carries the summary
        const status = s(obj(msg.patch).status);
        if (status !== 'failed' && status !== 'killed' && status !== 'stopped') return [];
        const card = this.tasks.notified(s(msg.task_id), undefined, status === 'failed' ? 'failed' : 'stopped', undefined, undefined, at);
        return card ? [{ kind: 'task', id: card.id, at, task: card }] : [];
      }
      case 'task_notification': {
        // also sent for a sub-agent's own Bash calls (their task_started has owned_by_subagent): those match no card
        const usage = obj(msg.usage);
        const card = this.tasks.notified(s(msg.task_id), s(msg.tool_use_id), s(msg.status) ?? 'completed', s(msg.summary), undefined, at,
          typeof usage.tool_uses === 'number' ? usage.tool_uses : undefined);
        return card ? [{ kind: 'task', id: card.id, at, task: card }] : [];
      }
      default:
        return [];
    }
  }

  /** --include-partial-messages: text deltas of the main thread become assistant_text with partial: true. */
  private partial(msg: Json, at: string): ThreadEvent[] {
    const parent = s(msg.parent_tool_use_id) ?? '';
    if (parent) return []; // sub-agent partials are not shown; their tool lines are
    const ev = obj(msg.event);
    switch (ev.type) {
      case 'message_start': {
        const mid = s(obj(ev.message).id);
        if (mid) this.currentMessage.set(parent, mid);
        return [];
      }
      case 'content_block_start': {
        const mid = this.currentMessage.get(parent);
        const block = obj(ev.content_block);
        if (!mid || block.type !== 'text') return [];
        const n = (this.textCount.get(mid) ?? 0) + 1;
        this.textCount.set(mid, n);
        this.blockText.set(`${mid}:${String(ev.index)}`, { id: `${mid}:t${n}`, text: s(block.text) ?? '' });
        return [];
      }
      case 'content_block_delta': {
        const mid = this.currentMessage.get(parent);
        const delta = obj(ev.delta);
        if (!mid || delta.type !== 'text_delta') return [];
        const b = this.blockText.get(`${mid}:${String(ev.index)}`);
        if (!b) return [];
        b.text += s(delta.text) ?? '';
        return [{ kind: 'assistant_text', id: b.id, at, text: redact(b.text), partial: true }];
      }
      default:
        return [];
    }
  }

  private assistant(msg: Json, at: string): ThreadEvent[] {
    const parent = s(msg.parent_tool_use_id) ?? null;
    const m = obj(msg.message);
    const mid = s(m.id) ?? s(msg.uuid) ?? randomUUID();
    const content = Array.isArray(m.content) ? m.content : [];
    const out: ThreadEvent[] = [];
    if (msg.error && !content.length) out.push({ kind: 'error', id: s(msg.uuid) ?? randomUUID(), at, text: oneLine(`Alma could not answer: ${String(msg.error)}`) });
    for (const raw of content) {
      const b = obj(raw);
      if (parent) {
        // a sub-agent's own steps go on its card
        if (b.type === 'tool_use') {
          const card = this.tasks.step(parent, s(b.id), s(b.name) ?? '?', b.input, at);
          if (card) out.push({ kind: 'task', id: card.id, at, task: card });
          if (AGENT_TOOLS.has(s(b.name) ?? '')) this.tasks.spawn(s(b.id) ?? randomUUID(), b.input, at);
        }
        continue;
      }
      if (b.type === 'text') {
        const n = (this.finalTextCount.get(mid) ?? 0) + 1;
        this.finalTextCount.set(mid, n);
        const text = s(b.text) ?? '';
        if (text.trim()) out.push({ kind: 'assistant_text', id: `${mid}:t${n}`, at, text: redact(text) });
      } else if (b.type === 'tool_use') {
        const name = s(b.name) ?? '?';
        const tid = s(b.id) ?? randomUUID();
        if (AGENT_TOOLS.has(name)) {
          const card = this.tasks.spawn(tid, b.input, at);
          out.push({ kind: 'task', id: card.id, at, task: card });
        } else {
          out.push({ kind: 'tool_use', id: tid, at, name, summary: toolSummary(name, b.input), input: redactDeep(b.input) });
          if (name === 'TaskStop') {
            const card = this.tasks.stopped(s(obj(b.input).task_id) ?? s(obj(b.input).shell_id), at);
            if (card) out.push({ kind: 'task', id: card.id, at, task: card });
          }
        }
      }
    }
    return out;
  }

  private user(msg: Json, at: string): ThreadEvent[] {
    const parent = s(msg.parent_tool_use_id) ?? null;
    const m = obj(msg.message);
    const content = Array.isArray(m.content) ? m.content : [];
    const out: ThreadEvent[] = [];
    for (const raw of content) {
      const b = obj(raw);
      if (b.type !== 'tool_result') continue;
      const tuid = s(b.tool_use_id) ?? '';
      const ok = b.is_error !== true;
      if (this.tasks.isAgent(tuid)) {
        const card = this.tasks.agentResult(tuid, b.content, !ok, msg.tool_use_result, at);
        if (card) out.push({ kind: 'task', id: card.id, at, task: card });
        continue;
      }
      if (parent) {
        // a sub-agent's tool result: a wait on jobs counts what landed, a failure is marked on its step
        const card = this.tasks.stepResult(tuid, b.content, ok, at);
        if (card) out.push({ kind: 'task', id: card.id, at, task: card });
        continue;
      }
      out.push({ kind: 'tool_result', id: `result:${tuid}`, at, toolUseId: tuid, summary: resultSummary(b.content, ok), ok });
    }
    return out;
  }

  private result(msg: Json, at: string, signals: StreamSignals): ThreadEvent[] {
    const sessionId = s(msg.session_id) ?? '';
    const ok = msg.subtype === 'success' && msg.is_error !== true;
    const total = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined;
    const durationMs = typeof msg.duration_ms === 'number' ? msg.duration_ms : undefined;
    signals.result = { ok, totalCostUsd: total, durationMs, sessionId };
    const out: ThreadEvent[] = [];
    for (const d of Array.isArray(msg.permission_denials) ? msg.permission_denials : []) {
      const dd = obj(d);
      const tuid = s(dd.tool_use_id) ?? '';
      if (tuid && this.seenDenials.has(tuid)) continue;
      if (tuid) this.seenDenials.add(tuid);
      out.push({ kind: 'system', id: `denied:${tuid || randomUUID()}`, at, text: oneLine(`Permission denied · ${toolSummary(s(dd.tool_name) ?? 'tool', dd.tool_input)}`, 300) });
    }
    if (!ok) {
      const errors = Array.isArray(msg.errors) ? msg.errors.map(String).join('; ') : s(msg.result) ?? String(msg.subtype);
      out.push({ kind: 'error', id: `error:${s(msg.uuid) ?? randomUUID()}`, at, text: oneLine(errors || 'The turn failed', 400) });
    }
    // costUsd is filled in by the process layer (the turn's share of the session total); total here as a fallback
    out.push({ kind: 'result', id: s(msg.uuid) ?? randomUUID(), at, ok, costUsd: total, durationMs, sessionId });
    return out;
  }
}

