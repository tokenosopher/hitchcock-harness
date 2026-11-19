#!/usr/bin/env node
// One runner for the unit checks (scripts/*-test.ts; tests/README.md says which to run when):
//   npm run test:quick              the fast checks, in a few seconds
//   npm run test:changed            the checks of what changed against main (committed or not)
//   npm run test:slow               every check, the slow ones included
//   node tests/run.mjs render refs  the checks whose path has one of these words
// Options: --base <branch or commit> (test:changed's; main), --plan (say what would run, run nothing).
// Which check covers what, and its tier, is tests/map.mjs. Each check runs in its own process, four at a time, with
// HARNESS_ALMA_DRYRUN=1 set, so none can reach a real Alma.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MAP, { manual as MANUAL } from './map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes(`--${name}`);
const words = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && argv[i - 1] !== '--plan'));
const MODE = ['quick', 'changed', 'slow'].includes(words[0]) ? words[0] : 'files';
const PICKS = MODE === 'files' ? words : words.slice(1);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(process.env.TEST_OUT ?? path.join(os.tmpdir(), 'hh-tests'), `${MODE}-${STAMP}`);
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');

fs.mkdirSync(OUT, { recursive: true });
const logFile = fs.createWriteStream(path.join(OUT, 'run.log'));
const log = (line = '') => logFile.write(`${line}\n`);
const say = (line = '') => { console.log(line); log(line); };
const secs = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;

// ---- what to run

/** A glob as a pattern: ** any folders, * any name. */
const globRe = (g) => new RegExp(`^${g.split('**/').map((p) => p.split('**').map((q) => q.split('*').map((r) => r.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')).join('(?:.*/)?')}$`);
const covered = (entry, files) => files.filter((f) => (entry.covers ?? []).some((g) => globRe(g).test(f)));

/** The files changed against `base`'s branch point: committed, staged, not staged and new. */
function changedFiles(base) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const from = git('merge-base', base, 'HEAD')[0];
  return [...new Set([...git('diff', '--name-only', from), ...git('ls-files', '--others', '--exclude-standard')])];
}

function plan() {
  const jobs = [];
  const job = (e, why) => jobs.push({ file: e.file, why, secs: e.secs ?? 1 });
  if (MODE === 'quick') {
    for (const e of MAP) if (e.tier === 'quick') job(e, 'quick');
  } else if (MODE === 'slow') {
    for (const e of MAP) job(e, e.tier === 'slow' ? 'slow' : 'quick');
  } else if (MODE === 'files') {
    if (!PICKS.length) { console.error('Name the checks to run (part of their path), or say quick, changed or slow.'); process.exit(2); }
    for (const e of MAP) if (PICKS.some((p) => e.file.includes(p))) job(e, 'named');
    if (!jobs.length) { console.error(`No check in tests/map.mjs has ${PICKS.join(' or ')} in its path.`); process.exit(2); }
  } else {
    const base = opt('base', 'main');
    const files = changedFiles(base);
    say(`Changed against ${base}: ${files.length} files${files.length ? `: ${files.slice(0, 12).join(', ')}${files.length > 12 ? ', …' : ''}` : ''}`);
    const runner = files.some((f) => f === 'tests/run.mjs' || f === 'tests/map.mjs');
    for (const e of MAP) {
      const hits = covered(e, files);
      if (files.includes(e.file)) job(e, 'the check itself changed');
      else if (hits.length) job(e, `covers ${hits[0]}${hits.length > 1 ? ` and ${hits.length - 1} more` : ''}`);
      else if (runner && e.tier === 'quick') job(e, 'the runner or its map changed (the quick checks)');
    }
    if (!jobs.length) {
      say('No check in tests/map.mjs covers these files: running the quick tier instead.');
      for (const e of MAP) if (e.tier === 'quick') job(e, 'quick (nothing else matched)');
    }
  }
  for (const j of jobs) if (MANUAL.includes(j.file)) throw new Error(`${j.file} is a hand tool and must not be in the map`);
  return jobs;
}

// ---- running

/** One check: its own process, under a time limit, never able to reach a real Alma. */
function runUnit(j) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(TSX, [j.file], { cwd: ROOT, env: { ...process.env, HARNESS_ALMA_DRYRUN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    p.stdout.on('data', (d) => { text += d; });
    p.stderr.on('data', (d) => { text += d; });
    const limit = setTimeout(() => { text += `\nstopped after ${secs(Date.now() - t0)}`; p.kill('SIGKILL'); }, Math.max(180000, j.secs * 4000));
    p.on('close', (code) => {
      clearTimeout(limit);
      log(`\n# ${j.file}\n${text}`);
      const lines = text.trim().split('\n');
      const fails = lines.filter((l) => /^(FAIL|✗|not ok)|\bFAIL\b/.test(l)).slice(0, 8);
      resolve({ ok: code === 0, ms: Date.now() - t0, failed: code === 0 ? [] : [...fails, ...(fails.length ? [] : lines.slice(-6))] });
    });
  });
}

const t0 = Date.now();
const jobs = plan();
say(`${MODE === 'files' ? 'Named' : MODE[0].toUpperCase() + MODE.slice(1)}: ${jobs.length} checks · log: ${path.join(OUT, 'run.log')}`);
for (const j of jobs) log(`plan  ${j.file}  [${j.why}]`);
if (flag('plan')) {
  for (const j of jobs) say(`  ${j.file}  ${j.why}`);
  process.exit(0);
}

const results = [];
const queue = [...jobs].sort((a, b) => b.secs - a.secs);
await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
  for (let j = queue.shift(); j; j = queue.shift()) {
    const r = await runUnit(j);
    results.push({ j, r });
    say(`${r.ok ? 'ok  ' : 'FAIL'} ${j.file} · ${secs(r.ms)}`);
    for (const l of r.failed) say(`       ${l}`);
  }
}));

const failed = results.filter(({ r }) => !r.ok);
say(`\n${'='.repeat(72)}`);
for (const { j } of failed) say(`FAIL  ${j.file}`);
say(`${results.length} checks run, ${failed.length} failed · ${secs(Date.now() - t0)} · ${path.join(OUT, 'run.log')}`);
logFile.end(() => process.exit(failed.length ? 1 : 0));
