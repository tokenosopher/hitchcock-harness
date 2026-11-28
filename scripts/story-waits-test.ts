// npm run story-waits:test
// The story or the script waiting on the user (derive.ts storyWait): the sidebar's white dot shows
// for them too. Fed with
// the Story page's samples (src/fixtures/story.ts) and shapes made from them: a script draft waits for the user's lock,
// an unsettled story with no script waits for their read; a locked script, a settled story without a script (Alma's
// move), a film past the story (an old film with takes and no lock flag) and a delivered film wait for nothing. The item
// is one key of waitingKeys (the sidebar's white dot, its subtitle, the server's count) and the first of waitItemsOf;
// the flow's Story step reads "yours to look at", not running; Lock or Settle just pressed takes it out at once
// (lib/sent.ts). One line per check, a summary line, exit 1 when any check fails.
import { storySampleState } from '../src/fixtures/story';
import { atStoryStage, filmSubtitle, scriptScenes, storyWait, waitingKeys, waitingWords } from '../src/components/lib/derive';
import { flowOf } from '../src/components/lib/flow';
import { itemHref, waitItemsOf, waitsByStep } from '../src/components/flow/waitList';
import { listedKeys, stillSent, storySent, withSent } from '../src/components/lib/sent';
import type { FeedCard, FilmState, SceneRef, TaskCard } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const sample = (slug: string): FilmState => {
  const s = storySampleState(slug);
  if (!s) throw new Error(`no ${slug} state`);
  return JSON.parse(JSON.stringify(s)) as FilmState;
};
const storyKeys = (s: FilmState, tasks: TaskCard[] = []) => waitingKeys(s, tasks).filter((k) => k.startsWith('story:'));

// ---- a script draft waits for the user's lock (Maren's shape: settled story, script v2 the user's edit, no cast)
const W = sample('sample-story-waits');
const w = storyWait(W, []);
ok('script draft: an item, keyed by its version', w?.kind === 'script' && w.key === 'story:script-v2' && !w.sent, w);
ok('script draft: its key is in waitingKeys (the white dot, the subtitle, the server\'s count)', waitingKeys(W, []).join() === 'story:script-v2', waitingKeys(W, []));
ok('script draft: it says the script waits for the lock', w?.title === 'Script v2 is ready to lock', w?.title);
ok('script draft: its line gives the length, the scenes, the spoken lines and the lines changed from the settled story', w?.line === '0:50 · 3 scenes · 7 spoken lines · 1 differs from story v3', w?.line);
ok('script draft: what goes on in it: the scenes, the story it comes from, which line changed', !!w && /^The scenes: S1 The bottle · S2 /.test(w.summary[0]) && w.summary[1] === 'Written from story v3, the story you settled.' && w.summary[2] === 'Changed from story v3: S1 line 1.', w?.summary);
const WF = flowOf(W, []);
const WI = waitItemsOf(WF);
ok('"Waiting for you": the script is its one item, with the lock as its word and answer', WI.length === 1 && WI[0].key === 'story:script-v2' && WI[0].word === 'Your lock' && WI[0].answer === 'your lock' && WI[0].story?.title === w?.title, WI.map((x) => [x.key, x.word, x.answer]));
ok('its button opens the Story page at the script, where "Lock v2" is', itemHref(WI[0], WF) === '/story?tab=script', itemHref(WI[0], WF));
ok('the flow counts it ("Waiting for you 1") and opens on it', WF.waiting === 1 && WF.story?.key === 'story:script-v2', [WF.waiting, WF.story?.key]);
ok('the Story step: yours to look at, "v2 draft · waits for your lock", not running', WF.nodes.story.state === 'pick' && WF.nodes.story.status === 'v2 draft · waits for your lock' && WF.nodes.story.short === WF.nodes.story.status, [WF.nodes.story.state, WF.nodes.story.status]);
ok('the sidebar\'s subtitle says what it waits for, not "1 pick waiting"', filmSubtitle(W, []) === 'Story · waits for your lock', filmSubtitle(W, []));
ok('the flow\'s words and a notice\'s words', WF.waitWords === 'waits for your lock' && waitingWords(waitingKeys(W, []), true) === 'Script v2 waits for your lock', [WF.waitWords, waitingWords(waitingKeys(W, []), true)]);
ok('What\'s next holds it at the script step', waitsByStep(WI, [{ id: 'script', done: false, current: true }]).get('script')?.[0]?.key === 'story:script-v2');

// first in "Waiting for you", before a location's card and a face's card
const card = (key: string, place: FeedCard['place']): FeedCard => ({ key, section: '', placed: 'card', place, media: [], title: key, ids: [], ask: { kind: 'yes', options: [] } } as unknown as FeedCard);
const mixed: FilmState = { ...W, feed: { counts: {}, asks: [card('ASK-loc', 'loc'), card('ASK-face', 'faces')] } };
const MI = waitItemsOf(flowOf(mixed, []));
ok('first in "Waiting for you", before the locations and the faces', MI.map((x) => x.key).join() === 'story:script-v2,card:ASK-loc,card:ASK-face', MI.map((x) => x.key));
ok('with other items, the words count them all ("3 picks waiting")', filmSubtitle(mixed, []) === 'Story · 3 picks waiting', filmSubtitle(mixed, []));

// ---- locked: nothing waits
const L = sample('sample-story-locked');
ok('locked script: no item', !storyWait(L, []) && !storyKeys(L).length, storyKeys(L));
ok('locked script: the Story step is locked', flowOf(L, []).nodes.story.state === 'locked');
const lockedNow: FilmState = { ...W, script: { ...W.script!, versions: W.script!.versions.map((v) => (v.version === 'v2' ? { ...v, locked: true } : v)) } };
ok('the same draft once script.md shows the lock: the item goes', !storyKeys(lockedNow).length && waitItemsOf(flowOf(lockedNow, [])).length === 0, storyKeys(lockedNow));

// ---- an unsettled story, no script: waits for the user's read
const D = sample('sample-story-draft');
const d = storyWait(D, []);
ok('unsettled story, no script: an item for the user\'s read', d?.kind === 'story' && d.key === 'story:story-v3' && d.title === 'Story v3 is ready to read and settle', d);
ok('its line and what goes on in it', d?.line === '224 words · Alma’s draft · 16 Nov · 3 versions' && /^It opens: “A lighthouse on a rocky point, early morning\.”$/.test(d?.summary[0] ?? ''), [d?.line, d?.summary]);
const DI = waitItemsOf(flowOf(D, []));
ok('its word is Settle, its answer your read, and it opens the Story page at the story', DI[0]?.word === 'Settle' && DI[0]?.answer === 'your read' && itemHref(DI[0], flowOf(D, [])) === '/story?tab=story', DI.map((x) => [x.key, x.word]));
ok('the Story step: yours to look at, "story v3 · waits for your read"', flowOf(D, []).nodes.story.state === 'pick' && flowOf(D, []).nodes.story.status === 'story v3 · waits for your read', flowOf(D, []).nodes.story.status);
ok('the subtitle: "Story · waits for your read"', filmSubtitle(D, []) === 'Story · waits for your read', filmSubtitle(D, []));

// ---- a settled story with no script yet: Alma writes the script, nothing waits for the user
const settledNoScript: FilmState = { ...D, story: { ...D.story!, settled: { version: D.story!.current } } };
ok('settled story, no script: no item (Alma\'s move)', !storyWait(settledNoScript, []) && !storyKeys(settledNoScript).length, storyKeys(settledNoScript));
ok('settled story, no script: the Story step is Alma\'s (running), the count 0', flowOf(settledNoScript, []).nodes.story.state === 'running' && flowOf(settledNoScript, []).waiting === 0);
ok('no story, no script: nothing', !storyWait(sample('sample-story-new'), []) && flowOf(sample('sample-story-new'), []).nodes.story.state === 'waiting');

// ---- old films: made before the harness had a script lock, takes and cuts and no lock flag
const take = { id: 'take1', kind: 'take', path: 'generations/S1/S1-take-1-480p.mp4', misses: [] };
const scene = (id: string, more: Partial<SceneRef> = {}): SceneRef => ({ id, title: id, takes: [], promptVersions: [], ...more } as unknown as SceneRef);
const old: FilmState = { ...W, film: { ...W.film, stage: 9 }, scenes: [scene('S1', { sceneFile: 'generations/S1/S1-scene.md', takes: [take] } as Partial<SceneRef>)] };
ok('old film (stage 9, takes, an unlocked script): no item', !storyWait(old, []) && !storyKeys(old).length, storyKeys(old));
ok('old film: the Story step reads done, not running or yours', flowOf(old, []).nodes.story.state === 'done', flowOf(old, []).nodes.story.state);
const oldStage1: FilmState = { ...W, scenes: [scene('S1', { takes: [take] } as Partial<SceneRef>)] };
ok('old film whose stage reads 1 but has takes: no item', !storyKeys(oldStage1).length && !atStoryStage(oldStage1));
const prompted: FilmState = { ...W, scenes: [scene('S1', { promptVersions: [{ version: 'v1', path: 'p' }] } as unknown as Partial<SceneRef>)] };
ok('a scene with a prompt: past the story, no item', !storyKeys(prompted).length);
const withCutFile: FilmState = { ...W, post: { cuts: ['cut/v3.mp4'], masters: [], captions: [] } as FilmState['post'] };
ok('a cut file in cut/: past the story, no item', !storyKeys(withCutFile).length);
const delivered: FilmState = { ...W, film: { ...W.film, status: 'delivered' } };
ok('delivered: no item, and its Story step is done', !storyKeys(delivered).length && flowOf(delivered, []).nodes.story.state === 'done');
const oldStory: FilmState = { ...D, film: { ...D.film, stage: 6 } };
ok('an unsettled story in a film past the story: no item', !storyKeys(oldStory).length);
const planned: FilmState = { ...W, cut: { versions: [{ version: 'v1' }] } as unknown as FilmState['cut'] };
ok('the planned timeline alone (made at the lock) does not hide the draft', storyKeys(planned).join() === 'story:script-v2', storyKeys(planned));

// ---- Alma at work on the story, or asking the same thing herself
const task = (state: TaskCard['state']): TaskCard => ({ id: 't1', title: 'Alma › script · re-time v2', state } as TaskCard);
ok('a story sub-agent running: no item, the Story step runs', !storyKeys(W, [task('running')]).length && flowOf(W, [task('running')]).nodes.story.state === 'running');
ok('a story sub-agent queued: no item', !storyKeys(W, [task('queued')]).length);
ok('a story sub-agent done: the item is back', storyKeys(W, [task('done')]).join() === 'story:script-v2');
const A = sample('sample-story-asks');
ok('Alma\'s own card asks for the lock: one question, not two (the card)', !storyWait(A, []) && waitingKeys(A, []).filter((k) => k.startsWith('card:')).length === 2 && !storyKeys(A).length, waitingKeys(A, []));
ok('with her cards at Story, the step waits ("2 wait for you")', flowOf(A, []).nodes.story.state === 'pick' && flowOf(A, []).nodes.story.short === '2 wait', flowOf(A, []).nodes.story.short);
const oneOther: FilmState = { ...W, feed: { counts: {}, asks: [card('ASK-story-wording', 'story')] } };
ok('a story card that is not the lock, and the draft: both wait, counted on the step', storyKeys(oneOther).length === 1 && flowOf(oneOther, []).nodes.story.short === '2 wait' && flowOf(oneOther, []).nodes.story.status === '2 wait for you · v2 draft', flowOf(oneOther, []).nodes.story.status);

// ---- "Lock v2" pressed: out at once, Alma's move until script.md shows it
const sent = [storySent('script', 'v2', 1000)];
ok('the lock sent is kept aside as long as Alma\'s work from a pick', sent[0].key === 'story:script-v2' && sent[0].alma === true && sent[0].until - sent[0].at === 30 * 60_000);
const S = withSent(W, sent);
ok('laid over the state: no longer in waitingKeys, so the white dot goes', waitingKeys(S, []).length === 0 && storyWait(S, [])?.sent === true, waitingKeys(S, []));
const SF = flowOf(S, []);
ok('the flow: nothing waiting, the Story step Alma\'s ("v2 draft · lock sent")', SF.waiting === 0 && !SF.story && SF.nodes.story.state === 'running' && SF.nodes.story.status === 'v2 draft · lock sent', [SF.waiting, SF.nodes.story.state, SF.nodes.story.status]);
ok('the server\'s state still lists it, so it stays aside until the lock shows', listedKeys(W).has('story:script-v2') && stillSent(W, sent, 2000).length === 1);
ok('once script.md shows the lock it is no longer kept aside', stillSent(lockedNow, sent, 2000).length === 0);
const settle = [storySent('story', 'v3', 1000)];
ok('"Settle v3" pressed: out at once (the harness writes settled.json itself)', waitingKeys(withSent(D, settle), []).length === 0 && settle[0].until - settle[0].at === 2 * 60_000 && !settle[0].alma);

// ---- the script's timing table, as the length reads it (the figure after the last → or =)
const timing = (cell: string) => {
  const md = `## Script\n\n*v1, draft.*\n\n### S1 · One · L01 a room\n\`[1 s]\` A.\n**A:** "Hi."\n\n| generation | lines | words | action s | ≈ s | ends at |\n|---|---|---|---|---|---|\n| S1 | 1 | 1 | 1 | ${cell} | 0:24 |\n`;
  return scriptScenes({ ...W, scenes: [], script: { versions: [], lines: [], markdown: md } })[0]?.scriptSeconds;
};
ok('timing: "52 ÷ 2.9 + 0.5 × 3 + 5 = 24" is 24 s (Maren\'s tables)', timing('52 ÷ 2.9 + 0.5 × 3 + 5 = 24') === 24, timing('52 ÷ 2.9 + 0.5 × 3 + 5 = 24'));
ok('timing: "14.2 → **15**" is 15 s', timing('14.2 → **15**') === 15, timing('14.2 → **15**'));
ok('timing: "53 ÷ 2.9 + 3.0 + 4 = 25.3 → 25" is 25 s', timing('53 ÷ 2.9 + 3.0 + 4 = 25.3 → 25') === 25);
ok('timing: "**12** (inside S7\'s 23 s in the cut)" is 12 s', timing('**12** (inside S7\'s 23 s in the cut)') === 12);
ok('timing: "4" is 4 s', timing('4') === 4);

console.log(`\n${n - bad} of ${n} checks passed`);
if (bad) process.exit(1);

// The script's scenes in the order of its headings, not by ID number; an earlier draft's headings do not count.
{
  const md = ['## Script', '### S1 · The rock · L02', 'A: one.', '### S2 · The boat · L01', 'A: two.', '### S7 · The telling · L01', 'A: seven.', '### S4 · The letter · L02', 'A: four.', '### S3 · The lamp · L03', 'A: three.', '## Earlier drafts', '### S1 · The rock · L02', '### S3 · The lamp · L03'].join('\n');
  const scenes = ['S1', 'S2', 'S3', 'S4', 'S5', 'S7'].map((id) => ({ id, title: id }));
  const got = scriptScenes({ ...W, scenes, script: { versions: [], lines: [], markdown: md } } as never).map((x) => x.id).join();
  if (got !== 'S1,S2,S7,S4,S3,S5') throw new Error(`scenes in the script's order: ${got}`);
  console.log('ok · the script\'s scenes in the order of its headings, an unwritten scene after');
}

