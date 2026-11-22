// npm run script-cards:test
// The cards of a script version (src/lib/script-cards.ts): the title card, a card between scenes, an end
// card, in every shape the films have written them; their words on two lines, their length, their place in the film;
// an earlier version read the same way; what changed in a card from one version to the next; a card's words edited on
// the page and written back (parse → edit → write → parse), nothing else in the file changed. Text only, no files.
import { cardChanges, scriptCards } from '../src/lib/script-cards';
import { applyEdits, checkEdits, earlierAsScript, ScriptEditError, type ScriptEdit } from '../src/lib/script-edit';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const S = (body: string, earlier = '') => `# A film: script\n\n## Script\n\n*v2, draft. 2026-11-21: the card.*\n\n${body}\n\n## Audit\n\nnothing\n\n## Earlier drafts\n\n${earlier || 'None yet.'}\n`;
const S1 = '### S1 · One · L01 a room\n`[1.5 s]` TOBIAS sets bottles on the table.\n**TOBIAS:** "There are countless bottles."\n`[1 s]` He looks up.\n\n| generation | lines | words | action s | ≈ s | ends at |\n|---|---|---|---|---|---|\n| S1 | 1 | 4 | 2.5 | 4 | 0:04 |';
const S2 = '### S2 · Two · L01 a room\n**MAREN:** "Is that so?"';

// 1. a film's v9: after S1, in the cards' own shape
const now = S(`${S1}\n\n**Title card** (3 s, after S1, the film's opening card; the user's words on card ASK-title-card): **Where Maren finds the letter** · then: *The point, about 1890*.\n\n${S2}`);
const [c] = scriptCards(now);
ok('the title card is read', !!c && c.kind === 'title' && c.label === 'Title card', c);
ok('its two lines', c?.lines[0] === 'Where Maren finds the letter' && c?.lines[1] === 'The point, about 1890', c?.lines);
ok('its length', c?.seconds === 3, c?.seconds);
ok('its place: after S1', c?.place.after === 'S1' && c?.where === 'after S1', c?.place);

// 2. the older shapes
const opening = scriptCards(S(`**Opening title card** (3 s, the period film's default): **The point, about 1890** · subtitle line: *The lighthouse on the point*.\n\n${S1}`))[0];
ok('"Opening title card", before the first scene', opening?.kind === 'title' && opening.where === 'before S1' && opening.lines.join('|') === 'The point, about 1890|The lighthouse on the point', opening);
const before = scriptCards(S(`**Title card, before S1** (the house card, about 3 s, not counted in the timings below): THE POINT, NORTH COAST · 1890, and under it the line *The lighthouse keeper*.\n\n${S1}`))[0];
ok('"Title card, before S1" with "and under it the line"', before?.where === 'before S1' && before.seconds === 3 && before.lines.join('|') === 'THE POINT, NORTH COAST · 1890|The lighthouse keeper', before);
const here = scriptCards(S(S1.replace('**TOBIAS:** "There are countless bottles."', '**TOBIAS:** "There are countless bottles."\n**Title card, here** (the house card, about 3 s): NORTH COAST · 1890, and under it the line *The lighthouse keeper*.')))[0];
ok('"Title card, here" inside a scene: after the row above it', here?.place.in === 'S1' && here.place.afterRow === 1 && here.where === 'in S1, after line 1', here);
const italic = S(`${S1.replace('`[1 s]` He looks up.', '*Title card: ALEXANDRIA · 41 BC, and under it "The palace of Queen Maren". A hard cut in and out, with the boom.*\n`[1 s]` He looks up.')}\n\n*Card: THE NEXT NIGHT. The same house style, with the boom.*\n\n${S2}\n\n### Timing (whole film)\n\n| generation | lines | words | action s | ≈ s | ends at |\n|---|---|---|---|---|---|\n| S1 | 1 | 4 | 2.5 | 4 | 0:04 (with the title card, 1.5 s) |\n| card: THE NEXT NIGHT | | | | 1.5 | 0:06 |`);
const [it1, it2] = scriptCards(italic);
ok('an italic title card: its words, not the note after them', it1?.lines.join('|') === 'ALEXANDRIA · 41 BC|The palace of Queen Maren' && it1.where === 'in S1, after line 1', it1);
ok('an italic card between scenes: one line, after S1', it2?.kind === 'card' && it2.label === 'Card' && it2.lines.join('|') === 'THE NEXT NIGHT' && it2.where === 'after S1', it2);
ok('a card with no length of its own takes the timing table\'s', it1?.seconds === 1.5 && it2?.seconds === 1.5, [it1?.seconds, it2?.seconds]);
const end = scriptCards(S(`${S1}\n\n${S2}\n\n**End card** (2 s): **Tobias kept rowing** · then: *Maren kept the light*.`)).at(-1);
ok('an end card after the last scene', end?.kind === 'end' && end.where === 'after S2' && end.seconds === 2 && end.lines[1] === 'Maren kept the light', end);

// 3. not cards: the lines, the version note, bold notes, a scene with none
ok('a script with no card has none', scriptCards(S(`${S1}\n\n**Flagged lines** (swear words): none.\n\n${S2}`)).length === 0);
ok('a card outside "## Script" (the story, the audit) is not read', scriptCards(`## Story\n\n**Title card** (3 s): **Nope**\n\n${S(S1)}`).length === 0);

// 4. an earlier version, and what changed
const md = S(`${S1}\n\n**Title card** (3 s, after S1): **NORTH COAST · 1890** · then: *The lighthouse keeper*.\n\n${S2}`,
  `### v1 (2026-11-16, as sent)\n\n*v1, draft.*\n\n**Title card, before S1** (about 3 s): THE POINT, NORTH COAST · 1890, and under it the line *The lighthouse keeper*.\n\n${S1}\n\n${S2}`);
const v1 = scriptCards(earlierAsScript(md, 'v1') ?? '');
ok('an earlier version reads its own card', v1.length === 1 && v1[0].lines[0] === 'THE POINT, NORTH COAST · 1890' && v1[0].where === 'before S1', v1);
const [ch] = cardChanges(scriptCards(md), v1);
ok('a changed card: its words and its place, not its length', !!ch && ch.words && ch.place && !ch.seconds && !ch.isNew && ch.was?.lines[0] === 'THE POINT, NORTH COAST · 1890', ch);
ok('an unchanged card is not marked', cardChanges(v1, v1)[0] === undefined);
ok('a card the version before did not have is new', cardChanges(scriptCards(md), [])[0]?.isNew === true);

// 5. a card edited on the page: parse → edit → write → parse, in every shape; only the card's words and the version
// note change in "## Script", the rest of the file is as it was but for the old version kept under "Earlier drafts"
const scriptOf = (text: string) => { const l = text.split('\n'); const h = l.indexOf('## Script'); const e = l.findIndex((x, i) => i > h && /^## /.test(x)); return l.slice(h, e); };
const outside = (text: string) => text.split('\n## Earlier drafts')[0].split('\n').filter((_, i, l) => !(i >= l.indexOf('## Script') && i < l.findIndex((x, j) => j > l.indexOf('## Script') && /^## /.test(x)))).join('\n');
function roundTrip(name: string, md: string, ci: number, part: number, words: string, want: string[]) {
  const cards = scriptCards(md);
  const c = cards[ci];
  const e: ScriptEdit = { scene: c?.place.before ?? c?.place.after ?? c?.place.in ?? 'S1', index: ci, kind: 'card', part, old: c?.lines[part] ?? '', new: words };
  let out = '';
  try { out = applyEdits(md, [e], { date: '2026-11-21' }).markdown; } catch (err) { ok(`${name}: saves`, false, (err as Error).message); return; }
  const after = scriptCards(out);
  ok(`${name}: the card reads the new words`, after[ci]?.lines.join('|') === want.join('|'), after[ci]?.lines);
  ok(`${name}: its kind, place and length stay`, after[ci]?.kind === c.kind && after[ci]?.where === c.where && after[ci]?.seconds === c.seconds, after[ci]);
  ok(`${name}: the other cards are as they were`, after.every((x, i) => i === ci || x.lines.join('|') === cards[i].lines.join('|')) && after.length === cards.length);
  const a = scriptOf(md), b = scriptOf(out);
  const diff = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  ok(`${name}: in "## Script" only the version note and the card's line changed`, a.length === b.length && diff.length === 2 && /^\*v\d/.test(a[diff[0]]) && a[diff[1]] === md.split('\n')[c.at], diff.map((i) => [a[i], b[i]]));
  const raw0 = md.split('\n')[c.at], raw1 = out.split('\n')[c.at];
  ok(`${name}: on its line, only the words`, raw1 === raw0.replace(c.lines[part], words), raw1);
  ok(`${name}: the rest of the file is as it was`, outside(out) === outside(md));
  ok(`${name}: the version note names it, the old version kept`, /^\*v3, draft\. 2026-11-21: the user's edit on the Story page, word for word: Title card/.test(scriptOf(out).find((l) => /^\*v\d/.test(l)) ?? '') && earlierAsScript(out, 'v2') !== undefined, scriptOf(out).find((l) => /^\*v\d/.test(l)));
  ok(`${name}: and reads back as written a second time`, scriptCards(earlierAsScript(out, 'v2')!)[ci]?.lines.join('|') === c.lines.join('|'));
}
roundTrip('bold, "· then:", first line', md, 0, 0, 'NORTH COAST · 1891', ['NORTH COAST · 1891', 'The lighthouse keeper']);
roundTrip('bold, "· then:", second line', md, 0, 1, 'At the lighthouse', ['NORTH COAST · 1890', 'At the lighthouse']);
roundTrip('"and under it the line"', S(`**Title card, before S1** (about 3 s): THE POINT, NORTH COAST · 1890, and under it the line *The lighthouse keeper*.\n\n${S1}`), 0, 1, 'The lamp room', ['THE POINT, NORTH COAST · 1890', 'The lamp room']);
roundTrip('italic with a note after it', italic, 0, 0, 'ALEXANDRIA · 40 BC', ['ALEXANDRIA · 40 BC', 'The palace of Queen Maren']);
// the shape of a real film's script v2: italic, the words in bold, a note after them
const gordium = S(`${S1}\n\n*Title card, between S1 and S2, the user's words (story v3 on): **Gordium, 333 BC.** About 3 s, with the boom.*\n\n${S2}`);
ok('the Gordium card is read', scriptCards(gordium)[0]?.lines.join('|') === 'Gordium, 333 BC.', scriptCards(gordium)[0]);
roundTrip('italic, the words in bold (Edda\'s)', gordium, 0, 0, 'Gordium, Phrygia, 333 BC.', ['Gordium, Phrygia, 333 BC.']);
// a card and a line in one save; both of a card's lines in one save
{
  const both = applyEdits(md, [{ scene: 'S1', index: 0, kind: 'card', part: 1, old: 'The lighthouse keeper', new: 'the keeper\'s lamp' }, { scene: 'S1', index: 0, kind: 'card', part: 0, old: 'NORTH COAST · 1890', new: 'SOUTH COAST · 1890' }, { scene: 'S2', index: 0, kind: 'line', old: 'Is that so?', new: 'Is it so?' }], { date: '2026-11-21' });
  ok('both lines of a card and a spoken line in one save', scriptCards(both.markdown)[0]?.lines.join('|') === 'SOUTH COAST · 1890|the keeper\'s lamp' && both.markdown.includes('**MAREN:** "Is it so?"'), scriptCards(both.markdown)[0]?.lines);
}
// refused: words that would not read back, a locked script, a card that changed under the edit
const refused = (e: Partial<ScriptEdit>, m = md) => { try { applyEdits(m, [{ scene: 'S1', index: 0, kind: 'card', part: 0, old: 'NORTH COAST · 1890', new: 'x', ...e }], { date: '2026-11-21' }); return ''; } catch (err) { return err instanceof ScriptEditError ? err.message : `other: ${(err as Error).message}`; } };
ok('a card\'s words with * are refused', /cannot hold \*/.test(refused({ new: 'NORTH COAST **1890**' })), refused({ new: 'NORTH COAST **1890**' }));
const early = refused({ scene: 'S1', index: 1, old: 'THE NEXT NIGHT', new: 'THE NEXT. NIGHT' }, italic);
ok('an italic card\'s words that would end its sentence early are refused', /would not read as written/.test(early), early);
ok('empty words are refused', /empty/.test(refused({ new: '  ' })));
ok('a locked script is refused', /locked/.test(refused({}, md.replace('*v2, draft.', '*v2, LOCKED by the user.'))));
const moved = md.replace('**NORTH COAST · 1890**', '**SOUTH COAST · 1066**');
ok('a card Alma changed meanwhile: "changed", her words given', checkEdits(moved, [{ scene: 'S1', index: 0, kind: 'card', part: 0, old: 'NORTH COAST · 1890', new: 'x' }])[0]?.status === 'changed' && checkEdits(moved, [{ scene: 'S1', index: 0, kind: 'card', part: 0, old: 'NORTH COAST · 1890', new: 'x' }])[0]?.theirs === 'SOUTH COAST · 1066');
ok('a card that moved down the list is found by its words', checkEdits(S(`**Card, before S1** (1 s): **FIRST**\n\n${S1}\n\n**Title card** (3 s, after S1): **NORTH COAST · 1890** · then: *The court*.\n\n${S2}`), [{ scene: 'S1', index: 0, kind: 'card', part: 0, old: 'NORTH COAST · 1890', new: 'x' }])[0]?.index === 1);

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
