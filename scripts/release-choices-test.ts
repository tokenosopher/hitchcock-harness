// npx tsx scripts/release-choices-test.ts
// A field's options on the platform page: which option is in use, the box's changes to it, the
// "Your text" option, the notes that only offered candidates, and the operations behind a tap, an edit, Save and
// Discard (pick, setText with `from` and `mine`, saveOption), on a shared field too. Pure: no server, nothing on disk.
import assert from 'node:assert/strict';
import { validateRelease, type ReleaseFile, type Field } from '../src/components/release/file';
import { applyOp, parseOp, type ReleaseOp } from '../src/components/release/ops';
import { changedFrom, chosenOf, noteReasons, OWN, ownOption, plainNote, typedField } from '../src/components/release/choices';
import { radiosRelease, RADIO_COMMENT, TODAY_NOW } from '../src/fixtures/release';

let n = 0;
const ok = (c: unknown, what: string) => { n++; assert.ok(c, what); };
const eq = <T>(a: T, b: T, what: string) => { n++; assert.deepEqual(a, b, what); };
const now = new Date(TODAY_NOW);
const yes = (f: ReleaseFile, op: ReleaseOp, what: string): ReleaseFile => {
  n++;
  const r = applyOp(f, op, now);
  if (!r.ok) assert.fail(`${what}: refused "${r.refused}"`);
  assert.deepEqual(validateRelease(r.file).problems, [], `${what}: the result checks out`);
  return r.file;
};
const fld = (f: ReleaseFile, pid: string, id: string): Field => f.platforms.find((p) => p.id === pid)!.fields.find((x) => x.id === id)!;
const cand = (ids: string[]) => ids.map((id) => ({ id, text: `text ${id}`, does: `does ${id}` }));

// ---- which option is in use
const base = { candidates: cand(['a', 'b']) };
eq(chosenOf({ ...base, text: '' }), undefined, 'an empty field has none');
eq(chosenOf({ ...base, text: 'text b', pick: 'b' }), 'b', 'the pick');
eq(chosenOf({ ...base, text: 'text b' }), 'b', 'the candidate with the very text (a note\'s button writes no pick)');
eq(chosenOf({ ...base, text: 'text a, changed', own: true, from: 'a' }), 'a', 'an edit of a candidate keeps it selected');
eq(chosenOf({ ...base, text: 'mine', own: true }), OWN, 'words of no option are "Your text"');
eq(chosenOf({ ...base, text: 'x', pick: 'zz' }), OWN, 'a pick that is no candidate is not trusted');
// the box's changes to it
eq(changedFrom({ ...base, text: 'text a', pick: 'a' }), undefined, 'no changes');
eq(changedFrom({ ...base, text: 'text a!', own: true, from: 'a' }), 'a', 'an edit of a');
eq(changedFrom({ ...base, text: 'mine', own: true }), undefined, '"Your text" never has changes');
// typing before it is saved
const picked = { ...base, text: 'text a', pick: 'a' } as Field & { label: string; id: string };
const typed = typedField(picked, 'text a typed');
eq([typed.own, typed.pick, typed.from, changedFrom(typed)], [true, undefined, 'a', 'a'], 'typing over a pick is an edit of it');
ok(typedField(picked, 'text a') === picked, 'the same words change nothing');
eq(chosenOf(typedField({ ...base, text: '' }, 'new words')), OWN, 'typing in an empty box is the user\'s text');
// "Your text"
eq(ownOption({ ...base, text: 'mine', own: true }), 'mine', 'the user\'s words in the box');
eq(ownOption({ ...base, text: 'text a', pick: 'a', ownWas: 'mine' }), 'mine', 'the words a pick replaced');
eq(ownOption({ ...base, text: 'text a', pick: 'a', ownWas: 'text b' }), undefined, 'not when they are a candidate');
eq(ownOption({ ...base, text: 'text a', pick: 'a' }), undefined, 'none otherwise');

// ---- notes that only offered candidates
const file = radiosRelease();
ok(validateRelease(file).problems.length === 0, 'the sample checks out');
const rd = file.platforms.find((p) => p.id === 'reddit')!;
const tt = file.platforms.find((p) => p.id === 'tiktok')!;
eq(plainNote(rd, fld(file, 'reddit', 'comment'), fld(file, 'reddit', 'comment').notes![0]), ['a', 'b'], '"Use it" and "Use this one instead" only offer candidates');
eq(plainNote(tt, fld(file, 'tiktok', 'first'), fld(file, 'tiktok', 'first').notes![0]), ['a', 'b'], 'on a shared field, set on both platforms');
const r = noteReasons(rd, fld(file, 'reddit', 'title'));
eq([[...r.plain], Object.keys(r.reasons), r.reasons.a[0]], [['n-title'], ['a'], 'The premise said flatly, the way your last title went.'], 'the reason sits under the recommended option');
const some = { ...fld(file, 'tiktok', 'first'), notes: [{ ...fld(file, 'tiktok', 'first').notes![0], actions: [{ id: 'x', label: 'Only here', effect: [{ kind: 'set' as const, field: 'first', platforms: ['tiktok'], text: fld(file, 'tiktok', 'first').candidates[0].text }] }] }] };
eq(plainNote(tt, some, some.notes[0]), undefined, 'a set on only one of the sharing platforms is not plain (it unlinks)');
const keep = { ...fld(file, 'reddit', 'title'), notes: [{ id: 'k', at: now.toISOString(), text: 't', actions: [{ id: 'use', label: 'Use it', effect: [{ kind: 'set' as const, field: 'title', platforms: ['reddit'], text: 'not a candidate' }] }] }] };
eq(plainNote(rd, keep, keep.notes[0]), undefined, 'a text that is no candidate is not plain');
const nothing = { ...keep, notes: [{ ...keep.notes[0], actions: [{ id: 'keep', label: 'Keep yours', effect: [] }] }] };
eq(plainNote(rd, nothing, nothing.notes[0]), undefined, '"Keep yours" is not plain');

// ---- a tap switches and fills the box; the user's own words are kept
let f = yes(file, { op: 'pick', platform: 'reddit', field: 'title', candidate: 'b' }, 'a tap on b');
let t = fld(f, 'reddit', 'title');
eq([t.text, t.pick, t.own, t.ownWas], [t.candidates[1].text, 'b', undefined, 'The keeper who wrote himself a letter'], 'b in the box, the user\'s words kept');
eq(ownOption(t), 'The keeper who wrote himself a letter', '"Your text" stays an option');
f = yes(f, { op: 'setText', platform: 'reddit', field: 'title', text: ownOption(t)!, mine: true }, 'a tap on "Your text"');
t = fld(f, 'reddit', 'title');
eq([chosenOf(t), t.ownWas, t.from], [OWN, undefined, undefined], 'the user\'s words are back, no edit of a candidate');

// ---- edit then Save: the edit becomes the old option, then the switch
f = yes(file, { op: 'pick', platform: 'reddit', field: 'comment', candidate: 'a' }, 'a tap on the long comment');
eq(fld(f, 'reddit', 'comment').text, RADIO_COMMENT, 'its whole text in the box');
f = yes(f, { op: 'setText', platform: 'reddit', field: 'comment', text: `${RADIO_COMMENT} Thanks.` }, 'the box saves the typing');
let c = fld(f, 'reddit', 'comment');
eq([c.own, c.from, chosenOf(c), changedFrom(c)], [true, 'a', 'a', 'a'], 'an edit of a: a stays selected, with changes');
const saved = yes(f, { op: 'saveOption', platform: 'reddit', field: 'comment', candidate: 'a', switchTo: 'b' }, 'Save, then b');
c = fld(saved, 'reddit', 'comment');
eq([c.candidates[0].text, c.candidates[0].edited, c.candidates[0].does, c.pick, c.text, c.own, c.from], [`${RADIO_COMMENT} Thanks.`, true, 'source, the app, the hardest part, a question (your last film’s shape)', 'b', c.candidates[1].text, undefined, undefined], 'a holds the edit, b is in use');
eq(plainNote(rd, c, c.notes![0]), ['a', 'b'], 'the note offers a as it now reads');
const back = yes(saved, { op: 'pick', platform: 'reddit', field: 'comment', candidate: 'a' }, 'back to a');
eq(fld(back, 'reddit', 'comment').text, `${RADIO_COMMENT} Thanks.`, 'the edit comes back with it');
const only = yes(f, { op: 'saveOption', platform: 'reddit', field: 'comment', candidate: 'a' }, '"Save to this option"');
c = fld(only, 'reddit', 'comment');
eq([c.pick, c.own, changedFrom(c), c.candidates[0].edited], ['a', undefined, undefined, true], 'saved without switching: no changes left');
// Discard: the switch only
const disc = yes(f, { op: 'pick', platform: 'reddit', field: 'comment', candidate: 'b' }, 'Discard, then b');
c = fld(disc, 'reddit', 'comment');
eq([c.candidates[0].text, c.candidates[0].edited, c.pick, c.ownWas], [RADIO_COMMENT, undefined, 'b', undefined], 'a untouched, the edit not kept as "Your text"');

// ---- a shared field: a tap and a Save reach the platforms sharing it
f = yes(file, { op: 'pick', platform: 'tiktok', field: 'first', candidate: 'b' }, 'a tap on TikTok');
eq([fld(f, 'instagram-reels', 'first').pick, fld(f, 'instagram-reels', 'first').text], ['b', fld(f, 'tiktok', 'first').text], 'Instagram has it too');
f = yes(f, { op: 'setText', platform: 'instagram-reels', field: 'first', text: 'Changed on Instagram.' }, 'an edit on Instagram');
eq(fld(f, 'tiktok', 'first').from, 'b', 'both know the edit is of b');
f = yes(f, { op: 'saveOption', platform: 'instagram-reels', field: 'first', candidate: 'b', switchTo: 'c' }, 'Save, then c, on Instagram');
for (const pid of ['tiktok', 'instagram-reels']) {
  const k = fld(f, pid, 'first');
  eq([k.candidates[1].text, k.candidates[1].edited, k.pick], ['Changed on Instagram.', true, 'c'], `${pid}: b holds the edit, c in use`);
}
eq(fld(f, 'tiktok', 'first').notes![0].actions[1].effect[0], { kind: 'set', field: 'first', platforms: ['tiktok', 'instagram-reels'], text: 'Changed on Instagram.' }, 'TikTok\'s note follows the saved option');

// ---- refusals and the file's rules
const no = (fl: ReleaseFile, op: ReleaseOp, re: RegExp, what: string) => { n++; const x = applyOp(fl, op, now); if (x.ok) assert.fail(`${what}: should be refused`); assert.match(x.refused, re, what); };
no(file, { op: 'saveOption', platform: 'reddit', field: 'comment', candidate: 'a' }, /empty/, 'nothing to keep in an empty box');
no(file, { op: 'saveOption', platform: 'reddit', field: 'title', candidate: 'z' }, /no candidate "z"/, 'an unknown option');
no(file, { op: 'saveOption', platform: 'reddit', field: 'title', candidate: 'a', switchTo: 'z' }, /no candidate "z"/, 'an unknown switch');
ok(typeof parseOp({ op: 'saveOption', platform: 'reddit', field: 'title', candidate: 'a', switchTo: 3 }) === 'string', 'switchTo must be text');
ok(typeof parseOp({ op: 'saveOption', platform: 'reddit', field: 'title', candidate: 'a' }) === 'object', 'saveOption parses');
const bad = radiosRelease();
Object.assign(fld(bad, 'reddit', 'comment'), { from: 'a' });
ok(validateRelease(bad).problems.some((p) => /"from"/.test(p)), '"from" only on the user\'s own text');
const bad2 = radiosRelease();
(fld(bad2, 'reddit', 'comment').candidates[0] as { edited?: unknown }).edited = 'yes';
ok(validateRelease(bad2).problems.some((p) => /"edited"/.test(p)), '"edited" is true or left out');

console.log(`ok · ${n} checks: the option in use, the box's changes, "Your text", the plain notes, a tap, Save, Discard, a shared field`);
