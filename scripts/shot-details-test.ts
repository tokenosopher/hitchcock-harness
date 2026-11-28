// npm run shot-details:test
// The Shot details page's pure rules: the prompt cut into its parts (a real prompt's headings, a sample's
// one-line shots, "SHOT 4a"), the names of inputs in it (tags, numbers, a run "IMAGE REFERENCES 12 TO 18", panels by the
// page they are on), the counts the Scene page's panel shows (a page named only in a run counts as named), how a line
// reads, the part of the previz a shot was drawn from, the page's address, and the previz and panels files as read.
// Strings only: no film is read or written.
import { lineKind, mentionCtx, mentionsIn, namedBySection, namedCounts, noteWords, panelsPerPage, previzWindow, promptSections, runsOf, sentence, shotSections, voicedVideos, type RefLite } from '../src/components/lib/shotDetails';
import { filmRel, shotDetailsHref, takeFromParam, takeParam } from '../src/components/lib/shotHref';
import { boardPathOk, parsePanels, parsePrevizTake, previzPathOk } from '../src/server/films/read/previzTake';

let bad = 0;
const check = (ok: boolean, what: string): void => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${what}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// a prompt in the shape of a pick-up's prompt (shortened): three pages of three panels, seven inputs
const REFS: RefLite[] = [
  { order: 1, kind: 'VIDEO', n: 1, label: 'VIDEO REFERENCE 1', tag: 'MAREN' },
  { order: 2, kind: 'IMAGE', n: 1, label: 'IMAGE REFERENCE 1', tag: 'LANTERN' },
  { order: 3, kind: 'IMAGE', n: 2, label: 'IMAGE REFERENCE 2', tag: 'ROCK SOUTH LOW' },
  { order: 4, kind: 'IMAGE', n: 3, label: 'IMAGE REFERENCE 3', tag: 'PAGE 1', page: 1 },
  { order: 5, kind: 'IMAGE', n: 4, label: 'IMAGE REFERENCE 4', tag: 'PAGE 2', page: 2 },
  { order: 6, kind: 'IMAGE', n: 5, label: 'IMAGE REFERENCE 5', tag: 'PAGE 3', page: 3 },
  { order: 7, kind: 'IMAGE', n: 6, label: 'IMAGE REFERENCE 6', tag: 'UNUSED' },
];
const REAL = `SCENE CONTEXT
Photoreal live-action cinema, 9:16.

ACTIVE REFERENCES
[MAREN] video character sheet, VIDEO REFERENCE 1: Maren. VOICE: the voice heard in this reference.
[LANTERN] IMAGE REFERENCE 1: her lantern.
[ROCK SOUTH LOW] IMAGE REFERENCE 2: Shots 2 and 3.
[BOTTLE]: the bottle, in words only.
Storyboard pages 1 to 3, IMAGE REFERENCES 3 TO 5: 9 numbered panels, three a page, in order.

COMPASS (fixed backdrop)
N: the lighthouse door.

SHOT 1: SHE TRIES AGAIN (CAM FACING: E) (PANELS 1 AND 2)
Size: medium, as framed there.
In shot:
[MAREN]: stooped over the [BOTTLE].
MAREN: "Tobias."
HARD CUT.

SHOT 2: THE LIFT (CAM FACING: S) (PANELS 3 TO 5)
Placement: [ROCK SOUTH LOW] behind.
[MAREN]: lifts the [LANTERN].

SHOT 4a: SALT? (CAM FACING: SE) (PANEL 9)
BOTTLE (CUT): rolls away.

AUDIO
Surf.

STORYBOARD
Follow panels 1 to 9 in order.`;

const secs = promptSections(REAL);
check(eq(secs.map((s) => s.kind), ['scene', 'scene', 'scene', 'shot', 'shot', 'shot', 'after', 'after']), 'a real prompt: the scene\'s parts, one a shot, the parts after the shots');
check(eq(shotSections(secs).map((s) => s.shot), ['1', '2', '4a']), 'shot parts keep their own ids, a letter included ("4a")');
check(secs[3].title === 'SHE TRIES AGAIN' && eq(secs[3].notes, ['CAM FACING: E', 'PANELS 1 AND 2']), 'a shot heading: its name and its notes in brackets');
check(secs[2].title === 'COMPASS' && eq(secs[2].notes, ['fixed backdrop']), 'a heading with a note');
check(secs[3].lines.includes('MAREN: "Tobias."') && !secs.some((s) => s.head.startsWith('MAREN')), 'a spoken line in capitals is not a heading');
check(shotSections(secs)[2].title === 'SALT?', 'a heading may end in a question mark');

const SAMPLE = 'SCENE CONTEXT\nA shore.\n\nSHOT 1 (0.0 to 3.4 s), wide, IMAGE REFERENCE 4 framing. The boat waits. HARD CUT.\nSHOT 2 (3.4 to 7.6 s), medium on TOBIAS.\n\nAUDIO\nSurf.';
const ss = promptSections(SAMPLE);
check(eq(ss.map((s) => `${s.kind}:${s.shot ?? ''}`), ['scene:', 'shot:1', 'shot:2', 'after:']), 'a sample prompt: one line a shot, each its own part');
check(eq(ss[1].notes, ['0.0 to 3.4 s']) && ss[1].lines[0].startsWith('Wide, IMAGE REFERENCE 4 framing'), 'a one-line shot: its times as a note, the rest as its first line');

const ctx = mentionCtx(REAL, REFS);
check(ctx.perPage === 3, 'panels a page: the prompt says "three a page"');
check(panelsPerPage('PANELS 1 TO 8, PANEL 12', REFS) === 4, 'panels a page, unsaid: the most named over the pages sent');
const ms = mentionsIn('Storyboard pages 1 to 3, IMAGE REFERENCES 3 TO 5: in order.', ctx);
check(ms.length === 1 && ms[0].kind === 'range' && eq(ms[0].orders, [4, 5, 6]), 'a run "IMAGE REFERENCES 3 TO 5" names each input in it');
const pm = mentionsIn('PANELS 3 TO 5 and panel 9', ctx);
check(pm.length === 2 && eq(pm[0].panels, [3, 4, 5]) && eq(pm[0].orders, [4, 5]) && eq(pm[1].orders, [6]), 'panels name the pages they are on');
const tm = mentionsIn('[MAREN] and [BOTTLE] and VIDEO REFERENCE 1', ctx);
check(eq(tm.map((m) => m.kind), ['ref', 'word', 'ref']), 'a tag names its input; a tag of no input is words only; a number names its input');

const counts = namedCounts(REAL, REFS);
check((counts.get(6) ?? 0) > 0, 'a storyboard page named only in a run and by panels counts as named (the Scene panel said "not named")');
check(counts.get(7) === 0, 'an input the prompt never names counts nothing');
const { bySec, byRef } = namedBySection(secs, ctx);
check(eq([...bySec.get(secs[3].id)!].sort(), [1, 4]), 'shot 1 names Maren and page 1 (panels 1 and 2)');
check(eq([...bySec.get(secs[4].id)!].sort(), [1, 2, 3, 4, 5]), 'shot 2 names Maren, the lantern, the view, and pages 1 and 2 (panels 3 to 5)');
check(eq(byRef.get(1), [1, 2]) && eq(byRef.get(6), [3]), 'each input knows the shot parts that name it, by their place');

check(eq(lineKind('Size: medium.'), { kind: 'kv', key: 'Size', text: 'medium.' }), 'a camera note reads as one');
check(lineKind('TOBIAS: "Rope!"').kind === 'say' && lineKind('In shot:').kind === 'sub' && lineKind('HARD CUT.').kind === 'cut', 'a spoken line, a sub-heading, the cut');
check(eq(lineKind('BOTTLE (CUT): rolls away.'), { kind: 'lab', label: 'BOTTLE', how: 'CUT', text: 'rolls away.' }), 'a label in capitals with a note');
check(noteWords('CAM FACING: SE').text === 'Camera faces south-east' && !!noteWords('PANELS 1 AND 2').panels, 'a heading note in plain words');
check(sentence('THE LIFT FOR MAREN', new Set(['MAREN'])) === 'The lift for Maren', 'sentence case keeps a name\'s capital');
check(eq(runsOf([1, 3, 4, 6, 8, 9, 10]), [[1, 1], [3, 4], [6, 6], [8, 10]]), 'shots in runs');
check(voicedVideos(REAL, REFS) === 1, 'a video whose line says VOICE carries a voice');

const PV = { seconds: 28, shots: [{ id: '1', t0: 0, t1: 2.5 }, { id: '2', t0: 2.5, t1: 5 }, { id: '6', t0: 16.4, t1: 19.2 }] };
check(eq(previzWindow(PV, 3, 2), { t0: 2.5, t1: 5, known: true }), 'a shot\'s part of the previz by count when the counts match');
check(eq(previzWindow(PV, 1, 1, '6'), { t0: 16.4, t1: 19.2, known: true }), 'a pick-up of one shot finds its part by its own number');
check(eq(previzWindow(PV, 1, 1, '9'), { t0: 0, t1: 28, known: false }), 'not known: the whole previz, said so');
check(eq(previzWindow(PV, 3), { t0: 0, t1: 28, known: true }), 'the whole take: the whole previz');

const src = 'assets/films/the-lighthouse/generations/FIX-S5/takes/take1/FIX-S5-take1-480p.mp4';
check(filmRel(src) === 'generations/FIX-S5/takes/take1/FIX-S5-take1-480p.mp4', 'a TakeShots.src made relative to the film');
check(takeParam(src) === 'generations~FIX-S5~takes~take1~FIX-S5-take1-480p.mp4', 'the address keeps the take readable, "/" as "~"');
check(shotDetailsHref('the-lighthouse', src, 7) === '/films/the-lighthouse/shots/generations~FIX-S5~takes~take1~FIX-S5-take1-480p.mp4?shot=7', 'shotDetailsHref at a shot');
check(!shotDetailsHref('f', 'generations/S1/a.mp4').includes('?'), 'shotDetailsHref on the whole take');
check(takeFromParam(takeParam('generations/S1/takes/take 1/S1 a.mp4')) === 'generations/S1/takes/take 1/S1 a.mp4', 'a path with spaces comes back whole');
check(takeFromParam('..~x') === undefined && takeFromParam('') === undefined, 'a path out of the film is refused');

check(previzPathOk('previz/FIX-S5/FIX-S5-previz-take-3.json') && !previzPathOk('previz/../x-previz-take-1.json') && !previzPathOk('generations/x.json'), 'only previz takes under previz/');
check(boardPathOk('previz/FIX-S5/storyboard/v4') && !boardPathOk('previz/FIX-S5/storyboard/../../x'), 'only storyboard folders under previz/');
const pt = parsePrevizTake({ duration: 28, take: 3, shots: [{ id: '1', t0: 0, t1: 2.5 }, { id: '2', t0: 3, t1: 2 }] }, 'previz/X/X-previz-take-3.json');
check(!!pt && pt.seconds === 28 && pt.take === 3 && pt.shots.length === 1, 'a previz take read: its length, its shots with times (a broken one left out)');
check(parsePrevizTake({ shots: [] }, 'x') === undefined, 'a previz record with no length is not one');
check(eq(parsePanels([{ n: 2, shot: '1', file: 'panels/02.png' }, { n: 1, shot: 1, file: 'panels/01.png' }, { n: 3, file: '../x.png' }], 'previz/X/storyboard/v4'),
  [{ n: 1, file: 'previz/X/storyboard/v4/panels/01.png', shot: '1' }, { n: 2, file: 'previz/X/storyboard/v4/panels/02.png', shot: '1' }]), 'panels read in order, made relative to the film, a path out refused');

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
