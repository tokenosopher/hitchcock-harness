// npm run keyboard:test
// The phone's keyboard and Alma's bar (src/components/shell/keyboard.ts): how far the bar rises to sit on
// the keyboard (iOS Safari shrinks only the visual viewport), and where the paragraph sent from the story's "Alma"
// button stays on screen once her box has the focus.
import { keepParaAt, keyboardLift } from '../src/components/shell/keyboard';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

ok('no keyboard: no lift', keyboardLift(844, { height: 844, offsetTop: 0 }) === 0);
ok('no visualViewport: no lift', keyboardLift(844, null) === 0 && keyboardLift(844, undefined) === 0);
ok('keyboard 340 high (its accessory row included): rises 340', keyboardLift(844, { height: 504, offsetTop: 0 }) === 340, keyboardLift(844, { height: 504, offsetTop: 0 }));
ok('iOS panned the page 120 up: rises only the rest', keyboardLift(844, { height: 504, offsetTop: 120 }) === 220);
ok('panned all the way: no lift', keyboardLift(844, { height: 504, offsetTop: 340 }) === 0);
ok('never goes down (overscroll)', keyboardLift(844, { height: 504, offsetTop: 400 }) === 0);
ok('under a pixel is none', keyboardLift(844, { height: 843.4, offsetTop: 0 }) === 0);
ok('rounded', keyboardLift(844, { height: 503.6, offsetTop: 0 }) === 340);
ok('a zero layout height is none', keyboardLift(0, { height: 504, offsetTop: 0 }) === 0);

// screen: page top 60, bar's top over the keyboard at 430
ok('the paragraph stays where it was', keepParaAt(200, 60, 60, 430) === 200);
ok('under the bar: just above it', keepParaAt(400, 60, 60, 430) === 358, keepParaAt(400, 60, 60, 430));
ok('a tall paragraph: its top kept in view, not pushed above the page', keepParaAt(400, 900, 60, 430) === 72, keepParaAt(400, 900, 60, 430));
ok('above the page top: just inside', keepParaAt(10, 60, 60, 430) === 72);
ok('no room at all: at the top', keepParaAt(300, 60, 60, 70) === 72);

console.log(`${n - bad}/${n} ok`);
if (bad) process.exit(1);
