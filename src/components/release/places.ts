// A platform posted in several places, every time (Reddit goes to r/aivideo and r/aivideos,
// the same title and first comment in each). The places are data on the platform (platforms.ts `places`); this works
// out, from the release file, which of them are posted and which are still to come, and which place a pasted link is
// in. Pure; the pages, the operations, the briefs and the tests import it.
//
// The stored shape (file.ts Send): the first place's post is `send.posted` {at, link?}, exactly as a platform with one
// post has always had it, so a file written before reads unchanged (its one link is the first place's); every other
// place's post is `send.postedIn[<place id>]` {at, link?}. A platform with places is posted only when every place is.
import type { Platform } from './file';
import { factsOf, isKind, type Place, type PlatformKind } from './platforms';

export interface PlacePost { at: string; link?: string }
type SendLike = { posted?: PlacePost; postedIn?: Record<string, PlacePost> };
type PlatLike = { kind: PlatformKind; send: SendLike };

export const placesOf = (kind: PlatformKind): Place[] => factsOf(kind).places ?? [];

/** Each place with its post, in the platform's order. Empty for a platform with one post. */
export function placePosts(p: PlatLike): { place: Place; posted?: PlacePost }[] {
  return placesOf(p.kind).map((place, i) => ({ place, posted: i === 0 ? p.send.posted : p.send.postedIn?.[place.id] }));
}
/** The post in one place (the first place, or a platform with one post: `send.posted`). */
export function postIn(p: PlatLike, place?: string): PlacePost | undefined {
  const ps = placesOf(p.kind);
  if (!ps.length || !place || place === ps[0].id) return p.send.posted;
  return p.send.postedIn?.[place];
}

/** Posted: every place posted (a platform with one post: `send.posted`). */
export function isPosted(p: PlatLike): boolean {
  const ps = placePosts(p);
  return ps.length ? ps.every((x) => !!x.posted) : !!p.send.posted;
}
/** Anything of it is up: one place or more. Its text and file are then the ones posted. */
export const anyPosted = (p: PlatLike): boolean => !!p.send.posted || Object.keys(p.send.postedIn ?? {}).length > 0;
/** Posted in some places, not all: the places posted and the ones to come. */
export function partlyPosted(p: PlatLike): { posted: Place[]; toCome: Place[] } | undefined {
  const ps = placePosts(p);
  if (!ps.length || !anyPosted(p) || isPosted(p)) return undefined;
  return { posted: ps.filter((x) => x.posted).map((x) => x.place), toCome: ps.filter((x) => !x.posted).map((x) => x.place) };
}
/** When it was posted: the last place's time, once every place is posted. */
export function postedAt(p: PlatLike): string | undefined {
  if (!isPosted(p)) return undefined;
  const ps = placePosts(p);
  if (!ps.length) return p.send.posted?.at;
  return ps.map((x) => x.posted!.at).sort().pop();
}
/** A place posted without its link. */
export const linkToAdd = (p: PlatLike): boolean => {
  const ps = placePosts(p);
  return ps.length ? ps.some((x) => x.posted && !x.posted.link) : !!p.send.posted && !p.send.posted.link;
};

/** Posted, from a release file read raw from disk (the briefs: left.ts postBrief), without trusting its shape. */
export function isPostedRaw(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const x = p as { kind?: unknown; send?: unknown };
  if (!x.send || typeof x.send !== 'object') return false;
  const s = x.send as { posted?: unknown; postedIn?: unknown };
  if (!isKind(x.kind) || !placesOf(x.kind).length) return !!s.posted;
  const rest = s.postedIn && typeof s.postedIn === 'object' ? (s.postedIn as Record<string, unknown>) : {};
  return placesOf(x.kind).every((pl, i) => (i === 0 ? !!s.posted : !!rest[pl.id]));
}

/** "r/aivideo", "r/aivideo and r/aivideos". */
export const placeNames = (ps: Place[]): string => (ps.length > 1 ? `${ps.slice(0, -1).map((x) => x.name).join(', ')} and ${ps[ps.length - 1].name}` : ps[0]?.name ?? '');

/** The place a post's link names: `place` one of the platform's, `other` the name of a place that is not one of them
 *  ("r/funny"), neither when the link names none (a short link). */
export function placeInLink(kind: PlatformKind, link: string): { place?: Place; other?: string } {
  const f = factsOf(kind);
  if (!f.places?.length || !f.placeIn) return {};
  const rest = link.trim().replace(/^https?:\/\//i, '');
  const pathPart = rest.slice(rest.indexOf('/') >= 0 ? rest.indexOf('/') : rest.length).split(/[?#]/)[0];
  const m = f.placeIn.exec(pathPart);
  if (!m) return {};
  const place = f.places.find((x) => x.id.toLowerCase() === m[1].toLowerCase());
  if (place) return { place };
  // the other place's name as the platform writes its own ("r/funny"), from the first place's
  return { other: f.places[0].name.replace(f.places[0].id, m[1]) };
}

/** Which place a pasted link goes in, or why it cannot: the place the link names, else the one it was pasted for. A
 *  link that names a place that is not the platform's is refused in words; so is one that names none, pasted for no
 *  place. A link that names another place than the box it was pasted in goes in its own place, unless that place has
 *  a different link already (then the user replaces it there). */
export function placeForLink(p: Pick<Platform, 'kind' | 'send' | 'name'>, link: string, asked?: string): { place: Place; moved?: boolean } | { error: string } {
  const ps = placesOf(p.kind);
  const askedPlace = asked ? ps.find((x) => x.id === asked) : undefined;
  if (asked && !askedPlace) return { error: `${p.name} is not posted in "${asked}".` };
  const named = placeInLink(p.kind, link);
  if (named.other) return { error: `That is a post in ${named.other}. ${p.name} goes to ${placeNames(ps)} only.` };
  const place = named.place ?? askedPlace;
  if (!place) return { error: `That link does not say which of ${placeNames(ps)} it is in. Paste it in its own box.` };
  if (askedPlace && place.id !== askedPlace.id) {
    const there = postIn(p, place.id);
    if (there?.link && there.link !== link.trim()) return { error: `That is the ${place.name} post, and ${place.name} has its link already. Paste the ${askedPlace.name} post's link here.` };
    return { place, moved: true };
  }
  return { place };
}
