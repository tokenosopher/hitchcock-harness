// npm run refs:test
// References in the message's words: src/lib/refs.ts (the <harness-ref/> tag Alma reads and
// the draft in the message box, where each chip is a token), src/components/lib/refPick.ts (where a reference lives in
// the app, the page's marks and sources) and src/components/shell/refItems.ts (the @ list). Checked: how a reference is
// written into the message and read back, its escaping, several references and references beside plain words, what is
// refused, the box's edits that take a touched chip out whole, and the @ list's order. Pure: no browser; the one
// function that walks the page (resolveRefAt) is given plain objects for its elements. One line per check, a summary
// line, exit 1 when any check fails.
import {
  chipSpans, draftForAlma, draftHasRefs, draftMarkup, draftParts, draftPlain, editParts, hasRefTags, insertRef, isRefKind, isRefPart,
  newRefKey, refKindWords, refTag, refTagsAsWords, refTimecode, shownLabel, snapCaret, splitRefTags, tokenOf, type DraftPart, type InlineRef,
} from '../src/lib/refs';
import { goOnPage, momentRef, refData, refHref, registerRefSource, resolveRefAt, sourceItems } from '../src/components/lib/refPick';
import { allItems, cardRefOf, filterItems, matchIn, sceneRefOf, shotRefOf, stateItems, takeRefLabel, type RefItem } from '../src/components/shell/refItems';
import { day1SampleState } from '../src/fixtures/day1';
import type { FeedCard, FilmState } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- the tag Alma reads: the recipe's own example (recipes/show.md, "References in the user's words")
const clip: InlineRef = {
  // given out of order: the tag's order is fixed
  file: 'assets/films/the-lighthouse/generations/S6/takes/take1/S6-take1-480p.mp4', to: 17.6, from: 12.6, length: 5,
  kind: 'clip', label: 'S6 · take 1 · shot 4', scene: 'S6', shot: 4, take: 'take 1', track: 'V1', clip: 's6-take~4', cut: 'v33', rev: 412,
  at: '00:01:56:10', sec: 116.41666666, frame: 2794,
};
const CLIP_TAG = '<harness-ref kind="clip" label="S6 · take 1 · shot 4" scene="S6" shot="4" take="take 1" track="V1" clip="s6-take~4" cut="v33" rev="412" at="00:01:56:10" sec="116.417" frame="2794" length="5" from="12.6" to="17.6" file="assets/films/the-lighthouse/generations/S6/takes/take1/S6-take1-480p.mp4"/>';
ok('tag: a clip written as the recipe shows it, the attributes in their fixed order, seconds to three places', refTag(clip) === CLIP_TAG, refTag(clip));
const moment: InlineRef = { kind: 'moment', label: '00:01:52:10 · v33', cut: 'v33', edited: true, rev: 412, at: '00:01:52:10', frame: 2698, track: 'V1', clip: 's6-take~3', file: 'x/S6-take1-480p.mp4', from: 9.9166666, title: 'S6 · take 1 · shot 3' };
const MOMENT_TAG = '<harness-ref kind="moment" label="00:01:52:10 · v33" track="V1" clip="s6-take~3" cut="v33" edited="yes" rev="412" at="00:01:52:10" frame="2698" from="9.917" file="x/S6-take1-480p.mp4" title="S6 · take 1 · shot 3"/>';
ok('tag: a moment, "edited" written as yes', refTag(moment) === MOMENT_TAG, refTag(moment));
ok('tag: what is not there is not written (unset, empty, edited false); a zero is', refTag({ kind: 'moment', label: 'm', edited: false, scene: '', frame: 0, sec: 0 }) === '<harness-ref kind="moment" label="m" sec="0" frame="0"/>', refTag({ kind: 'moment', label: 'm', edited: false, scene: '', frame: 0, sec: 0 }));
ok('tag: a field the shape does not know is not written', refTag({ kind: 'scene', label: 'S1', colour: 'red' } as unknown as InlineRef) === '<harness-ref kind="scene" label="S1"/>');

// escaping
const tricky: InlineRef = { kind: 'card', label: 'Say "no" <now> & then', card: 'ASK-1', title: 'two\nlines\tand  spaces', place: 'a/>b' };
const trickyTag = refTag(tricky);
ok('escape: quotes, angle brackets and ampersands', trickyTag.includes('label="Say &quot;no&quot; &lt;now&gt; &amp; then"') && trickyTag.includes('place="a/&gt;b"'), trickyTag);
ok('escape: line breaks and runs of spaces become one space, so the tag stays on one line', trickyTag.includes('title="two lines and spaces"') && !/[\n\t]/.test(trickyTag), trickyTag);
const back = splitRefTags(`see ${trickyTag} here`);
ok('escape: read back as written (a "/>" in a value does not end the tag)', back.length === 3 && eq(back[1], { kind: 'card', label: 'Say "no" <now> & then', card: 'ASK-1', place: 'a/>b', title: 'two lines and spaces' }), back);
const amp = splitRefTags(refTag({ kind: 'scene', label: 'S1 &quot; &amp;lt;', scene: 'S1' }));
ok('escape: a label that reads like an escape comes back as written', (amp[0] as InlineRef).label === 'S1 &quot; &amp;lt;', amp);

// read back
const words = `Now ${refTag(clip)} after ${refTag(moment)}, and hold it to the wave`;
const parts = splitRefTags(words);
ok('read: words and references in order', parts.length === 5 && parts[0] === 'Now ' && parts[2] === ' after ' && parts[4] === ', and hold it to the wave', parts.map((p) => (typeof p === 'string' ? p : `[${p.kind}]`)));
ok('read: each reference comes back whole, numbers as numbers, "yes" as true', eq(parts[1], { kind: 'clip', label: clip.label, scene: 'S6', shot: 4, take: 'take 1', track: 'V1', clip: 's6-take~4', cut: 'v33', rev: 412, at: '00:01:56:10', sec: 116.417, frame: 2794, length: 5, from: 12.6, to: 17.6, file: clip.file })
  && (parts[3] as InlineRef).edited === true && (parts[3] as InlineRef).frame === 2698, [parts[1], parts[3]]);
ok('read: two references side by side, and a reference alone', splitRefTags(refTag(clip) + refTag(moment)).length === 2 && splitRefTags(refTag(clip)).length === 1 && typeof splitRefTags(refTag(clip))[0] !== 'string');
ok('read: plain words are one piece; nothing is nothing', eq(splitRefTags('just words'), ['just words']) && eq(splitRefTags(''), []));
ok('read: the words alone, each reference by its label', refTagsAsWords(words) === 'Now S6 · take 1 · shot 4 after 00:01:52:10 · v33, and hold it to the wave', refTagsAsWords(words));
ok('read: whether a text has tags', hasRefTags(words) && !hasRefTags('a harness-ref without its bracket') && !hasRefTags(''));

// refused
const refused = [
  '<harness-ref kind="song" label="x"/>',                 // a kind the shape does not have
  '<harness-ref kind="clip"/>',                           // no label
  '<harness-ref kind="clip" label=""/>',                  // an empty label
  '<harness-ref kind="clip" label="x">',                  // not closed
  '<harness-reference kind="clip" label="x"/>',           // another tag
];
ok('refused: an unknown kind, no label, an empty label, a tag not closed, another tag: left as the words they are', refused.every((t) => eq(splitRefTags(`a ${t} b`), [`a ${t} b`])), refused.map((t) => splitRefTags(`a ${t} b`).length));
const mixed = splitRefTags(`x ${refused[0]} y ${refTag({ kind: 'scene', label: 'S2', scene: 'S2' })} z`);
ok('refused: a refused tag stays in the words before the good one', mixed.length === 3 && mixed[0] === `x ${refused[0]} y ` && (mixed[1] as InlineRef).label === 'S2' && mixed[2] === ' z', mixed);
const odd = splitRefTags('<harness-ref kind="take" label="S1 · take 1" colour="red" shot="four" rev="1e2" edited="no" scene="S1"/>')[0] as InlineRef;
ok('refused: an unknown attribute is dropped, a number that is not one is dropped, edited "no" is false', eq(odd, { kind: 'take', label: 'S1 · take 1', rev: 100, edited: false, scene: 'S1' }), odd);
ok('kinds: the ten kinds and nothing else', ['moment', 'clip', 'panel', 'scene', 'shot', 'take', 'card', 'character', 'view', 'location'].every(isRefKind) && ![undefined, null, 3, 'song', 'Clip', ''].some(isRefKind));

// ---- the draft in the message box
const A: InlineRef = { kind: 'scene', label: 'S1', scene: 'S1' };
const B: InlineRef = { kind: 'take', label: 'FIX-chair S6 · take 1', scene: 'S6', take: 'FIX-chair-S6' };
ok('draft: a token is the key between two private-use marks', tokenOf('k1') === 'k1');
ok('draft: a chip shows as one unbreakable word, a narrow space each end', shownLabel(B.label) === ' FIX‑chair S6 · take 1 ', [...shownLabel(B.label)].map((c) => c.charCodeAt(0).toString(16)));
const d0 = draftParts(`Look at ${tokenOf('a')} and ${tokenOf('gone')}here`, { a: A });
ok('draft: a token whose chip is unknown is dropped and the words beside it joined', eq(d0, [{ text: 'Look at ' }, { key: 'a', ref: A }, { text: ' and here' }]), d0);
const SA = shownLabel('S1');
ok('draft: what the box shows, the draft string again, what Alma receives', draftPlain(d0) === `Look at ${SA} and here` && draftMarkup(d0) === `Look at ${tokenOf('a')} and here` && draftForAlma(d0) === `Look at ${refTag(A)} and here`, [draftPlain(d0), draftForAlma(d0)]);
ok('draft: Alma\'s words read back to the same words and chip', eq(splitRefTags(draftForAlma(d0)), ['Look at ', A, ' and here']));
ok('draft: whether it has chips', draftHasRefs(d0) && !draftHasRefs([{ text: 'x' }]) && isRefPart(d0[1]) && !isRefPart(d0[0]));
ok('draft: a chip\'s place in the shown text', eq(chipSpans(d0).map((s) => [s.key, s.start, s.end]), [['a', 8, 12]]), chipSpans(d0));

// edits: the box's words changed, with the cursor after the change
const P: DraftPart[] = [{ text: 'Look at ' }, { key: 'a', ref: A }, { text: ' now' }];
const plain = draftPlain(P);                                         // "Look at |S1| now", the chip at 8 to 12
const shown = (r: { parts: DraftPart[]; caret: number }) => ({ words: draftMarkup(r.parts).replace(//g, '[').replace(//g, ']'), caret: r.caret });
ok('edit: nothing changed, the same draft', editParts(P, plain, 5).parts === P);
ok('edit: a letter typed at the end keeps the chip', eq(shown(editParts(P, `${plain}!`, 17)), { words: 'Look at [a] now!', caret: 17 }), shown(editParts(P, `${plain}!`, 17)));
ok('edit: a letter typed right after the chip goes beside it', eq(shown(editParts(P, `${plain.slice(0, 12)}X${plain.slice(12)}`, 13)), { words: 'Look at [a]X now', caret: 13 }), shown(editParts(P, `${plain.slice(0, 12)}X${plain.slice(12)}`, 13)));
ok('edit: a letter typed right before the chip goes beside it', eq(shown(editParts(P, `${plain.slice(0, 8)}S${plain.slice(8)}`, 9)), { words: 'Look at S[a] now', caret: 9 }), shown(editParts(P, `${plain.slice(0, 8)}S${plain.slice(8)}`, 9)));
ok('edit: a backspace into the chip takes it out whole', eq(shown(editParts(P, plain.slice(0, 11) + plain.slice(12), 11)), { words: 'Look at  now', caret: 8 }), shown(editParts(P, plain.slice(0, 11) + plain.slice(12), 11)));
ok('edit: a letter typed inside the chip takes the chip out and keeps the letter', eq(shown(editParts(P, `${plain.slice(0, 10)}Z${plain.slice(10)}`, 11)), { words: 'Look at Z now', caret: 9 }), shown(editParts(P, `${plain.slice(0, 10)}Z${plain.slice(10)}`, 11)));
ok('edit: words typed over a selection across the chip replace it', eq(shown(editParts(P, 'Look X now', 6)), { words: 'Look X now', caret: 6 }), shown(editParts(P, 'Look X now', 6)));
ok('edit: everything cleared', eq(editParts(P, '', 0).parts, []));
// the changed stretch is found from the cursor: a letter that repeats its neighbour is placed where it was typed
const aa: DraftPart[] = [{ text: 'a' }, { key: 'a', ref: A }];
ok('edit: a letter typed after the same letter: the cursor after it, the chip kept', eq(shown(editParts(aa, `aa${SA}`, 2)), { words: 'aa[a]', caret: 2 }), shown(editParts(aa, `aa${SA}`, 2)));
ok('edit: one of two same letters deleted: the cursor stays where it was', eq(shown(editParts([{ text: 'aa' }, { key: 'a', ref: A }], `a${SA}`, 1)), { words: 'a[a]', caret: 1 }), shown(editParts([{ text: 'aa' }, { key: 'a', ref: A }], `a${SA}`, 1)));
const two: DraftPart[] = [{ text: 'a ' }, { key: 'a', ref: A }, { text: ' b ' }, { key: 'b', ref: B }, { text: ' c' }];
const twoPlain = draftPlain(two), bAt = chipSpans(two)[1];
ok('edit: a deletion in the second chip keeps the first', eq(shown(editParts(two, twoPlain.slice(0, bAt.end - 1) + twoPlain.slice(bAt.end), bAt.end - 1)), { words: 'a [a] b  c', caret: bAt.start }), shown(editParts(two, twoPlain.slice(0, bAt.end - 1) + twoPlain.slice(bAt.end), bAt.end - 1)));

// a chip put in at the cursor
const ins = (ps: DraftPart[], s: number, e: number) => shown(insertRef(ps, s, e, 'n', B));
ok('insert: after a word, a space before and after it, the cursor after the second', eq(ins([{ text: 'Look at' }], 7, 7), { words: 'Look at [n] ', caret: 7 + 1 + shownLabel(B.label).length + 1 }), ins([{ text: 'Look at' }], 7, 7));
ok('insert: between spaces, no space added', eq(ins([{ text: 'Look at  now' }], 8, 8), { words: 'Look at [n] now', caret: 8 + shownLabel(B.label).length }), ins([{ text: 'Look at  now' }], 8, 8));
ok('insert: over a selection, in its place', eq(ins([{ text: 'Look at this now' }], 8, 12), { words: 'Look at [n] now', caret: 8 + shownLabel(B.label).length }), ins([{ text: 'Look at this now' }], 8, 12));
ok('insert: never inside a chip: a cursor inside one puts the new chip after it', eq(ins(P, 10, 10).words, 'Look at [a][n] now'), ins(P, 10, 10));
ok('insert: into an empty box', eq(ins([], 0, 0), { words: '[n] ', caret: shownLabel(B.label).length + 1 }), ins([], 0, 0));
ok('insert: the box keeps the chip by its key, and Alma receives its tag', draftForAlma(insertRef([{ text: 'Look at' }], 7, 7, 'n', B).parts) === `Look at ${refTag(B)} `);
ok('cursor: never inside a chip (forward after it, back before it); outside it, where it is', snapCaret(P, 10, true) === 12 && snapCaret(P, 10, false) === 8 && snapCaret(P, 8, true) === 8 && snapCaret(P, 12, false) === 12 && snapCaret(P, 3, true) === 3);
const ks = Array.from({ length: 50 }, newRefKey);
ok('keys: short, plain and each new', ks.every((k) => /^[0-9a-z]{1,7}$/.test(k)) && new Set(ks).size === 50, ks.slice(0, 3));

// words
ok('timecode: the app\'s own (hours, minutes, seconds, frames)', refTimecode(112.4166, 24) === '00:01:52:10' && refTimecode(3725.5, 25) === '01:02:05:13' && refTimecode(-3, 24) === '00:00:00:00', [refTimecode(112.4166, 24), refTimecode(3725.5, 25)]);
ok('kind in words: a shot of a take, a shot, a painted view', refKindWords({ kind: 'shot', label: 'x', take: 'take 1' }) === 'A shot of a take' && refKindWords({ kind: 'shot', label: 'x' }) === 'A shot' && refKindWords({ kind: 'view', label: 'x' }) === 'A painted view');

// ---- where a reference lives in the app (refPick.ts)
const F = 'the-lighthouse';
const hrefs: [InlineRef, string][] = [
  [{ kind: 'moment', label: 'm', frame: 2698.4 }, '/films/the-lighthouse/edit?at=2698'],
  [{ kind: 'clip', label: 'c' }, '/films/the-lighthouse/edit'],
  [{ kind: 'take', label: 't', scene: 'S6', take: 'take 1' }, '/films/the-lighthouse/scenes/S6?take=take%201'],
  [{ kind: 'take', label: 't' }, '/films/the-lighthouse/scenes'],
  [{ kind: 'shot', label: 's', scene: 'S6', shot: 3 }, '/films/the-lighthouse/scenes/S6'],
  [{ kind: 'character', label: 'c', character: 'C08' }, '/films/the-lighthouse/character/C08'],
  [{ kind: 'view', label: 'v', location: 'L01' }, '/films/the-lighthouse/locations'],
  [{ kind: 'card', label: 'k', place: 'previz' }, '/films/the-lighthouse?open=previz'],
  [{ kind: 'card', label: 'k', place: 'voices' }, '/films/the-lighthouse/character/voices'],
  [{ kind: 'card', label: 'k', place: 'edit' }, '/films/the-lighthouse/edit'],
  [{ kind: 'card', label: 'k', place: 'somewhere' }, '/films/the-lighthouse?open=gate'],
];
const hrefBad = hrefs.filter(([r, h]) => refHref(F, r) !== h).map(([r]) => [r, refHref(F, r)]);
ok('where: a moment and a clip on the Edit page (at their frame), a take, a shot, a character, a view, a card by its place', !hrefBad.length, hrefBad);
ok('marks: a page marks a thing with the reference as JSON, read back the same', eq(JSON.parse(refData(clip)['data-ref']), clip));

// the page's marks and sources, walked up from what was clicked (plain objects as the elements)
class El {
  constructor(private attrs: Record<string, string>, public parentElement: El | null) {}
  getAttribute(k: string): string | null { return this.attrs[k] ?? null; }
}
const body = new El({ 'data-ref': JSON.stringify(A) }, null);
Object.assign(globalThis, { Element: El, document: { body } });
const markedRow = new El(refData(B), body);
const badMarks = [new El({ 'data-ref': '{not json' }, markedRow), new El({ 'data-ref': JSON.stringify({ kind: 'song', label: 'x' }) }, markedRow), new El({ 'data-ref': JSON.stringify({ kind: 'clip', label: '' }) }, markedRow)];
const leaf = new El({}, badMarks[0]);
ok('page: a click finds the nearest mark above it', eq(resolveRefAt(leaf as unknown as EventTarget), B), resolveRefAt(leaf as unknown as EventTarget));
ok('page: a mark that is not JSON, of an unknown kind or with no label is passed over', badMarks.every((m) => eq(resolveRefAt(new El({}, m) as unknown as EventTarget), B)));
ok('page: the walk stops at the body; what is not an element names nothing', resolveRefAt(new El({}, body) as unknown as EventTarget) === undefined && resolveRefAt(null) === undefined && resolveRefAt({} as EventTarget) === undefined);
const shotRef: InlineRef = { kind: 'shot', label: 'S6 · shot 3', scene: 'S6', shot: 3 };
const off = registerRefSource({
  resolve: (el) => ((el as unknown) === markedRow ? shotRef : undefined),
  moment: () => moment,
  items: () => [{ group: 'Clips on the timeline · v33', ref: clip }],
  go: (r) => r.kind === 'clip',
});
ok('page: a source that knows the element comes before its mark', eq(resolveRefAt(leaf as unknown as EventTarget), shotRef));
ok('page: the playhead\'s moment, the page\'s own items, going to a thing', eq(momentRef(), moment) && sourceItems().length === 1 && goOnPage(clip) && !goOnPage(A));
const s1 = day1SampleState('sample-day1-takes')!;
const list = allItems(s1);
ok('@ list: the playhead first, then the page\'s own, then the film\'s', list[0].group === 'The playhead' && list[0].sub === moment.title && list[1].ref === clip && list[2].group === 'Scenes', list.slice(0, 3).map((x) => x.group));
off();
ok('page: once the page goes, its source goes with it', momentRef() === undefined && sourceItems().length === 0 && !goOnPage(clip) && eq(resolveRefAt(leaf as unknown as EventTarget), B) && allItems(s1)[0].group === 'Scenes');

// ---- the @ list (refItems.ts)
ok('names: a take in the references\' words, a fix\'s take by its own id', takeRefLabel('S6', 'take1') === 'S6 · take 1' && takeRefLabel('S6', 'pickup2') === 'S6 · pickup 2' && takeRefLabel('S6', 'FIX-chair-S6') === 'FIX-chair-S6', [takeRefLabel('S6', 'take1'), takeRefLabel('S6', 'pickup2')]);
const sc = s1.scenes[0];
ok('names: a scene and its shot', eq(sceneRefOf(sc), { kind: 'scene', label: 'S1', scene: 'S1', title: sc.title, length: sc.seconds }) && eq(shotRefOf(sc, 2), { kind: 'shot', label: 'S1 · shot 2', scene: 'S1', shot: 2 }), sceneRefOf(sc));
const longCard: FeedCard = { key: 'k-77', title: 'A question far longer than forty letters, asked at length', section: 'S', place: 'edit', ids: [], placed: 'guess', media: [] };
const cr = cardRefOf(longCard);
ok('names: a card by its id; without one, by its title cut to forty letters', cardRefOf({ ...longCard, id: 'ASK-9' }).label === 'ASK-9' && cr.label.length === 40 && cr.label.endsWith('…') && cr.card === 'k-77' && cr.place === 'edit' && cr.title === longCard.title, cr);
const items = stateItems(s1);
const firstOf = (g: string) => items.findIndex((x) => x.group.startsWith(g));
ok('@ list: the film\'s things in its order (scenes, shots, takes, characters, places)', [firstOf('Scenes'), firstOf('Shots of'), firstOf('Takes of'), firstOf('Characters'), firstOf('Places')].every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])), ['Scenes', 'Shots of', 'Takes of', 'Characters', 'Places'].map(firstOf));
const take1 = items.find((x) => x.ref.kind === 'take' && x.ref.scene === 'S1')!;
const take3 = items.find((x) => x.ref.kind === 'take' && x.ref.scene === 'S3')!;
ok('@ list: a take that has its file names it from the film repo; one being made has none', take1.ref.file === 'assets/films/sample-day1-takes/blocks/S1/takes/S1-grey-take1-480p.mp4' && take1.ref.label === 'S1 · take 1' && !take3.ref.file, [take1.ref, take3.ref]);
const wcards = stateItems(day1SampleState('sample-day1-waiting')!).filter((x) => x.group === 'Cards');
ok('@ list: the cards that ask, by their ids', wcards.map((x) => x.ref.label).join() === 'ASK-boards-S1-S2-v2,ASK-C08-voice-r1,GO-S3-closer' && wcards.every((x) => x.ref.kind === 'card'), wcards.map((x) => x.ref.label));
const S1q = filterItems(items, 'S1');
ok('@ list: "@S1" lists the shots of S1 first, then its takes, then the scene', S1q.map((x) => x.ref.label).join() === 'S1 · shot 1,S1 · shot 2,S1 · shot 3,S1 · shot 4,S1 · take 1,S1', S1q.map((x) => x.ref.label));
const it = (group: string, label: string, o: Partial<InlineRef> = {}): RefItem => ({ group, ref: { kind: 'shot', label, ...o } });
const words6 = filterItems([it('Shots of S6', 'S6 · shot 1'), it('Takes of S6', 'FIX-chair-S6'), it('Shots of S16', 'S16 · shot 1')], 's6');
const inside = filterItems([it('Shots of S6', 'S6 · shot 1'), it('Shots of S16', 'S16 · shot 1')], 'hot');
ok('@ list: a word is found at the start of a word only ("s6" finds S6 and FIX-chair-S6, not S16; "hot" not inside "shot")', words6.map((x) => x.ref.label).join() === 'S6 · shot 1,FIX-chair-S6' && inside.length === 0, [words6.map((x) => x.ref.label), inside.length]);
const grey = filterItems([{ group: 'The playhead', ref: { kind: 'moment', label: '00:00:01:00 · v3', title: 'grey take' } }, it('Clips on the timeline · v3', 'grey take · S1')], 'grey');
ok('@ list: the things whose names match come before those that match only beside them', grey.map((x) => x.group).join() === 'Clips on the timeline · v3,The playhead', grey.map((x) => x.group));
const many = Array.from({ length: 20 }, (_, k) => it('Shots of S9', `S9 · shot ${k + 1}`));
const twelve = Array.from({ length: 12 }, (_, g) => Array.from({ length: 20 }, (_, k) => it(`Shots of S${g + 1}`, `S${g + 1} · shot ${k + 1}`))).flat();
ok('@ list: a few of each group when nothing is typed, more when something is, never more than forty', filterItems(many, '').length === 4 && filterItems(many, 'shot').length === 12 && filterItems(twelve, '').length === 40 && filterItems(items, 'zzz').length === 0);
ok('@ list: the typed word drawn in bold where it starts a word', eq(matchIn('S6 · shot 1', 'shot'), [5, 9]) && eq(matchIn('FIX-chair-S6', 's6 more'), [10, 12]) && matchIn('S16', 's6') === undefined && matchIn('S6', '  ') === undefined);
ok('@ list: an empty film state lists nothing', stateItems(undefined).length === 0 && stateItems({ ...s1, scenes: [], characters: [], locations: [], feed: undefined } as FilmState).length === 0);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
