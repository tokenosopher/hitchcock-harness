// npm run release-waits:test
// Posting the film waits for the user ("once I've selected the final … Alma should start drafting
// the text for every platform, and I should still get in 'What's Next' kind of 'Push to All Platforms' … say 'Done' …
// Otherwise, still have the white dot"). Checks, pure:
//   - the release in brief the state carries (left.ts postBrief): platforms, posted, the user's "Done" tick;
//   - the wait item (derive.ts releaseWait): in waitingKeys (the white dot, the subtitle, the server's count) and in
//     waitItemsOf, opening the Release page; none for a delivered film, everything posted, "Done" ticked, no texts, no
//     final, no release file;
//   - What's next's last step in its three states: being made while Alma drafts, the user's with Open Release and
//     "Done" once the texts are in, done when all are posted or ticked;
//   - naming the final asks for the texts only when there are none (alma.ts wantsTexts), in the recipe's words, and the
//     thread says when Alma is drafting (textsAsked).
// One line per check, a summary line, exit 1 when any check fails.
import { postBrief, whatIsLeft, parseTickOp, type LeftInput, type LeftView } from '../src/components/edit/left';
import { filmSubtitle, releaseWait, waitingKeys, waitingWords } from '../src/components/lib/derive';
import { flowOf } from '../src/components/lib/flow';
import { itemHref, waitItemsOf, waitsByStep } from '../src/components/flow/waitList';
import { listedKeys } from '../src/components/lib/sent';
import { finalTextsAsk, textsAsked, textsChip, wantsTexts } from '../src/components/release/alma';
import { leftSampleState, leftReleaseSeed } from '../src/fixtures/left';
import type { FilmState, TaskCard, ThreadEvent } from '../src/server/types';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---- the brief the state carries
const posting = leftReleaseSeed('sample-left-posting')!;
const pb = postBrief(posting);
ok('brief: the final, six platforms, two posted', pb?.final?.version === 'v1' && pb.platforms === 6 && pb.posted === 2 && !pb.done, pb);
ok('brief: the "Done" tick from the ticks file', postBrief(posting, { posted: { at: '2026-11-22T10:00:00.000Z', cut: 'v1' } })?.done === '2026-11-22T10:00:00.000Z');
ok('brief: not a release file', postBrief(undefined) === undefined && postBrief([]) === undefined);
ok('brief: a broken platforms list counts as none', postBrief({ final: { path: 'x.mp4' }, platforms: 'no' })?.platforms === 0);
ok('tick: "posted" is a tick the route takes', JSON.stringify(parseTickOp({ tick: 'posted', cut: 'v1' })) === '{"tick":"posted","cut":"v1"}' && JSON.stringify(parseTickOp({ untick: 'posted' })) === '{"untick":"posted"}');

// ---- the wait item
const state = (release: ReturnType<typeof postBrief>, o: Partial<FilmState['film']> = {}): FilmState => {
  const s = clone(leftSampleState('sample-left-posting')!);
  s.film = { ...s.film, ...o };
  s.post = { ...(s.post ?? { cuts: [], masters: [], captions: [] }), ...(release ? { release: { path: 'social/release.json', ...release } } : { release: undefined }) };
  return s;
};
const S = state(pb);
const w = releaseWait(S);
ok('item: a final, texts, two of six posted', w?.key === 'release:post' && w.title === 'Post the film: 2 of 6 platforms posted', w);
ok('item: its line', w?.line === 'The final is the master of v1 · the texts for all 6 platforms are in', w?.line);
ok('item: in waitingKeys (the white dot, the subtitle, the server\'s count)', waitingKeys(S, []).includes('release:post'), waitingKeys(S, []));
ok('item: alone, its words', waitingWords(['release:post']) === 'waits for your post' && waitingWords(['release:post'], true) === 'The film waits for your post');
ok('item: the sidebar subtitle says it', /waits for your post$/.test(filmSubtitle(S, [])), filmSubtitle(S, []));
ok('item: listed by the state (lib/sent.ts)', listedKeys(S).has('release:post'));
const F = flowOf(S, []);
const I = waitItemsOf(F).find((x) => x.key === 'release:post');
ok('item: in "Waiting for you", word "Your post", at Release', !!I && I.word === 'Your post' && I.answer === 'your post' && I.place === 'release' && I.release?.title === w?.title, I);
ok('item: opens the Release page', !!I && itemHref(I, F) === '/release');
ok('item: What\'s next puts it on the publishing step', !!I && waitsByStep([I], [{ id: 'final', done: true, current: false }, { id: 'posted', done: false, current: true }]).get('posted')?.[0]?.key === 'release:post');
ok('no item: everything posted', !releaseWait(state({ ...pb!, posted: 6 })));
ok('no item: "Done" ticked', !releaseWait(state({ ...pb!, done: '2026-11-22T10:00:00.000Z' })));
ok('no item: no texts yet (Alma drafting)', !releaseWait(state({ ...pb!, platforms: 0, posted: 0 })));
ok('no item: no final', !releaseWait(state({ platforms: 6, posted: 2 })));
ok('no item: no release file', !releaseWait(state(undefined)) && !waitingKeys(state(undefined), []).includes('release:post'));
ok('no item: a delivered film, even with platforms not posted', !releaseWait(state(pb, { status: 'delivered' })));

// ---- What's next's last step
const base: LeftInput = {
  cut: 'v1', versions: ['v1'], ready: true, full: { shots: 3, full: 3, takes: 0, markedShots: 0, has: true },
  sound: { music: 1, effects: 1 }, subs: { lines: 4, srt: 0, unread: 0 }, master: { state: 'done' },
  approved: { version: 'v1' }, ticks: { sound: { at: '2026-11-14T10:00:00Z', cut: 'v1' } },
};
const step = (v: LeftView) => v.steps.find((s) => s.id === 'posted')!;
const drafting = whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 0, posted: 0 }, drafting: true });
const d = step(drafting);
ok('step, drafting: being made, not the user\'s, no button', d.current && !d.done && d.working?.yours === false && !d.action && !d.also, d);
ok('step, drafting: its words', d.facts === 'Alma is drafting the texts for every platform', d.facts);
const noTexts = step(whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 0, posted: 0 } }));
ok('step, no texts and Alma not on it: "no texts yet", Open Release', noTexts.facts === 'no texts yet' && noTexts.action?.label === 'Open Release' && !noTexts.working && !noTexts.also, noTexts);
const ready = whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 5, posted: 0 } });
const r = step(ready);
ok('step, texts in: the user\'s, says what to do', r.current && !r.working && r.facts === 'Post to every platform · 0 of 5 posted', r);
ok('step, texts in: Open Release opens the Release page', r.action?.label === 'Open Release' && r.action.do.kind === 'release' && r.row.kind === 'release');
ok('step, texts in: a quiet "Done" ticks it', r.also?.label === 'Done' && r.also.do.kind === 'tick' && r.also.do.tick === 'posted', r.also);
ok('step, texts in: the drafting flag no longer counts', !step(whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 5, posted: 0 }, drafting: true })).working);
const onBoard = step(whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 5, posted: 0 }, board: true }));
ok('step, texts in, on the film page: Open Release stays, "Done" goes to the Edit page', onBoard.action?.do.kind === 'release' && onBoard.also?.do.kind === 'on-edit' && onBoard.also.do.step === 'posted', onBoard);
const ticked = whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 5, posted: 2 }, ticks: { ...base.ticks, posted: { at: '2026-11-22T10:00:00Z', cut: 'v1' } } });
ok('step, ticked Done: done, by the user, can be taken back', step(ticked).done && step(ticked).ticked === 'posted' && step(ticked).facts === '2 of 5 posted · ticked done by you', step(ticked));
ok('step, ticked Done: the film is done', ticked.left === 0 && ticked.footer === 'Publishing ticked done by you. The film is done.', ticked.footer);
const all = whatIsLeft({ ...base, release: { final: { version: 'v1' }, platforms: 5, posted: 5 } });
ok('step, all posted: done, no tick', step(all).done && !step(all).ticked && step(all).facts === '5 of 5 posted' && all.footer === 'Published on every platform. The film is done.');

// ---- naming the final asks for the texts
const final = { name: 'Film - FINAL.mp4', version: 'v12', path: 'cut/renders/v12-master.mp4' };
ok('ask: sent when the file has no platforms', wantsTexts({ final, platforms: [] }, 'Named the master of v12 as the final (cut/renders/v12-master.mp4)'));
ok('ask: not when texts exist (the same final, or a changed one)', !wantsTexts({ final, platforms: [{}] }, 'Named the master of v12 as the final'));
ok('ask: not when the same master is named again', !wantsTexts({ final, platforms: [] }, 'The final is already the master of v12'));
const chip = textsChip('film-x', final);
ok('ask: the chip "Release texts · cut v12" carries the request', chip.id === 'release:texts' && chip.label === 'Release texts · cut v12' && chip.command === finalTextsAsk('film-x', final));
ok('ask: in the recipe\'s words, with the release file', chip.command === 'I named the final: Film - FINAL.mp4 (the master of v12, cut/renders/v12-master.mp4). Draft the text for every platform for this final now. The release file is assets/films/film-x/social/release.json; recipes/release.md ("Starting the platforms") says how to start its platforms.', chip.command);

// ---- Alma drafting, from the thread
const asked: ThreadEvent = { kind: 'user', id: 'u', at: '2026-11-22T10:00:00Z', text: '', context: { film: 'film-x', page: '/films/film-x/edit', pinned: '', selected: [chip] } };
const rel = { final: { version: 'v12' }, platforms: 0 };
ok('drafting: the ask in the thread, her turn going', textsAsked([asked], [], rel));
ok('drafting: her turn ended without texts: no longer', !textsAsked([asked, { kind: 'result', id: 'r', at: '2026-11-22T10:01:00Z', ok: true, sessionId: '' }], [], rel));
const task: TaskCard = { id: 't', title: 'Alma › release · texts', state: 'running', startedAt: '2026-11-22T10:01:00Z', steps: [] };
ok('drafting: a release task of hers still live', textsAsked([asked, { kind: 'result', id: 'r', at: '2026-11-22T10:01:00Z', ok: true, sessionId: '' }], [task], rel));
ok('drafting: an ask for another final does not count', !textsAsked([asked], [], { final: { version: 'v13' }, platforms: 0 }));
ok('drafting: once texts are in, never', !textsAsked([asked], [], { final: { version: 'v12' }, platforms: 3 }));

console.log(`\n${n - bad} of ${n} passed`);
if (bad) process.exit(1);
