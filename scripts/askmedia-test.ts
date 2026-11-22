// npm run askmedia:test
// Which files an asking card shows in its body, and how it lays them out (src/components/feed/askMedia.ts: a yes card
// over an "images" card must show its pictures).
// One line per check, a summary line, exit 1 when any check fails.
import type { FeedCard, FeedMedia } from '../src/server/types';
import { askLayout, bodyMedia, optionMediaOf, readHref, readOf, wideBox } from '../src/components/feed/askMedia';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const paths = (m: FeedMedia[]) => m.map((x) => x.path);

// the feed gives each item its id as `option` (feed.ts mediaOf), whatever the card asks
const items: FeedMedia[] = [
  { kind: 'image', path: 'props/P02-table/P02-table-v4.png', label: 'P02 v4', option: 'P02-v4' },
  { kind: 'image', path: 'props/P01-cups/P01-cups-v1.png', label: 'P01 v1', option: 'P01-v1' },
];
type C = Pick<FeedCard, 'media' | 'ask' | 'sounds'>;
const yes: C = { media: items, ask: { kind: 'yes', options: [] } };
const go: C = { media: items, ask: { kind: 'go', options: [], cost: '$1' } };
const why: C = { media: items, ask: { kind: 'why', options: [{ id: '1', label: 'too dark' }] } };

ok('a yes card over images shows both pictures in its body', paths(bodyMedia(yes, true)).length === 2, paths(bodyMedia(yes, true)));
ok('a go card shows its files', bodyMedia(go, true).length === 2);
ok('a why card shows its files (its options are words, not files)', bodyMedia(why, true).length === 2);

// a pick: the files that are its options are drawn in the answer, not in the body
const pick: C = { media: [...items, { kind: 'audio', path: 'sound/ref.mp3', option: 'ref' }], ask: { kind: 'pick', options: [{ id: 'P02-v4', label: 'table' }, { id: 'P01-v1', label: 'cups' }] } };
ok('a pick leaves its option files out of the body', JSON.stringify(paths(bodyMedia(pick, true))) === '["sound/ref.mp3"]', paths(bodyMedia(pick, true)));
ok('an item with an id that is no option of the pick stays in the body', bodyMedia(pick, true).some((m) => m.option === 'ref'));
const byPath: C = { media: [{ kind: 'image', path: 'a.png' }, { kind: 'image', path: 'b.png' }], ask: { kind: 'pick', options: [{ id: '1', label: 'a', path: 'a.png' }] } };
ok('an option named by its path leaves that file out, the other stays', JSON.stringify(paths(bodyMedia(byPath, true))) === '["b.png"]', paths(bodyMedia(byPath, true)));
ok('optionMediaOf finds by id first, then by path', optionMediaOf(pick, { id: 'P01-v1', label: '' })?.path === 'props/P01-cups/P01-cups-v1.png' && optionMediaOf(byPath, { id: 'x', label: '', path: 'a.png' })?.path === 'a.png');
ok('a sound-pick card keeps all its files', bodyMedia({ ...pick, sounds: [{ name: 'door', tries: [] }] } as C, true).length === 3);
ok('a card not asking (history) keeps all its files', bodyMedia(pick, false).length === 3 && bodyMedia({ media: items }, true).length === 2);

ok('one or two pictures: full width, a 960 thumbnail', askLayout(1).wide && askLayout(2).wide && askLayout(2).w === 960);
ok('three or more: a grid, a 640 thumbnail', !askLayout(3).wide && askLayout(5).w === 640);

ok('a wide picture keeps its own shape (the 2560x1440 table: 16:9)', Math.abs(wideBox(2560, 1440).ratio - 16 / 9) < 1e-9 && !wideBox(2560, 1440).maxW);
ok('the 3840x1664 students sheet keeps its 2.31; a wider panorama is held at 21:9', Math.abs(wideBox(3840, 1664).ratio - 3840 / 1664) < 1e-9 && Math.abs(wideBox(4000, 1000).ratio - 21 / 9) < 1e-9);
ok('an upright board stands at 3:4, at most 480 px wide', wideBox(360, 640).ratio === 3 / 4 && wideBox(360, 640).maxW === 480);
ok('before the size is known: 16:9', wideBox().ratio === 16 / 9);

// a card about the story or the script links its page; nothing else does
const R = (title: string, id?: string, place: FeedCard['place'] = 'story') => readOf({ title, id, place });
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
ok('the script lock reads the script at its version', eq(R('Script v2: lock it?', 'ASK-script-lock-v2'), { what: 'script', version: 'v2' }), R('Script v2: lock it?', 'ASK-script-lock-v2'));
ok('an older lock card names its version in the id', eq(R('Script v9: lock', 'ASK-script-v9-lock'), { what: 'script', version: 'v9' }));
ok('a question on a script line reads the script', eq(R("Script v1, S3: how Edda's telling plays", 'ASK-script-v1-legend-voice'), { what: 'script', version: 'v1' }));
ok('a story approval reads the story at its version', eq(R('Story v8: three small changes against kitsch, or settle it as it is?', 'ASK-story-v8-kitsch'), { what: 'story', version: 'v8' }));
ok('a version in brackets counts', eq(R("The king's closing speech: which wording (story v6)", 'ASK-story-closing-speech'), { what: 'story', version: 'v6' }));
ok('a story card with no version reads the story as it is', eq(R('The moment before the sword: what they say', 'ASK-story-loosed-moment'), { what: 'story' }));
ok('a cast question at story links nothing', R('Edda: the one from The Lighthouse, or a new one?', 'ASK-edda-reuse') === undefined);
ok('"scripts" (the tools) is not the script', R('Bring four small scripts and forms in line with the new flow', 'ASK-V31-scripts') === undefined);
ok('a card on another page links nothing, whatever it says', R('S2 storyboard v4, the script line: approve', 'ASK-S2-boards-v4', 'previz') === undefined);
ok('the address: the Story page at its tab and version', readHref('f', { what: 'script', version: 'v2' }) === '/films/f/story?tab=script&v=v2' && readHref('f', { what: 'story' }) === '/films/f/story?tab=story');

console.log(`${n - bad} of ${n} checks pass`);
if (bad) process.exit(1);
