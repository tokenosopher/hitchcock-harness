// npm run story-ref:test
// The Story page's "Alma" button (src/components/pages/storyRef.ts): the paragraphs of a story and where
// each starts, the one the caret is in, and the chip a tap puts in Alma's box: the paragraph, or only the words
// selected in it, with the exact words Alma reads, a long paragraph capped with ….
import { ABOUT_MAX, firstWords, paraAt, parasIn, storyParas, storyRef } from '../src/components/pages/storyRef';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const text = 'First, the hall.\n\n“My lord.”\n\n  \n\nEdda pulled the knot apart with her knife, and nobody spoke.\nThe rope fell.\n\n\nThe end. ';
const ps = storyParas(text);
ok('four paragraphs, a blank-only one skipped', ps.length === 4, ps.map((p) => p.text));
ok('numbered from 1', ps.map((p) => p.n).join() === '1,2,3,4');
ok('each start and end is its words in the text', ps.every((p) => text.slice(p.start, p.end) === p.text), ps);
ok('a paragraph keeps its single line breaks', ps[2].text === 'Edda pulled the knot apart with her knife, and nobody spoke.\nThe rope fell.');
ok('the trailing space is not part of the last one', ps[3].text === 'The end.');
ok('no text, no paragraphs', storyParas('').length === 0 && storyParas('\n\n  \n').length === 0);
ok('one paragraph without blank lines', storyParas('a\nb').length === 1);

ok('the caret inside ¶3', paraAt(ps, ps[2].start + 5)?.n === 3);
ok('the caret at the very start and end of ¶3', paraAt(ps, ps[2].start)?.n === 3 && paraAt(ps, ps[2].end)?.n === 3);
ok('the caret on a blank line between: none', paraAt(ps, ps[0].end + 1) === undefined);
ok('a selection over ¶2 and ¶3 touches both', parasIn(ps, ps[1].start + 2, ps[2].start + 4).map((p) => p.n).join() === '2,3');

ok('short words are kept whole', firstWords('The rope fell.') === 'The rope fell.');
ok('long words are cut at a word, with …', firstWords('Edda pulled the knot apart with her knife', 28) === 'Edda pulled the knot apart…', firstWords('Edda pulled the knot apart with her knife', 28));
ok('a cut drops the comma before …', firstWords('Edda pulled, the knot apart', 14) === 'Edda pulled…', firstWords('Edda pulled, the knot apart', 14));

const r = storyRef(text, ps[2], 'story/v3.md');
ok('the paragraph chip reads Story · ¶3 · its first words', r.chip.label === 'Story · ¶3 · Edda pulled the knot apart…', r.chip.label);
ok('its about holds the whole paragraph, word for word', r.about === `paragraph 3 of the story (story/v3.md), word for word: “${ps[2].text}”`, r.about);
ok('one chip per paragraph', r.chip.id === 'story:p3');
ok('the box asks about the paragraph', r.placeholder === 'Say something about this paragraph…');

const a = text.indexOf('the knot'), b = a + 'the knot apart'.length;
const s = storyRef(text, ps[2], 'story/v3.md', [a, b]);
ok('a selection in it: the chip carries only those words', s.chip.label === 'Story · “the knot apart”' && s.about === 'these words from paragraph 3 of the story (story/v3.md), word for word: “the knot apart”', s);
ok('and the box asks about the words', s.placeholder === 'Say something about these words…');
const x = storyRef(text, ps[2], 'story/v3.md', [ps[1].start, ps[2].start + 9]);
ok('a selection across paragraphs names them', /^these words from paragraphs 2 to 3 of the story/.test(x.about), x.about);
ok('a selection elsewhere: the paragraph', storyRef(text, ps[2], 'story/v3.md', [ps[0].start, ps[0].end]).chip.id === 'story:p3');
ok('an empty selection: the paragraph', storyRef(text, ps[2], 'story/v3.md', [a, a]).chip.id === 'story:p3');

const long = `${'word '.repeat(400)}end`;
const L = storyRef(long, storyParas(long)[0], 'story/v1.md');
const quoted = L.about.slice(L.about.indexOf('“') + 1, -1);
ok(`a long paragraph is capped at ${ABOUT_MAX} characters with …`, quoted.length <= ABOUT_MAX + 1 && quoted.endsWith('…') && !quoted.includes('end'), quoted.length);

console.log(bad ? `${bad} of ${n} failed` : `✓ all ${n} story-ref checks pass`);
process.exit(bad ? 1 : 0);
