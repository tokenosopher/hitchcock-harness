// npm run marks:test
// The takes marked for Seedance (src/components/edit/marks.ts): the file's shape and its check, the rule that drops a
// mark once the take has its own full-size file, the shots taken from the cut, and the words Alma is given.
import { cleanMarks, liveMarks, markOf, marksLabel, marksRel, marksText, MARKS_NOTE, refreshMarks, type CutTake } from '../src/components/edit/marks';
import { buildContextBlock } from '../src/server/context';
import { smpte } from '../src/components/lib/format';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const film = 'the-lighthouse';
const A = `assets/films/${film}/generations/S2/takes/short-C-take1/short-C-take1-480p.mp4`;
const B = `assets/films/${film}/generations/S3/takes/take2/take2-480p.mp4`;
const fps = 24, tc = (s: number) => smpte(s, fps);
const takeA: CutTake = { src: A, name: 'Short C · take 1', shots: [{ from: 294, len: 113, at: '0:12', scene: 'S2', n: 1 }, { from: 481, len: 48, at: '0:20', scene: 'S2', n: 3 }] };

// a mark from the cut
const m = markOf(takeA, 'v231', fps, tc, '2026-11-13T10:02:00Z');
ok('mark: take, scene, cut', m.take === 'Short C · take 1' && m.scene === 'S2' && m.cut === 'v231' && m.src === A, m);
ok('mark: shots with timecodes and seconds', JSON.stringify(m.shots) === JSON.stringify([{ name: 'S2 shot 1', at: '00:00:12:06', seconds: 4.7 }, { name: 'S2 shot 3', at: '00:00:20:01', seconds: 2 }]), m.shots);

// the file's check
const file = { note: MARKS_NOTE, seedance: [m, { src: B, take: 'take 2', markedAt: 'x', cut: 'v230', shots: [] }] };
ok('check: the file as written', cleanMarks(file, film)?.length === 2);
ok('check: a bare list', cleanMarks(file.seedance, film)?.length === 2);
ok('check: one mark a take', cleanMarks([m, m], film)?.length === 1);
ok('check: another film\'s take is refused', cleanMarks([{ ...m, src: 'assets/films/other/x-480p.mp4' }], film) === undefined);
ok('check: a path out of the film is refused', cleanMarks([{ ...m, src: `assets/films/${film}/../other/x.mp4` }], film) === undefined);
ok('check: a shot without seconds is refused', cleanMarks([{ ...m, shots: [{ name: 'S2 shot 1', at: '00:00:12:06' }] }], film) === undefined);
ok('check: not a list is refused', cleanMarks({ seedance: 'A' }, film) === undefined && cleanMarks('x', film) === undefined);
ok('check: an empty list is fine', cleanMarks({ note: MARKS_NOTE, seedance: [] }, film)?.length === 0);
ok('note: a mark is not a go', /A mark is not a go/.test(MARKS_NOTE));

// dropped once the take has its own file
const both = cleanMarks(file, film)!;
ok('drop: no full-size info keeps all', liveMarks(both, undefined).length === 2);
ok('drop: a take with its own 1080p file goes', JSON.stringify(liveMarks(both, { takes: { [B]: B.replace('-480p', '-1080p') } }).map((x) => x.src)) === JSON.stringify([A]));

// the shots follow the cut on screen
const later: CutTake = { ...takeA, shots: [takeA.shots[0]] };
const fresh = refreshMarks(both, [later], 'v232', fps, tc);
ok('refresh: the take in the cut takes its shots and version, keeps its time', fresh[0].cut === 'v232' && fresh[0].shots.length === 1 && fresh[0].markedAt === m.markedAt, fresh[0]);
ok('refresh: a take not in the cut stays as saved', fresh[1] === both[1]);
ok('refresh: without a cut nothing changes', refreshMarks(both, undefined, undefined, fps, tc) === both);

// the words Alma is given
const text = marksText([m, both[1]], film);
ok('text: the note, then where the file is', text.startsWith(`${MARKS_NOTE} Kept in ${marksRel(film)}.\n`), text);
ok('text: each take, its file, its shots', text.includes(`- Short C · take 1 (${A}), cut v231: S2 shot 1 at 00:00:12:06 (4.7 s), S2 shot 3 at 00:00:20:01 (2.0 s)`), text);
ok('text: a take with no shot in the cut says so', text.includes('take 2') && text.includes('no shot in the cut now'));
ok('label', marksLabel(1) === 'Marked for Seedance · 1 take' && marksLabel(2) === 'Marked for Seedance · 2 takes');
const block = buildContextBlock({ film, page: `/films/${film}/edit`, pinned: 'x', selected: [{ id: 'keep:seedance-marks', label: marksLabel(2), ref: text }] });
ok('context: the list follows the chip on lines of its own', block.includes(`- ${marksLabel(2)}:\n${MARKS_NOTE}`) && block.includes(`\n- Short C · take 1 (${A})`), block);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
