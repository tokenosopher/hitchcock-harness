// npm run smoke:thread -- "<text>" [--film <slug>] [--new] [--raw <file>]
// Sends one message to Alma in the film repo and prints the ThreadEvents as they come.
// It spends a little of the user's plan: run it once or twice, never in a loop.
import { appendFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlmaSession } from '../src/server/claude/process';
import { readHistory } from '../src/server/claude/transcript';
import type { ThreadEvent } from '../src/server/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flags = new Set(['--film', '--raw']);
const words = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !flags.has(all[i - 1] ?? ''));
const text = words.join(' ').trim() || 'In one line, say which film folders you can see under assets/films, and do nothing else.';
const film = arg('--film') ?? 'smoke-test';
const rawFile = arg('--raw') ?? path.join(os.tmpdir(), `alma-smoke-${Date.now()}.jsonl`);
writeFileSync(rawFile, '');

function show(ev: ThreadEvent): void {
  switch (ev.kind) {
    case 'assistant_text':
      if (ev.partial) return void process.stdout.write('.');
      return console.log(`\n[assistant_text ${ev.id}] ${ev.text}`);
    case 'tool_use':
      return console.log(`[tool_use ${ev.name}] ${ev.summary}`);
    case 'tool_result':
      return console.log(`[tool_result ${ev.ok ? 'ok' : 'failed'}] ${ev.summary}`);
    case 'task':
      return console.log(`[task ${ev.task.state}] ${ev.task.title} · ${ev.task.liveLine ?? ''}`);
    case 'result':
      return console.log(`[result ${ev.ok ? 'ok' : 'failed'}] session ${ev.sessionId} · ${ev.durationMs ?? '?'} ms · $${ev.costUsd ?? '?'} (plan estimate)`);
    default:
      return console.log(`[${ev.kind}] ${JSON.stringify(ev)}`);
  }
}

async function main(): Promise<void> {
  const alma = new AlmaSession(film, { fresh: process.argv.includes('--new'), onRaw: (line) => appendFileSync(rawFile, line + '\n') });
  const resumeId = await alma.currentSessionId();
  console.log(`film key: ${film} · cwd: ${alma.cwd} · ${resumeId ? `resuming ${resumeId}` : 'new session'}`);
  console.log(`raw stream (redacted): ${rawFile}`);
  const done = new Promise<void>((resolve) => {
    alma.subscribe((ev) => {
      show(ev);
      if (ev.kind === 'result' || (ev.kind === 'error' && !alma.alive)) resolve();
    });
  });
  await alma.send(text);
  const timer = setTimeout(() => { console.log('\n[smoke] no result after 5 minutes, closing'); void alma.close(5000); }, 5 * 60 * 1000);
  await done;
  // closing stdin lets background sub-agents finish; their notifications print as they come
  console.log('[smoke] turn ended; closing stdin and waiting for the CLI to exit');
  await alma.close(5 * 60 * 1000);
  clearTimeout(timer);
  const sid = await alma.currentSessionId();
  if (sid) {
    const h = await readHistory(alma.cwd, sid);
    console.log(`[smoke] transcript: ${h.events.length} events (${h.events.map((e) => e.kind).join(', ')})${h.warnings.length ? ` · ${h.warnings.join('; ')}` : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
