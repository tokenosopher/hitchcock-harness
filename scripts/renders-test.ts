// npm run renders:test
// The Edit page's Renders tab (14 Nov 2026, ASKS 39): the list's order and grouping (renderList.ts renderLists), the
// words of each file (fileWords), the tag on the picture (playTag), the server's listing of cut/renders/ on a
// synthetic film folder (render-files.ts renderFiles: masters and "More renders" files, never the 480p, nothing for a
// file that is not there), and the sample renders the sample-data mode starts with (src/fixtures/renders.ts).
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RenderState, Timeline } from '../src/server/types';
import { filmTargetOf } from '../src/server/edit/timeline';
import { renderFiles } from '../src/server/edit/render-files';
import { byNewest, clockLen, fileWords, playTag, renderLists, tookWords, type RenderFile } from '../src/components/edit/renderList';
import { mockNewestMaster, mockQueueRender, mockRenderFiles, mockRenderStates } from '../src/fixtures/renders';
import { earlierWords, masterAge, masterLogRel, masterNo, masterRel, mastersOf, newestMaster } from '../src/components/edit/masters';
import { hasFull, picturePieces, pictureMade, type FullInfo } from '../src/components/edit/fullsize';

let n = 0;
const check = (what: string, ok: boolean, detail?: unknown) => { n++; assert.ok(ok, `${what}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`); };
const names = new Map([['A1', 'Dialogue'], ['A2', 'Music'], ['V1', 'Picture']]);
const trackName = (id: string) => names.get(id);

async function main() {
  // ---- 1. the words of each file
  {
    const w = (p: string, extra: Partial<RenderFile> = {}) => fileWords({ path: p, version: 'v12', kind: 'proxy', ...extra }, 1080, 1920, trackName);
    // any full-size picture brings the 1080p view, upscaled takes or originals alone too
    check('no full-size picture: no 1080p view', !hasFull(undefined) && !hasFull({ bases: [], takes: {}, label: 'Higgsfield' }) && !hasFull({ bases: [], takes: {}, upscaled: {}, originals: {}, label: 'Higgsfield' }));
    check('upscaled takes alone bring the 1080p view', hasFull({ bases: [], takes: {}, upscaled: { 'a-480p.mp4': 'a-1080p-up.mp4' }, label: 'Higgsfield' }));
    check('full-size originals alone bring the 1080p view', hasFull({ bases: [], takes: {}, originals: { 'card-480.mp4': 'card-1080.mp4' }, label: 'Higgsfield' }));
    check('a take\'s own 1080p file brings the 1080p view', hasFull({ bases: [], takes: { 'a-480p.mp4': 'a-1080p.mp4' }, label: 'Higgsfield' }));
    check('the plain master', JSON.stringify(w('cut/renders/v12-master.mp4', { kind: 'master' })) === JSON.stringify({ title: 'Master of cut v12', size: '1080 × 1920', sound: false }), w('cut/renders/v12-master.mp4', { kind: 'master' }));
    check('the plain 480p', w('cut/renders/v12-proxy.mp4').title === '480p of cut v12' && w('cut/renders/v12-proxy.mp4').size === '480 × 854');
    const loud = w('cut/renders/v12-proxy-lufs14-tp1.mp4', { tag: 'lufs14-tp1', options: { loudness: { lufs: -14, truePeak: -1 } } });
    check('a loudness render says the loudness asked for', loud.title === '480p of cut v12' && loud.extra === '−14 LUFS', loud);
    const cards = w('cut/renders/v12-master-without-cards.mp4', { kind: 'master', tag: 'without-cards', options: { leaveOut: { cards: true } } });
    check('full size without the title cards', cards.title === 'Full size of cut v12' && cards.extra === 'no title cards' && cards.size === '1080 × 1920', cards);
    const stem = w('cut/renders/v12-proxy-stems.A1-Dialogue.wav', { tag: 'stems', options: { stems: true } });
    check('a sound track alone, a sound file', stem.title === 'Sound of cut v12' && stem.extra === 'A1 Dialogue alone' && stem.sound && stem.size === 'WAV', stem);
    const dial = w('cut/renders/v12-proxy-without-A2-stems.dialogue.wav', { tag: 'without-A2-stems', options: { stems: true, leaveOut: { tracks: ['A2'] } } });
    check('dialogue only, with what was left out', dial.extra === 'dialogue only · no A2 Music', dial);
    const pic = w('cut/renders/v12-proxy-stems.picture.mp4', { tag: 'stems', options: { stems: true } });
    check('the picture alone has no sound', pic.title === 'Picture alone of cut v12' && pic.extra === 'no sound' && !pic.sound, pic);
    check('mix and everything but dialogue', w('cut/renders/v12-proxy-stems.mix.wav', { tag: 'stems', options: { stems: true } }).extra === 'the full mix'
      && w('cut/renders/v12-proxy-stems.no-dialogue.wav', { tag: 'stems', options: { stems: true } }).extra === 'everything but dialogue');
    check('a landscape 480p', fileWords({ path: 'cut/renders/v1-proxy.mp4', version: 'v1', kind: 'proxy' }, 1920, 1080).size === '854 × 480');
    // the smaller file (ASKS 56): "smaller file" and both sizes once measured; alone, with a loudness and a leave-out
    const smallRec = { from: 'cut/renders/v12-master-lufs14-tp1.mp4', made: false, fromBytes: 101_000_000, bytes: 60_000_000, frames: 2722, ssim: 0.992, sound: { codec: 'aac', seconds: 113.4, copied: true }, encode: 'libx264 veryslow CRF 21' };
    const sm = w('cut/renders/v12-master-lufs14-tp1-small.mp4', { kind: 'master', tag: 'lufs14-tp1-small', options: { loudness: { lufs: -14, truePeak: -1 }, small: true }, small: smallRec });
    check('a smaller file with a loudness: both sizes', sm.title === 'Full size of cut v12' && sm.extra === '−14 LUFS · smaller file (60 MB, from 101 MB)' && sm.size === '1080 × 1920' && !sm.sound, sm);
    const sm2 = w('cut/renders/v12-master-small.mp4', { kind: 'master', tag: 'small', options: { small: true } });
    check('a smaller file before it is measured says only that', sm2.extra === 'smaller file', sm2);
    const sm3 = w('cut/renders/v12-master-without-cards-small.mp4', { kind: 'master', tag: 'without-cards-small', options: { leaveOut: { cards: true }, small: true }, small: { ...smallRec, fromBytes: 1_400_000_000, bytes: 820_000_000 } });
    check('a smaller file without the title cards, in GB', sm3.extra === 'no title cards · smaller file (820 MB, from 1.4 GB)', sm3);
    check('lengths and times in plain words', clockLen(113) === '1:53' && clockLen(7.4) === '0:07' && tookWords(74) === '1 min' && tookWords(41.25) === '41.3 s' && tookWords(undefined) === '');
  }

  // ---- 2. the list: the version on screen, newest first, running at the top; the other versions under it
  {
    const files: RenderFile[] = [
      { path: 'cut/renders/v11-master.mp4', version: 'v11', kind: 'master', at: '2026-11-13T09:00:00Z', took: 400, seconds: 110 },
      { path: 'cut/renders/v10-proxy-lufs14-tp1.mp4', version: 'v10', kind: 'proxy', tag: 'lufs14-tp1', options: { loudness: { lufs: -14, truePeak: -1 } }, at: '2026-11-13T10:00:00Z', took: 40, seconds: 108 },
      { path: 'cut/renders/v12-master.mp4', version: 'v12', kind: 'master', at: '2026-11-13T12:00:00Z', took: 412, seconds: 113 },
      { path: 'cut/renders/v12-proxy-stems.picture.mp4', version: 'v12', kind: 'proxy', tag: 'stems', options: { stems: true }, index: 0, at: '2026-11-13T13:00:00Z', took: 50, seconds: 113 },
      { path: 'cut/renders/v12-proxy-stems.mix.wav', version: 'v12', kind: 'proxy', tag: 'stems', options: { stems: true }, index: 3, at: '2026-11-13T13:00:00Z', took: 50, seconds: 113 },
      { path: 'cut/renders/v12-proxy-stems.A1-Dialogue.wav', version: 'v12', kind: 'proxy', tag: 'stems', options: { stems: true }, index: 1, at: '2026-11-13T13:00:00Z', took: 50, seconds: 113 },
    ];
    const running: RenderState = { version: 'v12', kind: 'proxy', tag: 'without-cards', options: { leaveOut: { cards: true } }, state: 'running', percent: 42 };
    const failed: RenderState = { version: 'v12', kind: 'master', tag: 'lufs16-tp1', options: { loudness: { lufs: -16, truePeak: -1 } }, state: 'failed', error: 'ffmpeg failed', finishedAt: '2026-11-13T12:30:00Z' };
    const stems: RenderState = { version: 'v12', kind: 'proxy', tag: 'stems', options: { stems: true }, state: 'done', finishedAt: '2026-11-13T13:00:00Z', seconds: 50,
      outputs: [{ path: 'cut/renders/v12-proxy-stems.picture.mp4', what: 'the picture alone, no sound' }, { path: 'cut/renders/v12-proxy-stems.A1-Dialogue.wav', what: 'sound track A1 Dialogue alone' }, { path: 'cut/renders/v12-proxy-stems.mix.wav', what: 'the full mix' }] };
    const L = renderLists({
      shown: 'v12', width: 1080, height: 1920, seconds: 113,
      proxy: { version: 'v12', kind: 'proxy', state: 'done', path: 'cut/renders/v12-proxy.mp4', finishedAt: '2026-11-13T11:00:00Z', seconds: 74 },
      master: { version: 'v12', kind: 'master', state: 'done', path: 'cut/renders/v12-master.mp4' },
      variants: [stems, failed, running], files, trackName,
    });
    const keys = L.shown.map((r) => r.key);
    check('the running render first, then newest first, a render\'s files in their own order', JSON.stringify(keys) === JSON.stringify([
      'proxy/without-cards', 'cut/renders/v12-proxy-stems.picture.mp4', 'cut/renders/v12-proxy-stems.A1-Dialogue.wav', 'cut/renders/v12-proxy-stems.mix.wav',
      'proxy/lufs16-tp1'.replace('proxy', 'master'), 'cut/renders/v12-master.mp4', 'cut/renders/v12-proxy.mp4']), keys);
    const run = L.shown[0];
    check('the running row: its percent, the panel\'s words, no file yet', run.state === 'running' && run.percent === 42 && run.title === 'A 480p file without the title cards' && !run.path, run);
    const fail = L.shown.find((r) => r.state === 'failed')!;
    check('the failed row keeps its error and what "Try again" asks', fail.error === 'ffmpeg failed' && fail.retry?.kind === 'master' && fail.retry.options?.loudness?.lufs === -16, fail);
    const m = L.shown.find((r) => r.key === 'cut/renders/v12-master.mp4')!;
    check('the master takes its time and how long it took from the files on disk', m.at === '2026-11-13T12:00:00Z' && m.took === 412 && m.title === 'Master of cut v12', m);
    const p = L.shown.find((r) => r.key === 'cut/renders/v12-proxy.mp4')!;
    check('the 480p of the version: from the render state', p.title === '480p of cut v12' && p.took === 74 && p.seconds === 113, p);
    check('every file once', new Set(keys).size === keys.length);
    check('the other versions: masters and "More renders" files only, newest first', JSON.stringify(L.earlier.map((r) => r.key)) === JSON.stringify(['cut/renders/v10-proxy-lufs14-tp1.mp4', 'cut/renders/v11-master.mp4']), L.earlier.map((r) => r.key));
    check('an earlier file keeps its own length', L.earlier[1].seconds === 110);

    // the 480p of an older version viewed: from what its version file recorded
    const old = renderLists({ shown: 'v11', width: 1080, height: 1920, seconds: 110, recorded: { proxy: { path: 'cut/renders/v11-proxy.mp4', at: '2026-11-12T10:00:00Z', hash: 'x', seconds: 70 } }, variants: [], files });
    check('viewing v11: its 480p and its master, the others under', JSON.stringify(old.shown.map((r) => r.key)) === JSON.stringify(['cut/renders/v11-master.mp4', 'cut/renders/v11-proxy.mp4'])
      && JSON.stringify(old.earlier.map((r) => r.version)) === JSON.stringify(['v12', 'v12', 'v12', 'v12', 'v10']), { shown: old.shown.map((r) => r.key), earlier: old.earlier.map((r) => r.version) });

    // a master running, then done: one row each time, the running one has no file
    const mRun = renderLists({ shown: 'v13', width: 1080, height: 1920, seconds: 90, master: { version: 'v13', kind: 'master', state: 'queued' }, variants: [], files: [] });
    check('a master queued is one row at the top', mRun.shown.length === 1 && mRun.shown[0].state === 'queued' && mRun.shown[0].title === 'Master of cut v13' && mRun.shown[0].retry?.kind === 'master');
    check('a master of another version than the one on screen is not listed as running', renderLists({ shown: 'v14', width: 1080, height: 1920, seconds: 90, master: { version: 'v13', kind: 'master', state: 'running' }, variants: [], files: [] }).shown.length === 0);
    const sorted = [...L.shown].sort(byNewest);
    check('the order is stable', JSON.stringify(sorted.map((r) => r.key)) === JSON.stringify(keys));

    // what a master's picture was made from (14 Nov): recorded, said in words; nothing for an older master
    const picture = { sources: [{ kind: 'base' as const, shots: 33, frames: 2500 }, { kind: 'small' as const, shots: 3, frames: 200 }], shots: 36, frames: 2700, base: { version: 'v230', path: 'x', label: 'Higgsfield' } };
    const made = renderLists({ shown: 'v13', width: 1080, height: 1920, seconds: 90, master: { version: 'v13', kind: 'master', state: 'done', path: 'cut/renders/v13-master.mp4', picture }, variants: [], files: [] });
    const mw = made.shown[0].made;
    check('a master says what its picture came from, the scaled-up part in amber', JSON.stringify(mw) === JSON.stringify([{ text: '33 shots from the Higgsfield upscale of v230', warn: false }, { text: '3 scaled up from 480p', warn: true }]), mw);
    const rec = renderLists({ shown: 'v13', width: 1080, height: 1920, seconds: 90, recorded: { master: { path: 'cut/renders/v13-master.mp4', at: '2026-11-14T08:00:00Z', hash: 'h', picture: { ...picture, sources: [{ kind: 'base', shots: 36, frames: 2700 }] } } }, variants: [], files: [] });
    check('from the version file too, all from the upscale', rec.shown[0].made?.map((m) => m.text).join(' · ') === '36 shots from the Higgsfield upscale of v230', rec.shown[0].made);
    check('a master made before this was recorded says nothing about it', !L.shown.find((r) => r.key === 'cut/renders/v12-master.mp4')?.made && !old.shown.find((r) => r.key === 'cut/renders/v11-master.mp4')?.made);
    const hint = '3 shots have no full-size picture and will be scaled up from 480p';
    const runHint = renderLists({ shown: 'v13', width: 1080, height: 1920, seconds: 90, master: { version: 'v13', kind: 'master', state: 'running', percent: 10 }, variants: [], files: [], masterHint: hint });
    check('a master running says what it will scale up', runHint.shown[0].warn === hint, runHint.shown[0]);
    check('a 480p running does not', renderLists({ shown: 'v13', width: 1080, height: 1920, seconds: 90, proxy: { version: 'v13', kind: 'proxy', state: 'running' }, variants: [], files: [], masterHint: hint }).shown[0].warn === undefined);
  }

  // ---- 3. the tag on the picture
  {
    const t = playTag({ title: 'Master of cut v231', version: 'v231', sound: false }, 'v231');
    check('the current version', t.text === 'Render · master of v231' && !t.older, t);
    const o = playTag({ title: 'Master of cut v230', version: 'v230', sound: false }, 'v231');
    check('an older version', o.text === 'Render of v230 · the cut is now v231' && o.older, o);
    check('a sound file', playTag({ title: 'Sound of cut v2', version: 'v2', sound: true }, 'v2').text === 'Render · sound of v2');
    // an older version whose cut is the same as the cut now, or differs, said by content (ASKS 49)
    const same = playTag({ title: 'Master of cut v235', version: 'v235', sound: false }, 'v239', { same: true });
    check('an older version of the same content: not older', same.text === 'Render · master of v235 · nothing changed since' && !same.older, same);
    const gap = playTag({ title: 'Master of cut v235', version: 'v235', sound: false }, 'v236', { same: false, words: '1 subtitle line moved since' });
    check('an older version with a real difference: what changed, in amber', gap.text === 'Render of v235 · 1 subtitle line moved since' && gap.older, gap);
    check('a gap on the version of the cut is not looked at', playTag({ title: 'Master of cut v231', version: 'v231', sound: false }, 'v231', { same: false, words: 'x since' }).text === 'Render · master of v231');
  }

  // ---- 4. the server's listing of cut/renders/
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hh-renders-'));
    const film = filmTargetOf('x', dir, dir);
    const r = path.join(dir, 'cut', 'renders');
    await fs.mkdir(r, { recursive: true });
    check('no folder yet: nothing', (await renderFiles(filmTargetOf('y', path.join(dir, 'none'), path.join(dir, 'none')))).length === 0);
    const tl = (v: string, end: number): Timeline => ({ version: v, fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z', markers: [], tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src: 'a.mp4', in: 0, out: end, at: 0 }] }],
      ...(v === 'v2' ? { renders: { master: { path: 'cut/renders/v2-master.mp4', at: '2026-11-13T08:00:00.000Z', hash: 'h', seconds: 321, picture: { sources: [{ kind: 'base', shots: 1, frames: 300 }], shots: 1, frames: 300 } } } } : {}) });
    await fs.writeFile(path.join(dir, 'cut', 'v1.json'), JSON.stringify(tl('v1', 10)));
    await fs.writeFile(path.join(dir, 'cut', 'v2.json'), JSON.stringify(tl('v2', 12.5)));
    for (const f of ['v1-proxy.mp4', 'v2-proxy.mp4', 'v2-master.mp4', 'v1-proxy-stems.picture.mp4', 'v1-proxy-stems.mix.wav', 'v1.log', 'v2.master-requested']) await fs.writeFile(path.join(r, f), 'x'.repeat(10));
    const manifest = { version: 'v1', kind: 'proxy', tag: 'stems', options: { stems: true }, state: 'done', finishedAt: '2026-11-13T07:00:00.000Z', seconds: 33,
      outputs: [{ path: 'cut/renders/v1-proxy-stems.picture.mp4', what: 'the picture alone, no sound' }, { path: 'cut/renders/v1-proxy-stems.A1-Dialogue.wav', what: 'gone' }, { path: 'cut/renders/v1-proxy-stems.mix.wav', what: 'the full mix' }] };
    await fs.writeFile(path.join(r, 'v1-proxy-stems.json'), JSON.stringify(manifest));
    const got = await renderFiles(film);
    const ps = got.map((f) => f.path).sort();
    check('masters and the files of renders with options, never a 480p, nothing that is not on disk', JSON.stringify(ps) === JSON.stringify(['cut/renders/v1-proxy-stems.mix.wav', 'cut/renders/v1-proxy-stems.picture.mp4', 'cut/renders/v2-master.mp4']), ps);
    const m = got.find((f) => f.path.endsWith('v2-master.mp4'))!;
    check('the master: its version\'s length, and when and how long from the version file', m.seconds === 12.5 && m.at === '2026-11-13T08:00:00.000Z' && m.took === 321 && m.bytes === 10, m);
    check('the master: what its picture was made from, from the version file', m.picture?.sources[0].shots === 1, m.picture);
    const mix = got.find((f) => f.path.endsWith('mix.wav'))!;
    check('a file of a render with options: its words, place, options and time', mix.what === 'the full mix' && mix.index === 2 && mix.tag === 'stems' && mix.options?.stems === true && mix.took === 33 && mix.seconds === 10 && mix.at === '2026-11-13T07:00:00.000Z', mix);
    check('read again only when the folder changes (the same list)', (await renderFiles(film)) === got);
    // a smaller file (ASKS 56): its record comes with it, and the list's row says both sizes
    const small = { from: 'cut/renders/v2-master.mp4', made: false, fromBytes: 101_000_000, bytes: 60_000_000, frames: 300, ssim: 0.992, sound: { codec: 'aac', seconds: 12.5, copied: true }, encode: 'libx264 veryslow CRF 21' };
    await fs.writeFile(path.join(r, 'v2-master-small.mp4'), 'x'.repeat(10));
    await fs.writeFile(path.join(r, 'v2-master-small.json'), JSON.stringify({ version: 'v2', kind: 'master', tag: 'small', options: { small: true }, state: 'done', finishedAt: '2026-11-13T09:00:00.000Z', seconds: 80, small,
      outputs: [{ path: 'cut/renders/v2-master-small.mp4', what: 'the master, as a smaller file: 60 MB, from 101 MB (SSIM 0.992, the sound copied)' }] }));
    const sf = (await renderFiles(film)).find((f) => f.path === 'cut/renders/v2-master-small.mp4');
    check('a smaller file is listed with its record', sf?.tag === 'small' && sf.kind === 'master' && sf.small?.fromBytes === 101_000_000 && sf.small.ssim === 0.992 && sf.index === 0, sf);
    const row = renderLists({ shown: 'v2', width: 1080, height: 1920, seconds: 12.5, variants: [], files: sf ? [sf] : [] }).shown[0];
    check('its row: full size, smaller file with both sizes', row?.title === 'Full size of cut v2' && row.extra === 'smaller file (60 MB, from 101 MB)' && row.state === 'done', row);
    await fs.rm(dir, { recursive: true, force: true });
  }

  // ---- 5. the sample renders (MOCK=boards)
  {
    const files = mockRenderFiles('the-lighthouse');
    const st = mockRenderStates('the-lighthouse', 'v1');
    check('the sample film starts with a master of v1', st.master?.state === 'done' && st.master.path === 'cut/renders/v1-master.mp4', st.master);
    check('two "More renders" files, sound files and one that failed', files.some((f) => f.tag === 'lufs14-tp1') && files.some((f) => f.tag === 'without-cards')
      && files.some((f) => f.path.endsWith('.wav')) && (st.variants ?? []).some((v) => v.state === 'failed'), files.map((f) => f.path));
    check('the other sample film: a master of an earlier version', mockRenderFiles('sample-master-older').some((f) => f.version === 'v1' && f.kind === 'master'));
    const q = mockQueueRender('the-lighthouse', 'v2', 'master', undefined, false);
    check('Render master plays one in sample-data mode', q.state === 'queued' && !q.tag, q);
    check('a master already made answers done at once', mockQueueRender('the-lighthouse', 'v1', 'master', undefined, false).state === 'done');
    const failed = (st.variants ?? []).find((v) => v.state === 'failed')!;
    check('"Try again" on the failed one starts it again', mockQueueRender('the-lighthouse', 'v1', failed.kind, failed.options, true).state === 'queued');
  }

  // ---- 6. a master made again (14 Nov, ASKS 42): the names, "newest wins", when one is out of date, the rows' words
  {
    check('names: the first, then -2, -3', masterRel('v231') === 'cut/renders/v231-master.mp4' && masterRel('v231', 2) === 'cut/renders/v231-master-2.mp4' && masterRel('v231', 3) === 'cut/renders/v231-master-3.mp4');
    check('logs: the first in the version\'s log, a later one its own', masterLogRel('v231') === 'cut/renders/v231.log' && masterLogRel('v231', 2) === 'cut/renders/v231-master-2.log');
    check('read back', JSON.stringify(masterNo('cut/renders/v231-master-2.mp4')) === JSON.stringify({ version: 'v231', n: 2 }) && masterNo('v231-master.mp4')?.n === 1, masterNo('v231-master-2.mp4'));
    check('never a "More renders" file, never a 480p, never "-1"', ['v231-master-without-cards.mp4', 'v231-master-lufs14-tp1.mp4', 'v231-master-stems.picture.mp4', 'v231-proxy.mp4', 'v231-master-1.mp4', 'v231-master-2.log'].every((x) => !masterNo(x)));
    const names = ['v231-master.mp4', 'v231-master-10.mp4', 'v231-master-2.mp4', 'v231.log', 'v231-master-2.log', 'v230-master-3.mp4', 'v231-master-without-cards.mp4'];
    check('every master of a version, oldest first', JSON.stringify(mastersOf(names, 'v231').map((x) => x.n)) === JSON.stringify([1, 2, 10]), mastersOf(names, 'v231'));
    check('the newest wins (by number, not by name order)', newestMaster(names, 'v231')?.path === 'cut/renders/v231-master-10.mp4' && newestMaster(names, 'v229') === undefined);

    // when a master is out of date: a two-shot cut, its upscale, and a take that gets a Seedance file
    const T0 = '2026-11-14T10:00:00.000Z', before = '2026-11-14T09:00:00.000Z', after = '2026-11-14T11:00:00.000Z';
    const cut: Timeline = { version: 'v1', fps: 24, width: 1080, height: 1920, at: T0, markers: [], tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: [
      { id: 'a', src: 'x/a-480p.mp4', in: 0, out: 2, at: 0 }, { id: 'b', src: 'x/b-480p.mp4', in: 0, out: 2, at: 2 }] }] };
    const basePath = 'x/video/1080/cut-v1-1080.mp4';
    const b = { version: 'v1', path: basePath, frames: 96, label: 'Higgsfield' };
    const now = (info: FullInfo) => { const pieces = picturePieces(cut, info, info.bases.length ? { b, tl: cut } : undefined); return { pieces, made: pictureMade(pieces, info.bases.length ? b : undefined), times: info.times }; };
    const withBase = (times: Record<string, string>, takes: Record<string, string> = {}): FullInfo => ({ bases: [b], takes, label: 'Higgsfield', times });
    const fromBase = { sources: [{ kind: 'base' as const, shots: 2, frames: 96 }], shots: 2, frames: 96, base: { version: 'v1', path: basePath, label: 'Higgsfield' } };
    const noRec = masterAge({ version: 'v1' }, now(withBase({ [basePath]: before })));
    check('no record, the upscaled cut covers every shot: out of date', noRec.state === 'stale' && noRec.reason === 'The master of v1 was made from the 480p scaled up; the upscaled cut now covers all 2 shots', noRec);
    const unknown = masterAge({ version: 'v1' }, now({ bases: [], takes: {}, label: 'upscaled' }));
    check('no record, nothing full size: unknown (shown as today)', unknown.state === 'unknown' && !unknown.reason, unknown);
    const fresh = masterAge({ version: 'v1', at: T0, picture: fromBase }, now(withBase({ [basePath]: before })));
    check('made from what the page would use now: up to date', fresh.state === 'fresh' && !fresh.reason, fresh);
    const take = masterAge({ version: 'v1', at: T0, picture: fromBase }, now(withBase({ [basePath]: before, 'x/a-1080p.mp4': after }, { 'x/a-480p.mp4': 'x/a-1080p.mp4' })));
    check('a take\'s Seedance file landed after it', take.state === 'stale' && take.reason === 'The master of v1 was made before 1 take got its full-size picture', take);
    const oldTake = masterAge({ version: 'v1', at: T0, picture: { ...fromBase, sources: [{ kind: 'take', shots: 1, frames: 48 }, { kind: 'base', shots: 1, frames: 48 }] } }, now(withBase({ [basePath]: before, 'x/a-1080p.mp4': before }, { 'x/a-480p.mp4': 'x/a-1080p.mp4' })));
    check('a take\'s Seedance file it already used: up to date', oldTake.state === 'fresh', oldTake);
    const base = masterAge({ version: 'v1', at: T0, picture: fromBase }, now(withBase({ [basePath]: after })));
    check('a new upscaled cut landed after it', base.state === 'stale' && base.reason === 'The master of v1 was made before the upscaled cut of v1 landed', base);
    const other = masterAge({ version: 'v1', at: T0, picture: { ...fromBase, base: { version: 'v0', path: 'x/video/1080/cut-v0-1080.mp4', label: 'Higgsfield' } } }, now(withBase({ [basePath]: before })));
    check('an upscaled cut of another version than the one it used', other.state === 'stale' && other.reason === 'The master of v1 was made before the upscaled cut of v1 landed', other);
    const scaled = masterAge({ version: 'v1', at: T0, picture: { sources: [{ kind: 'small', shots: 2, frames: 96 }], shots: 2, frames: 96 } }, now(withBase({})));
    check('it scaled up shots that have a full-size picture now (no times known)', scaled.state === 'stale' && scaled.reason === 'The master of v1 was made with 2 shots scaled up from 480p; every shot now has a full-size picture', scaled);
    const both = masterAge({ version: 'v1', at: T0, picture: fromBase }, now({ ...withBase({ [basePath]: after, 'x/b-1080p-up.mp4': after }), upscaled: { 'x/b-480p.mp4': 'x/b-1080p-up.mp4' } }));
    check('both at once, in one sentence', both.reason === 'The master of v1 was made before 1 take got its full-size picture and before the upscaled cut of v1 landed', both);

    // the rows: the master of the version, out of date, and an earlier one
    const files: RenderFile[] = [
      { path: 'cut/renders/v231-master.mp4', version: 'v231', kind: 'master', at: '2026-11-13T13:25:25Z', n: 1, earlier: true },
      { path: 'cut/renders/v231-master-2.mp4', version: 'v231', kind: 'master', at: '2026-11-14T13:25:25Z', n: 2, picture: fromBase },
    ];
    const reason = 'The master of v231 was made before 3 takes got their full-size picture';
    const L2 = renderLists({ shown: 'v231', width: 1080, height: 1920, seconds: 182, master: { version: 'v231', kind: 'master', state: 'done', path: 'cut/renders/v231-master-2.mp4' }, variants: [], files, masterStale: { path: 'cut/renders/v231-master-2.mp4', reason } });
    const newest = L2.shown.find((r) => r.key === 'cut/renders/v231-master-2.mp4');
    const old = L2.shown.find((r) => r.key === 'cut/renders/v231-master.mp4');
    check('the newest is the master of v231, its reason on its row', newest?.stale === reason && !newest.earlier && newest.title === 'Master of cut v231', newest);
    check('the earlier one stays, marked plainly', old?.earlier === 'An earlier master of v231 · scaled up from 480p' && !old.stale && old.state === 'done', old);
    check('newest first', L2.shown[0].key === 'cut/renders/v231-master-2.mp4', L2.shown.map((r) => r.key));
    check('an earlier one with a record does not guess', earlierWords('v231', fromBase) === 'An earlier master of v231');
    const running = renderLists({ shown: 'v231', width: 1080, height: 1920, seconds: 182, master: { version: 'v231', kind: 'master', state: 'running', percent: 40, path: 'cut/renders/v231-master-3.mp4' }, variants: [], files });
    check('while one runs again, the ones on disk stay listed', running.shown[0].state === 'running' && running.shown.filter((r) => r.state === 'done').length === 2, running.shown.map((r) => `${r.key} ${r.state}`));

    // the server's listing: every master, each with its own record
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hh-remaster-'));
    const film = filmTargetOf('z', dir, dir);
    const r = path.join(dir, 'cut', 'renders');
    await fs.mkdir(r, { recursive: true });
    await fs.writeFile(path.join(dir, 'cut', 'v3.json'), JSON.stringify({ ...cut, version: 'v3', renders: {
      master: { path: 'cut/renders/v3-master-2.mp4', at: '2026-11-14T12:00:00.000Z', hash: 'h', seconds: 300, picture: fromBase },
      earlierMasters: [{ path: 'cut/renders/v3-master.mp4', at: '2026-11-13T12:00:00.000Z', hash: 'h', seconds: 40 }] } }));
    for (const f of ['v3-master.mp4', 'v3-master-2.mp4', 'v3-master-2.log', 'v3.log']) await fs.writeFile(path.join(r, f), 'x');
    const got = await renderFiles(film);
    const m1 = got.find((f) => f.path.endsWith('v3-master.mp4')), m2 = got.find((f) => f.path.endsWith('v3-master-2.mp4'));
    check('both masters listed, nothing else', got.length === 2 && !!m1 && !!m2, got.map((f) => f.path));
    check('the first: earlier, its own record (no picture)', m1?.earlier === true && m1.n === 1 && m1.took === 40 && m1.at === '2026-11-13T12:00:00.000Z' && !m1.picture, m1);
    check('the second: the master of v3, its own record', !m2?.earlier && m2?.n === 2 && m2.took === 300 && m2.picture?.sources[0].kind === 'base', m2);
    await fs.rm(dir, { recursive: true, force: true });

    // the sample: its master of v1 is out of date (no record); "again" makes a -2 beside it, once
    const st = mockRenderStates('the-lighthouse', 'v1');
    check('the sample\'s master of v1 has no record', st.master?.state === 'done' && !st.master.picture, st.master);
    check('without "again", a master already made answers done', mockQueueRender('the-lighthouse', 'v1', 'master', undefined, false).path === 'cut/renders/v1-master.mp4');
    const q = mockQueueRender('the-lighthouse', 'v1', 'master', undefined, false, true);
    check('"again" starts a second master beside the first', q.state === 'queued' && !q.path, q);
    check('while it runs, the master state follows it', mockRenderStates('the-lighthouse', 'v1').master?.state === 'queued');
    check('asked again while it runs: the same render', mockQueueRender('the-lighthouse', 'v1', 'master', undefined, false, true).queuedAt === q.queuedAt);
    check('the Finish page keeps the first until it lands', mockNewestMaster('the-lighthouse', 'v1')?.path === 'cut/renders/v1-master.mp4');
  }

  // ---- the sample smaller file (MOCK=boards): the made-up sizes of the real one, its words
  {
    const q = mockQueueRender('the-lighthouse', 'v1', 'master', { loudness: { lufs: -14, truePeak: -1 }, small: true }, false);
    check('the sample: a smaller file is asked as its own render', q.state === 'queued' && q.tag === 'lufs14-tp1-small', q);
    const job = (globalThis as unknown as { __hhMockRenders: { jobs: Map<string, { end: number; start: number }> } }).__hhMockRenders.jobs.get('the-lighthouse/v1/master/lufs14-tp1-small');
    if (job) { job.start = Date.now() - 2000; job.end = Date.now() - 1000; }
    const st = mockRenderStates('the-lighthouse', 'v1').variants?.find((x) => x.tag === 'lufs14-tp1-small');
    check('the sample: done with one file and its record', st?.state === 'done' && st.outputs?.length === 1 && st.path === 'cut/renders/v1-master-lufs14-tp1-small.mp4' && st.small?.ssim === 0.992 && st.small.bytes < st.small.fromBytes, st);
    const f = mockRenderFiles('the-lighthouse').find((x) => x.path === 'cut/renders/v1-master-lufs14-tp1-small.mp4');
    const w = f ? fileWords(f, 1080, 1920) : undefined;
    check('the sample: listed with its sizes in words', f?.bytes === st?.small?.bytes && /^−14 LUFS · smaller file \(\d+ MB, from \d+ MB\)$/.test(w?.extra ?? ''), w);
  }

  console.log(`ok · ${n} checks of the Renders tab`);
}

main().catch((e) => { console.error(e); process.exit(1); });
