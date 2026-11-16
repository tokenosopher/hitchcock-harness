// npm run working:test
// The working cut and its history (14 Nov 2026, stage 1 of "saving apart from history": src/components/edit/history.ts,
// src/server/edit/working.ts), on synthetic films in a temp folder (deleted after). Seeding equals today's undo chain
// (EditPage's, read from the version notes) for written and random note histories; step, undo, redo, goTo and restore
// survive a re-read and never write a version; a new step drops the undone ones; one snapshot per content; a stale rev
// writes nothing; save writes the next version once (and nothing when nothing changed), names; the repair after a
// crash between the two writes; a missing snapshot said; the 1,000 cap and its cleanup; the edits-since count; ten
// steps at once with the same rev, one lands; the memory store of sample mode writes nothing. Never touches a real film.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Timeline, TimelineTrack, TimelineVersionRef } from '../src/server/types';

const root = mkdtempSync(path.join(os.tmpdir(), 'working-test-'));
const repo = path.join(root, 'repo');
process.env.HARNESS_FILM_REPO = repo;
process.env.HARNESS_DIR = path.join(root, 'harness');
process.env.HARNESS_NO_CUT_WATCH = '1';

let checks = 0;
function check(what: string, ok: boolean, got?: unknown): void {
  checks++;
  if (!ok) { console.log(`FAIL · ${what}${got === undefined ? '' : ` · ${JSON.stringify(got).slice(0, 400)}`}`); throw new Error(`failed: ${what}`); }
  console.log(`ok · ${what}`);
}

/** A cut whose content is `n`: one subtitle line saying it (no media file needed), an empty picture track. */
const tracksOf = (n: number | string): TimelineTrack[] => [
  { id: 'V1', kind: 'video', name: 'Picture', clips: [] },
  { id: 'C1', kind: 'captions', name: 'Subtitles', clips: [{ id: 's1', text: `line ${n}`, in: 0, out: 2, at: 0 }] },
];
const versionText = (v: string, content: number | string, note: string, basedOn?: string, by: Timeline['by'] = 'user') => JSON.stringify({
  version: v, fps: 24, width: 1080, height: 1920, ...(basedOn ? { basedOn } : {}), note, by, at: new Date().toISOString(), markers: [], tracks: tracksOf(content),
}, null, 1) + '\n';

let films = 0;
/** A film folder with the versions given (each [note, content]); returns its slug and folder. */
function makeFilm(versions: [string, number | string, Timeline['by']?][]): { slug: string; dir: string } {
  const slug = `w${++films}`;
  const dir = path.join(repo, 'assets', 'films', slug);
  mkdirSync(path.join(dir, 'cut'), { recursive: true });
  versions.forEach(([note, content, by], i) => writeFileSync(path.join(dir, 'cut', `v${i + 1}.json`), versionText(`v${i + 1}`, content, note, i ? `v${i}` : undefined, by)));
  return { slug, dir };
}

/** Every file under a folder with a hash of its bytes (what a refusal must leave as it was). */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = createHash('sha1').update(readFileSync(p)).digest('hex');
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
const versionFiles = (dir: string) => readdirSync(path.join(dir, 'cut')).filter((n) => /^v\d+\.json$/.test(n)).sort();

/** Today's undo chain, exactly as EditPage.tsx reads it (before stage 2). */
function todayChain(versions: TimelineVersionRef[]): { undo: string[]; redo: string[]; cur?: string } {
  const u: string[] = [], r: string[] = [];
  let cur: string | undefined;
  for (const v of versions) {
    const back = /^undo: back to (v\d+)/.exec(v.note ?? '')?.[1];
    const again = /^redo: (v\d+) again/.exec(v.note ?? '')?.[1];
    if (back && cur && u[u.length - 1] === back) { u.pop(); r.push(cur); cur = back; continue; }
    if (again && cur && r[r.length - 1] === again) { r.pop(); u.push(cur); cur = again; continue; }
    if (cur) u.push(cur);
    r.length = 0;
    cur = v.version;
  }
  return { undo: u, redo: r, cur };
}

/** A page session as today's page makes versions: changes, undos ("undo: back to vN") and redos ("redo: vN again"). */
function randomNotes(seed: number, n: number): TimelineVersionRef[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const vs: TimelineVersionRef[] = [];
  for (let i = 1; i <= n; i++) {
    const { undo, redo } = todayChain(vs);
    const a = rnd();
    let note = `change ${i}`;
    if (a < 0.35 && undo.length) note = `undo: back to ${undo[undo.length - 1]}`;
    else if (a < 0.55 && redo.length) note = `redo: ${redo[redo.length - 1]} again`;
    else if (a < 0.6 && vs.length) note = `undo: back to v${1 + Math.floor(rnd() * vs.length)}`;   // by hand, off the chain
    vs.push({ version: `v${i}`, at: '2026-11-14T00:00:00Z', note, by: rnd() < 0.2 ? 'alma' : 'user' });
  }
  return vs;
}

async function main(): Promise<void> {
  const H = await import('../src/components/edit/history');
  const W = await import('../src/server/edit/working');
  const T = await import('../src/server/edit/timeline');
  const C = await import('../src/components/edit/controls');
  const store = (slug: string, dir: string) => W.diskStore(T.filmTargetOf(slug, dir, repo));
  const fails = async (p: Promise<unknown>): Promise<InstanceType<typeof W.WorkingError> | Error | undefined> => { try { await p; return undefined; } catch (e) { return e as Error; } };
  const textOf = async (s: ReturnType<typeof store>) => (await W.peekWorking(s))!.working.tracks[1].clips[0].text;

  // ---- 1. seeding equals today's undo chain
  console.log('\n== seeding from the version notes');
  const cases: Record<string, TimelineVersionRef[]> = {
    linear: ['a', 'b', 'c', 'd'].map((n, i) => ({ version: `v${i + 1}`, at: '', note: n })),
    'two undos': [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'undo: back to v2' }, { note: 'undo: back to v1' }].map((v, i) => ({ ...v, version: `v${i + 1}`, at: '' })),
    'undo then redo': [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'undo: back to v2' }, { note: 'redo: v3 again' }].map((v, i) => ({ ...v, version: `v${i + 1}`, at: '' })),
    'undo of an undo, redo of a redo': [{ note: 'a' }, { note: 'b' }, { note: 'undo: back to v1' }, { note: 'redo: v2 again' }, { note: 'undo: back to v1' }, { note: 'redo: v2 again' }, { note: 'c' }, { note: 'undo: back to v2' }].map((v, i) => ({ ...v, version: `v${i + 1}`, at: '' })),
    'a change after undos drops the redos': [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'undo: back to v2' }, { note: 'undo: back to v1' }, { note: 'd' }].map((v, i) => ({ ...v, version: `v${i + 1}`, at: '' })),
    'an undo off the chain is a change': [{ note: 'a' }, { note: 'b' }, { note: 'c' }, { note: 'undo: back to v1' }].map((v, i) => ({ ...v, version: `v${i + 1}`, at: '' })),
  };
  const sameAsToday = (vs: TimelineVersionRef[]): boolean => {
    const t = todayChain(vs);
    const { steps, at } = H.seedSteps(vs);
    const names = steps.map((s) => s.version);
    return JSON.stringify(names.slice(0, at)) === JSON.stringify(t.undo) && names[at] === t.cur && JSON.stringify(names.slice(at + 1).reverse()) === JSON.stringify(t.redo) && steps[0].by === 'start';
  };
  for (const [name, vs] of Object.entries(cases)) check(`seed = today's chain: ${name}`, sameAsToday(vs), { today: todayChain(vs), seed: H.seedSteps(vs) });
  let randomOk = 0;
  for (let seed = 1; seed <= 300; seed++) if (sameAsToday(randomNotes(seed, 5 + (seed % 40)))) randomOk++;
  check('seed = today\'s chain: 300 random page sessions of 5 to 44 versions', randomOk === 300, randomOk);
  // the words an undo says are today's undoLine words
  {
    const vs = cases['undo then redo'];
    const { steps, at } = H.seedSteps(vs);
    const today = C.undoLine('undo', vs, todayChain(vs).cur!)!.text;
    check('the first undo says what today\'s undo says', H.stepLine('undo', steps[at]).text === today, [H.stepLine('undo', steps[at]).text, today]);
    const vs2 = cases['two undos'];
    const s2 = H.seedSteps(vs2);
    const t2 = todayChain(vs2);
    check('the first redo says what today\'s redo says', H.stepLine('redo', s2.steps[s2.at + 1]).text === C.undoLine('redo', vs2, t2.redo[t2.redo.length - 1])!.text);
  }
  {
    const big = Array.from({ length: 1500 }, (_, i) => ({ version: `v${i + 1}`, at: '', note: `c${i}` }));
    const { steps, at } = H.seedSteps(big);
    check('seeding keeps the newest 1,000 steps, the pointer on the last', steps.length === 1000 && at === 999 && steps[999].version === 'v1500' && steps[0].by === 'start', { n: steps.length, at });
  }

  // ---- 2. on disk: seed, the first undo goes where today's ⌘Z goes
  console.log('\n== a film on disk');
  {
    const { slug, dir } = makeFilm([['first', 1, 'migration'], ['b', 2], ['c', 3], ['undo: back to v2', 2], ['redo: v3 again', 3], ['undo: back to v2', 2]]);
    const s = store(slug, dir);
    const before = versionFiles(dir);
    const a = (await W.ensureWorking(s))!;
    check('seeded: edited false, version the newest, equals it', !a.working.edited && a.working.version === 'v6' && a.working.equals === 'v6', a.working);
    check('seeded: undo and redo as today (undo to v1, redo to v3)', a.history.steps.length === 3 && a.history.at === 1 && a.history.undo?.words === 'b' && a.history.redo?.words === 'c', a.history);
    check('seeded: the working content is the newest version', await textOf(s) === 'line 2');
    const t1 = tree(dir);
    const m1 = statSync(path.join(dir, 'cut', 'working.json')).mtimeMs;
    const again = (await W.ensureWorking(s))!;
    check('ensureWorking twice: the same, nothing rewritten', again.working.rev === a.working.rev && JSON.stringify(tree(dir)) === JSON.stringify(t1) && statSync(path.join(dir, 'cut', 'working.json')).mtimeMs === m1);
    const u = await W.undo(s, a.working.rev);
    check('the first ⌘Z goes to v1, as today', u.working.tracks[1].clips[0].text === 'line 1' && u.working.edited && u.working.equals === 'v1', u.working);
    const r = await W.redo(s, u.working.rev);
    const r2 = await W.redo(s, r.working.rev);
    check('two redos: back on v2, then on to v3', r.working.tracks[1].clips[0].text === 'line 2' && r2.working.tracks[1].clips[0].text === 'line 3' && r2.working.equals === 'v3');
    check('no version written by undo and redo', JSON.stringify(versionFiles(dir)) === JSON.stringify(before));
    // a film with no versions
    const empty = makeFilm([]);
    const e = await W.ensureWorking(store(empty.slug, empty.dir));
    check('a film with no versions: nothing made, nothing written', e === undefined && JSON.stringify(Object.keys(tree(empty.dir))) === '[]', tree(empty.dir));
  }

  // ---- 3. steps, re-reads, snapshots, stale, validation
  console.log('\n== steps');
  {
    const { slug, dir } = makeFilm([['first', 0, 'migration'], ['one', 1]]);
    let s = store(slug, dir);
    const a = (await W.ensureWorking(s))!;
    const states = () => readdirSync(path.join(dir, 'harness', 'cut-states')).length;
    const n0 = states();
    let w = await W.step(s, { rev: a.working.rev, words: 'line 10', tracks: tracksOf(10) });
    check('a step: kept, edited, not a version', w.working.edited && w.working.note === 'line 10' && w.working.equals === undefined && versionFiles(dir).length === 2, w.working);
    check('edits since v2: 1', w.history.since.version === 'v2' && w.history.since.count === 1, w.history.since);
    w = await W.step(s, { rev: w.working.rev, words: 'line 11', tracks: tracksOf(11) });
    w = await W.step(s, { rev: w.working.rev, words: 'back to line 10', tracks: tracksOf(10) });
    check('the same content twice: one snapshot', states() === n0 + 2, { n0, now: states() });
    check('edits since v2: 3', w.history.since.count === 3);
    const same = await W.step(s, { rev: w.working.rev, words: 'nothing', tracks: tracksOf(10) });
    check('a step with the content already there adds nothing', same.same === true && same.history.rev === w.history.rev && same.history.steps.length === w.history.steps.length);
    // re-read from disk: a fresh store sees the same
    s = store(slug, dir);
    const p = (await W.peekWorking(s))!;
    check('a re-read from disk: the same rev, pointer and content', p.working.rev === w.working.rev && p.history.at === w.history.at && p.working.tracks[1].clips[0].text === 'line 10');
    // undo twice, then a new step drops the two undone ones
    let u = await W.undo(s, p.working.rev);
    u = await W.undo(s, u.working.rev);
    check('two undos: on "line 10" again, redo would bring "line 11"', (await textOf(store(slug, dir))) === 'line 10' && u.history.redo?.words === 'line 11');
    const n = await W.step(s, { rev: u.working.rev, words: 'line 12', tracks: tracksOf(12) });
    check('a new step after undos: the undone steps leave the list', n.history.steps.length === u.history.at + 2 && !n.history.steps.some((x) => x.words === 'line 11' || x.words === 'back to line 10') && !n.history.redo, n.history.steps.map((x) => x.words));
    // goTo
    const first = n.history.steps[1];
    const g = await W.goTo(s, n.working.rev, first.rev);
    check('goTo the step seeded from v2: its content, edited false', g.working.tracks[1].clips[0].text === 'line 1' && !g.working.edited && g.working.equals === 'v2' && g.history.since.count === 0, g.working);
    const g2 = await W.goTo(store(slug, dir), g.working.rev, n.history.steps[n.history.steps.length - 1].rev);
    check('goTo the last step, from a fresh store', (await textOf(store(slug, dir))) === 'line 12' && g2.history.at === g2.history.steps.length - 1);
    check('goTo a step not there: refused', (await fails(W.goTo(s, g2.working.rev, 99999)) as InstanceType<typeof W.WorkingError>)?.code === 'no-step');
    check('no version written by steps, undo and goTo', JSON.stringify(versionFiles(dir)) === '["v1.json","v2.json"]');
    // stale: refused, nothing written
    const t0 = tree(dir);
    const st = await fails(W.step(s, { rev: g2.working.rev - 1, words: 'stale', tracks: tracksOf(99) })) as InstanceType<typeof W.WorkingError>;
    check('a stale rev: refused with code stale and the current rev', st?.code === 'stale' && st.status === 409 && st.rev === g2.working.rev, st && { code: st.code, rev: st.rev });
    for (const f of [W.undo(s, 0), W.redo(s, 1), W.goTo(s, 2, first.rev), W.restore(s, 3, 'v1'), W.save(s, { rev: 4, why: 'you' })]) check('a stale rev on every move: refused', (await fails(f) as InstanceType<typeof W.WorkingError>)?.code === 'stale');
    check('a stale rev: nothing written anywhere in the film', JSON.stringify(tree(dir)) === JSON.stringify(t0));
    // a cut that does not validate (a file that is not there; a clip before its own in)
    const bad = await fails(W.step(s, { rev: g2.working.rev, words: 'bad', tracks: [{ id: 'V1', kind: 'video', name: 'Picture', clips: [{ id: 'c1', src: 'media/none.mp4', in: 0, out: 1, at: 0 }] }] }));
    check('a cut that does not validate: 422 with its problems, nothing written', bad instanceof T.CutError && bad.status === 422 && bad.problems.some((x) => /does not exist/.test(x)) && JSON.stringify(tree(dir)) === JSON.stringify(t0), bad && { m: bad.message, p: (bad as InstanceType<typeof T.CutError>).problems });
    // restore
    const r = await W.restore(s, g2.working.rev, 'v1');
    check('restore v1: one step by "restore", "restored v1", equals v1, no version written', r.working.by === 'restore' && r.working.note === 'restored v1' && r.working.equals === 'v1' && r.working.tracks[1].clips[0].text === 'line 0' && versionFiles(dir).length === 2, r.working);
    const ru = await W.undo(s, r.working.rev);
    check('restore undone: back on line 12', ru.working.tracks[1].clips[0].text === 'line 12');
    const rs = await W.restore(s, ru.working.rev, 'v1');
    const rsame = await W.restore(s, rs.working.rev, 'v1');
    check('restore of what is there already: nothing added', rsame.same === true && rsame.history.rev === rs.history.rev);
    check('restore of a version not there: 404', (await fails(W.restore(s, rs.working.rev, 'v77')) as InstanceType<typeof T.CutError>)?.status === 404);
  }

  // ---- 4. save
  console.log('\n== save');
  {
    const { slug, dir } = makeFilm([['first', 0, 'migration'], ['one', 1]]);
    const s = store(slug, dir);
    let a = (await W.ensureWorking(s))!;
    const nothing = await W.save(s, { rev: a.working.rev, why: 'you' });
    check('save with nothing changed: no file, made false, the newest version', !nothing.made && nothing.version === 'v2' && versionFiles(dir).length === 2, nothing);
    a = await W.step(s, { rev: nothing.working.rev, words: 'line 5 on', tracks: tracksOf(5) });
    a = await W.step(s, { rev: a.working.rev, words: 'line 6 on', tracks: tracksOf(6) });
    const sv = await W.save(s, { rev: a.working.rev, why: 'render', name: '  For the director  ' });
    const v3 = JSON.parse(readFileSync(path.join(dir, 'cut', 'v3.json'), 'utf8')) as Timeline;
    check('save: v3 written once, basedOn v2, its content the working cut', sv.made && sv.version === 'v3' && versionFiles(dir).length === 3 && v3.basedOn === 'v2' && v3.tracks[1].clips[0].text === 'line 6', v3);
    check('save: the note is the steps\' words, why said', v3.note === 'line 5 on; line 6 on (saved for a render)' && v3.by === 'user', v3.note);
    check('save: the step marked saved v3 (why render), edited false, edits since v3: 0', sv.history.steps[sv.history.at].saved === 'v3' && sv.history.steps[sv.history.at].why === 'render' && !sv.working.edited && sv.working.version === 'v3' && sv.working.equals === 'v3' && sv.history.since.version === 'v3' && sv.history.since.count === 0, sv.working);
    const names = JSON.parse(readFileSync(path.join(dir, 'harness', 'version-names.json'), 'utf8')) as Record<string, { name: string }>;
    check('save: the name in harness/version-names.json', names.v3?.name === 'For the director');
    const twice = await W.save(s, { rev: sv.working.rev, why: 'you', name: 'Renamed' });
    const names2 = JSON.parse(readFileSync(path.join(dir, 'harness', 'version-names.json'), 'utf8')) as Record<string, { name: string }>;
    check('save again: no file, made false, the name given still goes to v3', !twice.made && twice.version === 'v3' && versionFiles(dir).length === 3 && names2.v3.name === 'Renamed');
    // undo past the saved version, then save: the note says what was undone
    let u = await W.undo(s, twice.working.rev);
    u = await W.undo(s, u.working.rev);
    check('two undos after the save: edited, equals v2, edits since v2: 0', u.working.edited && u.working.equals === 'v2' && u.history.since.count === 0, u.working);
    const sv2 = await W.save(s, { rev: u.working.rev, why: 'you' });
    const v4 = JSON.parse(readFileSync(path.join(dir, 'cut', 'v4.json'), 'utf8')) as Timeline;
    check('save after undos: v4, its note "undid: …", never "undo: back to"', sv2.made && v4.note === 'undid: line 6 on; line 5 on' && v4.tracks[1].clips[0].text === 'line 1', v4.note);
    const alma = await W.step(s, { rev: sv2.working.rev, words: 'Alma: line 9', by: 'alma', tracks: tracksOf(9) });
    const sv3 = await W.save(s, { rev: alma.working.rev, why: 'alma' });
    const v5 = JSON.parse(readFileSync(path.join(dir, 'cut', 'v5.json'), 'utf8')) as Timeline;
    check('save for Alma: by alma, her words', sv3.made && v5.by === 'alma' && v5.note === 'Alma: line 9' && sv3.history.steps[sv3.history.at].why === 'alma');
    // a version written meanwhile by hand (Alma on the old recipe): save goes on top of it, never over it
    const v6text = versionText('v6', 'hand', 'by hand', 'v5', 'alma');
    writeFileSync(path.join(dir, 'cut', 'v6.json'), v6text);
    const st = await W.step(s, { rev: sv3.working.rev, words: 'line 20', tracks: tracksOf(20) });
    check('a version written by hand: the working cut says edited, version v6', st.working.version === 'v6' && st.working.edited);
    const sv4 = await W.save(s, { rev: st.working.rev, why: 'you' });
    check('save after a hand-written v6: v7, basedOn v6, v6 untouched', sv4.version === 'v7' && (JSON.parse(readFileSync(path.join(dir, 'cut', 'v7.json'), 'utf8')) as Timeline).basedOn === 'v6' && readFileSync(path.join(dir, 'cut', 'v6.json'), 'utf8') === v6text);
    check('the writes log has the saves', readFileSync(path.join(root, 'harness', 'writes.log'), 'utf8').split('\n').filter((l) => /\tcut save\t/.test(l)).length >= 4);
  }

  // ---- 5. repair and damage
  console.log('\n== repair');
  {
    const { slug, dir } = makeFilm([['first', 0, 'migration'], ['one', 1]]);
    const s = store(slug, dir);
    const a = (await W.ensureWorking(s))!;
    const wfile = path.join(dir, 'cut', 'working.json');
    const old = readFileSync(wfile, 'utf8');
    const st = await W.step(s, { rev: a.working.rev, words: 'line 30', tracks: tracksOf(30) });
    // the crash: the history was written, working.json was not (put the old one back)
    writeFileSync(wfile, old);
    check('crash simulated: working.json is a rev behind', (JSON.parse(readFileSync(wfile, 'utf8')) as { rev: number }).rev === a.working.rev);
    const p = (await W.peekWorking(store(slug, dir)))!;
    check('peek (GET …/cut) reads the history\'s state without writing', p.working.rev === st.working.rev && readFileSync(wfile, 'utf8') === old && p.working.tracks[1].clips[0].text === 'line 30');
    const fixed = (await W.ensureWorking(store(slug, dir)))!;
    const onDisk = JSON.parse(readFileSync(wfile, 'utf8')) as { rev: number; tracks: TimelineTrack[] };
    check('ensureWorking: working.json rebuilt from the history', fixed.working.rev === st.working.rev && onDisk.rev === st.working.rev && onDisk.tracks[1].clips[0].text === 'line 30');
    rmSync(wfile);
    const fixed2 = (await W.ensureWorking(store(slug, dir)))!;
    check('working.json gone: rebuilt, the same rev', fixed2.working.rev === st.working.rev && existsSync(wfile));
    // a missing snapshot: said, never guessed
    const firstState = fixed2.history.steps[fixed2.history.at - 1].state;
    rmSync(path.join(dir, 'harness', 'cut-states', `${firstState}.json.gz`));
    const ms = await fails(W.undo(s, fixed2.working.rev)) as InstanceType<typeof W.WorkingError>;
    check('undo to a step whose snapshot is missing: code missing-state, the file named', ms?.code === 'missing-state' && ms.message.includes(firstState), ms?.message);
    check('…and the pointer did not move', (await W.peekWorking(s))!.history.at === fixed2.history.at);
    // a broken history file: said, never overwritten
    const hfile = path.join(dir, 'harness', 'cut-history.json');
    writeFileSync(hfile, '{"format":1,"rev":"x"}');
    const bh = await fails(W.ensureWorking(s)) as InstanceType<typeof W.WorkingError>;
    check('a broken history: code bad-history, the file left as it is', bh?.code === 'bad-history' && readFileSync(hfile, 'utf8') === '{"format":1,"rev":"x"}', bh?.message);
    writeFileSync(hfile, '{not json');
    check('a history that is not JSON: bad-history', (await fails(W.ensureWorking(s)) as InstanceType<typeof W.WorkingError>)?.code === 'bad-history');
  }

  // ---- 6. the cap and the cleanup
  console.log('\n== 1,000 steps');
  {
    const { slug, dir } = makeFilm([['first', 0, 'migration'], ['one', 1]]);
    const s = store(slug, dir);
    let a = (await W.ensureWorking(s))!;
    // things the cleanup must never touch: the versions, a render, another harness file, a file in cut-states that is not a snapshot
    mkdirSync(path.join(dir, 'cut', 'renders'), { recursive: true });
    writeFileSync(path.join(dir, 'cut', 'renders', 'v1-480p.mp4'), 'not really a film');
    writeFileSync(path.join(dir, 'harness', 'left.json'), '{"ticks":{}}\n');
    writeFileSync(path.join(dir, 'harness', 'cut-states', 'README.txt'), 'not a snapshot');
    const keep = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).filter(([k]) => !/^harness\/cut-states\/[0-9a-f]{16}\.json\.gz$/.test(k) && k !== 'harness/cut-history.json' && k !== 'cut/working.json' && k !== 'harness/version-names.json'));
    const before = keep(tree(dir));
    // three steps then two undos: the undone step's snapshot stays until the cleanup
    a = await W.step(s, { rev: a.working.rev, words: 'u1', tracks: tracksOf('u1') });
    a = await W.step(s, { rev: a.working.rev, words: 'u2', tracks: tracksOf('u2') });
    a = await W.undo(s, a.working.rev);
    const undoneState = a.history.steps[a.history.at + 1].state;
    a = await W.step(s, { rev: a.working.rev, words: 'after', tracks: tracksOf('after') });
    check('a step after an undo: the undone step\'s snapshot is still there (no cap passed)', existsSync(path.join(dir, 'harness', 'cut-states', `${undoneState}.json.gz`)));
    const t0 = Date.now();
    for (let i = 0; i < 1000; i++) a = await W.step(s, { rev: a.working.rev, words: `step ${i}`, tracks: tracksOf(`n${i}`) });
    console.log(`  1,000 steps in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const h = JSON.parse(readFileSync(path.join(dir, 'harness', 'cut-history.json'), 'utf8')) as { steps: { state: string; words: string }[]; at: number };
    check('the history keeps 1,000 steps, the newest last', h.steps.length === 1000 && h.at === 999 && h.steps[999].words === 'step 999' && a.history.steps.length === 1000);
    const snaps = readdirSync(path.join(dir, 'harness', 'cut-states')).filter((n) => /^[0-9a-f]{16}\.json\.gz$/.test(n)).map((n) => n.slice(0, 16));
    const used = new Set(h.steps.map((x) => x.state));
    check('the cleanup: every snapshot left is used by a step, every step has its snapshot', snaps.every((x) => used.has(x)) && [...used].every((x) => snaps.includes(x)), { snaps: snaps.length, used: used.size });
    check('the cleanup took the undone step\'s snapshot', !existsSync(path.join(dir, 'harness', 'cut-states', `${undoneState}.json.gz`)));
    check('the versions, the render, other harness files and the non-snapshot file untouched', JSON.stringify(keep(tree(dir))) === JSON.stringify(before), { before, after: keep(tree(dir)) });
    check('no version written by 1,000 steps', JSON.stringify(versionFiles(dir)) === '["v1.json","v2.json"]');
    const back = await W.undo(s, a.working.rev);
    check('undo after the cap: one step back', back.working.note === 'step 998');
  }

  // ---- 7. ten steps at once with the same rev
  console.log('\n== at once');
  {
    const { slug, dir } = makeFilm([['first', 0, 'migration']]);
    const a = (await W.ensureWorking(store(slug, dir)))!;
    const all = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => W.step(store(slug, dir), { rev: a.working.rev, words: `at once ${i}`, tracks: tracksOf(`x${i}`) })));
    const landed = all.filter((x) => x.status === 'fulfilled');
    const stale = all.filter((x) => x.status === 'rejected' && (x.reason as InstanceType<typeof W.WorkingError>).code === 'stale');
    const h = (await W.peekWorking(store(slug, dir)))!;
    check('ten steps with the same rev: exactly one lands, nine are stale', landed.length === 1 && stale.length === 9 && h.history.steps.length === 2, { landed: landed.length, stale: stale.length });
    check('…and the working cut is the one that landed', h.working.note === (landed[0] as PromiseFulfilledResult<{ working: { note: string } }>).value.working.note);
    // one change of each kind at once on the same rev: one lands
    const r0 = h.working.rev;
    const mixed = await Promise.allSettled([W.undo(store(slug, dir), r0), W.step(store(slug, dir), { rev: r0, words: 'm', tracks: tracksOf('m') }), W.save(store(slug, dir), { rev: r0, why: 'you' }), W.restore(store(slug, dir), r0, 'v1')]);
    check('an undo, a step, a save and a restore at once on the same rev: one lands', mixed.filter((x) => x.status === 'fulfilled').length === 1, mixed.map((x) => x.status));
  }

  // ---- 8. sample mode: the memory store writes nothing
  console.log('\n== sample mode');
  {
    const ghost = path.join(root, 'no-such-film');
    const v1 = JSON.parse(versionText('v1', 1, 'first', undefined, 'migration')) as Timeline;
    const v2 = JSON.parse(versionText('v2', 2, 'b', 'v1')) as Timeline;
    const film = T.filmTargetOf('sample-x', ghost, ghost);
    const fx = { current: v2, timelines: [v1], versions: [v1, v2].map((t) => ({ version: t.version, at: t.at, note: t.note, by: t.by })) };
    const s = W.memoryStore(film, fx)!;
    let a = (await W.ensureWorking(s))!;
    check('memory: seeded, undo would go to v1', a.history.at === 1 && !a.working.edited);
    a = await W.step(s, { rev: a.working.rev, words: 'm1', tracks: tracksOf('m1') });
    a = await W.undo(s, a.working.rev);
    a = await W.redo(s, a.working.rev);
    const sv = await W.save(W.memoryStore(film, fx)!, { rev: a.working.rev, why: 'you', name: 'n' });
    check('memory: a step, undo, redo, save (v3 in memory)', sv.made && sv.version === 'v3' && (await W.memoryStore(film, fx)!.readNames()).v3.name === 'n');
    check('memory: nothing on disk', !existsSync(ghost) && !existsSync(path.join(root, 'repo', 'assets', 'films', 'sample-x')));
    W.forgetMock('sample-x');
  }

  console.log(`\n${checks} checks passed`);
}

main().then(() => { rmSync(root, { recursive: true, force: true }); }, (e) => { console.error(e); rmSync(root, { recursive: true, force: true }); process.exit(1); });
