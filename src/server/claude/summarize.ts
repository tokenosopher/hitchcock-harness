// One-line summaries of tool calls and results, Claude Code style ("Read assets/films/x/brief.md").
import { redact } from './redact';
import { claudeConfig } from './config';
import { harnessConfig } from '../config';

/** The assets folder (HARNESS_DRIVE_ROOT when it is set elsewhere, else <studio>/assets). */
const assetsRoot = (): string => harnessConfig().driveRoot.replace(/\/$/, '');

/** Paths as the user knows them: relative to the studio folder, the assets folder shown as assets/. */
export function shortPath(p: string): string {
  const repo = claudeConfig().filmRepo.replace(/\/$/, '');
  const assets = assetsRoot();
  let out = p;
  if (out.startsWith(repo + '/')) out = out.slice(repo.length + 1);
  if (out.startsWith(assets)) out = 'assets' + out.slice(assets.length);
  return out.replace(/^\/Users\/[^/]+\//, '~/');
}

function shortenPathsIn(text: string): string {
  const repo = claudeConfig().filmRepo.replace(/\/$/, '');
  return text.split(repo + '/').join('').split(assetsRoot()).join('assets');
}

export function oneLine(text: string, max = 140): string {
  const flat = redact(shortenPathsIn(text)).replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length ? v : undefined;
}

/** "Bash · List the film folders", "Read assets/films/…/brief.md", "higgsfield · generate_video". */
export function toolSummary(name: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const p = str(i.file_path) ?? str(i.path) ?? str(i.notebook_path);
  switch (name) {
    case 'Bash':
      return oneLine(`Bash · ${str(i.description) ?? str(i.command) ?? ''}`);
    case 'Read':
      return oneLine(`Read ${p ? shortPath(p) : ''}`);
    case 'Write':
      return oneLine(`Write ${p ? shortPath(p) : ''}`);
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return oneLine(`Edit ${p ? shortPath(p) : ''}`);
    case 'Grep':
      return oneLine(`Search "${str(i.pattern) ?? ''}"${p ? ` in ${shortPath(p)}` : ''}`);
    case 'Glob':
      return oneLine(`Find ${str(i.pattern) ?? ''}${p ? ` in ${shortPath(p)}` : ''}`);
    case 'Skill':
      return oneLine(`Skill · ${str(i.skill) ?? str(i.command) ?? ''}`);
    case 'WebFetch':
      return oneLine(`Fetch ${(str(i.url) ?? '').replace(/\?.*$/, '')}`);
    case 'WebSearch':
      return oneLine(`Search the web · ${str(i.query) ?? ''}`);
    case 'ToolSearch':
      return oneLine(`Load tools · ${str(i.query) ?? ''}`);
    case 'TodoWrite':
      return 'Update the to-do list';
    case 'SendMessage':
      return oneLine(`Message a sub-agent · ${str(i.summary) ?? str(i.message) ?? ''}`);
    case 'TaskStop':
      return 'Stop a task';
    case 'Agent':
    case 'Task':
      return oneLine(`Sub-agent · ${str(i.description) ?? ''}`);
    default: {
      const m = /^mcp__(.+?)__(.+)$/.exec(name);
      if (m) {
        const server = m[1].replace(/^claude_ai_/, '').toLowerCase();
        const detail = str(i.prompt) ?? str(i.model) ?? str(i.query) ?? '';
        return oneLine(`${server} · ${m[2]}${detail ? ` · ${detail}` : ''}`);
      }
      return oneLine(name);
    }
  }
}

/** The text inside a tool_result block's content (string or text parts). */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && (c as { type?: unknown }).type === 'text' ? String((c as { text?: unknown }).text ?? '') : c && typeof c === 'object' && (c as { type?: unknown }).type === 'image' ? '[image]' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function resultSummary(content: unknown, ok: boolean): string {
  const text = resultText(content).trim();
  if (!text) return ok ? 'done' : 'failed';
  const first = text.split('\n').find((l) => l.trim()) ?? text;
  const lines = text.split('\n').length;
  return oneLine(lines > 1 ? `${first} (+${lines - 1} lines)` : first, 160);
}
