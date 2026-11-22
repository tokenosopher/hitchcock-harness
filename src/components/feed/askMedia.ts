// Which of a card's files a card shows in its body, and how an asking card lays out its pictures and clips. A card's `items` carry an id, which the feed
// reads as the file's option; the body used to drop every file with an option, as if it were one of the pick's tiles,
// so a yes card over an "images" card showed none of its pictures. Only the files that really are a pick's options are
// drawn in the answer instead; every other file stays in the body, whatever the card asks. Pure: scripts/askmedia-test.ts.
import type { FeedCard, FeedMedia, FeedOption } from '@/server/types';

/** The file an option of a pick is: the one marked with its id, else the one at its path. */
export const optionMediaOf = (card: Pick<FeedCard, 'media'>, o: FeedOption): FeedMedia | undefined =>
  card.media.find((m) => m.option === o.id) ?? (o.path ? card.media.find((m) => m.path === o.path) : undefined);

/** The card's files drawn in its body. `hideOptions`: the card's answer draws its pick's options, so they are left out
 *  here (and only those: an id on an item of a yes, go or why card is not an option). */
export function bodyMedia(card: Pick<FeedCard, 'media' | 'ask' | 'sounds'>, hideOptions?: boolean): FeedMedia[] {
  if (!hideOptions || card.ask?.kind !== 'pick' || card.sounds?.length) return card.media;
  const used = new Set(card.ask.options.map((o) => optionMediaOf(card, o)).filter((m): m is FeedMedia => !!m));
  return card.media.filter((m) => !used.has(m));
}

/** How an asking card draws its pictures and clips: one or two at the card's full width, more in a grid (and always a
 *  row of tiles when the card has a sound too: a character's element go); and the
 *  thumbnail width asked of /api/media (sharp on a phone at three pixels to the point, never the whole file). */
export function askLayout(n: number, withSound = false): { wide: boolean; w: number } {
  return n <= 2 && !withSound ? { wide: true, w: 960 } : { wide: false, w: 640 };
}

/** The shape of a wide picture's box once the picture's own size is known: its own aspect, kept between 3:4 and 21:9
 *  (a portrait board stands tall enough to judge, a wide sheet is not a sliver), and an upright one no wider than
 *  480 px, so on a desktop it is not a page high. Before it is known: 16:9, the shape of most of the film's pictures. */
export function wideBox(nw?: number, nh?: number): { ratio: number; maxW?: number } {
  if (!nw || !nh) return { ratio: 16 / 9 };
  const ratio = Math.min(21 / 9, Math.max(3 / 4, nw / nh));
  return ratio < 1 ? { ratio, maxW: 480 } : { ratio };
}

/** The page a card about the story or the script opens, so the user can read what they are asked to approve. Only these two:
 *  every other card shows its thing inside the card itself. A card at `story` whose title (else its id) names the
 *  script or the story; the version it names ("Script v2", "story v6", "ASK-script-v9-lock"), when it names one. */
export function readOf(card: Pick<FeedCard, 'place' | 'title' | 'id'>): { what: 'script' | 'story'; version?: string } | undefined {
  if (card.place !== 'story') return undefined;
  for (const s of [card.title, card.id ?? '']) {
    const what = /\bscript\b/i.test(s) ? 'script' : /\bstory\b/i.test(s) ? 'story' : undefined;
    if (!what) continue;
    const v = new RegExp(`\\b${what}[\\s-]*(v\\d+)\\b`, 'i').exec(`${card.title} ${card.id ?? ''}`)?.[1]?.toLowerCase();
    return { what, ...(v ? { version: v } : {}) };
  }
  return undefined;
}

/** Where it is, relative to the app: the Story page at its tab, at that version. */
export const readHref = (film: string, r: { what: 'script' | 'story'; version?: string }): string =>
  `/films/${film}/story?tab=${r.what}${r.version ? `&v=${r.version}` : ''}`;
