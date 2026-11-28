// npm run refblock:test
// Option-click selects anything on any page: src/components/lib/refBlock.ts (the fallback's block, its
// label, words and section, chosen from the element clicked), the new kinds of src/lib/refs.ts written into the
// message and read back, refHref for them (src/components/lib/refPick.ts), pagePath, and the Release page's
// references (src/components/release/refs.ts). Pure: the elements are plain objects with the few members the walk
// reads. One line per check, a summary line, exit 1 when any check fails.
import { blockAt, capWords, firstWords, sectionOf, WORDS_MAX, type BlockEl } from '../src/components/lib/refBlock';
import { isRefKind, refKindWords, refTag, splitRefTags, type InlineRef } from '../src/lib/refs';
import { pagePath, refHref } from '../src/components/lib/refPick';
import { fieldRef, finalRef, noteRef, optionRef, platformRef, stepRef } from '../src/components/release/refs';
import type { Field, Platform } from '../src/components/release/file';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- a small page of plain objects
class El implements BlockEl {
  parentElement: El | null = null;
  previousElementSibling: El | null = null;
  kids: El[] = [];
  value?: string;
  constructor(public tagName: string, private attrs: Record<string, string> = {}, private own = '') {}
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
  get textContent(): string { return [this.own, ...this.kids.map((k) => k.textContent)].filter(Boolean).join(' '); }
  get innerText(): string { return this.textContent; }
  add(...kids: El[]): this {
    for (const k of kids) { k.parentElement = this; k.previousElementSibling = this.kids[this.kids.length - 1] ?? null; this.kids.push(k); }
    return this;
  }
  querySelector(sel: string): El | null {
    const tags = sel.split(',').map((x) => x.trim().toUpperCase());
    for (const k of this.kids) {
      if (tags.includes(k.tagName) || (tags.includes('[DATA-TITLE]') && k.getAttribute('data-title') !== null)) return k;
      const d = k.querySelector(sel);
      if (d) return d;
    }
    return null;
  }
}
const el = (tag: string, attrs: Record<string, string> = {}, own = '') => new El(tag, attrs, own);

const html = el('HTML'), body = el('BODY'), main = el('MAIN');
html.add(body); body.add(main);
// the header bar (chrome), a section with a heading and a card of a heading and a sentence, a list, a field, a long paragraph
const header = el('HEADER', { 'data-ref-chrome': '' }).add(el('A', {}, 'Release'));
const h2 = el('H2', {}, 'Where it goes');
const cardTitle = el('H3', {}, 'Reddit first comment, the long story of it');
const word = el('SPAN', {}, 'sentence');
const sentence = el('DIV', {}, 'A plain').add(word);
const card = el('DIV', { class: 'flex rounded-[10px] border border-edge px-3' }).add(cardTitle, sentence);
const plainDiv = el('DIV', { class: 'flex flex-col' }).add(card);
const li = el('LI', {}, 'Copy the title and post it');
const ol = el('OL').add(li);
const ta = el('TEXTAREA', { 'aria-label': 'Caption' }); ta.value = 'The words in the box';
const longP = el('P', {}, 'word '.repeat(400).trim());
const iconBtn = el('BUTTON', { 'aria-label': 'Show the films list' }).add(el('svg'));
const emptyDiv = el('DIV');
main.add(header, h2, plainDiv, ol, ta, longP, iconBtn, emptyDiv);
const thread = el('DIV'); body.add(thread);
const threadP = el('P', {}, 'Alma said this'); thread.add(threadP);

const b1 = blockAt(word);
ok('fallback: a bare span inside a sentence takes its card, not itself', b1?.el === card, b1 && { tag: b1.el.tagName, label: b1.label });
ok('fallback: the card is named by its own heading, about six words', b1?.label === 'Reddit first comment, the long story…', b1?.label);
ok('fallback: its words are its visible text; the section is the heading above it', b1?.words === 'Reddit first comment, the long story of it A plain sentence' && b1?.section === 'Where it goes', b1);
const b2 = blockAt(li);
ok('fallback: a list item is its own block, named by its first words', b2?.el === li && b2.label === 'Copy the title and post it' && b2.words === 'Copy the title and post it', b2 && { label: b2.label, words: b2.words });
const b3 = blockAt(ta);
ok('fallback: a field gives its label and its value', b3?.el === ta && b3.label === 'Caption' && b3.words === 'Caption: The words in the box', b3 && { label: b3.label, words: b3.words });
const b4 = blockAt(longP);
ok(`fallback: the words are capped at about ${WORDS_MAX} characters, cut at a word`, !!b4 && b4.words.length <= WORDS_MAX && b4.words.endsWith('…') && !b4.words.includes('wor…'), b4?.words.length);
const b5 = blockAt(iconBtn.kids[0]);
ok('fallback: a button with only an icon is named by its aria-label', b5?.el === iconBtn && b5.label === 'Show the films list', b5?.label);
ok('fallback: the header bar is chrome and gives nothing', blockAt(header.kids[0]) === undefined);
ok('fallback: outside <main> (the thread) gives nothing', blockAt(threadP) === undefined);
ok('fallback: a click on the page itself, or on an empty box, gives nothing', blockAt(main) === undefined && blockAt(emptyDiv) === undefined && blockAt(null) === undefined);
const b6 = blockAt(word, (x) => (x === card ? '  the selected   words ' : undefined));
ok('fallback: words selected inside the block are its words, and its label quotes them', b6?.words === 'the selected words' && b6.label === '“the selected words”', b6 && { label: b6.label, words: b6.words });
ok('words: about six of them, an ellipsis when cut', firstWords('one two three four five six seven') === 'one two three four five six…' && firstWords('short one') === 'short one' && firstWords('') === '');
ok('words: runs of spaces and no-break spaces squashed', capWords('a   b\n\nc') === 'a b c');
ok('section: a labelled section around the block', sectionOf(el('P').add()) === undefined && (() => { const s = el('SECTION', { 'aria-label': 'Sending it' }); const p = el('P', {}, 'x'); main.add(s); s.add(p); return sectionOf(p) === 'Sending it'; })());

// ---- the new kinds, written for Alma and read back
const kinds = ['platform', 'field', 'option', 'note', 'step', 'final', 'stage', 'voice', 'prompt', 'qc', 'finding', 'line', 'text'] as const;
ok('kinds: every new kind is known and has its words', kinds.every((k) => isRefKind(k) && refKindWords({ kind: k, label: 'x' }).length > 0));
const opt: InlineRef = { kind: 'option', label: 'Reddit · First comment · option b', platform: 'reddit', field: 'comment', option: 'c2', title: 'Say how it was made', page: 'release/reddit', words: 'Made in "Hitchcock" <harness> & more' };
const OPT_TAG = '<harness-ref kind="option" label="Reddit · First comment · option b" platform="reddit" field="comment" option="c2" title="Say how it was made" page="release/reddit" words="Made in &quot;Hitchcock&quot; &lt;harness&gt; &amp; more"/>';
ok('tag: an option written with its ids, its page and its words, escaped', refTag(opt) === OPT_TAG, refTag(opt));
ok('tag: read back whole', eq(splitRefTags(`this ${OPT_TAG} one`)[1], opt), splitRefTags(OPT_TAG));
const txt: InlineRef = { kind: 'text', label: 'Where it goes', page: 'release', section: 'Release', words: 'two\nlines', quote: 'two' };
const back = splitRefTags(refTag(txt))[0] as InlineRef;
ok('tag: the fallback\'s page, section, words and a quote come back (line breaks as one space)', back.kind === 'text' && back.page === 'release' && back.section === 'Release' && back.words === 'two lines' && back.quote === 'two', back);
const nums = splitRefTags(refTag({ kind: 'finding', label: 'QC · S1 · m3', item: 'm3', round: 2 }))[0] as InlineRef;
const line = splitRefTags(refTag({ kind: 'line', label: 'S2 · line 4', scene: 'S2', line: 4 }))[0] as InlineRef;
ok('tag: a round and a line number come back as numbers', nums.round === 2 && nums.item === 'm3' && line.line === 4, [nums, line]);

// ---- where each leads
const F = 'the-lighthouse';
const hrefs: [InlineRef, string][] = [
  [opt, '/films/the-lighthouse/release/reddit'],
  [{ kind: 'platform', label: 'X', platform: 'x' }, '/films/the-lighthouse/release/x'],
  [{ kind: 'final', label: 'The final' }, '/films/the-lighthouse/release'],
  [{ kind: 'stage', label: 'Locations', place: 'loc' }, '/films/the-lighthouse?open=loc'],
  [{ kind: 'voice', label: 'C01 · voice option 2' }, '/films/the-lighthouse/character/voices'],
  [{ kind: 'prompt', label: 'S3 · prompt v4', page: 'go' }, '/films/the-lighthouse/go'],
  [{ kind: 'text', label: 'x', page: 'release/tiktok' }, '/films/the-lighthouse/release/tiktok'],
  [{ kind: 'text', label: 'x', page: '?open=story' }, '/films/the-lighthouse?open=story'],
  [{ kind: 'text', label: 'x' }, '/films/the-lighthouse'],
  [{ kind: 'text', label: 'x', page: '/library' }, '/library'],
];
const hrefBad = hrefs.filter(([r, h]) => refHref(F, r) !== h).map(([r]) => [r.kind, refHref(F, r)]);
ok('where: the new kinds lead to their page', !hrefBad.length, hrefBad);
ok('page: the path under the film, the board\'s open step, the whole path outside a film',
  pagePath('/films/x/release/reddit') === 'release/reddit' && pagePath('/films/x') === '' && pagePath('/films/x/') === '' && pagePath('/films/x?open=story') === '?open=story'
  && pagePath('/library') === '/library' && pagePath('/films/new') === '/films/new',
  [pagePath('/films/x/release/reddit'), pagePath('/films/x/'), pagePath('/films/x?open=story')]);

// ---- the Release page's things
const field = { id: 'comment', label: 'First comment', text: 'Made with Seedance', candidates: [{ id: 'c1', text: 'One', does: 'Short' }, { id: 'c2', text: 'Two', does: 'Long' }] } as Field;
const p = { id: 'reddit', name: 'Reddit', account: 'u/zero', fields: [field] } as unknown as Platform;
ok('release: a platform', eq(platformRef(p), { kind: 'platform', label: 'Reddit', platform: 'reddit', title: 'Reddit from u/zero', page: 'release/reddit' }), platformRef(p));
ok('release: a box of one field, with its words', eq(fieldRef(p, [field], 'First comment', 'Made with Seedance'), { kind: 'field', label: 'Reddit · First comment', platform: 'reddit', field: 'comment', title: 'First comment', page: 'release/reddit', words: 'Made with Seedance' }));
ok('release: a box of several fields names them all', fieldRef(p, [field, { ...field, id: 'tags' }], 'Caption', '').field === 'comment + tags' && fieldRef(p, [field], 'x', '').words === undefined);
const o = optionRef(p, field, { id: 'c2', does: 'Long', text: 'Two' }, field.candidates);
ok('release: an option by its letter, with its does and whole text', o.label === 'Reddit · First comment · option b' && o.option === 'c2' && o.title === 'Long' && o.words === 'Two', o);
ok('release: the user\'s own words are "your text"', optionRef(p, field, { id: 'own', does: 'Your text', text: 'mine' }, field.candidates).label === 'Reddit · First comment · your text');
const nr = noteRef(p, field, { id: 'n1', at: '', text: 'Shorter reads better.', proposal: 'One line', actions: [] });
ok('release: a note of Alma\'s with her proposal in its words', nr.note === 'n1' && nr.label === 'Reddit · First comment · Alma’s note' && nr.words === 'Shorter reads better. Proposed: “One line”', nr);
const st = stepRef(p, 'title', 3, 'Copy the title and paste it', 'hand');
ok('release: a step by hand, its number and first words', st.label === 'Reddit · step 3 Copy the title and…' && st.step === 'title' && st.item === 'upload.hand' && st.words === 'Copy the title and paste it', st);
ok('release: a step after it posts, and a sending step', stepRef(p, 'tag', 1, 'Tag it', 'after').label === 'Reddit · after it posts, step 1 Tag it' && stepRef(p, 'sending-2', 2, 'Handed over', 'sending').item === 'send.sending.steps');
const fr = finalRef({ path: 'cut/renders/v12-master.mp4', version: 'v12', namedAt: '', name: 'Film - FINAL.mp4', companions: {} }, 'assets/films/x/cut/renders/v12-master.mp4');
ok('release: the final, its version, name and file', fr.kind === 'final' && fr.cut === 'v12' && fr.title === 'Film - FINAL.mp4' && fr.file === 'assets/films/x/cut/renders/v12-master.mp4' && fr.label === 'The final · master of v12', fr);

console.log(`\n${n - bad} of ${n} checks passed`);
if (bad) process.exit(1);
