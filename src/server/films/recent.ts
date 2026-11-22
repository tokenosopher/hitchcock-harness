// When each film last moved up the sidebar (newest first, as ChatGPT and Claude list their chats). A film moves only when the user writes in it or something new needs them, never because Alma is working in
// the background. Kept in harness/recent.json, the harness's own folder (never the film
// folder), so the phone and the Mac see the same order: { "<slug>": { "active"?: iso, "opened"?: iso } }.
//   active  the user sent Alma a message or an answer (their text, a card's answer, Done picking: sendToAlma), or
//           something new needs them: Alma's reply landed, or a new card waits for them (the notices of
//           src/server/claude/notify.ts, kinds "turn" and "pick"). Her work, her sub-agents and the app's writes do not.
//   opened  no longer written (opening a film no longer moves it); a time from before still counts as it was
// Under MOCK=boards the record is harness/recent.mock.json, so a sample run never touches the real one.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { harnessConfig } from '../config';

export interface RecentEntry { opened?: string; active?: string }
export type RecentFile = Record<string, RecentEntry>;

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const NOT_FILMS = new Set(['library', 'settings', 'new']);

const file = (): string => path.join(harnessConfig().harnessDir, process.env.MOCK === 'boards' ? 'recent.mock.json' : 'recent.json');

// one copy across dev hot reloads: what is known in memory, and the write waiting to go out
const g = globalThis as unknown as { __hhRecent?: { mem: RecentFile; loaded?: Promise<void>; timer?: NodeJS.Timeout; chain: Promise<void> } };
const st = (g.__hhRecent ??= { mem: {}, chain: Promise.resolve() });

async function readFile(): Promise<RecentFile> {
  try {
    const v: unknown = JSON.parse(await fs.readFile(file(), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as RecentFile) : {};
  } catch {
    return {};
  }
}

const later = (a?: string, b?: string): string | undefined => (!a ? b : !b ? a : a > b ? a : b);

function merge(into: RecentFile, from: RecentFile): void {
  for (const [slug, e] of Object.entries(from)) {
    if (!SLUG.test(slug) || !e || typeof e !== 'object') continue;
    const cur = (into[slug] ??= {});
    const opened = later(cur.opened, typeof e.opened === 'string' ? e.opened : undefined);
    const active = later(cur.active, typeof e.active === 'string' ? e.active : undefined);
    if (opened) cur.opened = opened;
    if (active) cur.active = active;
  }
}

function load(): Promise<void> {
  st.loaded ??= readFile().then((disk) => merge(st.mem, disk));
  return st.loaded;
}

/** Writes the record a moment after the last change (Alma's stream moves many times a second). */
function scheduleWrite(): void {
  clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    st.chain = st.chain.then(async () => {
      await load();
      const all = await readFile();
      merge(all, st.mem);
      const f = file();
      await fs.mkdir(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 1) + '\n');
      await fs.rename(tmp, f);
    }).catch(() => undefined);
  }, 800);
}

function note(slug: string | undefined, kind: keyof RecentEntry, at?: string): void {
  if (!slug || !SLUG.test(slug) || NOT_FILMS.has(slug)) return;
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  const cur = (st.mem[slug] ??= {});
  const next = later(cur[kind], when);
  if (next === cur[kind]) return;
  cur[kind] = next;
  void load().then(scheduleWrite);
}

/** The user wrote to the film's Alma: a message, a card's answer, Done picking (sendToAlma, and the sample's mockPost). */
export const noteUserWrote = (slug: string | undefined): void => note(slug, 'active');
/** Something new needs the user in the film: Alma's reply landed, or a new card waits (the notify hub). */
export const noteAttention = (slug: string | undefined, at?: string): void => note(slug, 'active', at);

/** When each film last moved up: the newest of its record's times. */
export async function readRecent(): Promise<Record<string, string>> {
  await load();
  const out: Record<string, string> = {};
  for (const [slug, e] of Object.entries(st.mem)) {
    const t = later(e.opened, e.active);
    if (t) out[slug] = t;
  }
  return out;
}
