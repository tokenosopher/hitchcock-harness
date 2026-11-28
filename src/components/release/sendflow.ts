// Sending it (Release, stage 3 of 3, 14 Nov 2026): what the right part of a platform page, the steps by hand and the
// phone work out from the release file and the clock. Every post is made by hand in this copy. Pure, never stored; the page, the route's
// test hook and scripts/release-test.ts import it. Mechanics only: no film rule (when to post, how a text is written)
// lives here.
import type { OutFile } from './outfile';
import type { Platform, ReleaseFile, Step } from './file';
import { appName, postedParts, type PostedPart } from './derive';
import { factsOf, type Place, type PlatformKind } from './platforms';
import { anyPosted, placesOf, postIn } from './places';

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
  // a platform posted in several places opens the first; the others open from their own step
  const first = placesOf(p.kind)[0];
  if (first) return { label: `Open ${first.name}`, href: first.url };
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

// ---- the final file, as the page names it

/** The file that goes out as the page names it: the final, or its smaller file (`out`, outfile.ts; ASKS 56). */
export interface FinalInfo { path: string; abs?: string; name: string; bytes?: number; seconds?: number; width?: number; height?: number; out?: OutFile }
export const clockOf = (s?: number): string => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
export const sizeOf = (b?: number): string => (b === undefined ? '' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
/** "FINAL captioned, 1:53, 101 MB": the final by its plain name. */
export function fileWords(f: FinalInfo): string {
  const plain = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/^.* - /, '');
  return [plain, clockOf(f.seconds), sizeOf(f.bytes)].filter(Boolean).join(', ');
}

// ---- an older file's send (a post by hand is never asked, sent or failed)

/** Whether it can still be stopped, by Alma's own record: 'yes' while it is still held before the platform
 *  (`inBuffer`), 'no' once the platform has it (`platformHas`), else 'unknown' (the page never guesses). */
export function stoppable(p: Platform): 'yes' | 'no' | 'unknown' {
  const sd = p.send.sending;
  if (sd?.platformHas) return 'no';
  if (sd?.inBuffer) return 'yes';
  return 'unknown';
}
export const WAIT_DROPPED = 'Wait until Alma confirms nothing of it can still go out.';

// ---- by hand

export type HandKind = 'save' | 'copy' | 'open' | 'link' | 'check' | 'again';
export interface HandStep {
  id: string;
  /** Alma's words for the step. */
  text: string;
  kind: HandKind;
  /** A copy step: the posted part it copies, with its exact text. */
  part?: PostedPart;
  done?: string;
  n: number;
  /** A platform posted in several places: the place an `open`, `link` or `again` step is for. */
  place?: Place;
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
  // several places: Alma's steps are the first place's; after its link, each other place gets one step to
  // post the same there and one for its link, the page's own until ticked (then written into the list, as the reply's)
  const places = placesOf(p.kind);
  const placeOf = (id: string) => places.find((x) => x.id === id);
  if (places.length > 1) {
    let at = steps.findIndex((s) => s.id === 'link');
    at = at >= 0 ? at + 1 : steps.length;
    for (const pl of places.slice(1)) {
      for (const add of [{ id: `again-${pl.id}`, text: againWords(pl) }, { id: `link-${pl.id}`, text: linkWords(pl) }]) {
        const was = steps.findIndex((s) => s.id === add.id);
        if (was >= 0) { at = was + 1; continue; }
        steps.splice(at, 0, add);
        at++;
      }
    }
  }
  return steps.map((s: Step, i): HandStep => {
    const pid = partOfStep(s);
    const again = s.id.startsWith('again-') ? placeOf(s.id.slice(6)) : undefined;
    const linkAt = s.id.startsWith('link-') ? placeOf(s.id.slice(5)) : undefined;
    const kind: HandKind = s.id === 'save' ? 'save' : s.id === 'open' ? 'open' : s.id === 'link' || linkAt ? 'link' : again ? 'again' : pid ? 'copy' : 'check';
    const place = again ?? linkAt ?? ((kind === 'open' || kind === 'link') && places.length > 1 ? places[0] : undefined);
    // a link step names its place: the user pastes each post's link in its own box
    const text = kind === 'link' && place ? linkWords(place) : s.text;
    return { id: s.id, text, kind, part: kind === 'copy' ? parts.find((x) => x.part.id === pid) : undefined, done: s.done, n: i + 1, ...(place ? { place } : {}) };
  });
}
/** The step to post the same in another place. */
export const againWords = (pl: Place): string => `Post it in ${pl.name} too: the same video, title and first comment`;
/** A place's link step. */
export const linkWords = (pl: Place): string => `Paste the ${pl.name} post's link`;
/** A step done: ticked; a link step once its place (or the platform) is marked posted; a place's own step once that
 *  place is. */
export function stepDone(s: HandStep, p: Pick<Platform, 'kind' | 'send'>): boolean {
  if (s.done) return true;
  if (s.kind === 'link') return !!postIn(p, s.place?.id);
  if (s.kind === 'again') return !!postIn(p, s.place?.id);
  return false;
}
/** The reply's own step by hand, when Alma's steps have none for it. */
export const REPLY_STEP = 'Copy the reply and post it as a reply to your post.';
/** The step to do now: the first not done (the link step counts as done once the post is marked posted; with
 *  places, once its place is). `p`: the platform, or whether it is posted. */
export function currentHand(steps: HandStep[], p: boolean | Pick<Platform, 'kind' | 'send'>): HandStep | undefined {
  if (typeof p === 'boolean') return steps.find((s) => !(s.done || (p && s.kind === 'link')));
  return steps.find((s) => !stepDone(s, p));
}
/** What a copy step says it copies: "the first line, credit and tags together" for a caption made of several fields. */
export function copyWhat(file: ReleaseFile, p: Platform, part: PostedPart): string {
  const fields = part.fields.map((id) => p.fields.find((f) => f.id === id)?.label.toLowerCase()).filter(Boolean) as string[];
  if (fields.length < 2) return '';
  return `the ${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]} together`;
}
