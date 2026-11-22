// npx tsx scripts/viewer-width-test.ts
// The Edit page's viewer column made wider or narrower by its edge (src/components/edit/viewerWidth.ts, the user,
// 21 Nov 2026): the limits, the keys, the stored value read back, a double tap, and the CSS that keeps the same limits.
import { clampWidth, colWidthCss, COL_CHROME_X, isDoubleTap, keyWidth, maxWidth, parseWidth, picMaxWidth, PIC_FLOOR, PIC_ROOM_Y, stageWidthCss, VIEWER_W } from '../src/components/edit/viewerWidth';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const tall = 9 / 16, wide = 16 / 9;

// the limits
ok('the default is the width it always had', VIEWER_W.initial === 252);
ok('the minimum is a little under the default', VIEWER_W.min < VIEWER_W.initial && VIEWER_W.min >= 204 + COL_CHROME_X, VIEWER_W.min);
ok('a 9:16 picture at 900 px tall is as tall as the column leaves room for', near(picMaxWidth(900, tall), (900 - PIC_ROOM_Y) * tall), picMaxWidth(900, tall));
ok('a short window never holds the picture under 240 px', picMaxWidth(300, tall) === PIC_FLOOR);
ok('a bad aspect is read as 9:16', near(picMaxWidth(900, NaN), picMaxWidth(900, tall)) && near(picMaxWidth(900, 0), picMaxWidth(900, tall)));
// 1440 x 900 with both side columns open: the row is 808 px
ok('1440 with both columns: the timeline keeps its minimum', maxWidth(808, 900, tall) === 808 - VIEWER_W.rightMin, maxWidth(808, 900, tall));
// the films list folded: the row is 1004 px, the picture's height stops it first
const folded = maxWidth(1004, 900, tall);
ok('a 9:16 film stops where its picture cannot grow', near(folded, (900 - PIC_ROOM_Y) * tall + COL_CHROME_X), folded);
ok('a 16:9 film stops at the timeline column\'s minimum', maxWidth(1004, 900, wide) === 1004 - VIEWER_W.rightMin);
ok('a row too narrow for both still allows the default', maxWidth(600, 900, tall) === VIEWER_W.initial);
ok('a short window still lets the picture be 240 px wide', maxWidth(1400, 380, tall) === PIC_FLOOR + COL_CHROME_X, maxWidth(1400, 380, tall));

ok('clamped to the minimum', clampWidth(100, 500) === VIEWER_W.min);
ok('clamped to the maximum', clampWidth(900, 500) === 500);
ok('a width inside is kept, in whole pixels', clampWidth(333.4, 500) === 333);
ok('a maximum under the minimum gives the minimum', clampWidth(300, 200) === VIEWER_W.min);
ok('not a number: the default', clampWidth(NaN, 500) === VIEWER_W.initial);

// the stored value
ok('nothing stored', parseWidth(null) === undefined && parseWidth(undefined) === undefined && parseWidth('') === undefined && parseWidth('  ') === undefined);
ok('a stored width', parseWidth('400') === 400 && parseWidth('400.6') === 401);
ok('garbage is ignored', parseWidth('wide') === undefined && parseWidth('NaN') === undefined && parseWidth('Infinity') === undefined && parseWidth('{}') === undefined);
ok('an absurd number is ignored', parseWidth('3') === undefined && parseWidth('-400') === undefined && parseWidth('99999') === undefined);

// the keys
ok('Right is wider by 16', keyWidth('ArrowRight', false, 300, 500) === 316);
ok('Left is narrower by 16', keyWidth('ArrowLeft', false, 300, 500) === 284);
ok('Shift moves 48', keyWidth('ArrowRight', true, 300, 500) === 348 && keyWidth('ArrowLeft', true, 300, 500) === 252);
ok('a key stops at either end', keyWidth('ArrowRight', true, 490, 500) === 500 && keyWidth('ArrowLeft', true, 250, 500) === VIEWER_W.min);
ok('Home and End go to either end', keyWidth('Home', false, 300, 500) === VIEWER_W.min && keyWidth('End', false, 300, 500) === 500);
ok('other keys do nothing here', keyWidth('ArrowUp', false, 300, 500) === undefined && keyWidth('a', false, 300, 500) === undefined && keyWidth(' ', false, 300, 500) === undefined);

// a double click or tap
ok('a first tap is not a double', !isDoubleTap(undefined, 1000, 10));
ok('two taps close together', isDoubleTap({ t: 1000, x: 10 }, 1250, 13));
ok('two taps too far apart in time', !isDoubleTap({ t: 1000, x: 10 }, 1500, 10));
ok('two taps too far apart across', !isDoubleTap({ t: 1000, x: 10 }, 1100, 40));

// the CSS keeps the same limits
const css = colWidthCss(1080, 1920);
ok('the column reads the chosen width, the default when none', css.includes('var(--viewer-w, 252px)'), css);
ok('the column keeps its minimum and the timeline its', css.startsWith(`clamp(${VIEWER_W.min}px,`) && css.includes(`100% - ${VIEWER_W.rightMin}px`), css);
ok('the column stops where the picture does', css.includes(`(100dvh - ${PIC_ROOM_Y}px) * 1080 / 1920`) && css.includes(`+ ${COL_CHROME_X}px`), css);
ok('the picture fills its column up to its widest', stageWidthCss(1080, 1920) === `min(100%, max(${PIC_FLOOR}px, (100dvh - ${PIC_ROOM_Y}px) * 1080 / 1920))`, stageWidthCss(1080, 1920));
ok('a timeline with no size gives 9:16', stageWidthCss(0, 0).includes('* 9 / 16'), stageWidthCss(0, 0));
const parens = (s: string) => [...s].reduce((d, c) => (d < 0 ? d : d + (c === '(' ? 1 : c === ')' ? -1 : 0)), 0);
ok('the CSS is balanced', parens(css) === 0 && parens(stageWidthCss(1920, 1080)) === 0);

console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
