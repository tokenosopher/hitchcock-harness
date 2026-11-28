// A film's frame: the picture size of its cut follows the aspect ratio its brief gives.
// One place for the sizes, the brief's words, and the rule for a cut whose stored size is not the brief's.
// Pure: used by the server (new cuts, the working cut, Alma's drops, the renders) and by the pages (the players' boxes).

export type Aspect = '9:16' | '16:9' | '21:9' | '1:1';
export const ASPECTS: readonly Aspect[] = ['9:16', '16:9', '21:9', '1:1'];

/** The frame of each aspect, the short side 1080 (H.264 wants even sides; 21:9 is 2520×1080 exactly). */
export const FRAMES: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '21:9': { width: 2520, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};
/** A film whose brief gives no aspect is 9:16, as every film was before. */
export const DEFAULT_ASPECT: Aspect = '9:16';

export const isAspect = (x: unknown): x is Aspect => typeof x === 'string' && (ASPECTS as readonly string[]).includes(x);

/** The frame size of a film from its aspect (9:16 for an unknown one). */
export function frameSize(aspect?: string | null): { width: number; height: number } {
  return { ...FRAMES[isAspect(aspect) ? aspect : DEFAULT_ASPECT] };
}

/** The aspect a brief gives: its "Aspect ratio: 16:9" line when it has one, else the first ratio it names. */
export function briefAspect(markdown: string): Aspect | undefined {
  const line = /^[\s>*-]*\**\s*aspect(?:\s+ratio)?\**\s*[:=]?\s*\**\s*(9:16|16:9|21:9|1:1)\b/im.exec(markdown);
  if (line) return line[1] as Aspect;
  const any = /(?<![\d:])(9:16|16:9|21:9)(?![\d:])/.exec(markdown);
  return any ? (any[1] as Aspect) : undefined;
}

export type Shape = 'portrait' | 'landscape' | 'square';
export const shapeOf = (w: number, h: number): Shape => (w > h ? 'landscape' : w < h ? 'portrait' : 'square');

/** The aspect a size reads as, when it is one of ours (within 1%). */
export function aspectOfSize(w: number, h: number): Aspect | undefined {
  if (!(w > 0 && h > 0)) return undefined;
  for (const a of ASPECTS) {
    const f = FRAMES[a];
    if (Math.abs(w / h - f.width / f.height) < 0.01 * (f.width / f.height)) return a;
  }
  return undefined;
}

/** "1920x1080" */
export const sizeWords = (f: { width: number; height: number }): string => `${f.width}x${f.height}`;

/** The CSS aspect-ratio of a film's picture: "9 / 16", "16 / 9" (the default 9:16). */
export const cssAspect = (aspect?: string | null): string => {
  const f = frameSize(aspect);
  return `${f.width} / ${f.height}`;
};
/** Is the film's picture wider than tall? */
export const isWide = (aspect?: string | null): boolean => {
  const f = frameSize(aspect);
  return f.width > f.height;
};

// ---- a cut whose stored size is not the brief's

interface CutLike { width: number; height: number; tracks: { kind: string; clips: { src?: string }[] }[] }

export type FrameRule =
  | { kind: 'same' }                                                           // the cut is the brief's size (or the brief gives none)
  | { kind: 'adopt'; width: number; height: number; words: string }            // no picture to keep: the cut takes the brief's size
  | { kind: 'ask'; width: number; height: number; stored: Shape; brief: Aspect; words: string }; // pictures in another shape: the user decides

/** The words of the history step that changes the size. */
export const frameStepWords = (f: { width: number; height: number }): string => `frame size set to ${sizeWords(f)} from the brief`;

/** What to do with a cut whose size is not the brief's. Only the brief's own aspect counts (undefined: nothing to do).
 *  `adopt` when the cut has no picture clips, or none whose source (by `sizeOf`, when known) is in the stored shape;
 *  `ask` when it has. The same size already, or the same shape and ratio, is `same`. */
export function frameRule(cut: CutLike, aspect: Aspect | undefined, sizeOf?: (src: string) => { width: number; height: number } | undefined): FrameRule {
  if (!aspect) return { kind: 'same' };
  const want = frameSize(aspect);
  if (cut.width === want.width && cut.height === want.height) return { kind: 'same' };
  // a cut of another size in the same ratio (480x854, a sample) is not a disagreement
  if (aspectOfSize(cut.width, cut.height) === aspect) return { kind: 'same' };
  const stored = shapeOf(cut.width, cut.height);
  const pics = cut.tracks.filter((t) => t.kind === 'video').flatMap((t) => t.clips).filter((c) => typeof c.src === 'string' && c.src);
  const inStored = pics.filter((c) => {
    const s = sizeOf?.(c.src!);
    return !s || shapeOf(s.width, s.height) === stored;      // a picture of unknown size counts as the cut's shape
  });
  if (!inStored.length) return { kind: 'adopt', ...want, words: frameStepWords(want) };
  return { kind: 'ask', ...want, stored, brief: aspect, words: `The brief says ${aspect} but this cut is ${aspectOfSize(cut.width, cut.height) ?? sizeWords(cut)}` };
}

/** The frame the pages show for a cut: the brief's when the cut would take it at the next write, else the cut's own. */
export function shownFrame(cut: CutLike, aspect: Aspect | undefined): { width: number; height: number } {
  const r = frameRule(cut, aspect);
  return r.kind === 'adopt' ? { width: r.width, height: r.height } : { width: cut.width, height: cut.height };
}

/** Alma's drop may carry `aspect` ("16:9") or `width` and `height`: the size it asks for, or the problems. */
export function dropFrame(d: { aspect?: unknown; width?: unknown; height?: unknown }, maxSide: number): { frame?: { width: number; height: number }; problems: string[] } {
  const p: string[] = [];
  if (d.aspect !== undefined) {
    if (!isAspect(d.aspect)) p.push(`aspect must be one of ${ASPECTS.join(', ')}`);
    if (d.width !== undefined || d.height !== undefined) p.push('give aspect or width and height, not both');
    return p.length ? { problems: p } : { frame: frameSize(d.aspect as Aspect), problems: [] };
  }
  if (d.width === undefined && d.height === undefined) return { problems: [] };
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 16 && n <= maxSide && n % 2 === 0;
  if (!ok(d.width) || !ok(d.height)) p.push(`width and height must both be even whole numbers from 16 to ${maxSide}`);
  return p.length ? { problems: p } : { frame: { width: d.width as number, height: d.height as number }, problems: [] };
}

/** What a page writes in `data-frame` for the boxes under it to follow (WIDE below): "wide" for a landscape frame,
 *  nothing for a portrait one, so a 9:16 film's pages are exactly as they were. */
export const frameShape = (f: { width: number; height: number }): 'wide' | undefined => (f.width > f.height ? 'wide' : undefined);
/** The Tailwind variant of a box under a landscape film's `data-frame="wide"`. */
export const WIDE = '[[data-frame=wide]_&]';
/** The style of a box that shows a film's picture: its aspect, for a film that is not 9:16 (a 9:16 box keeps its own
 *  class and gets no style, so it is drawn exactly as before). */
export const aspectStyle = (aspect?: string | null): { aspectRatio: string } | undefined => (isAspect(aspect) && aspect !== '9:16' ? { aspectRatio: cssAspect(aspect) } : undefined);
