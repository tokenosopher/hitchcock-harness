// The platforms' own facts (Release, 14 Nov 2026): mechanics only, per kind of platform. Hard limits (characters per
// posted part, tags, video length and size), how many characters the feed shows before "more", which upload settings
// exist, how a caption is assembled from the release file's fields, and what Buffer can set for it. No film rule lives
// here: aims, advice and "no hashtags on X" are Alma's, in social/release.json.
//
// Every number carries where it was read and when. A number marked `unverified` could not be confirmed in the
// platform's or Buffer's public documentation on that day; the page says "about" before it.
// Pure: the pages, the server and scripts/release-test.ts import it.

export type PlatformKind = 'reddit' | 'youtube-shorts' | 'tiktok' | 'instagram-reels' | 'facebook' | 'threads' | 'x' | 'linkedin';
export const PLATFORM_KINDS: PlatformKind[] = ['reddit', 'youtube-shorts', 'tiktok', 'instagram-reels', 'facebook', 'threads', 'x', 'linkedin'];

/** A number, where it was read, on which day, and whether it could be confirmed there. */
export interface Sourced { value: number; source: string; checked: string; unverified?: true }

/** One piece of text the platform posts: a caption, a title, a description, a tag list, a first comment. */
export interface PartFacts {
  id: string;
  label: string;
  /** The hard limit, in characters (UTF-16 code units, as Buffer counts on most networks). */
  limit?: Sourced;
  /** A tag list part: its limit counts tags, `chars` its characters (YouTube's 500). */
  tags?: { max?: Sourced; chars?: Sourced };
  /** How the fields that go into this part are joined. */
  join: string;
  /** Posted only when it has text (X's and Threads' reply, ASKS 58): a platform file with no field in it, or with its
   *  fields emptied, posts nothing for it and nothing waits on it. */
  optional?: true;
}

export interface BufferFacts {
  /** Buffer has a channel for it. */
  channel: boolean;
  /** What Buffer can set at upload, in plain words, from the create_post tool's schema. */
  sets: string[];
  /** What the schema has no field for: left to the user in the app after it posts. */
  cannot: string[];
  checked: string;
}

export interface PlatformFacts {
  kind: PlatformKind;
  /** Its name as the user says it. */
  name: string;
  /** The two letters on its tile ("TT"). */
  short: string;
  /** The parts it posts, in the order they appear; a field without a `part` goes into the first. */
  parts: PartFacts[];
  /** How many characters the feed shows before "more" (one number: the page states it and the preview cuts by it). */
  fold?: Sourced;
  video: { min?: Sourced; max?: Sourced; bytes?: Sourced };
  /** The upload settings that exist on the platform (whoever sets them). */
  settings: string[];
  buffer: BufferFacts;
}

// ---- sources (read on the day below)
const CHECKED = '2026-11-13';
const BUFFER_CHARS = 'Buffer, "Character limits for each social network" (support.buffer.com/articles/character-limits-for-each-social-network-mNDqsEV9Nf) and developers.buffer.com/guides/character-limits';
const BUFFER_VIDEO = 'Buffer, "Sharing videos through Buffer" (support.buffer.com/articles/sharing-videos-through-buffer-LOe2p2rnAI)';
const YT_LIMITS = 'YouTube Help, "Add video details" (support.google.com/youtube/answer/57404)';
const YT_SHORTS = 'YouTube Help, "Upload YouTube Shorts" (support.google.com/youtube/answer/15424877)';
const BUFFER_SCHEMA = 'the Buffer create_post tool\'s input schema (metadata per service)';
const NONE = 'no public page found that states it; commonly quoted value';
const X_CHARS = `${BUFFER_CHARS} (free accounts; 25,000 on paid plans; X's weighted count: a link is 23, an emoji 2)`;

const s = (value: number, source: string): Sourced => ({ value, source, checked: CHECKED });
const about = (value: number, source = NONE): Sourced => ({ value, source, checked: CHECKED, unverified: true });

/** What Buffer sets for every channel it has (schema, 13 Nov 2026). */
export const BUFFER_ALL = [
  'when it goes out: now, the next slot, the queue, or a set time',
  'the video, which Buffer fetches from a public web address (not a file on this Mac)',
  'the thumbnail as a frame of the video (an offset in milliseconds); no picture of its own',
];

export const PLATFORMS: Record<PlatformKind, PlatformFacts> = {
  reddit: {
    kind: 'reddit', name: 'Reddit', short: 'RD',
    parts: [{ id: 'title', label: 'Title', limit: about(300), join: ' ' }, { id: 'comment', label: 'First comment', limit: about(10000), join: '\n\n' }],
    video: { max: about(900), bytes: about(1_000_000_000) },
    settings: ['subreddit', 'flair', 'NSFW and spoiler marks'],
    buffer: { channel: false, sets: [], cannot: ['everything: Buffer has no Reddit channel; it is posted by hand'], checked: CHECKED },
  },
  'youtube-shorts': {
    kind: 'youtube-shorts', name: 'YouTube Shorts', short: 'YT',
    parts: [
      { id: 'title', label: 'Title', limit: s(100, YT_LIMITS), join: ' ' },
      { id: 'description', label: 'Description', limit: s(5000, YT_LIMITS), join: '\n' },
      { id: 'tags', label: 'Tags', tags: { chars: about(500) }, join: ', ' },
    ],
    video: { max: s(180, YT_SHORTS), bytes: s(10_000_000_000, BUFFER_VIDEO) },
    settings: ['title', 'description', 'tags', 'thumbnail', 'altered or synthetic content', 'who can see it', 'made for kids', 'category', 'licence', 'notify subscribers'],
    buffer: {
      channel: true,
      sets: ['title (required)', 'category (required)', 'altered or synthetic content (isAiGenerated)', 'who can see it: public, unlisted or private', 'made for kids', 'licence', 'embeddable', 'notify subscribers'],
      cannot: ['tags', 'a thumbnail picture of its own (only a frame)', 'playlist', 'automatic captions'],
      checked: CHECKED,
    },
  },
  tiktok: {
    kind: 'tiktok', name: 'TikTok', short: 'TT',
    parts: [{ id: 'caption', label: 'Caption', limit: s(2200, BUFFER_CHARS), join: '\n' }],
    fold: about(55),
    video: { min: s(3, BUFFER_VIDEO), max: s(600, BUFFER_VIDEO), bytes: s(1_000_000_000, BUFFER_VIDEO) },
    settings: ['caption', 'AI-generated content', 'who can see it', 'comments, duet and stitch', 'cover frame', 'auto-captions'],
    buffer: {
      channel: true,
      sets: ['AI-generated content (isAiGenerated, video posts only)', 'a title'],
      cannot: ['who can see it', 'comments, duet and stitch', 'auto-captions', 'the sound'],
      checked: CHECKED,
    },
  },
  'instagram-reels': {
    kind: 'instagram-reels', name: 'Instagram Reels', short: 'IG',
    parts: [{ id: 'caption', label: 'Caption', limit: s(2200, BUFFER_CHARS), tags: { max: about(5, 'reported in Dec 2025 as Instagram\'s new cap; older pages say 30; not confirmed on help.instagram.com') }, join: '\n' },
      { id: 'comment', label: 'First comment', limit: s(2200, BUFFER_CHARS), join: '\n' }],
    fold: about(125),
    video: { min: s(3, BUFFER_VIDEO), max: s(900, BUFFER_VIDEO), bytes: s(300_000_000, BUFFER_VIDEO) },
    settings: ['caption', 'AI info label', 'share to feed', 'cover', 'location', 'collaborators', 'first comment', 'also to Facebook'],
    buffer: {
      channel: true,
      sets: ['posted as a reel (type reel)', 'share to the feed', 'AI-generated (isAiGenerated)', 'first comment', 'location'],
      cannot: ['collaborators', 'a cover picture of its own (only a frame)', 'the sound', 'cross-posting to Facebook (a separate Facebook channel post)'],
      checked: CHECKED,
    },
  },
  facebook: {
    kind: 'facebook', name: 'Facebook', short: 'FB',
    parts: [{ id: 'caption', label: 'Caption', limit: s(5000, BUFFER_CHARS), join: '\n' }, { id: 'comment', label: 'First comment', limit: s(5000, BUFFER_CHARS), join: '\n' }],
    video: { min: s(3, BUFFER_VIDEO), max: s(90, BUFFER_VIDEO), bytes: s(1_000_000_000, BUFFER_VIDEO) },
    settings: ['caption', 'reel or post', 'first comment', 'AI info label'],
    buffer: { channel: true, sets: ['reel, post or story (type)', 'first comment', 'a link card'], cannot: ['the AI info label'], checked: CHECKED },
  },
  threads: {
    kind: 'threads', name: 'Threads', short: 'TH',
    // the reply (ASKS 58): the second post of a thread, which Buffer sends with the first (create_post's
    // metadata.threads.thread); a field with part "reply"
    parts: [{ id: 'text', label: 'Text', limit: s(500, BUFFER_CHARS), join: '\n' }, { id: 'reply', label: 'Reply', limit: s(500, BUFFER_CHARS), join: '\n', optional: true }],
    video: { max: s(300, BUFFER_VIDEO), bytes: s(1_000_000_000, BUFFER_VIDEO) },
    settings: ['text', 'topic', 'location', 'a thread of posts'],
    buffer: { channel: true, sets: ['a thread of posts', 'topic (50 characters)', 'location', 'a link card'], cannot: ['reels (a video goes as a post)', 'an AI label'], checked: CHECKED },
  },
  x: {
    kind: 'x', name: 'X', short: 'X',
    // the reply (ASKS 58): the second post of a thread, which Buffer sends with the first (create_post's
    // metadata.twitter.thread); a field with part "reply". Buffer cannot reply to a post already up
    parts: [{ id: 'text', label: 'Post', limit: s(280, X_CHARS), join: '\n' }, { id: 'reply', label: 'Reply', limit: s(280, X_CHARS), join: '\n', optional: true }],
    fold: about(280),
    video: { min: s(0.5, BUFFER_VIDEO), max: s(140, BUFFER_VIDEO), bytes: s(512_000_000, BUFFER_VIDEO) },
    settings: ['text', 'a thread of posts', 'AI-generated label', 'who can reply'],
    buffer: { channel: true, sets: ['AI-generated (isAiGenerated, original posts only)', 'a thread of posts'], cannot: ['who can reply'], checked: CHECKED },
  },
  linkedin: {
    kind: 'linkedin', name: 'LinkedIn', short: 'LI',
    parts: [{ id: 'text', label: 'Post', limit: s(3000, `${BUFFER_CHARS} (a link counts as 24)`), join: '\n' }, { id: 'comment', label: 'First comment', limit: s(1250, BUFFER_CHARS), join: '\n' }],
    fold: about(210),
    video: { bytes: s(1_000_000_000, BUFFER_VIDEO) },
    settings: ['text', 'first comment', 'mentions'],
    buffer: { channel: true, sets: ['first comment', 'mentions', 'a link card'], cannot: ['an AI label', 'the video at more than 720p (Buffer sends it at 1280×720 at most)'], checked: CHECKED },
  },
};

export const SOURCES = { BUFFER_CHARS, BUFFER_VIDEO, YT_LIMITS, YT_SHORTS, BUFFER_SCHEMA };

export const isKind = (v: unknown): v is PlatformKind => typeof v === 'string' && (PLATFORM_KINDS as string[]).includes(v);
export const factsOf = (kind: PlatformKind): PlatformFacts => PLATFORMS[kind];
/** A part of a platform by id, else its first. */
export const partOf = (kind: PlatformKind, id?: string): PartFacts => PLATFORMS[kind].parts.find((p) => p.id === id) ?? PLATFORMS[kind].parts[0];
/** What the platform calls the frame shown before the video plays, from its settings: "thumbnail" (YouTube), "cover
 *  frame" (TikTok), "cover" (Instagram); "cover frame" for one whose settings name none. */
export const coverWord = (kind: PlatformKind): string => PLATFORMS[kind].settings.find((x) => x === 'thumbnail' || x === 'cover frame' || x === 'cover') ?? 'cover frame';
/** "2,200", or "about 125" for a number not confirmed. */
export const numWords = (n: Sourced | undefined): string => (n ? `${n.unverified ? 'about ' : ''}${n.value.toLocaleString('en-GB')}` : '');
