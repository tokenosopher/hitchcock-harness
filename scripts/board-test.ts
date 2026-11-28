// npm run board:test
// The film's board as drawn (ASKS 46 and 47, the timeline design's FlowWaiting): its three rows, only Edit and Release
// after the gate, the steps that are no longer boxes opening under Edit, Previz read from each scene's previz (it said
// "not yet" on a film whose previz is one file per scene), and the people boxes in the
// Characters cards' own words. Pure: a sample film's state with a few fields changed.
import { castSampleState } from '../src/fixtures/cast';
import { BOX_OF, defaultOpen, flowOf, ORDER, PEOPLE, PLACES, THEN, type Flow } from '../src/components/lib/flow';
import { castAll, castBoxLines, castLine } from '../src/components/characters/Cards';
import type { FeedCard, FilmState } from '../src/server/types';
import { masterYesOf } from '../src/server/films/read/master';
import { cardsOf, CARD_TYPES } from '../src/server/films/read/feed';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => { n++; if (!cond) { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); } };

const base = castSampleState('sample-cast');
if (!base) throw new Error('no sample-cast state');
const clone = (s: FilmState): FilmState => JSON.parse(JSON.stringify(s)) as FilmState;

// the rows
ok('places: Locations, Views, Shots, Previz', PLACES.join() === 'loc,views,shots,previz', PLACES);
ok('people: Faces, Clothing, Sheet, Voices, Character elements', PEOPLE.join() === 'faces,clothing,sheet,voices,elements', PEOPLE);
ok('then: the gate, Edit, Release (nothing else after the gate)', THEN.join() === 'gate,edit,release', THEN);
ok('every step still has an address', ['elements', 'scenes', 'finish', 'sound'].every((k) => ORDER.includes(k as never)));
ok('Scenes, Finish and Sound open under Edit', BOX_OF.scenes === 'edit' && BOX_OF.finish === 'edit' && BOX_OF.sound === 'edit');
const f0 = flowOf(base, []);
ok('the character elements box is named in the user\'s words', f0.nodes.elements.name === 'Character elements', f0.nodes.elements.name);

// Previz from each scene's previz
const pv = clone(base);
pv.scenes = pv.scenes.slice(0, 3).map((sc, i) => ({ ...sc, previzPath: `previz/${sc.id}/${sc.id}-previz-take-${i + 2}.mp4` }));
pv.previz = { film: [], storyboards: [] } as unknown as FilmState['previz'];
const f1 = flowOf(pv, []);
ok('Previz: every scene has its previz, so it is done', f1.nodes.previz.state === 'done', f1.nodes.previz.state);
ok('Previz: "3 of 3 scenes"', f1.nodes.previz.short === '3 of 3 scenes', f1.nodes.previz.short);
const half = clone(pv);
half.scenes[2].previzPath = undefined;
const f2 = flowOf(half, []);
ok('Previz: two of three is not done', f2.nodes.previz.state !== 'done' && f2.nodes.previz.short === '2 of 3 scenes', [f2.nodes.previz.state, f2.nodes.previz.short]);
const none = clone(base);
none.scenes = none.scenes.map((sc) => ({ ...sc, previzPath: undefined }));
none.previz = { film: [], storyboards: [] } as unknown as FilmState['previz'];
ok('Previz: no previz at all reads as before', !/scene/.test(flowOf(none, []).nodes.previz.short), flowOf(none, []).nodes.previz.short);

// Shots when every scene file is written: "n scenes, m shots"
const sh = clone(base);
sh.scenes = sh.scenes.slice(0, 2).map((sc, i) => ({ ...sc, sceneFile: `generations/${sc.id}/${sc.id}-scene.md`, shots: 3 + i }));
ok('Shots: "2 scenes planned" (the board adds the shots made from the takes, MainPage.tsx)', flowOf(sh, []).nodes.shots.short === '2 scenes planned', flowOf(sh, []).nodes.shots.short);

// defaultOpen never lands on a step that is not a box
const fake = (k: string): Flow => {
  const f = flowOf(base, []);
  const nodes = Object.fromEntries(Object.entries(f.nodes).map(([key, v]) => [key, { ...v, state: key === k ? 'running' : 'done' }])) as Flow['nodes'];
  return { ...f, nodes, waiting: 0 };
};
ok('a running Scenes opens Edit', defaultOpen(fake('scenes')) === 'edit', defaultOpen(fake('scenes')));
ok('a running Sound opens Edit', defaultOpen(fake('sound')) === 'edit');
ok('a running Faces opens Faces', defaultOpen(fake('faces')) === 'faces');

// the Characters cards: the people first, then the groups; the faces line
const order = castAll(base).map((c) => c.id);
ok('the cards: the people in cast order, then the groups', order.join() === 'C01,C02,C03,C04,C08,C06-C07', order);
ok('the faces line counts people and groups apart', /^4 picked · press a card/.test(castLine(base, 'faces')), castLine(base, 'faces'));
const done = clone(base);
const fd = flowOf(done, []);
const lines = castBoxLines(done, { ...fd, nodes: { ...fd.nodes, sheet: { ...fd.nodes.sheet, state: 'done', aims: [] }, faces: { ...fd.nodes.faces, state: 'pick' } } });
ok('a done box takes the cards\' words', /^\d+ of \d+ done$/.test(lines.sheet ?? ''), lines);
ok('a box still open keeps the flow\'s words', lines.faces === undefined, lines);

// Sound and Release the Film Flow v3.3 way: the finished sound is in the app's master (cut/renders/v<n>-master.mp4),
// no cut/<film>-final-clean.mp4 and no social/kit.md are made; the older films keep their reading
const v32 = (edit: (s: FilmState) => void): Flow => { const s = clone(base); s.film = { ...s.film, status: 'in-progress', delivered: undefined }; edit(s); return flowOf(s, []); };
const master = { path: 'cut/renders/v12-master.mp4', version: 'v12', date: '2026-11-16T10:00:00.000Z', bytes: 60_000_000, from: 'render' as const };
const music = v32((s) => { s.master = master; s.sound = { counts: { music: 2, sfx: 3 } }; });
ok('Sound: a master and music on disk but no yes yet is still being made', music.nodes.sound.state === 'running' && music.nodes.sound.short !== 'mixed', [music.nodes.sound.state, music.nodes.sound.short]);
ok('Finish: the app\'s master is the 1080p master', music.nodes.finish.state === 'done', music.nodes.finish.state);
const yes = v32((s) => { s.master = master; s.sound = { counts: { music: 2 }, masterYes: { key: 'ASK-v12-master', id: 'ASK-v12-master', title: 'Master of cut v12: approve' } }; });
ok('Sound: the user\'s yes on a master at Sound is the finished sound', yes.nodes.sound.state === 'done' && yes.nodes.sound.short === 'mixed', [yes.nodes.sound.state, yes.nodes.sound.short]);
const yesOnly = v32((s) => { s.master = master; s.sound = { counts: {}, masterYes: { key: 'k', title: 'v12 master: approve' } }; });
ok('Sound: done from the master\'s yes with no sound folder at all', yesOnly.nodes.sound.state === 'done', yesOnly.nodes.sound.state);
const named = v32((s) => { s.master = master; s.post = { cuts: [], masters: [], captions: [], release: { path: 'social/release.json', final: { path: 'cut/renders/v12-master.mp4', version: 'v12' } } }; });
ok('Sound: a final named in social/release.json means the sound is made', named.nodes.sound.state === 'done', named.nodes.sound.state);
ok('Release: the release file started is in work, with no social/kit.md', named.nodes.release.state === 'running' && named.nodes.release.short === 'final named', [named.nodes.release.state, named.nodes.release.short]);
const relOnly = v32((s) => { s.post = { cuts: [], masters: [], captions: [], release: { path: 'social/release.json' } }; });
ok('Release: a release file without a final is in work; the Sound step does not take it as done', relOnly.nodes.release.state === 'running' && relOnly.nodes.release.short === 'in work' && relOnly.nodes.sound.state !== 'done', [relOnly.nodes.release.state, relOnly.nodes.release.short, relOnly.nodes.sound.state]);
const old = v32((s) => { s.post = { cuts: [], masters: [], captions: [], finals: ['cut/old-film-final-clean.mp4'], kit: 'social/kit.md' }; });
ok('older films: a finished film named final still makes Sound done, the kit still starts Release', old.nodes.sound.state === 'done' && old.nodes.release.state === 'running' && old.nodes.release.short === 'kit', [old.nodes.sound.state, old.nodes.release.state, old.nodes.release.short]);
const mix = v32((s) => { s.sound = { counts: { mix: 1 } }; });
ok('older films: a mix kept in audio/master/ still makes Sound done', mix.nodes.sound.state === 'done', mix.nodes.sound.state);
const nothing = v32((s) => { s.master = undefined; s.sound = undefined; });
ok('Sound: nothing made waits', nothing.nodes.sound.state === 'waiting', nothing.nodes.sound.state);

// the yes the Sound step reads: an answered yes card at sound that names a master (server/films/read/master.ts)
const card = (over: Partial<FeedCard>, answer: { option?: string } | null = {}): FeedCard => ({
  key: 'k', id: 'ASK-v12-master', title: 'Master of cut v12: approve', section: 'Sound', place: 'sound', placed: 'card', ids: [], media: [],
  ask: { kind: 'yes', options: [], ...(answer ? { answer: { ...answer, by: 'harness' as const } } : {}) }, ...over,
});
ok('the yes: an answered yes on a master at Sound', masterYesOf([card({})])?.id === 'ASK-v12-master');
ok('the yes: not before the user answers', masterYesOf([card({}, null)]) === undefined);
ok('the yes: a "no" is not a yes', masterYesOf([card({}, { option: 'no' })]) === undefined);
ok('the yes: a master card at Finish is not the sound\'s', masterYesOf([card({ place: 'finish' })]) === undefined);
ok('the yes: a yes at Sound on something else (a music version) is not the master\'s', masterYesOf([card({ title: 'Music v3: approve' })]) === undefined);
ok('the yes: a card placed by a guess does not count', masterYesOf([card({ placed: 'guess' })]) === undefined);
ok('the yes: the newest of two', masterYesOf([card({ key: 'a', id: 'A', date: '2026-11-15T10:00:00Z' }), card({ key: 'b', id: 'B', date: '2026-11-16T10:00:00Z' })])?.id === 'B');

// a card type the record does not know (16 Nov: the review build that stopped on one is gone): shown, and said
{
  const said: string[] = [];
  const got = cardsOf({ sections: [{ heading: 'S1', cards: [
    { type: 'vidoes', id: 'X1', title: 'S1 takes', items: [{ file: 'generations/S1/takes/take1/a.mp4' }] },
    { type: 'groups', title: 'C01', cards: [{ type: 'images', title: 'inner' }] },
    ...CARD_TYPES.filter((t) => t !== 'group').map((t) => ({ type: t, title: `a ${t}` })),
    { title: 'no type at all' },
  ] }] }, (m) => said.push(m));
  ok('an unknown card type is still shown, with its file', got.some((c) => c.id === 'X1' && c.media.length === 1), got.map((c) => c.title));
  ok('an unknown card type is said in the film\'s warnings, by its title', said.some((m) => /"S1 takes": the card type "vidoes" is not one the harness knows/.test(m)), said);
  ok('a misspelt group says its cards are not shown', said.some((m) => /"groups".*the cards inside it are not shown/.test(m)), said);
  ok('the known types and a card without a type are not warned about', said.length === 2, said);
}

console.log(`${n - bad} of ${n} board checks passed`);
process.exit(bad ? 1 : 0);
