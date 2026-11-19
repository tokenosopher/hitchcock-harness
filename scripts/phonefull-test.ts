// npm run phonefull:test
// The phone player's full screen (src/components/edit/phoneFull.ts). The module is a React hook
// that talks to the browser (full screen, screen.orientation, the window's size), so it is run here outside a browser:
// React's four hooks it uses are stood in for by a small runner (put in place of the "react" module before the hook is
// loaded), and the document, the window and the screen by plain objects that record what the hook asks of them. Checked:
// a portrait film stays upright and a landscape one asks the phone to turn and is drawn sideways while the window stands
// upright; the browser's full screen where there is one, the page's own where there is not (an iPhone) or where it is
// refused; every refusal quiet; the way out by the button, by the browser (the back gesture) and by Esc; and nothing
// left behind when the page goes. One line per check, a summary line, exit 1 when any check fails.
import Module, { createRequire } from 'node:module';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};

// ---- a stand-in for React's useState, useRef, useCallback and useEffect: one component, rendered again while its
// state changes; effects run after each render, their cleanups before they run again and when it goes
type Slot = { v?: unknown; deps?: unknown[]; cleanup?: unknown; effect?: boolean };
let slots: Slot[] = [], at = 0, dirty = false, queued: (() => void)[] = [];
const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
const fakeReact = {
  useState<T>(init: T): [T, (v: T | ((p: T) => T)) => void] {
    const s = (slots[at] ??= { v: init }); at++;
    return [s.v as T, (v) => { const nv = typeof v === 'function' ? (v as (p: T) => T)(s.v as T) : v; if (!Object.is(nv, s.v)) { s.v = nv; dirty = true; } }];
  },
  useRef<T>(init: T): { current: T } { const s = (slots[at] ??= { v: { current: init } }); at++; return s.v as { current: T }; },
  useCallback<F>(fn: F, deps: unknown[]): F {
    const s = slots[at];
    if (s && same(s.deps, deps)) { at++; return s.v as F; }
    slots[at++] = { v: fn, deps };
    return fn;
  },
  useEffect(fn: () => unknown, deps?: unknown[]): void {
    const k = at++, s = slots[k];
    if (s && deps && same(s.deps, deps)) return;
    queued.push(() => { if (typeof s?.cleanup === 'function') s.cleanup(); slots[k] = { deps, cleanup: fn(), effect: true }; });
  },
};
function mount<T>(hook: () => T) {
  slots = []; dirty = false;
  let out!: T;
  const render = () => {
    for (let guard = 0; guard === 0 || dirty; guard++) {
      if (guard > 20) throw new Error('renders without end');
      dirty = false; at = 0; queued = [];
      out = hook();
      const run = queued; queued = [];
      run.forEach((f) => f());
    }
  };
  render();
  return {
    get now() { return out; },
    /** Renders again when something changed state from outside (an event, a promise). */
    settle() { if (dirty) render(); },
    unmount() { for (const s of slots) if (s?.effect && typeof s.cleanup === 'function') s.cleanup(); slots = []; },
  };
}

// ---- the browser, as plain objects
type Fn = (e?: unknown) => void;
class Target {
  ls = new Map<string, Set<Fn>>();
  addEventListener(t: string, f: Fn) { if (!this.ls.has(t)) this.ls.set(t, new Set()); this.ls.get(t)!.add(f); }
  removeEventListener(t: string, f: Fn) { this.ls.get(t)?.delete(f); }
  fire(t: string, e?: unknown) { for (const f of [...(this.ls.get(t) ?? [])]) f(e); }
  count() { return [...this.ls.values()].reduce((a, s) => a + s.size, 0); }
}
interface Phone {
  /** The browser's own full screen: standard, the older webkit names only, or none (an iPhone). */
  fs: 'std' | 'webkit' | 'none';
  /** screen.orientation: with lock and unlock, without lock (iOS), or none. */
  orient: 'lock' | 'nolock' | 'none';
  refuseFull?: boolean;
  refuseLock?: boolean;
  /** The window upright (a phone held normally) or sideways. */
  upright: boolean;
}
async function phone(p: Phone, landscape: boolean) {
  const calls: string[] = [];
  const doc = Object.assign(new Target(), {
    body: {}, fullscreenElement: null as unknown, webkitFullscreenElement: null as unknown,
    fullscreenEnabled: p.fs === 'std', webkitFullscreenEnabled: p.fs === 'webkit',
    ...(p.fs === 'std' ? { exitFullscreen: async () => { calls.push('exit'); doc.fullscreenElement = null; doc.fire('fullscreenchange'); } } : {}),
    ...(p.fs === 'webkit' ? { webkitExitFullscreen: () => { calls.push('webkit exit'); doc.webkitFullscreenElement = null; doc.fire('webkitfullscreenchange'); } } : {}),
  });
  const win = Object.assign(new Target(), { innerWidth: p.upright ? 390 : 844, innerHeight: p.upright ? 844 : 390 });
  const orientation = p.orient === 'none' ? undefined : {
    ...(p.orient === 'lock' ? { lock: async (o: string) => { calls.push(`lock ${o}`); if (p.refuseLock) throw new Error('NotSupportedError'); } } : {}),
    unlock: () => { calls.push('unlock'); },
  };
  const box = {
    ...(p.fs === 'std' ? { requestFullscreen: async (o: unknown) => { calls.push(`request ${JSON.stringify(o)}`); if (p.refuseFull) throw new Error('refused'); doc.fullscreenElement = box; doc.fire('fullscreenchange'); } } : {}),
    ...(p.fs === 'webkit' ? { webkitRequestFullscreen: () => { calls.push('webkit request'); doc.webkitFullscreenElement = box; doc.fire('webkitfullscreenchange'); } } : {}),
  };
  Object.assign(globalThis, { document: doc, window: win, screen: { orientation } });
  const { usePhoneFull } = await load();
  const h = mount(() => usePhoneFull({ current: box as unknown as HTMLElement }, landscape));
  const turn = (upright: boolean, how = 'resize') => { win.innerWidth = upright ? 390 : 844; win.innerHeight = upright ? 844 : 390; win.fire(how); h.settle(); };
  const enter = async () => { await h.now.enter(); h.settle(); };
  const leave = () => { h.now.leave(); h.settle(); };
  const key = (k: string) => { win.fire('keydown', { key: k }); h.settle(); };
  return { h, calls, doc, win, box, turn, enter, leave, key, state: () => ({ full: h.now.full, real: h.now.real, sideways: h.now.sideways }) };
}
const is = (s: { full: boolean; real: boolean; sideways: boolean }, full: boolean, real: boolean, sideways: boolean) => s.full === full && s.real === real && s.sideways === sideways;

// the hook, loaded once with the stand-in in place of "react"
const req = createRequire(__filename);
const reactPath = req.resolve('react');
const stand = new Module(reactPath);
stand.filename = reactPath; stand.loaded = true; stand.exports = fakeReact;
req.cache[reactPath] = stand;
let mod: typeof import('../src/components/edit/phoneFull') | undefined;
const load = async () => (mod ??= req('../src/components/edit/phoneFull') as typeof import('../src/components/edit/phoneFull'));

const ANDROID: Phone = { fs: 'std', orient: 'lock', upright: true };
const IPHONE: Phone = { fs: 'none', orient: 'nolock', upright: true };

async function main(): Promise<void> {
  // a portrait film on a phone with the browser's full screen and an orientation lock (Android)
  {
    const t = await phone(ANDROID, false);
    ok('portrait (Android): before, not full screen', is(t.state(), false, false, false), t.state());
    await t.enter();
    ok('portrait (Android): the picture\'s own box asks for the browser\'s full screen, its bar hidden', t.calls[0] === 'request {"navigationUI":"hide"}', t.calls);
    ok('portrait (Android): full screen, the browser\'s own', is(t.state(), true, true, false), t.state());
    ok('portrait (Android): the phone is asked to stay upright', t.calls.includes('lock portrait') && !t.calls.includes('lock landscape'), t.calls);
    ok('portrait (Android): drawn upright, never turned', !t.state().sideways);
    t.leave();
    ok('portrait (Android): the way out leaves the browser\'s full screen and lets the phone turn again', is(t.state(), false, false, false) && t.calls.includes('exit') && t.calls.includes('unlock'), [t.state(), t.calls]);
    t.h.unmount();
  }
  // a landscape film on the same phone
  {
    const t = await phone(ANDROID, true);
    ok('landscape: not full screen, not turned, even in an upright window', is(t.state(), false, false, false), t.state());
    await t.enter();
    ok('landscape (Android): the phone is asked to turn sideways', t.calls.includes('lock landscape') && !t.calls.includes('lock portrait'), t.calls);
    ok('landscape (Android): while the window still stands upright, drawn turned a quarter', is(t.state(), true, true, true), t.state());
    t.turn(false);
    ok('landscape (Android): once the phone has turned, drawn straight', is(t.state(), true, true, false), t.state());
    t.turn(true, 'orientationchange');
    ok('landscape (Android): turned upright again, drawn turned again (the orientation change is heard too)', t.state().sideways, t.state());
    t.leave();
    ok('landscape (Android): the way out: not full screen, not turned', is(t.state(), false, false, false), t.state());
    t.turn(true);
    ok('landscape (Android): after it, the window\'s turns are no longer followed', t.win.count() === 0, t.win.count());
    t.h.unmount();
  }
  {
    const t = await phone({ ...ANDROID, upright: false }, true);
    await t.enter();
    ok('landscape, the phone already sideways: drawn straight at once', is(t.state(), true, true, false), t.state());
    t.h.unmount();
  }
  // an iPhone: no full screen for a box, no orientation lock: the page's own full screen
  {
    const t = await phone(IPHONE, true);
    await t.enter();
    ok('landscape (iPhone): the page\'s own full screen, nothing asked of the browser', is(t.state(), true, false, true) && t.calls.length === 0, [t.state(), t.calls]);
    t.key('Enter');
    ok('landscape (iPhone): another key does nothing', t.state().full);
    t.key('Escape');
    ok('landscape (iPhone): Esc leaves the page\'s own full screen', is(t.state(), false, false, false), t.state());
    t.h.unmount();
  }
  {
    const t = await phone(IPHONE, false);
    await t.enter();
    ok('portrait (iPhone): the page\'s own full screen, upright', is(t.state(), true, false, false) && t.calls.length === 0, [t.state(), t.calls]);
    t.h.unmount();
  }
  // refusals are quiet
  {
    const t = await phone({ ...ANDROID, refuseFull: true }, true);
    let threw = false;
    try { await t.enter(); } catch { threw = true; }
    ok('refused full screen: quiet, the page\'s own stays, drawn turned in an upright window', !threw && is(t.state(), true, false, true), [threw, t.state()]);
    ok('refused full screen: the phone is not asked to turn', !t.calls.some((c) => c.startsWith('lock')), t.calls);
    t.h.unmount();
  }
  {
    const t = await phone({ ...ANDROID, refuseLock: true }, true);
    let threw = false;
    try { await t.enter(); } catch { threw = true; }
    ok('refused turn: quiet, the browser\'s full screen kept', !threw && t.state().full && t.state().real && t.calls.includes('lock landscape'), [threw, t.state(), t.calls]);
    t.h.unmount();
  }
  {
    const t = await phone({ ...ANDROID, orient: 'none' }, false);
    let threw = false;
    try { await t.enter(); t.leave(); } catch { threw = true; }
    ok('no screen.orientation at all: in and out without a word', !threw && !t.state().full && t.calls.join() === 'request {"navigationUI":"hide"},exit', [threw, t.calls]);
    t.h.unmount();
  }
  // the older webkit names (an older iPad)
  {
    const t = await phone({ fs: 'webkit', orient: 'none', upright: true }, false);
    await t.enter();
    ok('webkit only: its own request is used, and the full screen is the browser\'s', t.calls[0] === 'webkit request' && is(t.state(), true, true, false), [t.calls, t.state()]);
    t.leave();
    ok('webkit only: the way out uses its own exit', t.calls.includes('webkit exit') && !t.state().full, t.calls);
    t.h.unmount();
  }
  // the browser's full screen ended by the browser (the back gesture), and Esc while in it
  {
    const t = await phone(ANDROID, true);
    await t.enter();
    t.key('Escape');
    ok('Esc in the browser\'s full screen is left to the browser (the page does not leave by itself)', t.state().full && !t.calls.includes('exit'), [t.state(), t.calls]);
    t.doc.fullscreenElement = null; t.doc.fire('fullscreenchange'); t.h.settle();
    ok('ended by the browser: the page\'s full screen ends with it and the phone may turn again', is(t.state(), false, false, false) && t.calls.includes('unlock'), [t.state(), t.calls]);
    t.h.unmount();
  }
  {
    const t = await phone(ANDROID, false);
    await t.enter();
    t.doc.fullscreenElement = {}; t.doc.fire('fullscreenchange'); t.h.settle();
    ok('another element taking the browser\'s full screen: the player\'s is no longer the browser\'s', !t.state().real, t.state());
    t.h.unmount();
  }
  // the page goes while in full screen
  {
    const t = await phone(ANDROID, true);
    await t.enter();
    const before = t.calls.filter((c) => c === 'unlock').length;
    t.h.unmount();
    ok('the page goes in the browser\'s full screen: the phone may turn again', t.calls.filter((c) => c === 'unlock').length === before + 1, t.calls);
    ok('the page goes: nothing left listening on the document or the window', t.doc.count() === 0 && t.win.count() === 0, [t.doc.count(), t.win.count()]);
  }
  {
    const t = await phone(ANDROID, true);
    t.h.unmount();
    ok('the page goes without full screen: the phone is not touched', t.calls.length === 0, t.calls);
  }

  console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
