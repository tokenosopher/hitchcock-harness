// The fallback of Option-click: anything on any page can be picked for Alma's message. When no source and no mark names
// the thing clicked, the nearest meaningful block above it goes into the message as words: a card, a row, a list item,
// a labelled section, a button, a link, a paragraph, a heading, a field (its label and its value). Never the page
// itself, never a bare span inside a sentence, never the page's chrome (the header bar, anything marked
// data-ref-chrome; the films list and Alma's column are outside <main> and never reached).
//
// Pure: it reads elements through the few members below, so the unit test can hand it plain objects.

/** What the walk reads of an element (a DOM Element has all of it). */
export interface BlockEl {
  tagName: string;
  parentElement: BlockEl | null;
  previousElementSibling: BlockEl | null;
  getAttribute(name: string): string | null;
  /** The visible words (HTMLElement.innerText); `textContent` when there is none. */
  innerText?: string;
  textContent: string | null;
  /** A field's value. */
  value?: string;
  /** For a heading search inside a block. */
  querySelector?(sel: string): BlockEl | null;
}

export interface Block {
  el: BlockEl;
  label: string;
  words: string;
  section?: string;
}

export const WORDS_MAX = 600;
const LABEL_WORDS = 6;
const HEADING = /^H[1-6]$/;
// the blocks a click can take, by tag
const BLOCK_TAGS = new Set(['ARTICLE', 'LI', 'TR', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT',
  'LABEL', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'DT', 'DD', 'SUMMARY', 'DETAILS', 'FIELDSET', 'TD', 'TH', 'OPTION']);
// and by role
const BLOCK_ROLES = new Set(['button', 'link', 'radio', 'checkbox', 'switch', 'option', 'listitem', 'row', 'textbox', 'tab', 'menuitem',
  'dialog', 'alertdialog', 'region', 'article', 'group', 'radiogroup', 'listbox', 'img', 'figure', 'note', 'status', 'alert']);
// where the walk gives up: the page itself
const STOP_TAGS = new Set(['MAIN', 'BODY', 'HTML']);
const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const squash = (s: string) => s.replace(/[\s  ]+/g, ' ').trim();
export const capWords = (s: string, max = WORDS_MAX): string => {
  const t = squash(s);
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
/** "Reddit First comment option b" from a longer run of words: about six words. */
export function firstWords(s: string, n = LABEL_WORDS): string {
  const w = squash(s).split(' ').filter(Boolean);
  if (!w.length) return '';
  const head = w.slice(0, n).join(' ');
  const cut = head.length > 48 ? `${head.slice(0, 47).replace(/\s+\S*$/, '')}` : head;
  return w.length > n || cut !== head ? `${cut}…` : cut;
}

const textOf = (el: BlockEl): string => squash(el.innerText ?? el.textContent ?? '');
const classOf = (el: BlockEl) => el.getAttribute('class') ?? '';
const attr = (el: BlockEl, n: string) => { const v = el.getAttribute(n); return v && v.trim() ? v.trim() : undefined; };

/** A div drawn as a card (the app's rounded, bordered boxes) counts as a block. */
const looksLikeCard = (el: BlockEl): boolean => {
  const c = classOf(el);
  return /(^|\s)rounded(-|\s|$)/.test(c) && /(^|\s)border(\s|$|-(edge|line|sub|dashed|warn))/.test(c);
};

/** Chrome: never picked, and nothing inside it is. */
export function isChrome(el: BlockEl): boolean {
  return el.getAttribute('data-ref-chrome') !== null || el.getAttribute('data-ref-skip') !== null || el.getAttribute('data-ref-card') !== null;
}

function isBlock(el: BlockEl): boolean {
  if (BLOCK_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute('role');
  if (role && BLOCK_ROLES.has(role)) return true;
  if (el.tagName === 'SECTION' || el.tagName === 'NAV' || el.tagName === 'FORM') return !!(attr(el, 'aria-label') || attr(el, 'aria-labelledby'));
  if (attr(el, 'aria-label') && el.tagName !== 'SPAN' && el.tagName !== 'svg' && el.tagName !== 'SVG') return true;
  if (el.tagName === 'DIV' && looksLikeCard(el)) return true;
  return false;
}

/** The field's name: its aria-label, its placeholder, or the label around it. */
function fieldLabel(el: BlockEl): string | undefined {
  const own = attr(el, 'aria-label') ?? attr(el, 'placeholder') ?? attr(el, 'title') ?? attr(el, 'name');
  if (own) return own;
  for (let p = el.parentElement; p && !STOP_TAGS.has(p.tagName); p = p.parentElement) {
    if (p.tagName === 'LABEL') return firstWords(textOf(p)) || undefined;
  }
  return undefined;
}

/** The block's own heading inside it, when it has one. */
function headingIn(el: BlockEl): string | undefined {
  if (HEADING.test(el.tagName)) return undefined;
  const h = el.querySelector?.('h1, h2, h3, h4, h5, h6, [data-title]');
  const t = h ? textOf(h) : '';
  return t ? firstWords(t) : undefined;
}

/** The heading of the section the block sits in: a heading before it at its level or any level above, or a labelled
 *  section around it. */
export function sectionOf(el: BlockEl): string | undefined {
  for (let a: BlockEl | null = el; a && !STOP_TAGS.has(a.tagName); a = a.parentElement) {
    for (let s = a.previousElementSibling; s; s = s.previousElementSibling) {
      if (HEADING.test(s.tagName)) { const t = textOf(s); if (t) return firstWords(t, 8); }
      const lbl = s.getAttribute('class')?.split(/\s+/).includes('lbl') ? textOf(s) : '';
      if (lbl) return firstWords(lbl, 8);
    }
    const p = a.parentElement;
    if (p && p !== el && (p.tagName === 'SECTION' || p.getAttribute('role') === 'region')) {
      const l = attr(p, 'aria-label');
      if (l) return firstWords(l, 8);
    }
  }
  return undefined;
}

/** The block a click on `target` takes, with its label, its words and its section; undefined for chrome, for the page
 *  itself, and for a block with no words at all. `selected`: the words the user has selected inside the block, used as
 *  its words instead. */
export function blockAt(target: BlockEl | null, selected?: (el: BlockEl) => string | undefined): Block | undefined {
  let found: BlockEl | undefined;
  for (let el = target; el; el = el.parentElement) {
    if (STOP_TAGS.has(el.tagName)) break;
    if (isChrome(el)) return undefined;
    if (!found && isBlock(el) && (textOf(el) || attr(el, 'aria-label') || (FIELD_TAGS.has(el.tagName) && (el.value || fieldLabel(el))))) found = el;
  }
  // reached the top without passing through <main>: not part of a page (a portal, the thread)
  let inMain = false;
  for (let el = target; el; el = el.parentElement) if (el.tagName === 'MAIN') { inMain = true; break; }
  if (!found || !inMain) return undefined;
  const el = found;
  const field = FIELD_TAGS.has(el.tagName);
  const sel = selected?.(el);
  const own = field ? fieldLabel(el) : undefined;
  const words = sel ? capWords(sel) : field ? capWords(el.value ?? '') : capWords(textOf(el));
  const named = field ? own : attr(el, 'aria-label') ?? headingIn(el);
  const label = sel ? `“${firstWords(sel)}”` : firstWords(named ?? textOf(el)) || firstWords(words) || el.tagName.toLowerCase();
  const section = sectionOf(el);
  return { el, label, words: field && own ? (words ? `${own}: ${words}` : own) : words, ...(section && section !== label ? { section } : {}) };
}
