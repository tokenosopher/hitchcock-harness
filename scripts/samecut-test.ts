// npm run samecut:test
// Would two versions of the cut render the same master? (src/components/edit/sameCut.ts, ASKS 49.) A move and its undo
// are the same cut; a difference in each field the render reads is a difference; the fields the render never reads are
// ignored; and what changed is said in words, one kind and many, and counted when it is too much to list.
import { changeWords, cutChanges, cutGap, renderPart, sameCut, MAX_LISTED } from '../src/components/edit/sameCut';
import type { Timeline, TimelineClip } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// a small cut: two shots, their sound, a music clip, two subtitle lines and an .srt clip
const shot = (id: string, at: number, src: string): TimelineClip => ({ id, src, in: 0, out: 4, at, label: `S1 · ${id}`, takeRef: { scene: 'S1', take: id } });
const base: Timeline = {
  version: 'v235', fps: 24, width: 1080, height: 1920, basedOn: 'v234', note: 'the cut', by: 'user', at: '2026-11-14T08:00:00.000Z',
  tracks: [
    { id: 'V1', kind: 'video', name: 'Picture', clips: [shot('c1', 0, 'a.mp4'), shot('c2', 4, 'b.mp4')] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ ...shot('c1a', 0, 'a.mp4') }, { ...shot('c2a', 4, 'b.mp4') }] },
    { id: 'A2', kind: 'audio', name: 'Music', clips: [{ id: 'm1', src: 'music.wav', in: 0, out: 8, at: 0, gain: -6 }] },
    { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: 'Up, you wretch.', in: 0, out: 1.5, at: 1 }, { id: 's2', text: 'Who bids?', in: 0, out: 1, at: 5 }] },
    { id: 'C2', kind: 'captions', name: 'Old subtitles', clips: [{ id: 'f1', src: 'subs.srt', in: 0, out: 8, at: 0 }] },
  ],
  markers: [{ at: 2, text: 'look here', by: 'user' }],
};
const v = (f: (t: Timeline) => void): Timeline => { const t = copy(base); f(t); return t; };
const track = (t: Timeline, id: string) => t.tracks.find((x) => x.id === id)!;
const clip = (t: Timeline, tr: string, id: string) => track(t, tr).clips.find((c) => c.id === id)!;
const words = (a: Timeline, b: Timeline) => changeWords(cutChanges(a, b), 'the master');

// ---- a move and its undo
const moved = v((t) => { clip(t, 'C1', 's1').at = 1 - 28 / 24; Object.assign(t, { version: 'v236', basedOn: 'v235', note: 'moved “Up, you wretch.” −28 f' }); });
const undone = v((t) => Object.assign(t, { version: 'v237', basedOn: 'v236', note: 'undo: back to v235', at: '2026-11-14T09:00:00.000Z' }));
ok('the same cut is the same', sameCut(base, copy(base)));
ok('a move is a difference', !sameCut(base, moved));
ok('its undo is the same cut as before the move', sameCut(base, undone) && sameCut(undone, base));
ok('its undo: no changes, no words', cutChanges(base, undone).length === 0 && words(base, undone) === '', cutChanges(base, undone));
ok('the move in words', words(base, moved) === '1 subtitle line moved since the master', words(base, moved));
ok('cutGap: the same', JSON.stringify(cutGap(base, undone, 'the master')) === JSON.stringify({ same: true }));
ok('cutGap: a gap in words', JSON.stringify(cutGap(base, moved, 'the master')) === JSON.stringify({ same: false, words: '1 subtitle line moved since the master' }), cutGap(base, moved, 'the master'));
ok('a render part compares as its timeline does', sameCut(renderPart(base), undone) && !sameCut(renderPart(base), moved) && sameCut(renderPart(renderPart(base)), base));
ok('a render part of a part is the part', JSON.stringify(renderPart(renderPart(base))) === JSON.stringify(renderPart(base)));
ok('clips in another order in the file are the same cut (the render reads them in time order)', sameCut(base, v((t) => track(t, 'V1').clips.reverse())));

// ---- every field the render reads makes a difference (one case each)
const reads: [string, (t: Timeline) => void][] = [
  ['fps', (t) => { t.fps = 25; }],
  ['width', (t) => { t.width = 720; }],
  ['height', (t) => { t.height = 1280; }],
  ['a track id', (t) => { track(t, 'A2').id = 'A3'; }],
  ['a track kind', (t) => { track(t, 'C2').kind = 'audio'; }],
  ['a track muted', (t) => { track(t, 'A2').muted = true; }],
  ['a sound track solo', (t) => { track(t, 'A2').solo = true; }],
  ['the track order', (t) => { const [a, b] = [t.tracks[1], t.tracks[2]]; t.tracks[1] = b; t.tracks[2] = a; }],
  ['a track added', (t) => { t.tracks.push({ id: 'A3', kind: 'audio', name: 'Effects', clips: [] }); }],
  ['a clip src', (t) => { clip(t, 'V1', 'c2').src = 'b2.mp4'; }],
  ['a line text', (t) => { clip(t, 'C1', 's2').text = 'Who bids now?'; }],
  ['a clip in', (t) => { clip(t, 'V1', 'c1').in = 0.5; }],
  ['a clip out', (t) => { clip(t, 'V1', 'c1').out = 3.5; }],
  ['a clip at', (t) => { clip(t, 'V1', 'c2').at = 4.5; }],
  ['a clip speed', (t) => { clip(t, 'V1', 'c2').speed = 0.75; }],
  ['a clip gain', (t) => { clip(t, 'A2', 'm1').gain = -3; }],
  ['a clip gain points', (t) => { clip(t, 'A2', 'm1').gainPoints = [{ t: 2, db: 0 }, { t: 3, db: -6 }]; }],
  ['a gain point moved', (t) => { clip(t, 'A2', 'm1').gainPoints = [{ t: 2, db: 0 }]; }],
  ['a clip fade in', (t) => { clip(t, 'V1', 'c1').fadeIn = 0.5; }],
  ['a clip fade out', (t) => { clip(t, 'A2', 'm1').fadeOut = 1; }],
  ['a clip dissolve', (t) => { clip(t, 'V1', 'c2').dissolve = 0.5; }],
  ['a clip muted', (t) => { clip(t, 'A1', 'c2a').muted = true; }],
  ['a clip mirrored', (t) => { clip(t, 'V1', 'c1').flip = 'h'; }],
  ['a clip added', (t) => { track(t, 'A2').clips.push({ id: 'm2', src: 'sting.wav', in: 0, out: 1, at: 7 }); }],
  ['a clip removed', (t) => { track(t, 'C1').clips.pop(); }],
  ['an .srt clip trimmed', (t) => { clip(t, 'C2', 'f1').out = 6; }],
];
const withPoints = v((t) => { clip(t, 'A2', 'm1').gainPoints = [{ t: 2, db: 0 }, { t: 3, db: -6 }]; });
for (const [name, f] of reads) {
  const from = name === 'a gain point moved' ? withPoints : base;
  const b = v((t) => { if (from === withPoints) clip(t, 'A2', 'm1').gainPoints = [{ t: 2, db: 0 }, { t: 3, db: -6 }]; f(t); });
  ok(`reads ${name}: a difference`, !sameCut(from, b));
  ok(`reads ${name}: said in words`, cutChanges(from, b).length > 0 && words(from, b) !== '', words(from, b));
}
// the render's own defaults are not differences
ok('speed 1 is no speed', sameCut(base, v((t) => { clip(t, 'V1', 'c1').speed = 1; })));
ok('a speed not above 0 is speed 1, as the render reads it', sameCut(base, v((t) => { clip(t, 'V1', 'c1').speed = 0; })));
ok('gain 0 is no gain', sameCut(v((t) => { delete clip(t, 'A2', 'm1').gain; }), v((t) => { clip(t, 'A2', 'm1').gain = 0; })));
ok('no level points is an empty list', sameCut(base, v((t) => { clip(t, 'A2', 'm1').gainPoints = []; })));
ok('a fade of 0 is no fade, a dissolve of 0 none, muted false not muted', sameCut(base, v((t) => { Object.assign(clip(t, 'V1', 'c1'), { fadeIn: 0, fadeOut: 0, dissolve: 0, muted: false }); })));
ok('solo on a picture track is not read', sameCut(base, v((t) => { track(t, 'V1').solo = true; })));
ok('solo on a subtitles track is not read', sameCut(base, v((t) => { track(t, 'C1').solo = true; })));
ok('words on a clip with a file are not read (only a line has words)', sameCut(base, v((t) => { clip(t, 'C2', 'f1').text = 'stray'; })));

// ---- what the render never reads
const ignored: [string, (t: Timeline) => void][] = [
  ['the version name', (t) => { t.version = 'v239'; }],
  ['basedOn', (t) => { t.basedOn = 'v238'; }],
  ['the note', (t) => { t.note = 'undo: back to v235'; }],
  ['who saved it', (t) => { t.by = 'alma'; }],
  ['when', (t) => { t.at = '2026-11-15T00:00:00.000Z'; }],
  ['the markers', (t) => { t.markers = [{ at: 9, text: 'other', by: 'alma' }]; }],
  ['the renders record', (t) => { t.renders = { master: { path: 'cut/renders/v235-master.mp4', at: '2026-11-14T10:00:00Z', hash: 'abc' } }; }],
  ['a track name', (t) => { track(t, 'A2').name = 'Score'; }],
  ['a track locked', (t) => { track(t, 'V1').locked = true; }],
  ['clip ids', (t) => { for (const tr of t.tracks) for (const c of tr.clips) c.id = `${c.id}-new`; }],
  ['a clip label', (t) => { clip(t, 'V1', 'c1').label = 'Title card · other'; }],
  ['a clip takeRef', (t) => { clip(t, 'V1', 'c1').takeRef = { scene: 'S2', take: 'take9' }; }],
  ['a clip unlinked', (t) => { clip(t, 'V1', 'c1').unlinked = true; }],
];
for (const [name, f] of ignored) {
  const b = v(f);
  ok(`ignores ${name}`, sameCut(base, b) && cutChanges(base, b).length === 0, cutChanges(base, b));
}

// ---- the words, one kind and many
const say = (f: (t: Timeline) => void, since = 'the master') => changeWords(cutChanges(base, v(f)), since);
const cases: [string, (t: Timeline) => void, string][] = [
  ['a shot trimmed', (t) => { clip(t, 'V1', 'c1').out = 3.5; }, '1 shot trimmed since the master'],
  ['two shots trimmed', (t) => { clip(t, 'V1', 'c1').out = 3.5; clip(t, 'V1', 'c2').in = 0.5; }, '2 shots trimmed since the master'],
  ['a shot moved', (t) => { clip(t, 'V1', 'c2').at = 4.5; }, '1 shot moved since the master'],
  ['a shot swapped', (t) => { clip(t, 'V1', 'c2').src = 'b2.mp4'; }, '1 shot swapped since the master'],
  ['a shot added', (t) => { track(t, 'V1').clips.push(shot('c3', 8, 'c.mp4')); }, '1 shot added since the master'],
  ['two shots removed', (t) => { track(t, 'V1').clips = []; }, '2 shots removed since the master'],
  ['a shot mirrored', (t) => { clip(t, 'V1', 'c1').flip = 'h'; }, '1 shot mirrored since the master'],
  ['a shot slowed', (t) => { clip(t, 'V1', 'c2').speed = 0.5; }, '1 shot sped up or slowed since the master'],
  ['a sound clip added', (t) => { track(t, 'A2').clips.push({ id: 'm2', src: 'sting.wav', in: 0, out: 1, at: 7 }); }, '1 sound clip added since the master'],
  ['two sound clips moved', (t) => { clip(t, 'A1', 'c1a').at = 0.25; clip(t, 'A1', 'c2a').at = 4.25; }, '2 sound clips moved since the master'],
  ['a level changed', (t) => { clip(t, 'A2', 'm1').gain = -3; }, '1 sound level changed since the master'],
  ['two levels changed', (t) => { clip(t, 'A2', 'm1').gain = -3; clip(t, 'A1', 'c1a').gainPoints = [{ t: 1, db: -4 }]; }, '2 sound levels changed since the master'],
  ['a line moved', (t) => { clip(t, 'C1', 's1').at = 2; }, '1 subtitle line moved since the master'],
  ['two lines moved', (t) => { clip(t, 'C1', 's1').at = 2; clip(t, 'C1', 's2').at = 6; }, '2 subtitle lines moved since the master'],
  ['a line reworded', (t) => { clip(t, 'C1', 's2').text = 'Who bids now?'; }, '1 subtitle line reworded since the master'],
  ['two lines reworded', (t) => { clip(t, 'C1', 's1').text = 'Up!'; clip(t, 'C1', 's2').text = 'Who bids now?'; }, '2 subtitle lines reworded since the master'],
  ['a line added', (t) => { track(t, 'C1').clips.push({ id: 's3', text: 'Sold.', in: 0, out: 1, at: 7 }); }, '1 subtitle line added since the master'],
  ['a line removed', (t) => { track(t, 'C1').clips.shift(); }, '1 subtitle line removed since the master'],
  ['a line made longer', (t) => { clip(t, 'C1', 's1').out = 2; }, '1 subtitle line trimmed since the master'],
  ['a subtitle file trimmed', (t) => { clip(t, 'C2', 'f1').out = 6; }, '1 subtitle file trimmed since the master'],
  ['a fade', (t) => { clip(t, 'V1', 'c1').fadeIn = 0.5; }, '1 fade changed since the master'],
  ['two fades', (t) => { clip(t, 'V1', 'c1').fadeIn = 0.5; clip(t, 'A2', 'm1').fadeOut = 1; }, '2 fades changed since the master'],
  ['a dissolve', (t) => { clip(t, 'V1', 'c2').dissolve = 0.5; }, '1 dissolve changed since the master'],
  ['two dissolves', (t) => { clip(t, 'V1', 'c2').dissolve = 0.5; clip(t, 'A1', 'c2a').dissolve = 0.5; }, '2 dissolves changed since the master'],
  ['a clip muted', (t) => { clip(t, 'A1', 'c2a').muted = true; }, '1 clip muted since the master'],
  ['two clips muted', (t) => { clip(t, 'A1', 'c2a').muted = true; clip(t, 'A1', 'c1a').muted = true; }, '2 clips muted since the master'],
  ['a track muted', (t) => { track(t, 'A2').muted = true; }, '1 track muted since the master'],
  ['a track soloed', (t) => { track(t, 'A2').solo = true; }, '1 track soloed since the master'],
  ['a sound track added', (t) => { t.tracks.push({ id: 'A3', kind: 'audio', name: 'Effects', clips: [] }); }, '1 sound track added since the master'],
  ['the track order', (t) => { const [a, b] = [t.tracks[1], t.tracks[2]]; t.tracks[1] = b; t.tracks[2] = a; }, '1 track reordered since the master'],
  ['the picture size', (t) => { t.width = 720; t.height = 1280; }, '1 picture size changed since the master'],
  ['two kinds: the example', (t) => { clip(t, 'V1', 'c1').out = 3.5; clip(t, 'V1', 'c2').in = 0.5; track(t, 'A2').clips.push({ id: 'm2', src: 'sting.wav', in: 0, out: 1, at: 7 }); }, '2 shots trimmed and 1 sound clip added since the master'],
  ['three kinds, listed', (t) => { clip(t, 'V1', 'c1').out = 3.5; clip(t, 'A2', 'm1').gain = -3; clip(t, 'C1', 's1').at = 2; }, '1 shot trimmed, 1 sound level changed and 1 subtitle line moved since the master'],
  ['since the final', (t) => { clip(t, 'C1', 's1').at = 2; }, '1 subtitle line moved since the final'],
];
for (const [name, f, want] of cases) {
  const got = say(f, name === 'since the final' ? 'the final' : 'the master');
  ok(`words: ${name}`, got === want, got);
}
ok('words: without "since what", the sentence ends on since', changeWords(cutChanges(base, moved)) === '1 subtitle line moved since', changeWords(cutChanges(base, moved)));
// a split: the shot trimmed and its second half added
const split = say((t) => { const c = clip(t, 'V1', 'c1'); c.out = 2; track(t, 'V1').clips.splice(1, 0, { ...shot('c1b', 2, 'a.mp4'), in: 2, out: 4 }); });
ok('words: a split shot', split === '1 shot added and 1 shot trimmed since the master', split);
// clips renumbered and one moved: matched by their file
ok('words: ids renumbered, one moved, matched by file', say((t) => { for (const c of track(t, 'V1').clips) c.id = `${c.id}x`; clip(t, 'V1', 'c2x').at = 4.5; }) === '1 shot moved since the master');
ok('words: a move and a fade on the same shot count twice', say((t) => { clip(t, 'V1', 'c2').at = 4.5; clip(t, 'V1', 'c2').fadeIn = 0.5; }) === '1 shot moved and 1 fade changed since the master');

// too much to list
const lots = v((t) => {
  for (const c of track(t, 'V1').clips) c.out = 3.5;          // 2 shots trimmed
  clip(t, 'A2', 'm1').gain = -3;                               // 1 level
  track(t, 'A2').clips.push({ id: 'm2', src: 'sting.wav', in: 0, out: 1, at: 7 });   // 1 sound clip added
  for (const c of track(t, 'C1').clips) c.at += 0.5;           // 2 lines moved
  clip(t, 'C1', 's2').text = 'Who bids now?';                  // that one reworded instead: 1 moved, 1 reworded
});
const lw = words(base, lots);
ok(`too much to list: more than ${MAX_LISTED} kinds are counted, with their areas`, lw === '6 changes since the master, in picture, sound and subtitles', lw);
ok('too much to list: the count is every change', cutChanges(base, lots).reduce((s, c) => s + c.n, 0) === 6);
const lots2 = v((t) => { t.fps = 30; clip(t, 'V1', 'c1').fadeIn = 1; clip(t, 'V1', 'c2').dissolve = 1; track(t, 'A2').muted = true; });
ok('too much to list: fades, dissolves, mutes and the film said by area', words(base, lots2) === '4 changes since the master, in fades, dissolves, mutes and the picture size or frame rate', words(base, lots2));
ok('no change, no words', changeWords([], 'the master') === '');

// sameCut and cutChanges agree on random edits (the words never miss a difference)
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const edits: ((t: Timeline) => void)[] = reads.map(([, f]) => f).concat(ignored.map(([, f]) => f));
let agree = true;
for (let k = 0; k < 400; k++) {
  const b = v((t) => { for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) { try { edits[Math.floor(rnd() * edits.length)](t); } catch { /* a clip already gone */ } } });
  if (sameCut(base, b) !== (cutChanges(base, b).length === 0)) { agree = false; break; }
}
ok('sameCut and the changes agree on 400 random edits', agree);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
