// npx tsx scripts/zoom-math-test.ts
// The full-screen view's zoom (src/components/media/zoomMath.ts): pinch and double-tap about the
// fingers, 1x to 5x, the picture kept against the edges, the wheel and keys, and when a larger file is loaded.
import { clampView, FIT, isFit, keyScale, MAX_ZOOM, needsSharper, pan, pinch, sharperSrc, toggleAt, wheelScale, zoomAt, type ZoomView } from '../src/components/media/zoomMath';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
// a portrait face 300x600 at fit, centred in a 380x700 box
const f = { w: 300, h: 600, left: -190, right: 190, top: -350, bottom: 350 };
// where a point of the picture (measured from its centre at fit) is drawn
const drawn = (v: ZoomView, qx: number, qy: number) => ({ x: v.x + v.s * qx, y: v.y + v.s * qy });

const t = toggleAt(FIT, 60, -120, f);
ok('a double-tap zooms to 2.5x', near(t.s, 2.5), t);
const p = drawn(t, 60, -120);
ok('the tapped point stays under the finger', near(p.x, 60) && near(p.y, -120), p);
ok('a second double-tap goes back to fit', isFit(toggleAt(t, 0, 0, f)) && toggleAt(t, 0, 0, f).x === 0);

const corner = toggleAt(FIT, 150, 300, f);
ok('no empty band beside a zoomed picture', corner.x - 2.5 * 150 <= -190 + 1e-6 && corner.x + 2.5 * 150 >= 190 - 1e-6 && corner.y - 2.5 * 300 <= -350 + 1e-6 && corner.y + 2.5 * 300 >= 350 - 1e-6, corner);

const z = pinch(FIT, { x: 40, y: 80 }, { x: 40, y: 80 }, 3, f);
const zp = drawn(z, 40, 80);
ok('a pinch zooms about the fingers', near(z.s, 3) && near(zp.x, 40) && near(zp.y, 80), z);
ok('a pinch stops at 5x', pinch(FIT, { x: 0, y: 0 }, { x: 0, y: 0 }, 20, f).s === MAX_ZOOM);
ok('a pinch in below fit is fit', isFit(pinch(t, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.2, f)));
const moved = pinch(FIT, { x: 0, y: 0 }, { x: 30, y: 0 }, 2, f);
ok('a pinch follows its midpoint', near(moved.x, 30), moved);

const d = pan(t, -40, 25, f);
ok('a drag moves the zoomed picture with the finger', near(d.x, t.x - 40) && near(d.y, t.y + 25), d);
const far = pan(t, 5000, -5000, f);
ok('a drag stops at the picture edge', near(far.x, -190 + 2.5 * 150) && near(far.y, 350 - 2.5 * 300), far);
ok('at fit a drag does not move it', pan(FIT, 50, 50, f).x === 0);
ok('fit is kept as it is', clampView(FIT, f).s === 1 && clampView(FIT, f).x === 0);
const narrow = clampView({ s: 1.2, x: 80, y: 0 }, f);
ok('zoomed but narrower than the box: it stays inside', near(narrow.x, 190 - 1.2 * 150), narrow);
const w = zoomAt(FIT, 2, 50, 0, f);
ok('a wheel zoom at the pointer keeps that point', near(drawn(w, 50, 0).x, 50), w);

ok('the wheel up zooms in, down out', wheelScale(1, -100, false) > 1.2 && wheelScale(2, 100, false) < 2);
ok('a trackpad pinch zooms faster per pixel', wheelScale(1, -10, true) > wheelScale(1, -10, false));
ok('+, - and 0', keyScale(2, '+')! > 2 && keyScale(2, '-')! < 2 && keyScale(3, '0') === 1 && keyScale(2, 'a') === undefined);

ok('a small file drawn large asks for more pixels', needsSharper(3, 300, 3, 960) && !needsSharper(1, 300, 3, 960) && !needsSharper(3, 300, 3, 0));
ok('a thumbnail becomes the original', sharperSrc('/api/media?p=assets%2Ffilms%2Fx%2Fa.png&w=640') === '/api/media?p=assets%2Ffilms%2Fx%2Fa.png');
ok('a PDF page becomes the largest thumbnail', sharperSrc('/api/media?p=a.pdf&w=320') === '/api/media?p=a.pdf&w=960' && sharperSrc('/api/media?p=a.pdf&w=960') === undefined);
ok('the original, or another address, has nothing larger', sharperSrc('/api/media?p=a.png') === undefined && sharperSrc('blob:xyz') === undefined && sharperSrc('/api/library/thumb?id=1&w=320') === undefined);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
