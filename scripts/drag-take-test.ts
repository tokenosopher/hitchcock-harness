// npx tsx scripts/drag-take-test.ts
// A shot of a take, or a whole take, dragged from the Takes view onto the timeline
// (src/components/edit/dragTake.ts): the clips it becomes (labels, takeRef, in and out inside the take's file, places),
// its sound with it, where it is refused, and that nothing else in the cut moves. Pure, on a tiny made-up cut.
// One line per check; exits non-zero on the first failure.
import type { Timeline } from '../src/server/types';
import { placeTake, takePieces } from '../src/components/edit/dragTake';
import { labelShot, shotNo, type TakeShots } from '../src/components/edit/shots';

let checks = 0;
function check(what: string, ok: boolean, got: unknown): void {
  checks++;
  console.log(`${ok ? 'ok' : 'FAIL'} · ${what} · ${typeof got === 'string' ? got : JSON.stringify(got)}`);
  if (!ok) { process.exitCode = 1; throw new Error(`failed: ${what}`); }
}

const fps = 24;
const take: TakeShots = { src: 'assets/films/f/S6/take1.mp4', scene: 'S6', name: 'take 1', seconds: 6, cuts: [2, 3.5], state: 'ready' };
const tagged: TakeShots = { src: 'assets/films/f/S7/take2.mp4', scene: 'S7', name: 'take 2', seconds: 4, cuts: [1.5], ids: [7, 7], tags: ['7a', '7b'], state: 'ready' };
const uncut: TakeShots = { src: 'assets/films/f/S8/take1.mp4', scene: 'S8', name: 'take 1', seconds: 5.5, state: 'waiting' };
const by = new Map([[take.src, take], [tagged.src, tagged]]);
const tl: Timeline = {
  version: 'v1', fps, width: 1080, height: 1920,
  tracks: [
    { id: 'V2', kind: 'video', name: 'Inserts', clips: [] },
    { id: 'V1', kind: 'video', name: 'Main', clips: [{ id: 'a', src: 'assets/films/f/S1/take1.mp4', in: 0, out: 4, at: 0, label: 'S1 · take 1 · shot 1' }] },
    { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'aa', src: 'assets/films/f/S1/take1.mp4', in: 0, out: 4, at: 0 }] },
    { id: 'A2', kind: 'audio', name: 'Effects', clips: [] },
  ],
  markers: [],
} as unknown as Timeline;
const snap = JSON.stringify(tl);

// the pieces
const one = takePieces({ t: take, n: 2 }, 'FIX S6b · take 1', fps);
check('a shot is one clip of its in and out', !('error' in one) && one.clips.length === 1 && one.clips[0].in === 2 && one.clips[0].out === 3.5 && one.frames === 36, one);
check('labelled as putShot labels it', !('error' in one) && one.clips[0].label === 'S6 · FIX S6b · take 1 · shot 2' && one.clips[0].takeRef?.take === 'FIX S6b · take 1' && one.clips[0].takeRef?.scene === 'S6', !('error' in one) ? one.clips[0].label : one);
const whole = takePieces({ t: take }, 'take 1', fps);
check('a whole take is one clip a shot, back to back', !('error' in whole) && whole.clips.map((c) => `${c.in}-${c.out}@${c.f}`).join(',') === '0-2@0,2-3.5@48,3.5-6@84' && whole.frames === 144, !('error' in whole) ? whole.clips.map((c) => `${c.in}-${c.out}@${c.f}`) : whole);
const b7 = takePieces({ t: tagged, n: 7, tag: '7b' }, 'take 2', fps);
check('a shot with a letter is named by it', !('error' in b7) && b7.clips[0].label === 'S7 · take 2 · shot 7b' && b7.clips[0].in === 1.5, !('error' in b7) ? b7.clips[0].label : b7);
const raw = takePieces({ t: uncut }, 'take 1', fps);
check('a take with no cuts read yet is one clip of its whole file', !('error' in raw) && raw.clips.length === 1 && raw.clips[0].in === 0 && raw.clips[0].out === 5.5 && raw.clips[0].label === 'S8 · take 1' && raw.frames === 132, raw);
check('a take of no known length is refused', 'error' in takePieces({ t: { ...uncut, seconds: undefined } }, 'take 1', fps), 'refused');

// placed on V1 after the film
const r = placeTake(tl, { t: take, n: 2 }, 'FIX S6b · take 1', 'V1', 120);
const e = r.edit!;
const v1 = e.tl.tracks.find((t) => t.id === 'V1')!, a1 = e.tl.tracks.find((t) => t.id === 'A1')!;
const c = v1.clips.find((k) => k.id === e.ref.clipId)!;
check('placed at the line on V1', !!c && Math.round(c.at * fps) === 120 && c.in === 2 && c.out === 3.5, c);
check('its sound is the same clip on A1 (the dialogue)', a1.clips.some((k) => k.id === `${c.id}a` && k.at === c.at && k.in === c.in && k.out === c.out && k.src === c.src), a1.clips.map((k) => k.id));
check('the shot menus read it as the shot', labelShot(c) === '2' && shotNo(c, by) === 2, `${labelShot(c)} / ${shotNo(c, by)}`);
check('the note says what and where', e.note === 'S6 · FIX S6b · take 1 · shot 2 placed at 00:00:05:00 on V1, its sound on A1', e.note);
check('nothing else changed', JSON.stringify({ ...e.tl, tracks: e.tl.tracks.map((t) => ({ ...t, clips: t.clips.filter((k) => !k.id.startsWith('d')) })) }) === snap, 'same');
check('the cut given is left as it was', JSON.stringify(tl) === snap, 'same');

// the whole take
const w = placeTake(tl, { t: take }, 'take 1', 'V1', 96).edit!;
const wv = w.tl.tracks.find((t) => t.id === 'V1')!.clips.filter((k) => k.id.startsWith('d'));
check('a whole take lands one clip a shot, back to back', wv.length === 3 && wv.map((k) => Math.round(k.at * fps)).join(',') === '96,144,180' && wv.map((k) => labelShot(k)).join(',') === '1,2,3', wv.map((k) => [k.at, k.label]));
check('with a sound for each on A1', w.tl.tracks.find((t) => t.id === 'A1')!.clips.filter((k) => k.id.startsWith('d')).length === 3, w.note);
check('its note counts the shots', w.note === 'S6 · take 1 (3 shots) placed at 00:00:04:00 on V1, its sound on A1', w.note);

// on the inserts track: the sound goes on the effects track
const i = placeTake(tl, { t: take, n: 1 }, 'take 1', 'V2', 0).edit!;
check('on V2 its sound goes on the effects track', i.note.endsWith('on V2, its sound on A2') && i.tl.tracks.find((t) => t.id === 'A2')!.clips.length === 1, i.note);

// refused
check('over a picture already there: refused', !!placeTake(tl, { t: take, n: 1 }, 'take 1', 'V1', 50).error, placeTake(tl, { t: take, n: 1 }, 'take 1', 'V1', 50).error ?? '');
check('on a sound track: refused', !!placeTake(tl, { t: take, n: 1 }, 'take 1', 'A2', 200).error, 'refused');
const locked = { ...tl, tracks: tl.tracks.map((t) => (t.id === 'V1' ? { ...t, locked: true } : t)) } as Timeline;
check('on a locked track: refused', !!placeTake(locked, { t: take, n: 1 }, 'take 1', 'V1', 200).error, placeTake(locked, { t: take, n: 1 }, 'take 1', 'V1', 200).error ?? '');
// a sound already on the dialogue track there: beside it
const busyA = { ...tl, tracks: tl.tracks.map((t) => (t.id === 'A1' ? { ...t, clips: [...t.clips, { id: 'm', src: 'x.wav', in: 0, out: 10, at: 5 }] } : t)) } as Timeline;
const bs = placeTake(busyA, { t: take, n: 2 }, 'take 1', 'V1', 120).edit!;
check('a sound already on A1 there: its sound goes beside it', /beside Dialogue/.test(bs.note), bs.note);

console.log(`${checks} checks passed`);
