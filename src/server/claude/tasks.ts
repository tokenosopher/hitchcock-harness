// Alma's sub-agents (Agent tool runs) as TaskCards: spawned, working, done or failed.
// While a sub-agent works, its own tool calls reach the stream as assistant/user messages tagged with
// parent_tool_use_id = the Agent tool_use id; each becomes a step on its card and the newest one is the
// card's live line ("higgsfield · generate_image_batch · 12 jobs", "higgsfield · jobs_wait · 14/15").
// The CLI's task_progress events add the tool-call count. See docs/claude-p.md "Live task cards".
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TaskCard } from '../types';
import { projectSlug } from './config';
import { redact } from './redact';
import { oneLine, resultSummary, resultText, toolSummary } from './summarize';

export interface AgentMeta {
  toolUseId: string;
  taskId?: string;            // the CLI's task id (task_started), what stop_task takes
  agentId?: string;           // the id SendMessage takes (from the async launch result); equals taskId for local agents
  background: boolean;
  resumedAt?: string;         // when Alma last woke the finished agent with SendMessage
}

function title(input: Record<string, unknown>): string {
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const job = description || name || (typeof input.subagent_type === 'string' ? input.subagent_type : 'sub-agent');
  // Alma is asked to write descriptions as "<job> · <target>"; anything else is shown whole.
  return `Alma › ${job.replace(/^Alma\s*›\s*/, '')}`;
}

// every update re-sends the whole card (SSE replay, the thread GET): keep it small; the UI shows the last five
const MAX_STEPS = 50;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);

/** Generation jobs a card has submitted and seen land, for "jobs_wait · 14/15". */
interface JobCount { submitted: number; done: Set<string>; failed: Set<string> }

/** A sub-agent's tool call: which card and step it is, so its result can update that step. */
interface StepRef { card: string; index: number; name: string; base: string; waitJobs: number; submits: boolean }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line per sub-agent tool call. MCP calls read "<server> · <tool> · <the fact that matters>":
 *  a batch says how many jobs it submits, a wait how many it waits for (the result replaces it with done/total),
 *  anything else a short prompt or model. Other tools as in the main thread ("Bash · List the films"). */
export function stepLine(name: string, input: unknown): string {
  const i = obj(input);
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!m) return toolSummary(name, input);
  const server = m[1].replace(/^claude_ai_/, '').toLowerCase();
  const tool = m[2];
  const requests = arr(i.requests).length || arr(i.items).length || arr(i.batch).length;
  const jobs = arr(i.jobs).length || arr(i.job_ids).length || arr(i.ids).length;
  let detail = '';
  if (requests) detail = plural(requests, 'job');
  else if (jobs) detail = `waiting on ${plural(jobs, 'job')}`;
  else {
    const p = obj(i.params);
    const prompt = str(i.prompt) ?? str(p.prompt);
    const model = str(i.model) ?? str(p.model);
    const count = typeof p.count === 'number' && p.count > 1 ? plural(p.count, 'image') : '';
    detail = [model, count, prompt ? `“${oneLine(prompt, 48)}”` : str(i.query) ?? str(i.action) ?? ''].filter(Boolean).join(' · ');
  }
  return oneLine(`${server} · ${tool}${detail ? ` · ${detail}` : ''}`);
}

const WAITING = /waiting on its own background/i;
const DONE = /^(completed?|succeeded|success|done|finished|ready)$/i;
const FAILED = /^(failed|error|errored|cancell?ed|canceled|nsfw|rejected|refused|timed?_?out)$/i;

/** Job ids and statuses in a tool result (Higgsfield's jobs_wait answers with indexed statuses).
 *  Reads JSON when the text is JSON, otherwise "job_id … status" pairs; returns nothing when it finds none. */
export function jobStatuses(content: unknown): { id: string; status: string }[] {
  const text = resultText(content);
  const out: { id: string; status: string }[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 6) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Json;
    const status = str(o.status) ?? str(o.state);
    const id = str(o.job_id) ?? str(o.jobId) ?? str(o.id);
    if (status && id) out.push({ id, status });
    for (const k of Object.keys(o)) if (typeof o[k] === 'object') walk(o[k], depth + 1);
  };
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { walk(JSON.parse(t), 0); } catch { /* not JSON after all */ }
  }
  if (!out.length) {
    const re = /"?(?:job_id|jobId)"?\s*[:=]\s*"?([0-9a-f-]{8,})"?[^{}]*?"?status"?\s*[:=]\s*"?([A-Za-z_]+)/g;
    for (let mm = re.exec(t); mm; mm = re.exec(t)) out.push({ id: mm[1], status: mm[2] });
  }
  return out;
}

/** The agent a SendMessage result says it resumed, or nothing (a message queued to a running agent, one to another
 *  session, a failure). The result reads {"success":true,"message":"Resuming agent a02b0a9","resumedAgentId":
 *  "a02b0a936578dac5e","revivedAgentId":"a02b0a936578dac5e","pin":{...}}, as tool_use_result (stream) or toolUseResult
 *  (transcript), and as the same JSON in the tool_result text. */
export function resumedAgent(content: unknown, toolUseResult: unknown): string | undefined {
  let r = obj(toolUseResult);
  if (!str(r.message)) {
    try { r = obj(JSON.parse(resultText(content).trim())); } catch { return undefined; }
  }
  if (r.success !== true || !/^Resuming agent\b/.test(str(r.message) ?? '')) return undefined;
  return str(r.resumedAgentId) ?? str(r.revivedAgentId);
}

export class TaskTracker {
  private cards = new Map<string, TaskCard>();
  private meta = new Map<string, AgentMeta>();
  private byTaskId = new Map<string, string>();
  // added for the live cards (9 Nov); created on first use so an instance made by an older version of this
  // class (kept alive across a dev hot reload by process.ts) takes them on too
  private _steps?: Map<string, StepRef>;
  private _jobs?: Map<string, JobCount>;
  private get steps(): Map<string, StepRef> { return (this._steps ??= new Map()); }
  private get jobs(): Map<string, JobCount> { return (this._jobs ??= new Map()); }

  isAgent(toolUseId: string | null | undefined): boolean {
    return !!toolUseId && this.cards.has(toolUseId);
  }
  get(toolUseId: string): TaskCard | undefined {
    return this.cards.get(toolUseId);
  }
  getMeta(toolUseId: string): AgentMeta | undefined {
    return this.meta.get(toolUseId);
  }
  /** Finds a card by its tool_use id, CLI task id or agent id. */
  resolve(id: string): string | undefined {
    if (this.cards.has(id)) return id;
    if (this.byTaskId.has(id)) return this.byTaskId.get(id);
    for (const m of this.meta.values()) if (m.agentId === id) return m.toolUseId;
    return undefined;
  }
  running(): TaskCard[] {
    return [...this.cards.values()].filter((c) => c.state === 'running' || c.state === 'queued');
  }
  all(): TaskCard[] {
    return [...this.cards.values()];
  }

  private snapshot(id: string): TaskCard {
    const c = this.cards.get(id)!;
    return { ...c, steps: [...c.steps] };
  }

  spawn(toolUseId: string, input: unknown, at: string): TaskCard {
    const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const existing = this.cards.get(toolUseId);
    if (existing) return this.snapshot(toolUseId);
    this.cards.set(toolUseId, { id: toolUseId, title: oneLine(title(i), 120), state: 'running', startedAt: at, steps: [] });
    this.meta.set(toolUseId, { toolUseId, background: i.run_in_background === true });
    return this.snapshot(toolUseId);
  }

  started(taskId: string, toolUseId: string | undefined, description: string | undefined): TaskCard | undefined {
    // a resumed agent's run is started again under the SendMessage's tool_use_id (the CLI's resume path launches it
    // with that id): its card runs again, as when the SendMessage's result confirms the resume
    if (toolUseId && !this.cards.has(toolUseId)) {
      const known = this.resolve(taskId);
      const c = known ? this.cards.get(known) : undefined;
      if (known && c && c.state !== 'running' && c.state !== 'queued') return this.resumed(toolUseId, taskId, undefined, new Date().toISOString());
    }
    // a sub-agent's own Bash calls also send task_started (task_type local_bash, owned_by_subagent): not cards
    if (!toolUseId || !this.cards.has(toolUseId)) return undefined;
    this.byTaskId.set(taskId, toolUseId);
    const m = this.meta.get(toolUseId)!;
    m.taskId = taskId;
    const c = this.cards.get(toolUseId)!;
    if (!c.liveLine) c.liveLine = m.background ? 'started in the background' : 'started';
    void description;
    return this.snapshot(toolUseId);
  }

  /** system/task_progress: sent after each of the sub-agent's tool calls, with `description` "Running <the
   *  call's description>", `last_tool_name` and `usage.tool_uses`. The step line from the tool call itself says
   *  more, so progress only fills the live line while the card has no step yet (or when the CLI sends a
   *  model-written `summary`, which it does only with agentProgressSummaries on). */
  progress(taskId: string | undefined, toolUseId: string | undefined, p: { summary?: string; description?: string; lastTool?: string; toolUses?: number }, at: string): TaskCard | undefined {
    const id = toolUseId && this.cards.has(toolUseId) ? toolUseId : taskId ? this.byTaskId.get(taskId) : undefined;
    if (!id) return undefined;
    const c = this.cards.get(id)!;
    if (c.state !== 'running' && c.state !== 'queued') return undefined;
    let changed = false;
    // the count rides on the next step's update; a frame of its own only when the live line changes
    if (typeof p.toolUses === 'number') c.toolUses = p.toolUses;
    const line = p.summary ?? (!c.steps.length ? p.description?.replace(/^Running\s+/, '') ?? p.lastTool : undefined);
    if (line && oneLine(line) !== c.liveLine) { c.liveLine = oneLine(line); changed = true; }
    void at;
    return changed ? this.snapshot(id) : undefined;
  }

  /** A sub-agent's tool call (assistant tool_use with parent_tool_use_id): a new step, and the live line. */
  step(parent: string, toolUseId: string | undefined, name: string, input: unknown, at: string): TaskCard | undefined {
    // a resumed run's steps may be tagged with the SendMessage that woke it: the same card
    const parentToolUseId = this.cards.has(parent) ? parent : this.byTaskId.get(parent) ?? parent;
    const c = this.cards.get(parentToolUseId);
    if (!c) return undefined;
    let text = stepLine(name, input);
    const i0 = obj(input);
    const known = this.jobs.get(parentToolUseId);
    // a wait on jobs this card submitted reads as the count so far ("jobs_wait · 14/15") until its answer updates it
    if (known?.submitted && (arr(i0.jobs).length || arr(i0.job_ids).length)) text = `${text.replace(/ · waiting on .*$/, '')} · ${known.done.size}/${known.submitted}`;
    c.steps.push({ at, text });
    if (c.steps.length > MAX_STEPS) {
      const drop = c.steps.length - MAX_STEPS;
      c.steps.splice(0, drop);
      for (const s of this.steps.values()) if (s.card === parentToolUseId) s.index -= drop;
    }
    const i = obj(input);
    const requests = arr(i.requests).length || arr(i.items).length || arr(i.batch).length;
    if (requests && /^mcp__/.test(name)) {
      const j = this.jobs.get(parentToolUseId) ?? { submitted: 0, done: new Set<string>(), failed: new Set<string>() };
      j.submitted += requests;
      this.jobs.set(parentToolUseId, j);
    }
    if (toolUseId) this.steps.set(toolUseId, { card: parentToolUseId, index: c.steps.length - 1, name, base: text, waitJobs: arr(i.jobs).length || arr(i.job_ids).length, submits: requests > 0 });
    if (c.state === 'running' || c.state === 'queued') c.liveLine = text;
    return this.snapshot(parentToolUseId);
  }

  /** The result of a sub-agent's tool call (user tool_result with parent_tool_use_id). A wait on generation
   *  jobs becomes "jobs_wait · 14/15" (landed of all the card has submitted); a failure is marked on its step. */
  stepResult(toolUseId: string, content: unknown, ok: boolean, at: string): TaskCard | undefined {
    const ref = this.steps.get(toolUseId);
    if (!ref) return undefined;
    this.steps.delete(toolUseId);
    const c = this.cards.get(ref.card);
    if (!c || !c.steps[ref.index]) return undefined;
    let text = ref.base;
    if (!ok) {
      text = oneLine(`${ref.base} · failed · ${resultSummary(content, false)}`);
    } else if (/^mcp__/.test(ref.name) && !ref.submits) {
      // a wait or status call (a submission's answer lists its jobs as queued: not progress)
      const statuses = jobStatuses(content);
      if (statuses.length) {
        const j = this.jobs.get(ref.card) ?? { submitted: 0, done: new Set<string>(), failed: new Set<string>() };
        for (const s of statuses) {
          if (DONE.test(s.status)) j.done.add(s.id);
          else if (FAILED.test(s.status)) j.failed.add(s.id);
        }
        this.jobs.set(ref.card, j);
        const total = Math.max(j.submitted, j.done.size + j.failed.size, ref.waitJobs);
        const head = ref.base.replace(/ · waiting on .*$/, '').replace(/ · \d+\/\d+$/, '');
        text = `${head} · ${j.done.size}/${total}${j.failed.size ? ` · ${j.failed.size} failed` : ''}`;
      }
    }
    if (text === c.steps[ref.index].text) return undefined;
    c.steps[ref.index] = { ...c.steps[ref.index], text };
    // the live line follows the newest step only
    if ((c.state === 'running' || c.state === 'queued') && ref.index === c.steps.length - 1) c.liveLine = text;
    void at;
    return this.snapshot(ref.card);
  }

  /** The Agent tool's own result: either the finished answer, or "launched in the background". */
  agentResult(toolUseId: string, content: unknown, isError: boolean, toolUseResult: unknown, at: string): TaskCard | undefined {
    const c = this.cards.get(toolUseId);
    if (!c) return undefined;
    const m = this.meta.get(toolUseId)!;
    const r = (toolUseResult && typeof toolUseResult === 'object' ? toolUseResult : {}) as Record<string, unknown>;
    const text = resultText(content);
    const async = r.status === 'async_launched' || /^Async agent launched/i.test(text);
    if (typeof r.agentId === 'string') m.agentId = r.agentId;
    const idMatch = /agentId:\s*([A-Za-z0-9_-]+)/.exec(text);
    if (!m.agentId && idMatch) m.agentId = idMatch[1];
    if (async && !isError) {
      m.background = true;
      c.liveLine = c.liveLine ?? 'working in the background';
      return this.snapshot(toolUseId);
    }
    c.state = isError ? 'failed' : 'done';
    c.endedAt = at;
    const body = Array.isArray(r.content) ? resultText(r.content) : text;
    c.result = { text: redact(body.trim()) };
    c.liveLine = isError ? oneLine(body || 'failed') : doneLine(c);
    return this.snapshot(toolUseId);
  }

  /** A background sub-agent finished (system task_notification, or <task-notification> in the transcript). */
  notified(taskId: string | undefined, toolUseId: string | undefined, status: string, summary: string | undefined, resultBody: string | undefined, at: string, toolUses?: number): TaskCard | undefined {
    let id = toolUseId && this.cards.has(toolUseId) ? toolUseId : undefined;
    if (!id && taskId) id = this.resolve(taskId);
    if (!id) return undefined;
    const c = this.cards.get(id)!;
    if (typeof toolUses === 'number') c.toolUses = toolUses;
    // a note that the agent ended a turn while its own background job (a render) still runs is not the end:
    // it is woken again when that job finishes, and reports then (12 Nov: "previz · S5" left the strip early)
    if (status === 'completed' && WAITING.test(summary ?? '')) {
      if (c.state === 'done' && !c.result) c.state = 'running';
      if (c.state !== 'running' && c.state !== 'queued') return undefined;
      c.endedAt = undefined;
      c.liveLine = 'waiting on its own background job';
      return this.snapshot(id);
    }
    // a job that already reported keeps its report: a late "stopped" for it changes nothing
    if (status !== 'completed' && c.state === 'done') return undefined;
    c.state = status === 'completed' ? 'done' : 'failed';
    c.endedAt = at;
    c.liveLine = status === 'stopped' || status === 'killed' ? 'stopped' : status === 'completed' ? doneLine(c) : oneLine(summary ?? 'failed');
    if (resultBody || summary) c.result = { text: redact((resultBody ?? summary ?? '').trim()) };
    return this.snapshot(id);
  }

  /** History: a job still marked running whose own file says otherwise. Its agent ended its last turn and nothing
   *  has been written for 45 minutes (its report was lost, for example when the CLI restarted), or nothing at all
   *  has been written for six hours. A job that ended a turn to wait on its own render writes again within minutes. */
  async settleStale(cwd: string, sessionId: string, now = Date.now()): Promise<string[]> {
    const dir = path.join(os.homedir(), '.claude', 'projects', projectSlug(cwd), sessionId, 'subagents');
    const settled: string[] = [];
    for (const [toolUseId, m] of this.meta) {
      const c = this.cards.get(toolUseId);
      const agentId = m.agentId ?? m.taskId;
      if (!c || !agentId || (c.state !== 'running' && c.state !== 'queued')) continue;
      const file = path.join(dir, `agent-${agentId}.jsonl`);
      let age: number;
      let ended = false;
      try {
        age = now - (await stat(file)).mtimeMs;
        const raw = await readFile(file, 'utf8');
        const last = obj(JSON.parse(raw.trimEnd().split('\n').pop() ?? '{}'));
        ended = last.type === 'assistant' && obj(last.message).stop_reason === 'end_turn';
      } catch { continue; }
      if ((ended && age > 45 * 60_000) || age > 6 * 3_600_000) {
        c.state = ended ? 'done' : 'failed';
        c.endedAt = new Date(now - age).toISOString();
        c.liveLine = ended ? `${doneLine(c)} · its report was not seen` : 'no longer running';
        settled.push(toolUseId);
      }
    }
    return settled;
  }

  /** Alma woke a sub-agent with SendMessage. Confirmed by the tool's result
   *  {"success":true,"message":"Resuming agent a02b0a9","resumedAgentId":"a02b0a936578dac5e",...}; the run ends with a
   *  task_notification whose task-id is the agent id and whose tool-use-id is this SendMessage's id. The agent's card
   *  runs again under its own title; an agent the app never saw gets a card of its own, titled by the message's summary. */
  resumed(sendToolUseId: string, agentId: string, summary: string | undefined, at: string): TaskCard {
    let id = this.resolve(agentId);
    const fresh = !id;
    if (!id) {
      id = agentId;
      this.cards.set(id, { id, title: oneLine(title({ description: summary ?? '' }), 120), state: 'running', startedAt: at, steps: [] });
      this.meta.set(id, { toolUseId: id, taskId: agentId, agentId, background: true });
    }
    const c = this.cards.get(id)!;
    const m = this.meta.get(id)!;
    m.agentId ??= agentId;
    this.byTaskId.set(agentId, id);
    if (sendToolUseId) this.byTaskId.set(sendToolUseId, id);
    if (!fresh && (c.state === 'running' || c.state === 'queued')) return this.snapshot(id);
    m.resumedAt = at;
    c.state = 'running';
    c.endedAt = undefined;
    c.liveLine = 'resumed with a new message';
    // its file grows again: read it again at the next history read
    this.filledDone.delete(id);
    return this.snapshot(id);
  }

  /** Takes over the end of jobs another reading (the transcript) knows about and this tracker never heard. */
  learnEnded(from: TaskTracker): boolean {
    let changed = false;
    for (const c of this.cards.values()) {
      if (c.state !== 'running' && c.state !== 'queued') continue;
      const other = from.get(c.id);
      if (!other || (other.state !== 'done' && other.state !== 'failed')) continue;
      // an end from before the agent was resumed is not this run's end
      const resumedAt = this.meta.get(c.id)?.resumedAt;
      if (resumedAt && (!other.endedAt || Date.parse(other.endedAt) < Date.parse(resumedAt))) continue;
      c.state = other.state; c.endedAt = other.endedAt; c.liveLine = other.liveLine; c.result = c.result ?? other.result;
      changed = true;
    }
    return changed;
  }

  /** Alma stopped a sub-agent herself with TaskStop: no notification follows, so the card ends here. */
  stopped(taskId: string | undefined, at: string): TaskCard | undefined {
    const id = taskId ? this.resolve(taskId) : undefined;
    const c = id ? this.cards.get(id) : undefined;
    if (!id || !c || (c.state !== 'running' && c.state !== 'queued')) return undefined;
    c.state = 'failed';
    c.endedAt = at;
    c.liveLine = 'stopped';
    return this.snapshot(id);
  }

  /** History: the sub-agents' own tool calls are not in the session's JSONL (they are sidechains) but in
   *  <session>/subagents/agent-<agentId>.jsonl beside it. Fills every card's steps from there, without
   *  changing a finished card's state or live line. */
  private filled = new Set<string>();
  private filledDone = new Set<string>();

  async fillFromSubagents(cwd: string, sessionId: string): Promise<void> {
    const dir = path.join(os.homedir(), '.claude', 'projects', projectSlug(cwd), sessionId, 'subagents');
    for (const [toolUseId, m] of this.meta) {
      const agentId = m.agentId ?? m.taskId;
      const c = this.cards.get(toolUseId);
      if (!agentId || !c) continue;
      // The tracker now lives across reads (the history is kept, not rebuilt): a finished job's file is read once;
      // a running job's is read again each time, from the start, since it is still growing.
      const running = c.state === 'running' || c.state === 'queued';
      if (this.filled.has(toolUseId)) {
        if (!running && this.filledDone.has(toolUseId)) continue;
        // read again from the start: forget what the last read counted for this card
        c.steps = [];
        this.jobs.delete(toolUseId);
        for (const [k, s] of this.steps) if (s.card === toolUseId) this.steps.delete(k);
      } else if (c.steps.length) continue;
      let raw: string;
      try { raw = await readFile(path.join(dir, `agent-${agentId}.jsonl`), 'utf8'); } catch { continue; }
      this.filled.add(toolUseId);
      if (!running) this.filledDone.add(toolUseId);
      const live = { state: c.state, liveLine: c.liveLine };
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let e: Json;
        try { e = obj(JSON.parse(line)); } catch { continue; }
        const at = str(e.timestamp) ?? c.startedAt;
        const content = arr(obj(e.message).content).map(obj);
        if (e.type === 'assistant') {
          for (const b of content) if (b.type === 'tool_use') this.step(toolUseId, str(b.id), str(b.name) ?? '?', b.input, at);
        } else if (e.type === 'user') {
          for (const b of content) if (b.type === 'tool_result') this.stepResult(str(b.tool_use_id) ?? '', b.content, b.is_error !== true, at);
        }
      }
      if (live.state !== 'running' && live.state !== 'queued') c.liveLine = live.liveLine === 'done' ? doneLine(c) : live.liveLine;
      if (!c.toolUses && c.steps.length) c.toolUses = c.steps.length;
    }
  }
}

/** A finished card's live line: "done · 3 tool calls". */
function doneLine(c: TaskCard): string {
  const n = c.toolUses ?? c.steps.length;
  return n ? `done · ${plural(n, 'tool call')}` : 'done';
}
