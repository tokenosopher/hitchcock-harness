// npx tsx scripts/hearit-test.ts
// A sound pick heard on the card and in the film (src/components/feed/hearIt.ts, the feed's pairing in
// src/server/films/read/feed.ts, the clip's command in src/server/edit/hear.ts). The cards keep the shape the sound
// designer writes (options as words, a plain list of files) and an audio/sfx/lay-v2.json.
// One line per check, a summary line, exit 1 when any check fails. Nothing is rendered.
import type { FeedSound, TimelineTrack } from '../src/server/types';
import { clock, momentOfSound, momentsFromLay, momentsFromPlaces, momentWords, pairFiles, piecesFor, spanIn, windowOf } from '../src/components/feed/hearIt';
import { cardsOf } from '../src/server/films/read/feed';
import { optionMediaOf } from '../src/components/feed/askMedia';
import { hearArgs } from '../src/server/edit/hear';
import { SOUND_CARDS_LAY } from '../src/fixtures/soundcards';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-6;

const F = 'assets/films/f';
const try_ = (k: number) => `${F}/audio/sfx/surf-wash/surf-wash-try${k}.wav`;

// ---- the card: options as words, the files beside them by order
ok('files pair with options by order, the extra option without one', JSON.stringify(pairFiles(4, [try_(1), try_(2), try_(3)])) === JSON.stringify([try_(1), try_(2), try_(3), undefined]));
ok('files that are not all sounds pair nothing', pairFiles(2, [try_(1), `${F}/x.png`]).length === 0 && pairFiles(2, undefined).length === 0);
const [card] = cardsOf({ sections: [{ heading: 'Sound', cards: [{ type: 'card', id: 'ASK-sfx2-surf-wash', title: 'Which surf wash?', at: 'sound', ask: 'pick', options: ['try 1', 'try 2', 'try 3', 'none of these'], files: [try_(1), try_(2), try_(3)] }] }] });
ok('the card reads its plain files as its media', card.media.length === 3 && card.media.every((m) => m.kind === 'audio'), card.media);
ok('each try option has its file (it was names and paths only)', card.ask!.options.slice(0, 3).every((o, i) => optionMediaOf(card, o)?.path === try_(i + 1)), card.ask!.options);
ok('"none of these" has no file', !optionMediaOf(card, card.ask!.options[3]));
const withPlaces = cardsOf({ sections: [{ heading: 'Sound', cards: [{ type: 'card', id: 'ASK-x', title: 'Which gull?', at: 'sound', ask: 'pick', options: ['try 1', 'try 2'], files: [try_(1), try_(2)],
  places: [[{ moment: 'the gull', at: 15, in: 0.2, out: 2, gain_db: -4, fade_in: 0.2 }], [{ moment: 'the gull', at: 15, in: 0, out: 1.8, gain_db: -6 }]] }] }] })[0];
ok('a card\'s own places become one moment for both options', withPlaces.hear?.moments.length === 1 && Object.keys(withPlaces.hear.moments[0].places).join() === '1,2', withPlaces.hear);
ok('…ending where the longest one ends', near(withPlaces.hear?.moments[0].ends, 16.8), withPlaces.hear?.moments[0]);

// ---- the lay file (audio/sfx/lay-v2.json): each sound's moments, each try's placement
const ms = momentsFromLay(SOUND_CARDS_LAY, card.ask!.options.map((o) => ({ id: o.id, path: o.path })));
ok('two moments for the surf, in film order', ms.map((m) => m.id).join() === 'V07,V09', ms.map((m) => m.id));
ok('a try\'s placement is the lay\'s (at, in, out, level)', JSON.stringify(ms[0].places['1']) === JSON.stringify({ file: try_(1).replace('/f/', '/sample-sound-cards/'), at: 6, in: 0.25, out: 1.75, gainDb: -2 }), ms[0].places['1']);
ok('fades in frames become seconds (6 and 12 at 24 fps)', near(ms[0].fadeIn, 0.25) && near(ms[0].fadeOut, 0.5));
ok('try 3 is laid only at the first moment', !!ms[0].places['3'] && !ms[1].places['3']);
ok('the designer\'s recommendation is the option it names', ms[0].recommend === '2');
ok('the moment\'s words drop the sound\'s name', ms[0].label === 'into S2' && momentWords('gull-cry', 'gull-cry') === 'gull cry', ms[0].label);
ok('a lay file of other sounds gives no moment', momentsFromLay({ sounds: [{ id: 'V1', name: 'rain', variations: [{ file: `${F}/audio/sfx/rain/rain-try1.wav`, at: 1, in: 0, out: 1 }] }] }, [{ id: '1', path: try_(1) }]).length === 0);
ok('the film-relative and the repo form of a path are one file', momentsFromLay({ sounds: [{ id: 'V1', name: 'm', place: [1, 2], variations: [{ file: 'audio/sfx/surf-wash/surf-wash-try1.wav', at: 1, in: 0, out: 1 }] }] }, [{ id: '1', path: try_(1) }]).length === 1);
ok('places without "moment" group by their time', momentsFromPlaces([[{ at: 3, out: 1 }], [{ at: 3, out: 1 }]], [{ id: 'a' }, { id: 'b' }].map((o) => ({ ...o, path: try_(1) })))[0].label === 'at 0:03.0');

// ---- a card of sound picks: one moment per sound, from its plan
const s: FeedSound = { name: 'cheer-toast', scene: 'S1', fps: 24, effect: { startFrame: 194, endFrame: 252, levelDb: -12, fadeIn: 4, fadeOut: 18 }, tries: [{ n: 1, file: 'audio/sfx/cheer-toast/cheer-toast-try1.wav', seconds: 4.4 }, { n: 2, seconds: 4 }] };
const sm = momentOfSound(s)!;
ok('a planned sound is a moment at its place, each try from its start', near(sm.at, 194 / 24) && near(sm.ends, 252 / 24) && near(sm.places['1'].out, 58 / 24) && sm.places['1'].gainDb === -12, sm);
ok('a try with no file is not laid', !sm.places['2']);

// ---- the window and the pieces of the clip
const w = windowOf(ms[0], 20);
ok('the clip runs 2 s before to 2 s after', near(w.start, 4) && near(w.end, 9.5), w);
ok('…kept inside the film', near(windowOf({ at: 1, ends: 19.5 }, 20).start, 0) && near(windowOf({ at: 1, ends: 19.5 }, 20).end, 20));
const long = windowOf({ at: 4, ends: 150 }, 160);
ok('a song laid across most of the film: a minute from 2 s before its placement, marked', near(long.start, 2) && near(long.end, 62) && long.capped === true, long);
ok('a 12 s lay keeps its whole window, not marked (0:02 to 0:18)', JSON.stringify(windowOf({ at: 4, ends: 16 }, 160)) === JSON.stringify({ start: 2, end: 18 }));
ok('the sound\'s part of the strip', near(spanIn(ms[0], w).left, 2 / 5.5) && near(spanIn(ms[0], w).width, 1.5 / 5.5));
ok('clock reads minutes and tenths', clock(66) === '1:06.0' && clock(81.208) === '1:21.2' && clock(4.04) === '0:04.0');
const R = 'assets/films/sample-sound-cards';
const tracks: TimelineTrack[] = [
  { id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'v', src: `${R}/t.mp4`, in: 0, out: 20, at: 0 }] },
  { id: 'A1', kind: 'audio', name: 'Dialogue', clips: [{ id: 'a', src: `${R}/t.mp4`, in: 0, out: 20, at: 0, gain: -8 }] },
  { id: 'FX3', kind: 'audio', name: 'sea', clips: [
    { id: 'm1', src: `${R}/audio/sfx/surf-wash/surf-wash-try2.wav`, in: 0.5, out: 2, at: 6, gain: -3, fadeIn: 0.25, fadeOut: 0.5 },
    { id: 'm2', src: `${R}/audio/sfx/surf-wash/surf-wash-try2.wav`, in: 0.5, out: 2, at: 11, gain: -3 },
  ] },
  { id: 'M1', kind: 'audio', name: 'Music', muted: true, clips: [{ id: 'mu', src: `${R}/music.wav`, in: 0, out: 20, at: 0 }] },
];
const p1 = piecesFor(tracks, ms[0], '1', w);
ok('the cut\'s try at the moment comes out, try 1 goes in', p1.inCut === '2' && p1.pieces.length === 2 && p1.pieces.some((p) => p.src.endsWith('try1.wav')) && !p1.pieces.some((p) => p.src.endsWith('try2.wav')), p1);
ok('the take\'s sound is cut to the window, at the clip\'s start', p1.pieces.some((p) => p.src.endsWith('t.mp4') && near(p.in, 4) && near(p.out, 9.5) && near(p.at, 0) && p.gainDb === -8));
const t1 = p1.pieces.find((p) => p.src.endsWith('try1.wav'))!;
ok('try 1 laid at its place in the clip, its level and the moment\'s fades', near(t1.at, 2) && near(t1.in, 0.25) && near(t1.out, 1.75) && t1.gainDb === -2 && near(t1.fadeIn, 0.25) && near(t1.fadeOut, 0.5), t1);
ok('a muted track is not heard', !p1.pieces.some((p) => p.src.endsWith('music.wav')));
ok('the surf at the other moment stays out of this window', !p1.pieces.some((p) => near(p.at, 7)));
const p2 = piecesFor(tracks, ms[0], '2', w).pieces.find((p) => p.src.endsWith('try2.wav'))!;
ok('the option the cut has is laid as the cut has it', near(p2.at, 2) && near(p2.in, 0.5) && p2.gainDb === -3 && near(p2.fadeIn, 0.25));
const p0 = piecesFor(tracks, ms[0], undefined, w);
ok('"Without": the moment with none of them', p0.pieces.length === 1 && p0.inCut === '2');
const cutHead = piecesFor([{ id: 'A', kind: 'audio', name: 'a', clips: [{ id: 'x', src: `${R}/long.wav`, in: 10, out: 15, at: 2, fadeIn: 3, fadeOut: 1 }] }], ms[0], undefined, w).pieces[0];
ok('a clip cut at the window\'s start loses that much of its fade in', near(cutHead.in, 12) && near(cutHead.at, 0) && near(cutHead.fadeIn, 1) && near(cutHead.fadeOut, 1), cutHead);

// ---- the clip's command
const args = hearArgs({ pieces: p1.pieces.map((p) => ({ ...p, file: `/x/${p.src.split('/').pop()}` })), picture: { file: '/x/v3-proxy.mp4', start: w.start }, w, out: '/x/o.mp4' });
const graph = args[args.indexOf('-filter_complex') + 1];
ok('the 480p is seeked to the window and cut to its length', args.join(' ').includes('-ss 4 -t 5.7 -i /x/v3-proxy.mp4') && graph.includes('[0:v]trim=duration=5.5'), args.slice(0, 12));
ok('each sound is read from its in-point for its length', args.join(' ').includes('-ss 0.25 -t 1.5 -i /x/surf-wash-try1.wav'));
ok('its gain, fades and place', graph.includes('volume=-2dB') && graph.includes('afade=t=in:st=0:d=0.25') && graph.includes('adelay=2000:all=1'));
ok('summed with no normalising over a silent bed', graph.includes('amix=inputs=3:normalize=0'));
ok('an MP4 an iPhone plays inline: H.264, AAC, the moov first', args.includes('libx264') && args.includes('aac') && args.includes('+faststart') && args.includes('yuv420p'));
const black = hearArgs({ pieces: [], w, out: '/x/o.mp4' });
ok('without a 480p: black picture, the silent bed alone', black.join(' ').includes('color=c=black') && black[black.indexOf('-filter_complex') + 1].includes('amix=inputs=1'));

console.log(`${n - bad} of ${n} checks pass`);
if (bad) process.exit(1);
