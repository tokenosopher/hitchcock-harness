// Sending it (Release, stage 3 of 3, 14 Nov 2026): what the right part of a platform page, the steps by hand, the
// ask's chip and the phone work out from the release file and the clock. Pure, never stored; the page, the route's
// test hook and scripts/release-test.ts import it. Mechanics only: no film rule (when to post, how a text is written)
// lives here.
import type { OutFile } from './outfile';
import type { Platform, ReleaseFile, Step } from './file';
import { appName, hm, platformOf, postedParts, waveAt, type PostedPart } from './derive';
import { factsOf, type PlatformKind } from './platforms';

// ---- the platforms' own web addresses (no brand artwork, plain links)

/** The hosts a post's link may be on, per kind. */
export const LINK_HOSTS: Record<PlatformKind, string[]> = {
  reddit: ['reddit.com', 'redd.it'],
  'youtube-shorts': ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  'instagram-reels': ['instagram.com'],
  facebook: ['facebook.com', 'fb.watch', 'fb.com'],
  threads: ['threads.net', 'threads.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com', 'lnkd.in'],
};

/** Why a pasted link is not a post's link on this platform, or undefined when it is. */
export function linkProblem(kind: PlatformKind, link: string): string | undefined {
  const t = link.trim();
  if (!/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t)) return 'That does not look like a link to a post.';
  const host = t.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  const ok = LINK_HOSTS[kind].some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) return `That is not a ${factsOf(kind).name.replace(/ (Reels|Shorts)$/, '')} link. It should be on ${LINK_HOSTS[kind][0]}.`;
  if (!/\/\S+/.test(t.replace(/^https?:\/\//i, ''))) return 'That is the site, not a post. Paste the post\'s own link.';
  return undefined;
}

/** Where "Open <app>" goes: the platform's own site, the upload page where a plain web address has one. */
export function appHome(p: Pick<Platform, 'kind' | 'account' | 'name'>): { label: string; href: string } {
  const sub = /\br\/([A-Za-z0-9_]+)/.exec(p.account)?.[1];
  const href: Record<PlatformKind, string> = {
    reddit: sub ? `https://www.reddit.com/r/${sub}/submit` : 'https://www.reddit.com/submit',
    'youtube-shorts': 'https://studio.youtube.com/',
    tiktok: 'https://www.tiktok.com/upload',
    'instagram-reels': 'https://www.instagram.com/',
    facebook: 'https://www.facebook.com/',
    threads: 'https://www.threads.net/',
    x: 'https://x.com/compose/post',
    linkedin: 'https://www.linkedin.com/feed/',
  };
  return { label: sub ? `Open r/${sub}` : `Open ${appName(p)}`, href: href[p.kind] };
}

// ---- the words of an ask

/** "19:10", "19:10 tomorrow". */
export function whenWords(when: 'now' | string, now: Date): string {
  if (when === 'now') return 'now';
  const d = new Date(when);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  return `${hm(d)}${diff === 1 ? ' tomorrow' : diff > 1 ? ` on ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}` : ''}`;
}
/** The user's own message for an ask: "Post TikTok now", "Schedule Instagram for 19:10". */
export const askWords = (p: Pick<Platform, 'name'>, when: 'now' | string, now: Date): string =>
  when === 'now' ? `Post ${appName(p)} now` : `Schedule ${appName(p)} for ${whenWords(when, now)}`;

/** The time "Schedule…" offers first: the wave's time while it is still ahead, else the next five minutes after ten
 *  from now. Never a time in the past. */
export function scheduleDefault(file: ReleaseFile, p: Platform, now: Date): Date {
  const w = waveAt(file, p);
  if (w.getTime() > now.getTime() + 60_000) return w;
  const t = new Date(now.getTime() + 10 * 60_000);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
  return t;
}
/** "2026-11-14T19:10" for a datetime-local field, in local time. */
export const localInput = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hm(d)}`;

// ---- the final file, as the page and the chip name it

/** The file that goes out as the page names it: the final, or its smaller file (`out`, outfile.ts; ASKS 56). */
export interface FinalInfo { path: string; abs?: string; name: string; bytes?: number; seconds?: number; width?: number; height?: number; out?: OutFile }
export const clockOf = (s?: number): string => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
export const sizeOf = (b?: number): string => (b === undefined ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
/** "FINAL captioned, 1:53, 101 MB": the final by its plain name. */
export function fileWords(f: FinalInfo): string {
  const plain = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/^.* - /, '');
  return [plain, clockOf(f.seconds), sizeOf(f.bytes)].filter(Boolean).join(', ');
}

/** What Buffer sets at upload: Alma's lines when she wrote them, else what the platforms module says Buffer can
 *  set (marked `about`: not read from Buffer for this post). */
export function bufferSets(p: Platform): { label: string; value?: string; about?: true }[] {
  if (p.upload.bufferSets.length) return p.upload.bufferSets;
  return factsOf(p.kind).buffer.sets.map((s) => ({ label: s, about: true as const }));
}

// ---- the ask's chip: exactly what is asked

/** The ref of the chip that rides with an ask, for Alma: platform, account, route, when, the caption as it will be
 *  posted, the file, what Buffer sets and what is left for the user after. */
export function askRef(file: ReleaseFile, pid: string, when: 'now' | string, final: FinalInfo, now: Date, again?: string): string {
  const p = platformOf(file, pid)!;
  const parts = postedParts(file, pid);
  const sets = bufferSets(p);
  const lines = [
    `The user asks: ${askWords(p, when, now)}${again ? ` (again, after: ${again})` : ''}. Recorded as send.asked in social/release.json; answer with your asking card for this platform only (recipes/release.md, "The go card").`,
    `Platform: ${p.name} (${p.id})${p.also?.length ? `, also to ${p.also.join(' and ')}` : ''}. Account: ${p.account}. Route: through Buffer.`,
    `When: ${when === 'now' ? 'now' : `${whenWords(when, now)} (${new Date(when).toISOString()})`}.`,
    ...parts.map((x) => `${x.part.label}, exactly as it will be posted:\n"""\n${x.text}\n"""`),
    ...(parts.some((x) => x.part.id === 'reply') ? ['One Buffer post as a thread: the post first, with the video, then the reply, with no video (recipes/release.md, "A reply on X").'] : []),
    `File: ${final.abs ?? final.path} (${final.path} in the film folder), going out as "${final.name}"${[clockOf(final.seconds), sizeOf(final.bytes)].filter(Boolean).length ? `, ${[clockOf(final.seconds), sizeOf(final.bytes)].filter(Boolean).join(', ')}` : ''}.`,
    `Buffer sets: ${sets.map((s) => (s.value ? `${s.label}: ${s.value}` : `${s.label}${s.about ? ' (what Buffer can set; not read for this post)' : ''}`)).join('; ') || 'nothing written yet'}.`,
    `Left for the user in ${appName(p)} after it posts: ${p.upload.after.map((s) => s.text).join('; ') || 'nothing'}.`,
  ];
  return lines.join('\n');
}

// ---- sending

export interface SendStep { label: string; at?: string; state: 'done' | 'current' | 'to-come' }
/** Alma's steps with the current one marked (the first without a time). Without steps of hers: Buffer has it, the
 *  platform takes it, posted. */
export function sendSteps(p: Platform): SendStep[] {
  const raw = p.send.sending?.steps?.length ? p.send.sending.steps : [{ label: 'Buffer has the file', at: p.send.sending?.since }, { label: `${appName(p)} takes it`, at: p.send.sending?.platformHas }, { label: 'Posted' }];
  const cur = raw.findIndex((s) => !s.at);
  return raw.map((s, i) => ({ label: s.label, at: s.at, state: s.at ? 'done' : i === cur ? 'current' : 'to-come' }));
}
/** "1 min 40 s", "12 s", "1 h 3 min". */
export function elapsedWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
/** Whether a send could still be alive: asked, given its go, scheduled or sending, or failed without Alma confirming
 *  Buffer dropped it (`failed.cleared`), and not posted. A new ask, or by hand, could then post it twice. */
export function maybeAlive(p: Platform): boolean {
  const s = p.send;
  if (s.posted) return false;
  if (s.failed) return !s.failed.cleared;
  return !!(s.asked || s.go || s.sending || s.scheduled);
}
/** Whether it can still be stopped, by Alma's own record: 'yes' while Buffer holds it (`inBuffer`), 'no' once the
 *  platform has it (`platformHas`), 'unknown' when her record says neither (the page then asks her, never guesses). */
export function stoppable(p: Platform): 'yes' | 'no' | 'unknown' {
  const sd = p.send.sending;
  if (sd?.platformHas) return 'no';
  if (sd?.inBuffer) return 'yes';
  return 'unknown';
}
export const WAIT_DROPPED = 'Wait until Alma confirms Buffer has dropped it.';

// ---- by hand

export type HandKind = 'save' | 'copy' | 'open' | 'link' | 'check';
export interface HandStep {
  id: string;
  /** Alma's words for the step. */
  text: string;
  kind: HandKind;
  /** A copy step: the posted part it copies, with its exact text. */
  part?: PostedPart;
  done?: string;
  n: number;
}
/** The steps by hand, Alma's `upload.hand` in her order, each read as one of the mechanics the page knows by its id:
 *  `save` (the final, full size), `copy` (the first posted part) or a part's id (`title`, `comment`, …) or
 *  `copy-<part>`, `open` (the app), `link` (paste the post's link). Any other id is a check, ticked as done. */
export function handSteps(file: ReleaseFile, p: Platform): HandStep[] {
  const parts = postedParts(file, p.id);
  const partIds = parts.map((x) => x.part.id);
  const partOfStep = (s: Step) => (s.id === 'copy' ? partIds[0] : s.id.startsWith('copy-') ? s.id.slice(5) : partIds.includes(s.id) ? s.id : undefined);
  const steps = [...p.upload.hand];
  // X's reply (ASKS 58): a step of its own, after the post's, when Alma's steps have none for it
  if (partIds.includes('reply') && !steps.some((s) => partOfStep(s) === 'reply')) {
    const after = steps.findIndex((s) => partOfStep(s) === partIds[0]);
    const link = steps.findIndex((s) => s.id === 'link');
    steps.splice(after >= 0 ? after + 1 : link >= 0 ? link : steps.length, 0, { id: 'copy-reply', text: REPLY_STEP });
  }
  return steps.map((s: Step, i): HandStep => {
    const pid = partOfStep(s);
    const kind: HandKind = s.id === 'save' ? 'save' : s.id === 'open' ? 'open' : s.id === 'link' ? 'link' : pid ? 'copy' : 'check';
    return { id: s.id, text: s.text, kind, part: kind === 'copy' ? parts.find((x) => x.part.id === pid) : undefined, done: s.done, n: i + 1 };
  });
}
/** The reply's own step by hand, when Alma's steps have none for it. */
export const REPLY_STEP = 'Copy the reply and post it as a reply to your post.';
/** The step to do now: the first not done (the link step counts as done once the post is marked posted). */
export function currentHand(steps: HandStep[], posted: boolean): HandStep | undefined {
  return steps.find((s) => !(s.done || (posted && s.kind === 'link')));
}
/** What a copy step says it copies: "the first line, credit and tags together" for a caption made of several fields. */
export function copyWhat(file: ReleaseFile, p: Platform, part: PostedPart): string {
  const fields = part.fields.map((id) => p.fields.find((f) => f.id === id)?.label.toLowerCase()).filter(Boolean) as string[];
  if (fields.length < 2) return '';
  return `the ${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]} together`;
}

// ---- the go card, as recipes/release.md tells Alma to write it (the test hook writes the same in sample-data mode)

/** The platforms that get their own go: the ones sharing a text with this one, else "The others". */
export function ownGoWords(file: ReleaseFile, p: Platform): string {
  const shared = [...new Set(p.fields.flatMap((f) => f.sharedWith ?? []))].map((id) => platformOf(file, id)).filter((x): x is Platform => !!x).map((x) => appName(x));
  const others = shared.length ? `${shared.slice(0, -1).join(', ')}${shared.length > 1 ? ' and ' : ''}${shared[shared.length - 1]}` : 'The others';
  return `Only ${appName(p)}. ${others} ${shared.length === 1 ? 'gets its' : 'get their'} own go.`;
}
/** The card Alma writes into review/cards.json for an ask: what it shows, its id form, its buttons. */
export function goCardJson(file: ReleaseFile, pid: string, final: FinalInfo, now: Date, n = 1, note?: string): Record<string, unknown> {
  const p = platformOf(file, pid)!;
  const when = p.send.asked?.when ?? 'now';
  const parts = postedParts(file, pid);
  const sets = bufferSets(p).filter((s) => s.value).map((s) => `${s.label} ${s.value}`);
  const after = p.upload.after.map((s) => s.text.charAt(0).toLowerCase() + s.text.slice(1));
  return {
    type: 'card', id: `GO-release-${pid}-${n}`, at: 'release', for: pid, updated: now.toISOString(),
    title: `${appName(p)}, from ${p.account}, through Buffer, ${when === 'now' ? 'now' : `at ${whenWords(when, now)}`}.`,
    sub: ownGoWords(file, p),
    quote: parts.length === 1 ? parts[0].text : parts.map((x) => `${x.part.label}:\n${x.text}`).join('\n\n'),
    fileLine: { name: final.name, sub: [clockOf(final.seconds), sizeOf(final.bytes)].filter(Boolean).join(', '), path: final.path },
    text: [[sets.length ? `At upload Buffer sets ${sets.join(' and ')}.` : '', after.length ? `You ${after.join(' and ')} in ${appName(p)} right after it posts.` : ''].filter(Boolean).join(' ')].filter(Boolean),
    ...(note ? { note } : {}),
    ask: 'go', yesLabel: when === 'now' ? `Post to ${appName(p)} now` : `Schedule ${appName(p)} for ${whenWords(when, now)}`, noLabel: 'Cancel the ask',
  };
}
