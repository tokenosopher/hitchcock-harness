// npx tsx scripts/frame-render-test.ts
// The renders of a landscape cut: a synthetic 16:9 film (its picture the 1920x1080 sample clip,
// src/fixtures/media/wide/wide-1080.mp4) rendered as its 480p and its master, measured with ffprobe: 854x480 and
// 1920x1080, every frame there; and a 9:16 film beside it from a portrait picture: 480x854 and 1080x1920, as always.
// Built in a temp folder and deleted after. Never touches a real film.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline } from '../src/server/types';

const FFMPEG = process.env.HARNESS_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.HARNESS_FFPROBE || 'ffprobe';
const root = mkdtempSync(path.join(os.tmpdir(), 'frame-render-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';
delete process.env.HARNESS_AUTO_480P;

let checks = 0;
function check(what: string, ok: boolean, got: string): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what} · ${got}`);
  if (!ok) throw new Error(`failed: ${what}`);
}
const probe = (f: string): string => execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', f]).toString().trim();

function film(slug: string, aspect: string, picture: string, w: number, h: number): void {
  const dir = path.join(repo, 'assets', 'films', slug);
  mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
  mkdirSync(path.join(dir, 'takes'), { recursive: true });
  writeFileSync(path.join(dir, 'brief.md'), `# ${slug}\n\n- Aspect ratio: ${aspect}\n`);
  copyFileSync(picture, path.join(dir, 'takes', 'S1-take1-480p.mp4'));
  const t: Timeline = {
    version: 'v1', fps: 24, width: w, height: h, note: 'two shots', by: 'user', at: new Date().toISOString(), markers: [],
    tracks: [
      { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src: 'takes/S1-take1-480p.mp4', in: 0, out: 1.5, at: 0 }, { id: 'c2', src: 'takes/S1-take1-480p.mp4', in: 2, out: 3, at: 1.5 }] },
      { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'a1', src: 'takes/S1-take1-480p.mp4', in: 0, out: 2.5, at: 0 }] },
    ],
  };
  writeFileSync(path.join(dir, 'cut', 'v1.json'), JSON.stringify(t, null, 1) + '\n');
}

async function main(): Promise<void> {
  const R = await import('../src/server/edit/render');
  const wide = path.join(process.cwd(), 'src/fixtures/media/wide/wide-1080.mp4');
  const tall = path.join(root, 'tall.mp4');
  execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=480x854:rate=24:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', '-shortest', '-pix_fmt', 'yuv420p', '-c:a', 'aac', tall]);
  film('wide', '16:9', wide, 1920, 1080);
  film('tall', '9:16', tall, 1080, 1920);
  for (const [slug, small, big] of [['wide', '854,480', '1920,1080'], ['tall', '480,854', '1080,1920']] as const) {
    for (const kind of ['proxy', 'master'] as const) {
      await R.queueRender(slug, 'v1', kind);
      await R.drain();
      const st = (await R.renderStates(slug, 'v1'))[kind];
      check(`${slug}: the ${kind} rendered`, st?.state === 'done', JSON.stringify(st).slice(0, 300));
      const file = path.join(repo, 'assets', 'films', slug, R.renderRel('v1', kind));
      const [w, h, frames] = probe(file).split(',');
      check(`${slug}: the ${kind} is ${kind === 'proxy' ? small : big} with all 60 frames`, `${w},${h}` === (kind === 'proxy' ? small : big) && frames === '60', `${w}x${h}, ${frames} frames`);
    }
  }
  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, (e: Error) => { console.log(e.message); rmSync(root, { recursive: true, force: true }); process.exit(1); });
