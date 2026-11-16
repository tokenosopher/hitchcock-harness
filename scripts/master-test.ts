// npm run master:test
// The film's master and its release, on hand-made folders (13 Nov 2026, ASKS 37). Four films in a made-up repo and
// two made-up final-cuts roots, read by the real readers:
//   upscaled   a master under video/1080/ shown by a review card at Finish (beside it a 480p file and an "upscaled-all"
//              file named for 1080), a card asking for its yes, the cut moved on to v3; a copy in final cuts, nothing
//              released
//   rendered   the app's own "Render master" (cut/renders/v2-master.mp4); no card
//   remastered the same, made again (v2-master-2.mp4 beside v2-master.mp4, 14 Nov): the newest is the master, even
//              when the first one's file was touched since
//   old        an older film: masters by name only (cut/<film>-final-clean.mp4, a 1080 soft variant); posted
//              (Published links note); its final-cuts folder holds a Social kit with FINAL files
//   kitonly    no master; a final-cuts folder with a Social kit and its FINAL files, nothing in the note
// Also: where each shot's full-size picture comes from (fullsize.ts picturePieces). Nothing outside the temp folder is read or written.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline } from '../src/server/types';

const root = mkdtempSync(path.join(os.tmpdir(), 'hh-master-'));
const repo = path.join(root, 'repo');
const finals = path.join(root, 'final cuts');
const note = path.join(root, 'Published links.md');
process.env.HARNESS_PUBLISHED_LINKS = note;
process.env.HARNESS_NO_CUT_WATCH = '1';
process.chdir(root); // harness/films.json and the kept readings land in the temp folder

const put = (p: string, body: string | Buffer = 'x', when?: string) => {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, body);
  if (when) utimesSync(p, new Date(when), new Date(when));
};
const film = (slug: string) => path.join(repo, 'assets', 'films', slug);
const tl = (slug: string, v: string, shift = 0, name = 'Music'): Timeline => ({
  version: v, fps: 24, width: 1080, height: 1920, at: '2026-11-13T00:00:00Z', by: 'user', note: v, markers: [],
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'a', src: `assets/films/${slug}/takes/a.mp4`, in: 0, out: 2, at: 0 }, { id: 'b', src: `assets/films/${slug}/takes/b.mp4`, in: 0, out: 2, at: 2 + shift }] },
    { id: 'A1', kind: 'audio', name: name, clips: [{ id: 'm', src: `assets/films/${slug}/audio/m.wav`, in: 0, out: 4, at: 0 }] },
  ],
});
const cards = (sections: unknown[]) => JSON.stringify({ title: 'review', sections });

// ---- upscaled: the film of tonight, in small
{
  const d = film('upscaled');
  put(path.join(d, 'brief.md'), '# Upscaled Film\n');
  for (const [v, shift] of [['v1', 0], ['v2', 0], ['v3', 0]] as const) put(path.join(d, 'cut', `${v}.json`), JSON.stringify(tl('upscaled', v, shift, v === 'v3' ? 'Music 2' : 'Music')));
  put(path.join(d, 'takes', 'a.mp4')); put(path.join(d, 'takes', 'b.mp4')); put(path.join(d, 'audio', 'm.wav'));
  put(path.join(d, 'video/1080/cut-v2-480p-no-music.mp4'), 'x', '2026-11-13T07:21:00Z');
  put(path.join(d, 'video/1080/cut-v2-1080-upscaled-all.mp4'), 'x'.repeat(30), '2026-11-13T07:44:00Z');
  put(path.join(d, 'video/1080/cut-v2-1080.mp4'), 'x'.repeat(20), '2026-11-13T07:45:00Z');
  put(path.join(d, 'video/1080/cut-v2-480p-dialogue-only.mp4'), 'x', '2026-11-13T07:50:00Z');
  put(path.join(d, 'review/cards.json'), cards([{ heading: 'Finish', cards: [
    { type: 'video', id: 'MASTER-v2-1080', title: 'Cut v2 at 1080p (dialogue only)', at: 'finish', for: 'film', file: 'video/1080/cut-v2-1080.mp4', text: 'The approved cut v2. The sound is the Dialogue tracks only: the rest is laid later.' },
    { type: 'card', id: 'YES-master-v2-1080', title: 'Is this 1080p version the one? (cut v2 at 1080p)', at: 'finish', for: 'film', ask: 'yes', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
  ] }]));
  put(path.join(finals, '2026-11-11 Upscaled Film', 'Upscaled Film 1080p v1 (cut v2, dialogue only).mp4'));
}
// ---- rendered: the app's own master render
{
  const d = film('rendered');
  put(path.join(d, 'brief.md'), '# Rendered Film\n');
  for (const v of ['v1', 'v2']) put(path.join(d, 'cut', `${v}.json`), JSON.stringify(tl('rendered', v)));
  put(path.join(d, 'takes', 'a.mp4')); put(path.join(d, 'takes', 'b.mp4')); put(path.join(d, 'audio', 'm.wav'));
  put(path.join(d, 'cut/renders/v1-proxy.mp4')); put(path.join(d, 'cut/renders/v2-proxy.mp4'));
  put(path.join(d, 'cut/renders/v2-master.mp4'), 'x'.repeat(40), '2026-11-12T10:00:00Z');
}
// ---- remastered: a master made again beside the first; the first touched later (a copy, a backup)
{
  const d = film('remastered');
  put(path.join(d, 'brief.md'), '# Remastered Film\n');
  for (const v of ['v1', 'v2']) put(path.join(d, 'cut', `${v}.json`), JSON.stringify(tl('remastered', v)));
  put(path.join(d, 'takes', 'a.mp4')); put(path.join(d, 'takes', 'b.mp4')); put(path.join(d, 'audio', 'm.wav'));
  put(path.join(d, 'cut/renders/v2-proxy.mp4'));
  put(path.join(d, 'cut/renders/v2-master-2.mp4'), 'x'.repeat(60), '2026-11-14T10:00:00Z');
  put(path.join(d, 'cut/renders/v2-master.mp4'), 'x'.repeat(40), '2026-11-14T11:00:00Z');
}
// ---- old: masters by name, posted, a Social kit with FINAL files
{
  const d = film('old');
  put(path.join(d, 'brief.md'), '# Old Film\n');
  put(path.join(d, 'cut/old-1080-soft-v1.mp4'), 'x', '2026-11-08T10:00:00Z');
  put(path.join(d, 'cut/old-1080-final-clean.mp4'), 'x'.repeat(50), '2026-11-07T10:00:00Z');
  put(path.join(d, 'audio/master/mix.wav'));
  put(path.join(finals, '2026-11-06 Old Film', 'Social kit', 'Old Film - FINAL captioned.mp4'));
}
// ---- kitonly: FINAL files, no post, no master
{
  const d = film('kitonly');
  put(path.join(d, 'brief.md'), '# Kit Only\n');
  put(path.join(finals, '2026-11-01 Kit Only', 'Social kit', 'Kit Only - FINAL captioned.mp4'));
}
put(path.join(repo, 'films.txt'), 'upscaled\nrendered\nremastered\nold\nkitonly\n');
put(note, '# Published links\n\n## Old Film (9 Nov 2026)\n\n| Platform | Account | Title | Link | Posted |\n|---|---|---|---|---|\n| YouTube | ZB | Old | https://youtu.be/x | 9 Nov |\n\n## Upscaled Film (13 Nov 2026)\n\n| Platform | Account | Title | Link | Posted |\n|---|---|---|---|---|\n| TikTok | ZB | | add if posted | |\n');

async function main() {
  const { buildRegistry } = await import('../src/server/films/registry');
  const { readPost } = await import('../src/server/films/read/post');
  const { readFeed, isWaiting } = await import('../src/server/films/read/feed');
  const { readMaster } = await import('../src/server/films/read/master');
  const { withTimeline } = await import('../src/server/edit/state');
  const { Warnings } = await import('../src/server/films/util');

  const reg = await buildRegistry({ filmRepo: repo, otherRepos: [], finalCuts: [finals], harnessDir: path.join(root, 'harness'), driveRoot: root, port: 0 } as never);
  const by = Object.fromEntries(reg.films.map((f) => [f.slug, f]));
  const line = (s: string) => { const f = by[s]; return `${s}: ${f.status} · stage ${f.stage} · released ${JSON.stringify(f.released ?? null)} · copies ${JSON.stringify((f.copies ?? []).map((c) => c.date))}`; };
  for (const s of ['upscaled', 'rendered', 'old', 'kitonly']) console.log(line(s));

  assert.equal(by.upscaled.status, 'in-progress', 'a copy in final cuts is not a release ("add if posted" is no post)');
  assert.equal(by.upscaled.copies?.length, 1);
  assert.equal(by.upscaled.delivered, undefined);
  assert.equal(by.upscaled.stage, 10, 'a full-size master: stage 10');
  assert.equal(by.rendered.stage, 10, "the app's master render: stage 10");
  assert.equal(by.old.status, 'delivered');
  assert.equal(by.old.released?.by, 'posted');
  assert.equal(by.kitonly.status, 'delivered');
  assert.equal(by.kitonly.released?.by, 'final files');

  const masterOf = async (slug: string, title: string) => {
    const dir = film(slug);
    const ctx = { dir, warn: new Warnings() };
    const post = await readPost(ctx);
    const cut = await withTimeline(slug, dir, repo, title, undefined);
    const feed = await readFeed(ctx, slug);
    return readMaster(ctx, post, cut, feed.cards, feed.cards.filter(isWaiting));
  };
  const up = await masterOf('upscaled', 'Upscaled Film');
  console.log('upscaled master:', JSON.stringify(up));
  assert.equal(up?.path, 'video/1080/cut-v2-1080.mp4', 'the card at Finish wins over a newer 480p file and an older "upscaled-all"');
  assert.equal(up?.version, 'v2');
  assert.equal(up?.from, 'card');
  assert.equal(up?.sound, 'dialogue only');
  assert.equal(up?.ask?.id, 'YES-master-v2-1080');
  const re = await masterOf('rendered', 'Rendered Film');
  console.log('rendered master:', JSON.stringify(re));
  assert.equal(re?.path, 'cut/renders/v2-master.mp4');
  assert.equal(re?.version, 'v2');
  assert.equal(re?.from, 'render');
  const again = await masterOf('remastered', 'Remastered Film');
  console.log('remastered master:', JSON.stringify(again));
  assert.equal(again?.path, 'cut/renders/v2-master-2.mp4', 'a master made again is the master of its version, the first one is not');
  assert.equal(again?.version, 'v2');
  assert.equal(again?.from, 'render');
  assert.equal(again?.bytes, 60);
  assert.equal(by.remastered.stage, 10);
  const old = await masterOf('old', 'Old Film');
  console.log('old master:', JSON.stringify(old));
  assert.equal(old?.path, 'cut/old-1080-final-clean.mp4', 'an older film keeps its reading by name');
  assert.equal(old?.from, 'name');
  assert.equal(await masterOf('kitonly', 'Kit Only'), undefined);

  // where each shot's full-size picture comes from: Seedance file, upscaled file, the base mapped by source, else 480p
  const { picturePieces } = await import('../src/components/edit/fullsize');
  const base = tl('x', 'v1');
  const later = { ...tl('x', 'v2'), tracks: [{ id: 'V1', kind: 'video' as const, name: 'Picture', clips: [
    { id: 'b1', src: 'assets/films/x/takes/b.mp4', in: 0.5, out: 2, at: 0 },        // b, trimmed and moved first: from the base
    { id: 'a1', src: 'assets/films/x/takes/a.mp4', in: 0, out: 3, at: 1.5 },        // a, longer than the base used: 1 s at 480p
    { id: 'c1', src: 'assets/films/x/takes/c-480p.mp4', in: 0, out: 1, at: 4.5 },   // c: its own upscaled file
    { id: 'd1', src: 'assets/films/x/takes/d-480p.mp4', in: 0, out: 1, at: 5.5 },   // d: Seedance and upscale: Seedance wins
  ] }] };
  const info = { bases: [{ version: 'v1', path: 'assets/films/x/video/1080/cut-v1-1080.mp4', label: 'Higgsfield' }], label: 'Higgsfield',
    takes: { 'assets/films/x/takes/d-480p.mp4': 'assets/films/x/takes/d-1080p.mp4' },
    upscaled: { 'assets/films/x/takes/c-480p.mp4': 'assets/films/x/takes/c-1080p-up.mp4', 'assets/films/x/takes/d-480p.mp4': 'assets/films/x/takes/d-1080p-up.mp4' } };
  const ps = picturePieces(later, info, { b: info.bases[0], tl: base });
  const kinds = ps.map((p) => `${p.clip.id}:${p.kind}:${p.from}-${p.to}${p.kind === 'base' ? `@${Math.round(p.t0 * 24)}` : ''}`).join(' ');
  console.log('pieces:', kinds);
  assert.equal(kinds, 'b1:base:0-36@60 a1:base:36-84@0 a1:small:84-108 c1:upscaled:108-132 d1:take:132-156');
  // a made piece with its full-size original plays it, before the base (14 Nov)
  const card = picturePieces(base, { ...info, originals: { 'assets/films/x/takes/b.mp4': 'assets/films/x/takes/b-1080x1920.mp4' } }, { b: info.bases[0], tl: base });
  assert.equal(card.map((p) => `${p.clip.id}:${p.kind}`).join(' '), 'a:base b:original');
  // a master of another version is of the cut now when its content is the same (ASKS 49): the Release list's
  // `current`, and the version's render part read once and again only when its file changed
  const { versionPart } = await import('../src/server/edit/timeline');
  const { filmTarget } = await import('../src/server/actions/film');
  const { listMasters } = await import('../src/server/release/final');
  const { sameCut, cutGap } = await import('../src/components/edit/sameCut');
  const rf = (await filmTarget('rendered', repo))!;
  const p1 = await versionPart(rf, 'v1'), p2 = await versionPart(rf, 'v2');
  assert.ok(p1 && p2 && sameCut(p1, p2), 'v1 and v2 of "rendered" differ only by name and note: the same cut');
  assert.equal(await versionPart(rf, 'v1'), p1, 'read once: the same part from the cache');
  assert.equal(await versionPart(rf, 'v7'), undefined, 'a version that is not there: none');
  const v1now = tl('rendered', 'v1');
  const asOf = async (t: Timeline) => (await listMasters(rf, t)).find((m) => m.path === 'cut/renders/v2-master.mp4');
  assert.equal((await asOf(v1now))?.current, true, 'the master of v2 is of the cut now when the cut is v1 of the same content');
  const moved = { ...v1now, version: 'v3', tracks: v1now.tracks.map((t) => (t.id === 'A1' ? { ...t, clips: t.clips.map((c) => ({ ...c, at: c.at + 1 })) } : t)) };
  assert.equal((await asOf(moved))?.current, false, 'with a sound clip moved it is not');
  assert.deepEqual(cutGap(p2, moved, 'the master'), { same: false, words: '1 sound clip moved since the master' });
  // a version file changed by hand (never by the app) is read again
  put(path.join(film('rendered'), 'cut', 'v1.json'), JSON.stringify({ ...moved, version: 'v1' }), '2026-11-14T12:00:00Z');
  const p1b = await versionPart(rf, 'v1');
  assert.ok(p1b && p1b !== p1 && !sameCut(p1b, p2), 'a changed file is read again');
  put(path.join(film('rendered'), 'cut', 'v1.json'), JSON.stringify(tl('rendered', 'v1')));
  console.log('same cut: a master of another version with the same content is current; the part is cached by the file');
  console.log(`ok · masters by card, render and name; released by note and by FINAL files; a copy is not a release; the full-size sources in order (${root})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
