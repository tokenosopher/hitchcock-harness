// npm run waitlist:test
// What's next's "waits for you" list (src/components/flow/waitList.ts), fed with the sample films' states
// (src/fixtures/day1.ts) and a few made-up flows. "Waiting for you" (GatePage) lists the same items: only what asks the
// user to choose now (nothing still being made), the most important first whatever the source (locations, faces,
// clothing, sheets, voices, props, the rest, the go for the video last), and the same count; each item says what it
// asks for and what the answer is; a voice round asked in a card is asked once; and a step gets a "waits for" line only
// from a real waiting item, never from the order of the steps.
// One line per check, a summary line, exit 1 when any check fails.
import { day1SampleState } from '../src/fixtures/day1';
import { FIXTURES_BOARDS } from '../src/fixtures';
import { flowOf, type Flow } from '../src/components/lib/flow';
import { voiceParts, type GateItem } from '../src/components/lib/derive';
import { beingMade, byImportance, itemHref, soundsOf, waitItemsOf, waitRank, waitsByStep, waitsLine, type WaitItem } from '../src/components/flow/waitList';
import { leftChip, waitWords, whatIsLeft, type StepId } from '../src/components/edit/left';
import type { FeedCard, FilmState } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};

const sample = (slug: string): FilmState => {
  const s = day1SampleState(slug);
  if (!s) throw new Error(`no ${slug} state`);
  return JSON.parse(JSON.stringify(s)) as FilmState;
};
const keys = (items: WaitItem[]) => items.map((x) => x.key);
const listOf = (s: FilmState) => { const flow = flowOf(s, []); return { flow, items: waitItemsOf(flow) }; };
const item = (items: WaitItem[], key: string) => items.find((x) => x.key === key);

// ---- the waiting sample: three cards of Alma's ask (a yes on the boards, the Neighbour's voice round, a go with its quote),
// and the gate holds the Neighbour's Voices pick
const W = listOf(sample('sample-day1-waiting'));
ok('waiting sample: "Waiting for you" counts three (the three cards; the Neighbour\'s voice pick is the card\'s question, asked once)', W.flow.waiting === 3 && W.items.length === 3 && W.flow.asks.length === 3 && W.flow.gate.length === 1, [W.flow.waiting, W.items.length, W.flow.asks.length, W.flow.gate.length]);
ok('waiting sample: by importance: the voice (Voices) before the boards (Previz), the go at Scenes last', keys(W.items).join() === 'card:ASK-C08-voice-r1,card:ASK-boards-S1-S2-v2,card:GO-S3-closer', keys(W.items));

// the same cards listed by the feed in another order come out in the same order
const shuffled = sample('sample-day1-waiting');
shuffled.feed!.asks = [...shuffled.feed!.asks].reverse();
ok('cards: the feed\'s own order does not change the list\'s', keys(listOf(shuffled).items).join() === keys(W.items).join(), keys(listOf(shuffled).items));

// each item's word, answer and line
const yes = item(W.items, 'card:ASK-boards-S1-S2-v2'), pick = item(W.items, 'card:ASK-C08-voice-r1'), go = item(W.items, 'card:GO-S3-closer');
ok('a card that asks a yes: "Yes or no", answered by your yes, no quote', yes?.word === 'Yes or no' && yes.answer === 'your yes' && yes.cost === undefined && yes.ready && yes.place === 'previz', yes);
ok('a card that asks a pick: "Pick one", answered by your pick, its line under the title', pick?.word === 'Pick one' && pick.answer === 'your pick' && pick.line === 'Three designed voices, each saying the element line.' && pick.place === 'voices', pick);
ok('a card that asks a go: "Your go", answered by your go, the quote as written', go?.word === 'Your go' && go.answer === 'your go' && go.cost === '21 credits for one 480p draft with sound (7 seconds at 3 credits a second)' && go.place === 'scenes', go);
ok('a card keeps its title in its own words', yes?.title === 'S1 and S2: the storyboards v2: approve' && go?.title === 'Go for a closer S3 shot 3? One take, 7 seconds', [yes?.title, go?.title]);
ok('a card is the card itself (answered with the very card of "Waiting for you")', yes?.card === W.flow.asks.find((c) => c.id === 'ASK-boards-S1-S2-v2') && !yes?.gate, yes?.card?.id);
const goNoQuote = sample('sample-day1-waiting');
goNoQuote.feed!.asks = goNoQuote.feed!.asks.map((c) => (c.ask?.kind === 'go' ? { ...c, ask: { ...c.ask, cost: undefined } } : c));
ok('a go without a quote carries none', !('cost' in (item(listOf(goNoQuote).items, 'card:GO-S3-closer') ?? {})), item(listOf(goNoQuote).items, 'card:GO-S3-closer'));

// where each item lives, and the sounds of a card that asks to choose between them
ok('where: a yes at Previz opens its step on the board, a voice card the Voices page, a go at Scenes the scenes', [yes, pick, go].map((x) => itemHref(x!, W.flow)).join() === '?open=previz,/character/voices,/scenes', [yes, pick, go].map((x) => itemHref(x!, W.flow)));
const sounds = soundsOf(pick!, sample('sample-day1-waiting'));
ok('sounds: a voice card plays its three options, named by their number', sounds.map((x) => `${x.key}=${x.label}`).join() === 'option-1=1,option-2=2,option-3=3' && sounds.every((x, i) => x.path === `voices/options/C08-neighbour-r1-${i + 1}.mp3`), sounds);
ok('sounds: a yes and a go have none', !soundsOf(yes!, sample('sample-day1-waiting')).length && !soundsOf(go!, sample('sample-day1-waiting')).length);

// ---- the voice question once: the Neighbour's voice round is asked by Alma's card, so the gate's Voices pick goes
ok('voice once: the gate\'s Voices pick is left out where a card asks about its only character', !W.items.some((x) => x.gate?.kind === 'voices') && W.items.length === 3, keys(W.items));
const noCard = sample('sample-day1-waiting');
noCard.feed!.asks = noCard.feed!.asks.filter((c) => c.id !== 'ASK-C08-voice-r1');
const NC = listOf(noCard);
const voicesPick = NC.items.find((x) => x.gate?.kind === 'voices');
// one voice card per character whose options landed, its round and count as its line
ok('voice once: without the card the Neighbour\'s voice pick is listed, its own card', !!voicesPick && voicesPick.ready && voicesPick.key === 'gate:pick:C08:voice' && JSON.stringify(voicesPick.voiceIds) === '["C08"]' && voicesPick.line === 'Round 1 · 3 voices landed 15 Nov', voicesPick);
ok('voice once: and its sounds are the Neighbour\'s three voices', soundsOf(voicesPick!, noCard).map((x) => x.key).join() === 'C08:1,C08:2,C08:3', soundsOf(voicesPick!, noCard));
// a second character's round ready too: the pick stays, for that character only
const two = sample('sample-day1-waiting');
two.characters = two.characters.map((c) => (c.id === 'C02' ? { ...c, voice: { rounds: c.voice!.rounds }, element: undefined } : c));
const ready2 = voiceParts(two, []).filter((p) => p.state === 'ready').map((p) => p.id).join();
const T = listOf(two);
const narrowed = T.items.find((x) => x.gate?.kind === 'voices');
ok('voice once: two characters ready (C02 and C08), the made-up state is as meant', ready2 === 'C02,C08', ready2);
ok('voice once: the voice card stays for the character no card asks about', JSON.stringify(narrowed?.voiceIds) === '["C02"]' && narrowed?.key === 'gate:pick:C02:voice' && T.items.filter((x) => x.gate?.kind === 'voices').length === 1, narrowed);
ok('voice once: its sounds are only that character\'s', !!narrowed && soundsOf(narrowed, two).length > 0 && soundsOf(narrowed, two).every((x) => x.key.startsWith('C02:')), narrowed && soundsOf(narrowed, two));
ok('voice once: each question once: three cards and C02\'s voice (the gate holds C08\'s too)', T.flow.waiting === 4 && T.items.length === 4, [T.flow.waiting, T.items.length]);
// only a card at Voices that asks a pick narrows it
const asYes = sample('sample-day1-waiting');
asYes.feed!.asks = asYes.feed!.asks.map((c) => (c.id === 'ASK-C08-voice-r1' ? { ...c, ask: { kind: 'yes' as const, options: [] } } : c));
ok('voice once: a card at Voices that asks a yes leaves the Voices pick whole', !!listOf(asYes).items.find((x) => x.gate?.kind === 'voices' && x.gate.id === 'C08'), keys(listOf(asYes).items));
const elsewhere = sample('sample-day1-waiting');
elsewhere.feed!.asks = elsewhere.feed!.asks.map((c) => (c.id === 'ASK-C08-voice-r1' ? { ...c, place: 'faces' as const } : c));
ok('voice once: a pick card about the Neighbour at another step leaves the Voices pick whole', !!listOf(elsewhere).items.find((x) => x.gate?.kind === 'voices' && x.gate.id === 'C08'), keys(listOf(elsewhere).items));

// ---- the order and count of "Waiting for you": cards, then the chains, then the gate
ok('count: the same as "Waiting for you"; the gate\'s voice pick ranks before the boards card', NC.items.length === NC.flow.waiting && keys(NC.items).join() === 'gate:pick:C08:voice,card:ASK-boards-S1-S2-v2,card:GO-S3-closer', [NC.flow.waiting, keys(NC.items)]);
// a made-up film at its characters: four faces in every state, a place's look, a voice round
const cands = (who: string, round: string, n: number, landed: number) => Array.from({ length: n }, (_, k) => ({ id: `${round}-${k + 1}`, ...(k < landed ? { path: `cast/${who}/${round}/${round}-${k + 1}.png` } : {}) }));
const made = sample('sample-day1-script');
made.feed = undefined;
made.characters = [
  { id: 'C01', name: 'the Keeper', role: 'keeps the light', folder: 'cast/C01-keeper', element: { state: 'none' },
    face: { rounds: [{ id: 'r1', date: '2026-11-07', candidates: cands('C01-keeper', 'r1', 8, 5) }, { id: 'r2', date: '2026-11-07', prediction: 'r2-7', candidates: cands('C01-keeper', 'r2', 15, 15) }] },
    voice: { rounds: [{ id: 'r1', date: '2026-11-07', prediction: 'option-1', candidates: [1, 2, 3].map((k) => ({ id: `option-${k}`, path: `voices/C01/option-${k}.mp3` })) }] } },
  { id: 'C02', name: 'the Inspector', role: 'comes by boat', folder: 'cast/C02-inspector', element: { state: 'none' }, face: { rounds: [{ id: 'r1', date: '2026-11-07', candidates: cands('C02-inspector', 'r1', 20, 12) }] } },
  { id: 'C03', name: 'the Clerk', role: 'keeps the log', folder: 'cast/C03-clerk', element: { state: 'none' }, face: { rounds: [] } },
  { id: 'C04', name: 'the Postman', role: 'brings the letters', folder: 'cast/C04-postman', element: { state: 'none' }, face: { rounds: [{ id: 'r1', date: '2026-11-07', prediction: 'r1-14', candidates: cands('C04-postman', 'r1', 20, 20) }] } },
] as unknown as FilmState['characters'];
made.locations = [{ id: 'L01', name: 'the harbour', folder: 'locations/L01-harbour', master: { picked: false },
  styleImages: [{ id: 'r1', date: '2026-11-07', prediction: 'c2', candidates: Array.from({ length: 8 }, (_, k) => ({ id: `c${k + 1}`, ...(k < 5 ? { path: `locations/L01-harbour/r1/c${k + 1}.png` } : {}) })) }] }] as unknown as FilmState['locations'];
made.spend = { lines: [
  { date: '2026-11-07', what: 'Faces · C04 round 1', service: 'higgsfield', cost: { credits: 2.4 }, note: '20 × 0.12 cr' },
  { date: '2026-11-07', what: 'Faces · C02 round 1', service: 'higgsfield', cost: { credits: 2.4 }, note: '20 × 0.12 cr' },
], total: { credits: 4.8 } } as unknown as FilmState['spend'];
const D = listOf(made);
ok('made-up film: only the picks that can be made, as many as "Waiting for you" counts', D.items.length === D.flow.waiting && D.items.length === 2 && D.flow.gate.length === 5, [D.items.length, D.flow.waiting, D.flow.gate.length]);
ok('made-up film: the two faces ready, nothing still being made or not started', keys(D.items).join() === 'gate:pick:C01,gate:pick:C04', keys(D.items));
const word = (k: string) => item(D.items, k);
ok('picks: a face ready is "Pick one", named by its id, answered by your pick', word('gate:pick:C01')?.word === 'Pick one' && word('gate:pick:C01')?.title === 'C01 · the Keeper face' && word('gate:pick:C01')?.answer === 'your pick' && word('gate:pick:C01')?.ready === true, word('gate:pick:C01'));
ok('picks: a round being made or not started is not on the list; the being-made ones are counted for the quiet line', !word('gate:pick:C02') && !word('gate:pick:C03') && !word('gate:pick:L01') && beingMade(D.flow) === D.flow.gate.filter((g) => g.state === 'running' || g.state === 'queued').length + D.flow.working.length && beingMade(D.flow) > 0, [beingMade(D.flow), D.flow.gate.map((g) => `${g.key}:${g.state}`)]);
ok('picks: the line is the pick\'s round and count', word('gate:pick:C04')?.line === 'Round 1 · 20 candidates landed 7 Nov · 2.40 cr', word('gate:pick:C04')?.line);
const readyMaster = { ...D.flow, gate: D.flow.gate.map((g) => (g.kind === 'master' ? { ...g, state: 'ready' as const } : g)) } as Flow;
const masterItem = waitItemsOf(readyMaster).find((x) => x.key === 'gate:pick:L01');
ok('picks: a master whose round landed comes first', waitItemsOf(readyMaster)[0]?.key === 'gate:pick:L01', keys(waitItemsOf(readyMaster)));
ok('picks: a face belongs to Faces, a master to Locations, the voices to Voices', [word('gate:pick:C01')?.place, masterItem?.place, voicesPick?.place].join() === 'faces,loc,voices');
ok('picks: a face opens its character, a master the locations, the voices the Voices page', [itemHref(word('gate:pick:C01')!, D.flow), itemHref(masterItem!, readyMaster), itemHref(voicesPick!, NC.flow)].join() === '/character/C01,/locations,/character/voices');
const boards = listOf(sample('sample-day1-boards'));
const vgo = boards.items[0];
ok('the go for the video: one item, "Your go", its own title, its meta as the line, the go page', boards.items.length === 1 && boards.flow.waiting === 1 && vgo.word === 'Your go' && vgo.answer === 'your go' && vgo.title === 'Go for the video' && vgo.place === 'scenes' && vgo.line === boards.flow.gate[0].meta && itemHref(vgo, boards.flow) === '/go', vgo);
ok('nothing waits: an empty list', waitItemsOf(flowOf(FIXTURES_BOARDS.states['the-lighthouse'], [])).length === 0);

// made-up flows: the gate's own order mixed, a sheet, a queued round
const gi = (o: Partial<GateItem> & Pick<GateItem, 'key' | 'kind' | 'group' | 'state'>): GateItem => ({ id: '', title: o.key, chip: o.key, meta: '', ...o });
const card = (id: string, place: FeedCard['place'], kind: 'yes' | 'pick' | 'go'): FeedCard => ({ key: id, id, title: id, section: 'S', place, ids: [], placed: 'card', media: [], ask: { kind, options: [] } });
const mixed = { asks: [card('c-scenes', 'scenes', 'go'), card('c-story', 'story', 'yes')], gate: [
  gi({ key: 'g-voices', kind: 'voices', group: 'gate', state: 'waiting', title: 'Voices' }),
  gi({ key: 'c-sheet', kind: 'sheet', group: 'chains', state: 'ready', id: 'C05', title: 'the Wife sheet' }),
  gi({ key: 'c-face', kind: 'face', group: 'chains', state: 'queued', id: 'C06', title: 'the Son face' }),
], working: [], nodes: {} } as unknown as Flow;
const M = waitItemsOf(mixed);
ok('made up: by importance whatever the source: the story card, the sheet pick, then the card at Scenes; nothing not ready', keys(M).join() === 'card:c-story,gate:c-sheet,card:c-scenes', keys(M));
ok('made up: a sheet asks a yes', item(M, 'gate:c-sheet')?.word === 'Yes or no' && item(M, 'gate:c-sheet')?.answer === 'your yes' && item(M, 'gate:c-sheet')?.place === 'sheet', item(M, 'gate:c-sheet'));
ok('made up: a queued round and one not started are left out, the queued one counted as being made', !item(M, 'gate:c-face') && !item(M, 'gate:g-voices') && beingMade(mixed) === 1, [keys(M), beingMade(mixed)]);

// ---- the order of "Waiting for you" // choose ... the location to choose, that goes top priority"): what the most later work waits on first, whatever the
// source; Alma's cards by their step; equal ranks keep their order; the go for the video last
const all = { asks: [card('a-go', 'scenes', 'go'), card('a-voice', 'voices', 'pick'), card('a-loc', 'loc', 'yes'), card('a-face', 'faces', 'pick'), card('a-previz', 'previz', 'yes')], gate: [
  gi({ key: 'g-go', kind: 'go', group: 'gate', state: 'ready', title: 'Go for the video' }),
  gi({ key: 'g-prop', kind: 'prop', group: 'gate', state: 'ready', id: 'P01' }),
  gi({ key: 'g-voice', kind: 'voices', group: 'gate', state: 'ready', id: 'C02' }),
  gi({ key: 'g-cloth', kind: 'clothing', group: 'gate', state: 'ready', id: 'C02' }),
  gi({ key: 'g-face', kind: 'face', group: 'chains', state: 'ready', id: 'C03' }),
  gi({ key: 'g-master', kind: 'master', group: 'chains', state: 'ready', id: 'L01' }),
  gi({ key: 'g-sheet', kind: 'sheet', group: 'gate', state: 'ready', id: 'C04' }),
], working: [], nodes: {} } as unknown as Flow;
ok('order: locations, faces, clothing, sheets, voices, props, the rest by the work\'s order, the go for the video last', keys(waitItemsOf(all)).join() === 'card:a-loc,gate:g-master,card:a-face,gate:g-face,gate:g-cloth,gate:g-sheet,card:a-voice,gate:g-voice,gate:g-prop,card:a-previz,card:a-go,gate:g-go', keys(waitItemsOf(all)));
ok('order: the ranks behind it', ['loc', 'faces', 'clothing', 'sheet', 'voices'].map((place) => waitRank({ place: place as WaitItem['place'] })).every((r, i, a) => i === 0 || r > a[i - 1]) && waitRank({ place: 'loc', gate: gi({ key: 'p', kind: 'prop', group: 'gate', state: 'ready' }) }) > waitRank({ place: 'voices' }) && waitRank({ place: 'scenes', gate: gi({ key: 'g', kind: 'go', group: 'gate', state: 'ready' }) }) > waitRank({ place: 'release' }));
ok('order: equal ranks keep the order they came in', byImportance([{ place: 'faces' as const, k: 'b' }, { place: 'loc' as const, k: 'x' }, { place: 'faces' as const, k: 'a' }]).map((x) => x.k).join() === 'x,b,a');
ok('order: the go alone is the first item', keys(waitItemsOf({ ...all, asks: [], gate: [all.gate[0]] } as Flow)).join() === 'gate:g-go');

// ---- which step each item holds up: only from a real waiting item, never from the order
const STEPS: StepId[] = ['script', 'characters', 'places', 'shots', 'boards', 'takes', 'approved', 'full', 'sound', 'subs', 'master', 'final', 'posted'];
const steps = (current: StepId, done: StepId[] = []) => STEPS.map((id) => ({ id, done: done.includes(id), current: id === current }));
const at = (m: Map<StepId, WaitItem[]>) => [...m.entries()].map(([k, v]) => `${k}:${v.map((x) => x.key).join('+')}`).join(' ');
const byStep = waitsByStep(W.items, steps('characters', ['script']));
ok('steps: each card counts against its own step while that step is still to do', at(byStep) === 'characters:card:ASK-C08-voice-r1 boards:card:ASK-boards-S1-S2-v2 takes:card:GO-S3-closer', at(byStep));
ok('steps: no step gets a line from the order alone (the steps still to do with nothing waiting get none)', byStep.size === 3 && !['places', 'shots', 'approved', 'full', 'sound'].some((id) => byStep.has(id as StepId)), [...byStep.keys()]);
ok('steps: nothing waiting, no line at all', waitsByStep([], steps('characters', ['script'])).size === 0);
const behind = waitsByStep(W.items, steps('full', ['script', 'characters', 'places', 'shots', 'boards', 'takes', 'approved']));
ok('steps: a card whose own step is done counts against the step to look at', at(behind) === 'full:card:ASK-C08-voice-r1+card:ASK-boards-S1-S2-v2+card:GO-S3-closer', at(behind));
const ahead = waitsByStep(W.items, steps('takes', ['script', 'places', 'shots', 'boards']));
ok('steps: a card whose own step comes before the step to look at counts against the step to look at', at(ahead) === 'takes:card:ASK-C08-voice-r1+card:ASK-boards-S1-S2-v2+card:GO-S3-closer', at(ahead));
ok('steps: only what can be answered now holds a step up', at(waitsByStep(D.items, steps('characters', ['script']))) === 'characters:gate:pick:C01+gate:pick:C04', at(waitsByStep(D.items, steps('characters', ['script']))));
ok('steps: no step to look at (all done), no line', waitsByStep(W.items, STEPS.map((id) => ({ id, done: true, current: false }))).size === 0);

// the steps' line
ok('line: one item, its answer and its title without "approve"', waitsLine([yes!]) === 'Waits for your yes on “S1 and S2: the storyboards v2”', waitsLine([yes!]));
ok('line: two named with "and"', waitsLine([yes!, pick!]) === 'Waits for your yes on “S1 and S2: the storyboards v2” and your pick on “C08 the Neighbour: which voice (round 1)”', waitsLine([yes!, pick!]));
ok('line: two named and the rest counted', waitsLine([yes!, pick!, go!]) === 'Waits for your yes on “S1 and S2: the storyboards v2”, your pick on “C08 the Neighbour: which voice (round 1)” and 1 more', waitsLine([yes!, pick!, go!]));
ok('line: a long title shortened', waitsLine([{ ...go!, title: 'A question that is very much longer than the line has room for' }]) === 'Waits for your go on “A question that is very much longer than the…”', waitsLine([{ ...go!, title: 'A question that is very much longer than the line has room for' }]));

// the counts the tab, Alma's chip and the board's Edit line say
ok('count words: "1 waits for you", "3 wait for you"', waitWords(1) === '1 waits for you' && waitWords(3) === '3 wait for you');
const view = whatIsLeft({ cut: 'v1', versions: ['v1'], ready: true, full: { shots: 29, full: 0, takes: 0, markedShots: 0, has: false }, sound: { music: 1, effects: 0 }, subs: { lines: 0, srt: 0, unread: 0 }, master: { state: 'none' }, ticks: {} });
ok('Alma\'s chip: what waits for you first, as listed', leftChip(view, W.items.length) === "What's next · 3 wait for you · 7 steps left · the cut approved at 480p", leftChip(view, W.items.length));
ok('Alma\'s chip: nothing waiting, as before', leftChip(view, 0) === "What's next · 7 steps left · the cut approved at 480p", leftChip(view, 0));

console.log(bad ? `${bad} of ${n} failed` : `ok · ${n} checks`);
process.exit(bad ? 1 : 0);
