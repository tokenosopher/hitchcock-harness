// The film's newest full-size master (13 Nov 2026, ASKS 37: "I don't see the final video … I can't see where the
// video is"). The Finish page, the board and the Edit page's 1080p switch read FilmState.master; nothing here writes.
//
// The rule, in one sentence: the master is the newest full-size video the record vouches for (a review card whose own
// "at" is finish shows it, the app's own "Render master" made it, or spend.md's render rows name it) among the files the
// readers already know as masters (cut/*1080*, video/1080/*, the newest of cut/renders/v<n>-master.mp4, -2, -3 …: a master
// made again is a new file beside the first, and the render states name only the newest, masters.ts), never one whose name says a
// smaller size; when the record vouches for none, the older films' reading by name, unchanged (final-clean, then
// final, then the first in cut/, then the newest in video/1080/).
//
// Before this, the Finish page looked only for the record's render rows and for "final" in cut/, so a master made outside
// the app's render (video/1080/cut-v230-1080.mp4, shown by Alma's card MASTER-v230-1080) was never found.
import type { CutInfo, FeedCard, FilmMaster, PostInfo } from '../../types';
import { abs, natCmp, type FilmCtx } from '../util';
import { fileFact } from './record';
import { isRemovedAnswer } from '../../../components/lib/remove';

/** A name that says a size under full size ("…-480p-no-music.mp4", "…_720p.mp4") or a proxy. */
const SMALL = /(^|[^0-9])(1[0-9]{2}|[2-9][0-9]{2})p([^a-z0-9]|$)|proxy/i;
const VIDEO = /\.(mp4|mov|m4v)$/i;
const base = (p: string): string => p.split('/').pop() ?? p;

interface Cand { path: string; from: FilmMaster['from']; version?: string; card?: FeedCard }

/** "v230" from "cut v230" in a card's title or "cut-v230-1080.mp4", kept only when the timeline has that version. A
 *  bare "v1" is not read: "1080p v1" is the master's own edition, not a version of the cut. */
function versionIn(text: string, known: Set<string>): string | undefined {
  for (const m of text.matchAll(/(?:^|[^a-z0-9])cut[-_ ]?(v\d+)(?=[^0-9]|$)/gi)) {
    const v = m[1].toLowerCase();
    if (known.has(v)) return v;
  }
  return undefined;
}

/** The sound the master carries, in the card's own words: a bracket of its title that speaks of sound
 *  ("(dialogue only)"), else the first sentence of its text that starts with "The sound", up to a colon. */
function soundOf(card: FeedCard | undefined): string | undefined {
  if (!card) return undefined;
  for (const m of card.title.matchAll(/\(([^)]+)\)/g)) if (/dialogue|music|mix|sound|effects|silent/i.test(m[1])) return m[1].trim();
  for (const para of card.text ?? []) {
    const s = para.replace(/\*\*|`/g, '').split(/(?<=\.)\s+/).find((x) => /^(the )?sound\b/i.test(x));
    if (s) return s.split(':')[0].replace(/\.$/, '').trim();
  }
  return undefined;
}

/** The user's yes on a master at the Sound page (Film Flow v3.3, 11 Sound and music: the master goes on a card on the
 *  Sound page and waits for the user's yes, its title naming the version). The newest answered yes card that says
 *  where it belongs (`"at": "sound"`) and names a master in its title; a "no" is not a yes. */
export function masterYesOf(cards: FeedCard[]): { key: string; id?: string; title: string } | undefined {
  let best: FeedCard | undefined;
  for (const c of cards) {
    const a = c.ask;
    if (!a || a.kind !== 'yes' || !a.answer || a.answer.option === 'no' || isRemovedAnswer(a.answer.option)) continue;
    if (c.place !== 'sound' || c.placed !== 'card' || !/\bmaster\b/i.test(c.title)) continue;
    if (!best || (c.date ?? '') > (best.date ?? '')) best = c;
  }
  return best ? { key: best.key, id: best.id, title: best.title } : undefined;
}

export async function readMaster(ctx: FilmCtx, post: PostInfo | undefined, cut: CutInfo | undefined, cards: FeedCard[], asks: FeedCard[]): Promise<FilmMaster | undefined> {
  const named = (post?.masters ?? []).filter((m) => VIDEO.test(m) && !SMALL.test(base(m)));
  const knownNames = new Set(named);
  const versions = new Set((cut?.versions ?? []).map((v) => v.version.toLowerCase()));
  if (cut?.current) versions.add(cut.current.version.toLowerCase());

  // what the record vouches for
  const vouched: Cand[] = [];
  const renders = Object.entries(cut?.renders ?? {});
  for (const [v, r] of renders) {
    for (const st of [r.master, ...(r.variants ?? []).filter((x) => x.kind === 'master')]) {
      if (st?.state === 'done' && st.path && VIDEO.test(st.path)) vouched.push({ path: st.path, from: 'render', version: v });
    }
  }
  const renderPaths = new Set(vouched.map((c) => c.path));
  for (const card of cards) {
    if (card.place !== 'finish' || card.placed !== 'card') continue;
    for (const m of card.media) {
      if (m.kind !== 'video' || !(knownNames.has(m.path) || renderPaths.has(m.path))) continue;
      vouched.push({ path: m.path, from: 'card', card, version: versionIn(card.title, versions) ?? versionIn(base(m.path), versions) });
    }
  }
  if (cut?.master && VIDEO.test(cut.master) && !SMALL.test(base(cut.master))) vouched.push({ path: cut.master, from: 'record', version: versionIn(base(cut.master), versions) });

  const dated = async (c: Cand) => ({ c, f: await fileFact(abs(ctx, c.path)) });
  const live = (await Promise.all(vouched.map(dated))).filter((x) => x.f);
  let pick: { c: Cand; f: { bytes: number; date: string } } | undefined;
  if (live.length) {
    // the newest file; for the same file, the card's reading (it says what the file is) over the render's
    const rank = { card: 0, render: 1, record: 2, name: 3 } as const;
    live.sort((a, b) => b.f!.date.localeCompare(a.f!.date) || rank[a.c.from] - rank[b.c.from]);
    pick = live[0] as typeof pick;
  } else {
    // the older films, by name, as the Finish page always read them: the clean finished film, then a final, then the
    // first in cut/; and, new, the newest in video/1080/
    const all = post?.masters ?? [];
    const v1080 = named.filter((m) => m.startsWith('video/1080/'));
    const facts1080 = (await Promise.all(v1080.map((p) => dated({ path: p, from: 'name' })))).filter((x) => x.f);
    facts1080.sort((a, b) => b.f!.date.localeCompare(a.f!.date) || natCmp(b.c.path, a.c.path));
    const byName = all.find((m) => /final-clean/.test(m)) ?? all.find((m) => /final/.test(m)) ?? all.find((m) => m.startsWith('cut/'));
    pick = (byName ? await dated({ path: byName, from: 'name' }) : facts1080[0]) as typeof pick;
    if (pick && !pick.f) pick = undefined;
    if (pick) pick.c.version = versionIn(base(pick.c.path), versions);
  }
  if (!pick) return undefined;
  const { c, f } = pick;
  // the card that shows it: the chosen card, else any card at Finish that shows the same file
  const card = c.card ?? cards.find((k) => k.place === 'finish' && k.placed === 'card' && k.media.some((m) => m.path === c.path));
  const version = c.version ?? (card ? versionIn(card.title, versions) : undefined);
  // the yes it waits for: an open ask at Finish that names the file, or this version at 1080p
  const ask = asks.find((k) => k.place === 'finish' && ([k.title, ...(k.text ?? [])].some((t) => t.includes(base(c.path)))
    || (!!version && new RegExp(`\\b${version}\\b`, 'i').test(k.title) && /1080|master/i.test(k.title))));
  const sound = soundOf(card) ?? (c.from === 'render' ? `the mix of the tracks of ${c.version}` : undefined);
  return {
    path: c.path, version, date: f.date, bytes: f.bytes, from: c.from,
    card: card ? { key: card.key, id: card.id, title: card.title } : undefined,
    ask: ask ? { key: ask.key, id: ask.id, title: ask.title } : undefined,
    sound,
  };
}
