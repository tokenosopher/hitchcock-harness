// npx tsx scripts/zoom-set-test.ts
// The full-screen view's set (src/components/media/zoomSet.ts): it steps through the tile row the picture
// was opened from, never the rest of the page; the same file once; round from the last to the first; a swipe.
import { scopeIndex, stepIndex, swipeStep, zoomList } from '../src/components/media/zoomSet';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

// a face tile: img < tile button (1) < strip (20) < card (20) < page (26 with the location's 6)
ok('a face opens its row, not the page', scopeIndex([{ count: 1 }, { count: 20 }, { count: 20, edge: true }, { count: 26 }]) === 1);
ok('a named set wins over a nearer box', scopeIndex([{ count: 1 }, { count: 2 }, { count: 20, set: true }, { count: 26 }]) === 1 && scopeIndex([{ count: 1 }, { count: 1 }, { count: 20, set: true }, { count: 26 }]) === 2);
ok('a lone picture in a card is alone: never past the card', scopeIndex([{ count: 1 }, { count: 1, edge: true }, { count: 26 }]) === -1);
ok('the card itself can be the set', scopeIndex([{ count: 1 }, { count: 3, edge: true }, { count: 26 }]) === 1);
ok('a picture outside any card finds its nearest group', scopeIndex([{ count: 1 }, { count: 4 }, { count: 30 }]) === 1);

const e = (src: string) => ({ src, alt: src });
const l1 = zoomList([e('a'), e('b'), e('c'), e('d')], 2);
ok('opened at its place, in drawn order', l1.i === 2 && l1.list.map((x) => x.src).join('') === 'abcd', l1);
const l2 = zoomList([e('a'), e('b'), e('a'), e('c')], 3);
ok('the same file twice is one stop', l2.list.map((x) => x.src).join('') === 'abc' && l2.i === 2, l2);
const l3 = zoomList([e('a'), e('b'), e('b')], 2);
ok('the opened copy of a doubled file is the one shown', l3.list.length === 2 && l3.i === 1, l3);

ok('next and before, round at the ends', stepIndex(2, 1, 20) === 3 && stepIndex(19, 1, 20) === 0 && stepIndex(0, -1, 20) === 19 && stepIndex(0, 1, 0) === 0);
ok('a swipe left is the next, right the one before', swipeStep(-80, 5) === 1 && swipeStep(80, 5) === -1);
ok('a short or mostly upward touch is no step', swipeStep(-20, 0) === 0 && swipeStep(-60, 90) === 0);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
