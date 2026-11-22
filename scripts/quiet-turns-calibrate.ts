// npx tsx scripts/quiet-turns-calibrate.ts <transcript.jsonl> <film repo folder>
// Read only: runs the thread's transcript reader (readHistory) over one Alma session's transcript and says
// which turns she started on her own schedule the chat hides (changed nothing) and which it shows, with the time and the
// last reply line of each shown one. Nothing is written: the reader only opens and stats files, and this script runs
// from a temp folder with its own HARNESS_DIR.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [file, cwd] = process.argv.slice(2);
if (!file || !cwd) {
  console.error('usage: npx tsx scripts/quiet-turns-calibrate.ts <transcript.jsonl> <film repo folder>');
  process.exit(2);
}
const scratch = mkdtempSync(path.join(os.tmpdir(), 'quiet-calibrate-'));
process.chdir(scratch);
process.env.HARNESS_DIR = scratch;

async function main(): Promise<void> {
  const { readHistory, transcriptPath } = await import('../src/server/claude/transcript');
  const { hideable, quietScheduled } = await import('../src/server/claude/quietTurns');
  const abs = path.resolve(file);
  const m = /^(.*)\/projects\/[^/]+\/([^/]+)\.jsonl$/.exec(abs);
  if (!m) throw new Error('not a transcript path (<account>/projects/<slug>/<session>.jsonl)');
  const [, home, sid] = m;
  if (transcriptPath(cwd, sid, home) !== abs) throw new Error(`the film folder does not match the transcript's project folder (${transcriptPath(cwd, sid, home)})`);
  const t0 = Date.now();
  const h = await readHistory(cwd, sid, home);
  const turns = [...h.scheduled, ...(h.open?.origin === 'scheduled' ? [h.open] : [])];
  // the last turn counts as over here (Alma is not in a turn while this runs against a saved transcript)
  const hidden = turns.filter((t) => quietScheduled(t));
  const shown = turns.filter((t) => !quietScheduled(t));
  const ids = new Set([...h.hidden, ...(quietScheduled(h.open) ? h.open!.ids : [])]);
  const dropped = h.events.filter((e) => hideable(e) && ids.has(e.id));
  const line = (s?: string) => (s ?? '(no reply)').split('\n').map((x) => x.trim()).filter(Boolean).pop() ?? '(no reply)';
  console.log(`transcript: ${abs}`);
  console.log(`read in ${Date.now() - t0} ms · ${h.events.length} events · ${h.warnings.join('; ') || 'no warnings'}`);
  console.log(`scheduled turns: ${turns.length} · hidden ${hidden.length} · shown ${shown.length}`);
  console.log(`events the chat drops: ${dropped.length} (${['assistant_text', 'tool_use', 'tool_result'].map((k) => `${dropped.filter((e) => e.kind === k).length} ${k}`).join(', ')})`);
  console.log('\nshown (time UTC · last reply line):');
  for (const t of shown) console.log(`  ${t.at.slice(0, 16).replace('T', ' ')} · ${line(t.last).slice(0, 150)}`);
  const counts = new Map<string, number>();
  for (const t of hidden) counts.set(line(t.last), (counts.get(line(t.last)) ?? 0) + 1);
  console.log('\nhidden, by last reply line (count · line):');
  for (const [l, c] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)} · ${l.slice(0, 150)}`);
}

main().then(() => rmSync(scratch, { recursive: true, force: true }), (e: unknown) => {
  console.error(e);
  rmSync(scratch, { recursive: true, force: true });
  process.exit(1);
});
