// harness/step-intros.json: whether Alma's word at the top of each step shows, kept on the server so the phone
// and the desktop agree (the same way harness/alma-model.json keeps each film's model). Default: all on.
// { "off": true } hides every intro but those in "shown" (brought back one by one); with "off" false, "hidden" lists
// the steps whose intro was hidden one by one.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IntroPrefs } from '@/components/intro/prefs';
import { harnessConfig } from './config';

export type { IntroPrefs };

const file = () => path.join(harnessConfig().harnessDir, 'step-intros.json');
const KEY = /^[a-z]{1,24}$/;
let writeChain: Promise<unknown> = Promise.resolve();

export async function getIntroPrefs(): Promise<IntroPrefs> {
  try {
    const p = JSON.parse(await readFile(file(), 'utf8')) as Partial<IntroPrefs>;
    const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && KEY.test(k)) : []);
    return { off: p.off === true, hidden: keys(p.hidden), shown: keys(p.shown) };
  } catch {
    return { off: false, hidden: [], shown: [] };
  }
}

/** One change: `off` sets the switch for all (either way, the one-by-one choices are cleared); `hide` or `show`
 *  one step, under the switch as it is. Answers the prefs as they now are. */
export function changeIntroPrefs(c: { off?: boolean; hide?: string; show?: string }): Promise<IntroPrefs> {
  const next = writeChain.then(async () => {
    const p = await getIntroPrefs();
    if (typeof c.off === 'boolean') { p.off = c.off; p.hidden = []; p.shown = []; }
    const add = (a: string[], k: string) => (a.includes(k) ? a : [...a, k]);
    if (c.hide && KEY.test(c.hide)) { if (p.off) p.shown = p.shown.filter((k) => k !== c.hide); else p.hidden = add(p.hidden, c.hide); }
    if (c.show && KEY.test(c.show)) { if (p.off) p.shown = add(p.shown, c.show); else p.hidden = p.hidden.filter((k) => k !== c.show); }
    await mkdir(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(p, null, 2) + '\n');
    await rename(tmp, file());
    return p;
  });
  writeChain = next.catch(() => undefined);
  return next;
}
