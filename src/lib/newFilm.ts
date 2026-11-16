// A new film's setup (the New film form): the defaults taken at face value, the folder name and the
// short code made from the title, and the one setup line Alma is told. Shared by the Idea page and POST /api/films.

export type Ratio = '9:16' | '16:9';
export const RATIOS: Ratio[] = ['9:16', '16:9'];

export interface NewFilmSetup {
  ratio: Ratio;
  code: string;
  budgetCredits: number | null;
  voices: string;               // "Higgsfield voices"
  elements: string;             // "1920×1080, 5 s" (shown after "elements ")
  upscale: string;              // "Seedance 2.5" (shown after "1080p by ")
}

/** The setup defaults the user never gets asked about: only what differs is changed, in place. */
export const SETUP_DEFAULTS: Omit<NewFilmSetup, 'code'> = {
  ratio: '9:16',
  budgetCredits: 5000,
  voices: 'Higgsfield voices',
  elements: '1920×1080, 5 s',
  upscale: 'Seedance 2.5',
};

/** Slugs that are routes or thread keys of the harness itself, never a film folder. */
export const RESERVED_SLUGS = new Set(['new', 'library', 'settings']);

/** The folder name new_film.py wants: lower case with hyphens, made from the title ("The Quiet Room" → the-quiet-room). */
export function slugOf(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export const CODE_RE = /^[A-Z0-9]{2,6}$/;

/** The short code: the initials of the title's words (The Lighthouse Letter → TLL), 2 to 6 capitals or digits,
 *  made unique against the codes earlier films use by a digit at the end (TTF → TTF2). */
export function codeOf(title: string, taken: Iterable<string> = []): string {
  const words = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let base = words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('').slice(0, 6);
  if (base.length < 2) base = (words[0] ?? 'FILM').slice(0, 3).padEnd(2, 'X');
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const c = `${base.slice(0, 6 - String(n).length)}${n}`;
    if (!used.has(c)) return c;
  }
  return base;
}

/** The setup line's pieces, in order, as the page shows them and Alma reads them. */
export function setupParts(s: NewFilmSetup): string[] {
  return [
    s.ratio,
    `code ${s.code}`,
    s.budgetCredits ? `budget ${s.budgetCredits} credits` : 'no budget set',
    s.voices,
    `elements ${s.elements}`,
    `1080p by ${s.upscale}`,
  ];
}

export function setupLine(s: NewFilmSetup): string {
  return setupParts(s).join(' · ');
}
