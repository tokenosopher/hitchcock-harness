// npx tsx scripts/remove-test.ts
// "Remove" in "Waiting for you": one tap sets the removal aside, "Done picking" sends it. Checks
// the pure parts on the sample films: the block Alma gets (removalBlock, choicesHead), the request body
// (parseRemovals), that a removal is never a yes, a go, a pick or an approval (its own field all the way, and a card Alma
// closes as "removed" is no yes anywhere the app reads one), one choice per entry (an answer and a removal replace each
// other), and that a removed entry stays off the list: a card until Alma closes it, an app entry while the thing it is
// about is the same.
// One line per check, a summary line, exit 1 when any check fails.
import { asksLeft, choicesHead, isRemovedAnswer, parseRemovals, removalBlock, removeChoiceId, waitKeysOf, waitMark, type Removal } from '../src/components/lib/remove';
import { sentItems, stillSent, withSent } from '../src/components/lib/sent';
import { gateItems, waitingKeys } from '../src/components/lib/derive';
import { flowOf } from '../src/components/lib/flow';
import { waitItemsOf } from '../src/components/flow/waitList';
import { isYes, feedSummary } from '../src/server/films/read/feed';
import { masterYesOf } from '../src/server/films/read/master';
import { approvalOf } from '../src/components/edit/left';
import { day1SampleState } from '../src/fixtures/day1';
import { castSampleState, SHEET_SLUG } from '../src/fixtures/cast';
import { choicesNow, choose, unchoose } from '../src/components/data/choices';
import type { FeedCard, FilmState } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const day1 = () => clone(day1SampleState('sample-day1-waiting')!);
const sheet = () => clone(castSampleState(SHEET_SLUG)!);
const on = (s: FilmState, removed: Removal[]): FilmState => ({ ...s, removed });

// ---- the block Alma gets
const block = removalBlock([
  { key: 'card:GO-S3-closer', title: 'Go for a closer S3 shot 3? One take, 7 seconds', card: 'GO-S3-closer' },
  { key: 'gate:pick:C05:sheet', title: 'C05 · the Harbourmaster (no lines) sheet', mark: 'cast/C05-harbourmaster/pick.png' },
]);
ok('block: its own heading, not an answer', block[1] === 'Removed from "Waiting for you" (not answered; close these, start no work from them):', block[1]);
ok('block: a card by its id and title', block[2] === '- card="GO-S3-closer" · “Go for a closer S3 shot 3? One take, 7 seconds”', block[2]);
ok('block: an app entry by its key, said to be the harness\'s own', block[3] === '- gate:pick:C05:sheet · “C05 · the Harbourmaster (no lines) sheet” (the harness\'s own entry, no card of yours)', block[3]);
ok('block: never a yes, a go, a pick or an approval; how to close a card', /None of them is a yes, a go, a pick or an approval/.test(block[4]) && /"option": "removed"/.test(block[4]) && /needs nothing from you/.test(block[4]), block[4]);
ok('block: nothing removed, no block', removalBlock([]).length === 0);
ok('head: says an entry removed is one kind of item', /one answer, one pick or one entry removed/.test(choicesHead(1, false, true)) && /one answer, one pick, one sheet approved or one entry removed/.test(choicesHead(3, true, true)));
ok('head: unchanged without removals', /Each item below is one answer or one pick, exactly/.test(choicesHead(2, false, false)) && /one answer, one pick or one sheet approved, exactly/.test(choicesHead(2, true, false)));

// ---- the request body
ok('parse: a card and an app entry', JSON.stringify(parseRemovals([{ key: 'card:GO-S3-closer', title: 'x' }, { key: 'gate:pick:C05:sheet', title: 'y', mark: 'cast/C05-harbourmaster/pick.png' }])) === JSON.stringify([{ key: 'card:GO-S3-closer', title: 'x' }, { key: 'gate:pick:C05:sheet', title: 'y', mark: 'cast/C05-harbourmaster/pick.png' }]));
ok('parse: the story, the release, the go', Array.isArray(parseRemovals([{ key: 'story:script-v3' }, { key: 'release:post' }, { key: 'gate:go:video' }])));
ok('parse: an unknown key is refused', typeof parseRemovals([{ key: 'taste:C05' }]) === 'string' && typeof parseRemovals([{ key: 'card:<x>' }]) === 'string');
ok('parse: twice is refused', typeof parseRemovals([{ key: 'release:post' }, { key: 'release:post' }]) === 'string');

// ---- never a yes, a go, a pick or an approval
const sent = sentItems([{ label: 'Remove · x', remove: { key: 'card:GO-S3-closer' } }], () => undefined);
ok('sent: a removal takes out its entry and nothing else', sent.length === 1 && sent[0].key === 'card:GO-S3-closer' && !sent[0].alma, sent);
const closed = (kind: 'yes' | 'go', place: FeedCard['place'], title: string, option: string): FeedCard => ({ key: 'K', id: 'K', title, section: 's', place, ids: ['C05'], placed: 'card', media: [], ask: { kind, options: [], answer: { option, by: 'card' } } });
ok('a yes card closed as removed is no yes (isYes)', !isYes(closed('yes', 'edit', 'Cut v12: approve', 'removed')) && isYes(closed('yes', 'edit', 'Cut v12: approve', 'yes')));
ok('…nor in the feed\'s approvals', !feedSummary({ cards: [closed('yes', 'edit', 'Cut v12: approve', 'removed')], warnings: [] }).approvals);
ok('…nor the master\'s yes at Sound', !masterYesOf([closed('yes', 'sound', 'The master v12', 'removed')]) && !!masterYesOf([closed('yes', 'sound', 'The master v12', 'yes')]));
ok('…nor a cut approved in What\'s next', !approvalOf([closed('yes', 'edit', 'Cut v12: approve', 'removed')], ['v12']) && !!approvalOf([closed('yes', 'edit', 'Cut v12: approve', 'yes')], ['v12']));
ok('"removed" is read in any case', isRemovedAnswer(' Removed ') && !isRemovedAnswer('yes') && !isRemovedAnswer(undefined));

// one choice per entry: an answer and a removal of the same entry replace each other, the last tap goes
const F = 'remove-test-film';
const ids = () => choicesNow(F).map((c) => c.id).sort().join();
choose(F, { id: 'card:GO-S3-closer', label: 'go', answer: { card: 'GO-S3-closer', kind: 'go' } });
choose(F, { id: 'card:ASK-boards-S1-S2-v2', label: 'yes', answer: { card: 'ASK-boards-S1-S2-v2', kind: 'yes' } });
choose(F, { id: removeChoiceId('card:GO-S3-closer'), label: 'Remove · go', remove: { key: 'card:GO-S3-closer', title: 'go' } });
ok('Remove on a card takes the place of its go; another card\'s yes stays', ids() === 'card:ASK-boards-S1-S2-v2,remove:card:GO-S3-closer', ids());
choose(F, { id: 'card:GO-S3-closer', label: 'go', answer: { card: 'GO-S3-closer', kind: 'go' } });
ok('choosing the go again takes the removal back', ids() === 'card:ASK-boards-S1-S2-v2,card:GO-S3-closer', ids());
choose(F, { id: 'approve:sheet:C05', label: 'yes', approve: { kind: 'sheet', id: 'C05', path: 'cast/C05-harbourmaster/pick.png' } });
choose(F, { id: removeChoiceId('gate:pick:C05:sheet'), label: 'Remove · sheet', remove: { key: 'gate:pick:C05:sheet', title: 'sheet' } });
ok('Remove on an app entry takes the place of its approval', !ids().includes('approve:sheet:C05') && ids().includes('remove:gate:pick:C05:sheet'), ids());
unchoose(F, removeChoiceId('gate:pick:C05:sheet'));
ok('a second tap (unchoose) takes it back', !ids().includes('remove:'), ids());
ok('the keys an answer and a removal share', waitKeysOf({ approve: { id: 'C05' } })[0] === 'gate:pick:C05:sheet' && waitKeysOf({ pick: { kind: 'face', target: 'C08' } })[0] === 'gate:pick:C08' && waitKeysOf({ pick: { kind: 'sfx', target: 'cheer', card: 'SFX-S2' } })[0] === 'card:SFX-S2');
unchoose(F, choicesNow(F).map((c) => c.id));

// ---- staying off the list
const W = day1();
ok('the sample: three cards wait', waitingKeys(W, []).length === 3, waitingKeys(W, []));
const W1 = on(W, [{ key: 'card:GO-S3-closer', title: 'go' }]);
ok('a removed card leaves the list and the count (the sidebar\'s white dot goes by it)', !waitingKeys(W1, []).includes('card:GO-S3-closer') && waitingKeys(W1, []).length === 2 && flowOf(W1, []).waiting === 2);
ok('…and the page\'s list', !waitItemsOf(flowOf(W1, [])).some((x) => x.key === 'card:GO-S3-closer') && waitItemsOf(flowOf(W1, [])).length === 2);
ok('…while the card is still Alma\'s, open, in the record (she closes it)', !!W1.feed!.asks.find((c) => c.key === 'GO-S3-closer') && asksLeft(W1).length === 2);
ok('…and does not come back when Alma rewrites the card unanswered', !waitingKeys(on({ ...W, feed: { ...W.feed!, asks: W.feed!.asks.map((c) => (c.key === 'GO-S3-closer' ? { ...c, date: '2026-12-01T00:00:00Z' } : c)) } }, W1.removed!), []).includes('card:GO-S3-closer'));
// the moment "Done picking" is pressed it leaves (kept aside), and once the state has the record it is no longer kept aside
const out = sentItems([{ label: 'x', remove: { key: 'card:GO-S3-closer' } }], () => undefined);
ok('sent: the entry leaves at once', !waitingKeys(withSent(W, out), []).includes('card:GO-S3-closer'));
ok('sent: kept aside only until the state has the record', stillSent(W, out).length === 1 && stillSent(W1, out).length === 0);

const S = sheet();
const sheetItem = waitItemsOf(flowOf(S, [])).find((x) => x.key === 'gate:pick:C05:sheet')!;
ok('the sample: C05\'s sheet waits, an app entry', !!sheetItem?.gate && waitingKeys(S, []).includes('gate:pick:C05:sheet'));
const mark = waitMark(sheetItem, S);
ok('its mark is the sheet file', mark === 'cast/C05-harbourmaster/pick.png', mark);
const S1 = on(S, [{ key: 'gate:pick:C05:sheet', title: sheetItem.title, mark }]);
ok('a removed app entry stays off while the sheet is the same', !waitingKeys(S1, []).includes('gate:pick:C05:sheet') && !gateItems(S1, []).some((g) => g.key === 'pick:C05:sheet'));
ok('…and is not approved by it', !S1.characters.find((c) => c.id === 'C05')!.sheet!.approved);
const S2 = clone(S1);
S2.characters.find((c) => c.id === 'C05')!.sheet!.path = 'cast/C05-harbourmaster/pick-v2.png';
ok('…and comes back for a new sheet file', waitingKeys(S2, []).includes('gate:pick:C05:sheet'));
const S3 = on(S, [{ key: 'gate:pick:C05:sheet', title: 'x' }]);
ok('a removal without the mark does not hide a sheet that has one', waitingKeys(S3, []).includes('gate:pick:C05:sheet'));
// a removed card of Alma's about that sheet: the app's own entry does not take its place
const card: FeedCard = { key: 'ASK-C05-sheet', id: 'ASK-C05-sheet', title: 'C05 sheet: approve', section: 's', place: 'sheet', ids: ['C05'], placed: 'card', media: [], ask: { kind: 'yes', options: [] } };
const S4 = { ...S, feed: { counts: {}, asks: [card] } };
ok('Alma\'s sheet card stands for the app entry', waitingKeys(S4, []).includes('card:ASK-C05-sheet') && !waitingKeys(S4, []).includes('gate:pick:C05:sheet'));
const S5 = on(S4, [{ key: 'card:ASK-C05-sheet', title: card.title }]);
ok('removing that card does not bring up the app\'s own sheet entry', !waitingKeys(S5, []).includes('card:ASK-C05-sheet') && !waitingKeys(S5, []).includes('gate:pick:C05:sheet'), waitingKeys(S5, []));

// the release and the story
const R: FilmState = { ...W, post: { ...(W.post ?? { cuts: [], masters: [], captions: [] }), release: { path: 'social/release.json', final: { path: 'x.mp4', version: 'v12' }, platforms: 3, posted: 1 } } };
ok('the release waits', waitingKeys(R, []).includes('release:post'));
const rItem = waitItemsOf(flowOf(R, [])).find((x) => x.key === 'release:post')!;
const R1 = on(R, [{ key: 'release:post', title: rItem.title, mark: waitMark(rItem, R) }]);
ok('a removed release stays off for the same final', !waitingKeys(R1, []).includes('release:post') && !flowOf(R1, []).release);
ok('…and comes back for a new final', waitingKeys({ ...R1, post: { ...R1.post!, release: { ...R1.post!.release!, final: { path: 'y.mp4', version: 'v13' } } } }, []).includes('release:post'));

void (async () => {
  // the sample send (MOCK=boards): kept in memory, laid on the state as a reload reads it again
  const { removeMockDone, resetMockRemoved } = await import('../src/fixtures/removed');
  resetMockRemoved(SHEET_SLUG);
  const r = removeMockDone(SHEET_SLUG, [], [], [], [{ key: 'gate:pick:C05:sheet', title: sheetItem.title, mark }])!;
  const j = (await r.json()) as { message: string; answers: unknown[]; picks: unknown[]; approvals: unknown[] };
  ok('the sample send: the block, and no answer, pick or approval', r.ok && j.message.includes('- gate:pick:C05:sheet · “C05 · the Harbourmaster (no lines) sheet”') && !j.message.includes('Sheet approved') && !j.answers.length && !j.picks.length && !j.approvals.length, j);
  const { mockState } = await import('../src/fixtures/mock');
  const again = mockState(SHEET_SLUG)!;
  ok('after the send, read again: still off the list, and the sheet not approved', !waitingKeys(again, []).includes('gate:pick:C05:sheet') && !again.characters.find((c) => c.id === 'C05')!.sheet!.approved);
  resetMockRemoved(SHEET_SLUG);
  ok('a fresh sample has it back', waitingKeys(mockState(SHEET_SLUG)!, []).includes('gate:pick:C05:sheet'));
  console.log(`${n - bad} of ${n} passed`);
  if (bad) process.exit(1);
})();
