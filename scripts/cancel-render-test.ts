// npx tsx scripts/cancel-render-test.ts
// Cancelling a render, on a tiny synthetic film in a temp folder (deleted after), with real
// ffmpeg: a queued render cancelled never runs; a running one's own ffmpeg exits, its scratch folder (its partial
// files) is gone and nothing lands in cut/renders/; the next queued render then runs to the end; a process this test
// started itself (`sleep 60`) is still alive afterwards, so nothing else was touched; a cancelled render can be asked
// for again; cancelling one that is done or not there answers plainly. Never touches a real film.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const root = mkdtempSync(path.join(os.tmpdir(), 'cancel-render-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';
delete process.env.HARNESS_AUTO_480P;

let checks = 0;
function check(what: string, ok: boolean, got = ''): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what}${got ? ` · ${got}` : ''}`);
  if (!ok) throw new Error(`failed: ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 20000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(50); }
  return ok();
}
/** Is this exact pid a live process? `ps -p` reads it; nothing is sent to it. */
const alive = (pid: number): boolean => {
  try {
    const stat = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
    return stat.length > 0 && !stat.startsWith('Z');
  } catch { return false; }
};

const dir = path.join(repo, 'assets', 'films', 'synth');
const version = (v: string, w: number, h: number, src: string, out: number) => JSON.stringify({
  version: v, fps: 24, width: w, height: h, by: 'user', at: new Date().toISOString(), note: v, markers: [],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src, in: 0, out, at: 0 }] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'c1a', src, in: 0, out, at: 0 }] },
  ],
}, null, 1);

async function main(): Promise<void> {
  mkdirSync(path.join(dir, 'media'), { recursive: true });
  mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
  const media = (name: string, secs: number) => execFileSync(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=480x854:r=24:d=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${secs}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', path.join(dir, 'media', name)]);
  media('long.mp4', 90);
  media('a.mp4', 2);
  writeFileSync(path.join(repo, 'films.txt'), 'synth\n');
  // v1: a master of 90 s at 1080 × 1920 (x264 slow: long enough to be cancelled while it runs); v2: 1.5 s
  writeFileSync(path.join(dir, 'cut', 'v1.json'), version('v1', 1080, 1920, 'media/long.mp4', 90));
  writeFileSync(path.join(dir, 'cut', 'v2.json'), version('v2', 480, 854, 'media/a.mp4', 1.5));

  const R = await import('../src/server/edit/render');
  const T = await import('../src/server/edit/timeline');
  const film = await T.cutFilm('synth');
  const has = (rel: string) => existsSync(path.join(dir, rel));
  const tmpDir = path.join(root, 'harness', 'render-tmp');
  const scratchOf = (prefix: string) => (existsSync(tmpDir) ? readdirSync(tmpDir).filter((n) => n.startsWith(prefix)) : []);

  // a long-lived process of the test's own, by its own pid: it must outlive every cancel below
  const sleeper = spawn('/bin/sleep', ['60'], { stdio: 'ignore' });
  const sleepPid = sleeper.pid!;
  check('the test\'s own sleep 60 is running', alive(sleepPid), String(sleepPid));

  try {
    console.log('== three renders asked: v1 master (long), v2 master, v2 480p');
    const a = await R.queueRender('synth', 'v1', 'master');
    const b = await R.queueRender('synth', 'v2', 'master');
    const c = await R.queueRender('synth', 'v2', 'proxy');
    check('the first starts, the other two wait', (a.state === 'queued' || a.state === 'running') && b.state === 'queued' && c.state === 'queued', [a, b, c].map((x) => x.state).join(','));

    console.log('== a queued render cancelled');
    const cb = await R.cancelRender('synth', 'v2', 'master');
    check('it answers cancelled, before it started', cb.cancelled && cb.state.state === 'cancelled' && /before it started/.test(cb.said), cb.said);

    console.log('== the running render cancelled');
    check('v1 master starts and its ffmpeg runs', await until(() => R.jobChildPids('synth', 'v1', 'master').length > 0, 30000));
    await sleep(1500);   // let it write some of its file
    const pids = R.jobChildPids('synth', 'v1', 'master');
    const running = await R.renderStates(film, 'v1');
    check('it is running, its ffmpeg alive', running.master?.state === 'running' && pids.length > 0 && pids.every(alive), `${running.master?.state} ${Math.round(running.master?.percent ?? 0)}% pids ${pids.join(',')}`);
    check('its scratch folder holds its partial file', scratchOf('synth-v1-master-').length === 1 && readdirSync(path.join(tmpDir, scratchOf('synth-v1-master-')[0])).includes('out.mp4'));
    const t0 = Date.now();
    const ca = await R.cancelRender('synth', 'v1', 'master');
    check('it answers cancelled', ca.cancelled && ca.state.state === 'cancelled', `${ca.said} (${Date.now() - t0} ms)`);
    check('its ffmpeg has exited', await until(() => pids.every((p) => !alive(p)), 6000), pids.join(','));
    check('its scratch folder and partial file are gone', scratchOf('synth-v1-master-').length === 0);
    check('nothing landed in cut/renders', !has('cut/renders/v1-master.mp4'));
    check('the version records no master', !(JSON.parse(readFileSync(path.join(dir, 'cut', 'v1.json'), 'utf8')) as { renders?: { master?: unknown } }).renders?.master);
    check('its log says it was cancelled', /CANCELLED at \d+%: stopped on request; nothing written/.test(readFileSync(path.join(dir, 'cut', 'renders', 'v1.log'), 'utf8')));
    check('the page sees it cancelled', (await R.renderStates(film, 'v1')).master?.state === 'cancelled');

    console.log('== the queue moves on');
    await R.drain();
    check('the next queued render ran to the end', has('cut/renders/v2-proxy.mp4') && (await R.renderStates(film, 'v2')).proxy?.state === 'done');
    check('the cancelled queued one never ran', !has('cut/renders/v2-master.mp4') && (await R.renderStates(film, 'v2')).master?.state === 'cancelled');
    check('the test\'s own sleep 60 is still alive', alive(sleepPid), String(sleepPid));

    console.log('== plain answers');
    const done = await R.cancelRender('synth', 'v2', 'proxy');
    check('cancelling one that is done: not cancelled, said plainly', !done.cancelled && done.state.state === 'done' && done.said === 'Nothing to cancel: the 480p of v2 is already made.', done.said);
    const none = await R.cancelRender('synth', 'v1', 'proxy');
    check('cancelling one never asked: not cancelled, said plainly', !none.cancelled && none.state.state === 'none' && none.said === 'Nothing to cancel: the 480p of v1 is not queued or running.', none.said);
    const twice = await R.cancelRender('synth', 'v2', 'master');
    check('cancelling it again: said plainly', !twice.cancelled && /cancelled already/.test(twice.said), twice.said);

    console.log('== a running render with options cancelled (its ffmpeg spawned by the variant path)');
    const loud = { loudness: { lufs: -16, truePeak: -1 } };
    const tag = (await import('../src/server/edit/render-options')).optionsTag(loud);
    await R.queueRender('synth', 'v1', 'master', { options: loud });
    check('it starts and its ffmpeg runs', await until(() => R.jobChildPids('synth', 'v1', 'master', tag).length > 0, 30000));
    const vp = R.jobChildPids('synth', 'v1', 'master', tag);
    const cv = await R.cancelRender('synth', 'v1', 'master', { options: loud });
    check('it answers cancelled', cv.cancelled && cv.state.state === 'cancelled' && cv.state.tag === tag, cv.said);
    check('its ffmpeg has exited', await until(() => vp.every((p) => !alive(p)), 6000), vp.join(','));
    check('none of its files, no list of files, no scratch', !readdirSync(path.join(dir, 'cut', 'renders')).some((n) => n.startsWith(`v1-master-${tag}`)) && scratchOf('synth-v1-master-').length === 0);
    check('the page lists it cancelled among the variants', (await R.renderStates(film, 'v1')).variants?.find((x) => x.tag === tag)?.state === 'cancelled');

    console.log('== a cancelled render asked for again');
    const again = await R.queueRender('synth', 'v2', 'master');
    check('it is queued again', again.state === 'queued' || again.state === 'running', again.state);
    await R.drain();
    check('and made', has('cut/renders/v2-master.mp4') && (await R.renderStates(film, 'v2')).master?.state === 'done');
    check('the test\'s own sleep 60 is still alive at the end', alive(sleepPid), String(sleepPid));
  } finally {
    // a check that failed midway leaves no render running behind it: each stopped by the cancel under test
    for (const [v, k] of [['v1', 'master'], ['v2', 'master'], ['v2', 'proxy']] as const) await R.cancelRender('synth', v, k).catch(() => undefined);
    // the test's own sleep, stopped by its own ChildProcess object (its exact pid)
    sleeper.kill('SIGTERM');
  }
  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, (e) => {
  console.error(e);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
