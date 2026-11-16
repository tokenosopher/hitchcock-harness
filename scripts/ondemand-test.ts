// npm run ondemand:test
// The 480p made when asked for (14 Nov 2026, ASKS 44), on two tiny synthetic films in a temp folder (deleted after),
// through the real cut watcher: a version written by hand renders nothing; a refused one gets its reasons in
// cut/renders/<version>.log without a render, once; the marker cut/renders/<version>.proxy-requested renders the
// 480p; the route's own versions render nothing; markers left while the server was down are honoured at start and the
// current version is not rendered; HARNESS_AUTO_480P=1 brings the render after every change back. Never touches a real
// film.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.HARNESS_FFMPEG || 'ffmpeg';
const root = mkdtempSync(path.join(os.tmpdir(), 'ondemand-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
delete process.env.HARNESS_NO_CUT_WATCH;
delete process.env.HARNESS_AUTO_480P;

let checks = 0;
function check(what: string, ok: boolean, got = ''): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what}${got ? ` · ${got}` : ''}`);
  if (!ok) throw new Error(`failed: ${what}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 6000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ok()) return true; await sleep(100); }
  return ok();
}

function film(slug: string): string {
  const dir = path.join(repo, 'assets', 'films', slug);
  mkdirSync(path.join(dir, 'media'), { recursive: true });
  mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
  execFileSync(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2040C0:s=480x854:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', path.join(dir, 'media', 'a.mp4')]);
  return dir;
}
const version = (v: string, basedOn: string | undefined, out = 1.5) => JSON.stringify({
  version: v, fps: 24, width: 480, height: 854, ...(basedOn ? { basedOn } : {}), by: 'alma', at: new Date().toISOString(), note: `${v} by hand`, markers: [],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src: 'media/a.mp4', in: 0, out, at: 0 }] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'c1a', src: 'media/a.mp4', in: 0, out, at: 0 }] },
  ],
}, null, 1);

async function main(): Promise<void> {
  const a = film('synth');
  const b = film('synth-start');
  writeFileSync(path.join(repo, 'films.txt'), 'synth\nsynth-start\n');
  writeFileSync(path.join(a, 'cut', 'v1.json'), version('v1', undefined));
  // the second film: two versions, a 480p asked for v1 while the server was down, none for v2 (the current one)
  writeFileSync(path.join(b, 'cut', 'v1.json'), version('v1', undefined));
  writeFileSync(path.join(b, 'cut', 'v2.json'), version('v2', 'v1', 1));
  writeFileSync(path.join(b, 'cut', 'renders', 'v1.proxy-requested'), '');

  const T = await import('../src/server/edit/timeline');
  const R = await import('../src/server/edit/render');
  const W = await import('../src/server/edit/watch');
  const fa = await T.cutFilm('synth');
  const fb = await T.cutFilm('synth-start');
  const rel = (dir: string, p: string) => path.join(dir, p);

  console.log('== the server starts');
  W.ensureCutWatch(fa);
  W.ensureCutWatch(fb);
  await sleep(800);
  await R.drain();
  check('a 480p asked for while the server was down is made at start', await until(() => existsSync(rel(b, 'cut/renders/v1-proxy.mp4')), 20000));
  await R.drain();
  check('the current version is not rendered at start', !existsSync(rel(b, 'cut/renders/v2-proxy.mp4')) && (await R.renderStates(fb, 'v2')).proxy?.state === 'none');
  check('nor the other film\'s', !existsSync(rel(a, 'cut/renders/v1-proxy.mp4')));

  console.log('== a version written by hand');
  writeFileSync(path.join(a, 'cut', 'v2.json'), version('v2', 'v1', 1.2));
  await sleep(1500);
  await R.drain();
  const st2 = await R.renderStates(fa, 'v2');
  check('a good version renders nothing', !existsSync(rel(a, 'cut/renders/v2-proxy.mp4')) && st2.proxy?.state === 'none', JSON.stringify(st2.proxy));
  check('and writes nothing (no log)', !existsSync(rel(a, 'cut/renders/v2.log')));

  console.log('== a refused version');
  writeFileSync(path.join(a, 'cut', 'v3.json'), version('v3', 'v2', 3.5));   // reads past the 2 s file
  check('its log appears, without a render', await until(() => existsSync(rel(a, 'cut/renders/v3.log'))));
  await R.drain();
  const log3 = readFileSync(rel(a, 'cut/renders/v3.log'), 'utf8');
  check('the log is a failed render\'s: the heading, FAILED and the reasons', /^== proxy render of v3 · /.test(log3) && /FAILED: the timeline does not check out:/.test(log3) && /clip c1 .*out 3\.5 s is past the end of media\/a\.mp4/.test(log3), log3.trim().split('\n').slice(0, 3).join(' | '));
  check('no file', !existsSync(rel(a, 'cut/renders/v3-proxy.mp4')));
  const st3 = await R.renderStates(fa, 'v3');
  check('the page sees its 480p as failed, with the reasons', st3.proxy?.state === 'failed' && /past the end/.test(st3.proxy.error ?? ''), st3.proxy?.state);
  writeFileSync(path.join(a, 'cut', 'v3.json'), version('v3', 'v2', 3.5));   // the same file written again
  await sleep(1500);
  check('the same refusal is written once', (readFileSync(rel(a, 'cut/renders/v3.log'), 'utf8').match(/FAILED/g) ?? []).length === 1);
  const asked = await R.queueRender('synth', 'v3', 'proxy');
  check('asking for its 480p answers the refusal; nothing runs', asked.state === 'failed' && !existsSync(rel(a, 'cut/renders/v3-proxy.mp4')));
  writeFileSync(path.join(b, 'cut', 'v3.json'), '{ not json');
  check('a file that is not a timeline gets its log too', await until(() => existsSync(rel(b, 'cut/renders/v3.log'))) && /FAILED: v3 is not valid JSON/.test(readFileSync(rel(b, 'cut/renders/v3.log'), 'utf8')));

  console.log('== the marker');
  writeFileSync(path.join(a, 'cut', 'renders', 'v2.proxy-requested'), '');
  check('cut/renders/v2.proxy-requested starts the render', await until(() => existsSync(rel(a, 'cut/renders/v2-proxy.mp4')), 20000));
  await R.drain();
  const done2 = await R.renderStates(fa, 'v2');
  check('it is done and recorded in the version', done2.proxy?.state === 'done' && (JSON.parse(readFileSync(rel(a, 'cut/v2.json'), 'utf8')) as { renders?: { proxy?: { path: string } } }).renders?.proxy?.path === 'cut/renders/v2-proxy.mp4');
  check('its log says it rendered', /== proxy render of v2 · [^\n]*\n[\s\S]*done in/.test(readFileSync(rel(a, 'cut/renders/v2.log'), 'utf8')));

  console.log('== a version from the page (the cut route)');
  const v5 = await T.writeNextVersion(fa, { basedOn: 'v3', note: 'from the page', by: 'user', tracks: JSON.parse(version('v4', 'v3', 1)).tracks });
  const r5 = await R.afterNewVersion('synth', v5.version, 'page');
  await sleep(1500);
  await R.drain();
  check('the route renders nothing', r5.state === 'none' && !existsSync(rel(a, `cut/renders/${v5.version}-proxy.mp4`)) && !existsSync(rel(a, `cut/renders/${v5.version}.log`)), JSON.stringify(r5));

  console.log('== HARNESS_AUTO_480P=1');
  process.env.HARNESS_AUTO_480P = '1';
  check('the setting reads on', R.auto480p());
  writeFileSync(path.join(a, 'cut', 'v5.json'), version('v5', 'v4', 1.4));
  check('a version written by hand renders its 480p again', await until(() => existsSync(rel(a, 'cut/renders/v5-proxy.mp4')), 20000));
  await R.drain();
  const v7 = await T.writeNextVersion(fa, { basedOn: 'v5', note: 'from the page', by: 'user', tracks: JSON.parse(version('v6', 'v5', 1.1)).tracks });
  const r7 = await R.afterNewVersion('synth', v7.version, 'page');
  check('a version from the page is queued at once', r7.state === 'queued' || r7.state === 'running', r7.state);
  await R.drain();
  check('and rendered', existsSync(rel(a, `cut/renders/${v7.version}-proxy.mp4`)));
  delete process.env.HARNESS_AUTO_480P;
  check('off again', !R.auto480p());

  console.log('== with a working cut (14 Nov, stage 4): a version written by hand is one step on top, the rules above stay');
  const Wk = await import('../src/server/edit/working');
  const D = await import('../src/server/edit/alma-drop');
  const sa = Wk.diskStore(fa);
  const w0 = (await Wk.ensureWorking(sa))!;
  const steps0 = w0.history.steps.length;
  const historyLen = () => (JSON.parse(readFileSync(rel(a, 'harness/cut-history.json'), 'utf8')) as { steps: { saved?: string; words: string }[] }).steps;
  writeFileSync(path.join(a, 'cut', 'v7.json'), version('v7', 'v6', 1.3));
  check('a good one becomes one step marked saved', await until(() => historyLen().length === steps0 + 1) && historyLen().at(-1)!.saved === 'v7' && historyLen().at(-1)!.words === 'Alma: v7 by hand', historyLen().at(-1)!.words);
  await sleep(500);
  await R.drain();
  check('and still renders nothing and writes no log', !existsSync(rel(a, 'cut/renders/v7-proxy.mp4')) && !existsSync(rel(a, 'cut/renders/v7.log')));
  writeFileSync(path.join(a, 'cut', 'v8.json'), version('v8', 'v7', 3.5));   // reads past the 2 s file
  check('a refused one still gets its log', await until(() => existsSync(rel(a, 'cut/renders/v8.log'))) && /FAILED: the timeline does not check out:/.test(readFileSync(rel(a, 'cut/renders/v8.log'), 'utf8')));
  await sleep(800);
  check('and is not taken into the working cut', historyLen().length === steps0 + 1 && (await Wk.peekWorking(sa))!.working.tracks[0].clips[0].out === 1.3);
  const v9 = await D.writePageVersion(fa, { basedOn: 'v8', note: 'from the page, old route', by: 'user', tracks: JSON.parse(version('v9', 'v8', 1)).tracks });
  await sleep(1200);
  await R.drain();
  check('a version from the old route is one step by the user, not taken again as one written by hand', historyLen().length === steps0 + 2 && historyLen().at(-1)!.saved === v9.version && historyLen().filter((x) => x.saved === v9.version).length === 1);
  check('and renders nothing', !existsSync(rel(a, `cut/renders/${v9.version}-proxy.mp4`)));

  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, (e) => {
  console.error(e);
  rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
