// The changes the page makes to the release file (Release, 14 Nov 2026): one small named operation at a time, so the
// page and Alma never write over each other's work. POST /api/films/[film]/release reads the file fresh, applies one
// operation here, checks the result (validateRelease), writes it and returns it. Each operation is refused with a
// plain reason when the spec forbids it: a locked platform's text, a shared edit that would change a locked platform,
// a go while a fact is unconfirmed, changing the final after a post. Pure.
import { emptyRelease, factIdsIn, type Field, type FieldSnapshot, type Platform, type ReleaseFile, type ReleaseFinal, type ThumbOption, type Thumbnail } from './file';
import { appName, boxOf, type Box, boxShare, boxText, coverGroup, fillFacts, goCheck, heldWords, lockedVerb, nameList, platformOf, platformStatus, sharedTouch } from './derive';
import { coverWord } from './platforms';
import { handSteps, linkProblem, stoppable, WAIT_DROPPED } from './sendflow';

export type ReleaseOp =
  /** Use one of Alma's candidates for a field (on every platform sharing it). */
  | { op: 'pick'; platform: string; field: string; candidate: string }
  /** The user's own text for a field. `only`: unlink it first, so a locked platform sharing it keeps its text.
   *  `tags`: written in the page's Tags box, so the field is marked as tags (it stays in that box whatever its words). */
  | { op: 'setText'; platform: string; field: string; text: string; only?: boolean; tags?: boolean; mine?: boolean }
  /** The text in the box kept as the option it was edited from: the candidate's text becomes the field's
   *  text, marked as the user's, on every platform sharing the field; then, with `switchTo`, that candidate is used. */
  | { op: 'saveOption'; platform: string; field: string; candidate: string; switchTo?: string }
  /** The user's own text for a whole box of several fields (ASKS 57): `part` is the posted part ("caption"), `tags`
   *  its Tags box instead of its text. The first field of the box holds the whole text as the user's own; the box's
   *  other fields become empty own text (an empty field is left out of the posted text), their candidates kept. On
   *  every platform the box is shared with, all or nothing. `only`: unlink the box's fields first, so the edit is this
   *  platform's only. `back`: the fields as they were before (the page's Command-Z back to the text it started from):
   *  each field takes its text, own and pick again, in one step. */
  | { op: 'setPartText'; platform: string; part: string; text: string; tags?: boolean; only?: boolean; back?: Record<string, { text: string; own?: boolean; pick?: string }> }
  /** A fact's value, confirmed. */
  | { op: 'confirm'; fact: string; value: string }
  /** A step done or undone: an after-post step (`after`) or a by-hand step (`hand`). */
  | { op: 'tick'; platform: string; list: 'after' | 'hand'; step: string; done: boolean }
  /** The route: only "hand" in this copy (every post is made by hand); anything else is refused. */
  | { op: 'setRoute'; platform: string; route: string }
  /** This platform keeps the text; the others keep their own from now on. `fields`: more fields at once (a box of
   *  several, "Only here"), all or nothing. */
  | { op: 'unlink'; platform: string; field: string; fields?: string[] }
  /** This field becomes one text with another platform's field of the same id (that one takes this one's words).
   *  `fields`: more fields at once (a box of several, "Link again"), all or nothing. */
  | { op: 'link'; platform: string; field: string; with: string; fields?: string[] }
  /** The master that goes out. The server builds `final` (companions, name); the page sends the master's path. */
  | { op: 'nameFinal'; final: ReleaseFinal }
  /** "Post now" or "Schedule…": the ask, with a snapshot of the exact text. */
  | { op: 'ask'; platform: string; when: 'now' | string; file?: string }   // file: the file that goes out, as the page names it (outfile.ts)
  /** "Cancel the ask", before the go. */
  | { op: 'cancelAsk'; platform: string }
  /** The go, given on Alma's card or the page (the next stage builds the card). */
  | { op: 'go'; platform: string }
  /** The post's link, pasted. */
  | { op: 'pasteLink'; platform: string; link: string }
  /** "I posted it, link later": posted by hand, the link still to come. */
  | { op: 'postedNoLink'; platform: string }
  /** One of a note's buttons: its effects applied, the fields before kept for the undo. */
  | { op: 'answer'; platform: string; field: string; note: string; action: string }
  /** Takes back the last answered note. */
  | { op: 'undoAnswer' }
  /** The thumbnail in use, one of the platform's options (stage 2); also the pick of every other platform with a
   *  thumbnail that is not locked and not marked as keeping its own (ASKS 55). */
  | { op: 'pickThumbnail'; platform: string; option: string }
  /** `own: true`: this platform keeps its own thumbnail (its picks stay here, the others' do not change it). `own:
   *  false`: it takes the frame the others share again. */
  | { op: 'thumbnailOwn'; platform: string; own: boolean }
  /** Stage 3 (older files only: a post by hand is never scheduled or sent): the user asks Alma to unschedule a
   *  scheduled post, to stop one still going out, or to check on one that is late. Recorded in send.requested (the page says "Unscheduling…"); the words go to Alma as the user's. */
  | { op: 'request'; platform: string; what: 'unschedule' | 'stop' | 'check' };

export type OpName = ReleaseOp['op'];
export const OP_NAMES: OpName[] = ['pick', 'setText', 'saveOption', 'setPartText', 'confirm', 'tick', 'setRoute', 'unlink', 'link', 'nameFinal', 'ask', 'cancelAsk', 'go', 'pasteLink', 'postedNoLink', 'answer', 'undoAnswer', 'pickThumbnail', 'thumbnailOwn', 'request'];

export type OpResult = { ok: true; file: ReleaseFile; said: string } | { ok: false; refused: string };

const no = (refused: string): OpResult => ({ ok: false, refused });
const copy = (f: ReleaseFile): ReleaseFile => JSON.parse(JSON.stringify(f)) as ReleaseFile;
const lower = (s: string) => s.toLowerCase();
export const LINK = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/** The field and its platform in a copy, or why not. */
function find(file: ReleaseFile, pid: string, fid?: string): { p: Platform; f?: Field } | string {
  const p = platformOf(file, pid);
  if (!p) return `There is no platform "${pid}".`;
  if (fid === undefined) return { p };
  const f = p.fields.find((x) => x.id === fid);
  return f ? { p, f } : `${p.name} has no field "${fid}".`;
}

/** The platforms that hold a field's text together (it and every one it is shared with). */
const group = (file: ReleaseFile, p: Platform, f: Field): Platform[] =>
  [p, ...(f.sharedWith ?? []).map((id) => platformOf(file, id)).filter((x): x is Platform => !!x)];

/** Refuses an edit of a field when its own platform is locked, or (unless `only`) when a platform sharing it is. */
function editCheck(file: ReleaseFile, p: Platform, f: Field, now: Date, only?: boolean): string | undefined {
  const st = platformStatus(file, p.id, now);
  if (st.locked) return `${appName(p)}'s text is locked. ${st.lockWhy ?? ''}`.trim();
  if (only) return undefined;
  const t = sharedTouch(file, p.id, f.id, now);
  return t.warning;
}

/** Takes `p` out of a field's shared group, both ways. */
function unlinkIn(file: ReleaseFile, p: Platform, fid: string): void {
  const f = p.fields.find((x) => x.id === fid);
  for (const id of f?.sharedWith ?? []) {
    const o = platformOf(file, id)?.fields.find((x) => x.id === fid);
    if (o) { o.sharedWith = (o.sharedWith ?? []).filter((x) => x !== p.id); if (!o.sharedWith.length) delete o.sharedWith; }
  }
  if (f) delete f.sharedWith;
}

/** Sets a field's text on every platform of its group. `from`: own text that is an edit of that candidate. */
function setGroup(file: ReleaseFile, p: Platform, f: Field, text: string, how: { own?: boolean; pick?: string; from?: string }): void {
  for (const q of group(file, p, f)) {
    const g = q.fields.find((x) => x.id === f.id);
    if (!g) continue;
    keepOwn(g, text, how);
    g.text = text;
    if (how.own) g.own = true; else delete g.own;
    if (how.pick && g.candidates.some((c) => c.id === how.pick)) g.pick = how.pick; else delete g.pick;
  }
}

/** The user's own words, from no candidate, are kept when something else replaces them (`ownWas`), so the page can
 *  offer them back as "Your text"; an edit of a candidate (`from`) is not: it is saved to its option or discarded. */
function keepOwn(g: Field, text: string, how: { own?: boolean; from?: string }): void {
  if (g.own && !g.from && g.text.trim() && g.text !== text && !(how.own && !how.from)) g.ownWas = g.text;
  if (how.own && !how.from) delete g.ownWas;
  if (how.own && how.from && g.candidates.some((c) => c.id === how.from)) g.from = how.from; else delete g.from;
}

/** Every field of these ids on these platforms and their partners, as they are now (for a note's undo). */
function snapshot(file: ReleaseFile, keys: { platform: string; field: string }[]): FieldSnapshot {
  const out: FieldSnapshot = {};
  const add = (pid: string, fid: string) => {
    const f = platformOf(file, pid)?.fields.find((x) => x.id === fid);
    if (!f || out[pid]?.[fid]) return;
    (out[pid] ??= {})[fid] = { text: f.text, ...(f.own ? { own: true } : {}), ...(f.pick ? { pick: f.pick } : {}), ...(f.sharedWith ? { sharedWith: [...f.sharedWith] } : {}) };
    for (const o of f.sharedWith ?? []) add(o, fid);
  };
  for (const k of keys) add(k.platform, k.field);
  return out;
}

/** Applies one operation to a copy of the file. `now` is the clock the rules read (locks, the go). */
export function applyOp(file: ReleaseFile | undefined, op: ReleaseOp, now: Date): OpResult {
  if (op.op === 'nameFinal') return nameFinal(file, op.final, now);
  if (!file) return no('There is no release file yet. Name the final first.');
  const f = copy(file);
  const at = now.toISOString();
  switch (op.op) {
    case 'pick': {
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      const c = x.f!.candidates.find((k) => k.id === op.candidate);
      if (!c) return no(`${x.p.name} ${lower(x.f!.label)} has no candidate "${op.candidate}".`);
      const why = editCheck(f, x.p, x.f!, now);
      if (why) return no(why);
      setGroup(f, x.p, x.f!, c.text, { pick: c.id });
      return { ok: true, file: f, said: `Picked "${c.does}" for the ${lower(x.f!.label)} of ${names(f, x.p, x.f!)}` };
    }
    case 'setText': {
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      if (typeof op.text !== 'string') return no('The text is missing.');
      const why = editCheck(f, x.p, x.f!, now, op.only);
      if (why) return no(why);
      if (op.only && x.f!.sharedWith?.length) unlinkIn(f, x.p, x.f!.id);
      for (const id of factIdsIn(op.text)) if (!f.facts.some((k) => k.id === id)) return no(`{${id}} is not a fact of this release.`);
      const from = op.mine ? undefined : (x.f!.pick ?? x.f!.from);
      setGroup(f, x.p, x.f!, op.text, { own: true, ...(from ? { from } : {}) });
      if (op.tags === true) for (const q of group(f, x.p, x.f!)) { const g = q.fields.find((k) => k.id === x.f!.id); if (g) g.tags = true; }
      return { ok: true, file: f, said: `Wrote their own ${lower(x.f!.label)} for ${names(f, x.p, x.f!)}` };
    }
    case 'saveOption': {
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      const c = x.f!.candidates.find((k) => k.id === op.candidate);
      if (!c) return no(`${x.p.name} ${lower(x.f!.label)} has no candidate "${op.candidate}".`);
      const to = op.switchTo === undefined ? undefined : x.f!.candidates.find((k) => k.id === op.switchTo);
      if (op.switchTo !== undefined && !to) return no(`${x.p.name} ${lower(x.f!.label)} has no candidate "${op.switchTo}".`);
      const why = editCheck(f, x.p, x.f!, now);
      if (why) return no(why);
      const text = x.f!.text;
      if (!text.trim()) return no(`The ${lower(x.f!.label)} is empty: there is nothing to keep.`);
      for (const id of factIdsIn(text)) if (!f.facts.some((k) => k.id === id)) return no(`{${id}} is not a fact of this release.`);
      // the edit becomes that option, on every platform sharing the field (each keeps its own list of candidates)
      for (const q of group(f, x.p, x.f!)) {
        const g = q.fields.find((k) => k.id === x.f!.id);
        const k = g?.candidates.find((y) => y.id === c.id);
        if (!g || !k) continue;
        // a note's button that offered this candidate offers it as it now reads
        for (const n of g.notes ?? []) for (const a of n.actions) for (const e of a.effect) if (e.kind === 'set' && e.field === g.id && e.text === k.text) e.text = text;
        k.text = text;
        k.edited = true;
      }
      setGroup(f, x.p, x.f!, to ? to.text : text, { pick: to ? to.id : c.id });
      return { ok: true, file: f, said: to
        ? `Kept the changed ${lower(x.f!.label)} as "${c.does}" and used "${to.does}" for ${names(f, x.p, x.f!)}`
        : `Kept the changed ${lower(x.f!.label)} as "${c.does}" for ${names(f, x.p, x.f!)}` };
    }
    case 'setPartText': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      if (typeof op.text !== 'string') return no('The text is missing.');
      const key = op.tags && boxOf(x.p, op.part)?.kind !== 'tags' ? `${op.part}:tags` : op.part;
      const b = boxOf(x.p, key);
      if (!b || b.kind !== (op.tags ? 'tags' : 'text')) return no(`${x.p.name} has no ${op.tags ? 'tags in its ' : ''}${lower(op.part)}.`);
      const st = platformStatus(f, x.p.id, now);
      if (st.locked) return no(`${appName(x.p)}'s text is locked. ${st.lockWhy ?? ''}`.trim());
      for (const id of factIdsIn(op.text)) if (!f.facts.some((k) => k.id === id)) return no(`{${id}} is not a fact of this release.`);
      const ids = b.fields.map((k) => k.id);
      if (op.back) {
        const bad = backProblem(f, x.p, b, op.back, op.text);
        if (bad) return no(bad);
      }
      const sh = boxShare(f, x.p.id, key, now);
      if (!op.only && (sh.state === 'some' || sh.locked.length)) return no(sh.ask!);
      if (op.only) for (const id of ids) if (x.p.fields.find((k) => k.id === id)?.sharedWith?.length) unlinkIn(f, x.p, id);
      const all = op.only || sh.state !== 'shared' ? [x.p] : [x.p, ...sh.with.map((q) => platformOf(f, q.id)!)];
      // a box of one field is that field: its text is an edit of the option in use, as with setText
      const f0 = x.p.fields.find((k) => k.id === ids[0]);
      const from = ids.length === 1 && !op.back ? (f0?.pick ?? f0?.from) : undefined;
      for (const q of all) ids.forEach((id, i) => {
        const g = q.fields.find((k) => k.id === id);
        if (!g) return;
        const was = op.back?.[id];
        g.text = was ? was.text : i ? '' : op.text;
        if (!was) keepOwn(g, g.text, { own: true, from });
        if (was ? was.own : true) g.own = true; else delete g.own;
        if (was?.pick) g.pick = was.pick; else delete g.pick;
        if (was) delete g.from;
        if (op.tags === true && !was) g.tags = true;
      });
      const who = nameList(all.map((q) => q.name));
      return { ok: true, file: f, said: op.back ? `Put the ${lower(b.label)} of ${who} back as it was` : `Wrote their own ${lower(b.label)} for ${who}` };
    }
    case 'confirm': {
      const fact = f.facts.find((k) => k.id === op.fact);
      if (!fact) return no(`There is no fact "${op.fact}".`);
      const value = typeof op.value === 'string' ? op.value.trim() : '';
      if (!value) return no(`Write ${fact.label} first.`);
      if (value !== fact.value) {
        // a locked platform's text that uses it would change
        for (const p of f.platforms) {
          const st = platformStatus(f, p.id, now);
          if (st.locked && p.fields.some((k) => factIdsIn(k.text).includes(fact.id))) return no(`${heldWords(p, st).replace(/ with this text$/, '')} with this value.${st.state === 'posted' ? '' : ` ${st.lockWhy ?? ''}`}`.trim());
        }
      }
      fact.value = value;
      fact.confirmedAt = at;
      return { ok: true, file: f, said: `Confirmed ${fact.label}: ${value}` };
    }
    case 'tick': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const list = op.list === 'after' ? x.p.upload.after : op.list === 'hand' ? x.p.upload.hand : undefined;
      if (!list) return no('A step is in the list "after" or "hand".');
      // the reply's step by hand (ASKS 58) is the page's own until it is ticked: then it is written into the list, where
      // the page shows it
      if (op.list === 'hand' && !list.some((k) => k.id === op.step)) {
        const derived = handSteps(f, x.p);
        if (derived.some((k) => k.id === op.step)) x.p.upload.hand = derived.map((k) => list.find((y) => y.id === k.id) ?? { id: k.id, text: k.text });
      }
      const s = (op.list === 'hand' ? x.p.upload.hand : list).find((k) => k.id === op.step);
      if (!s) return no(`${x.p.name} has no step "${op.step}".`);
      if (op.done) s.done = at; else delete s.done;
      return { ok: true, file: f, said: `${op.done ? 'Done' : 'Not done after all'}: ${s.text} (${x.p.name})` };
    }
    case 'setRoute': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      // every post is made by hand in this copy: there is no other route to move it to
      if (op.route !== 'hand') return no(`Every post here is made by hand: ${appName(x.p)} stays by hand.`);
      return { ok: true, file: f, said: `${x.p.name} already goes by hand` };
    }
    case 'unlink': {
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      if (op.fields?.length) {
        const ids = [...new Set([op.field, ...op.fields])];
        for (const id of ids) if (!x.p.fields.some((k) => k.id === id)) return no(`${x.p.name} has no field "${id}".`);
        const shared = ids.filter((id) => x.p.fields.find((k) => k.id === id)!.sharedWith?.length);
        if (!shared.length) return no(`${x.p.name}'s text is not shared.`);
        const others = [...new Set(shared.flatMap((id) => x.p.fields.find((k) => k.id === id)!.sharedWith!))].map((id) => platformOf(f, id)?.name ?? id);
        for (const id of shared) unlinkIn(f, x.p, id);
        return { ok: true, file: f, said: `Unlinked ${shared.length} texts: ${x.p.name} keeps them, ${others.join(' and ')} ${others.length > 1 ? 'keep their' : 'keeps its'} own` };
      }
      if (!x.f!.sharedWith?.length) return no(`${x.p.name} ${lower(x.f!.label)} is not shared.`);
      // the text stays the same on both sides, so a locked one loses nothing
      const others = x.f!.sharedWith.map((id) => platformOf(f, id)?.name ?? id);
      unlinkIn(f, x.p, x.f!.id);
      return { ok: true, file: f, said: `Unlinked the ${lower(x.f!.label)}: ${x.p.name} keeps this text, ${others.join(' and ')} ${others.length > 1 ? 'keep their' : 'keeps its'} own` };
    }
    case 'link': {
      if (op.fields?.length) {
        // several fields at once: each linked as one would be, all or nothing
        let g: ReleaseFile = f;
        for (const id of [...new Set([op.field, ...op.fields])]) {
          const r = applyOp(g, { op: 'link', platform: op.platform, field: id, with: op.with }, now);
          if (!r.ok) return r;
          g = r.file;
        }
        const a = platformOf(g, op.platform), z = platformOf(g, op.with);
        return { ok: true, file: g, said: `Linked the texts of ${a?.name ?? op.platform} and ${z?.name ?? op.with} again: one text` };
      }
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      const y = find(f, op.with, op.field);
      if (typeof y === 'string') return no(y);
      if (y.p.id === x.p.id) return no('A field cannot be linked to itself.');
      if (x.f!.sharedWith?.includes(y.p.id)) return no(`${x.p.name} and ${y.p.name} already share the ${lower(x.f!.label)}.`);
      for (const q of [x.p, ...group(f, y.p, y.f!)]) {
        const st = platformStatus(f, q.id, now);
        if (st.locked && q.fields.find((k) => k.id === x.f!.id)?.text !== x.f!.text) return no(`${heldWords(q, st)}. Linking would change it.`);
      }
      // the other side (and its own partners) take this text, then all of them share
      setGroup(f, y.p, y.f!, x.f!.text, { own: x.f!.own, pick: x.f!.pick, from: x.f!.from });
      const all = [...new Set([x.p.id, ...(x.f!.sharedWith ?? []), y.p.id, ...(y.f!.sharedWith ?? [])])];
      for (const id of all) {
        const g = platformOf(f, id)?.fields.find((k) => k.id === x.f!.id);
        if (g) g.sharedWith = all.filter((o) => o !== id);
      }
      return { ok: true, file: f, said: `Linked the ${lower(x.f!.label)} of ${x.p.name} and ${y.p.name} again: one text` };
    }
    case 'ask': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      // stage 3 (older files): a failed send that may still go out is not asked again until Alma confirms it is gone
      if (x.p.send.failed && !x.p.send.failed.cleared && !x.p.send.posted) return no(WAIT_DROPPED);
      const g = goCheck(f, x.p.id, now);
      if (!g.ok) return no(g.why);
      if (op.when !== 'now' && (typeof op.when !== 'string' || Number.isNaN(Date.parse(op.when)))) return no('"when" is "now" or a time.');
      if (op.when !== 'now' && Date.parse(op.when) <= now.getTime()) return no('That time has passed. Pick a later one.');
      // the file that goes out, kept with the ask (ASKS 56): the final or its smaller file, nothing else
      const fin = f.final!;
      if (op.file !== undefined && op.file !== fin.path && op.file !== fin.companions.post?.path) return no('That file is not the final or its smaller file.');
      x.p.send = { asked: { at, when: op.when, text: Object.fromEntries(x.p.fields.map((k) => [k.id, k.text])), ...(op.file ? { file: op.file } : {}) } };
      return { ok: true, file: f, said: op.when === 'now' ? `Post ${x.p.name} now` : `Schedule ${x.p.name} for ${new Date(op.when).toISOString()}` };
    }
    case 'cancelAsk': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const st = platformStatus(f, x.p.id, now);
      if (st.state !== 'waiting') return no(st.state === 'scheduled' ? `${appName(x.p)} is scheduled: ask Alma to unschedule it.` : st.locked ? `Too late to stop it. To remove it, delete it in ${appName(x.p)} once it is up.` : `${appName(x.p)} has no ask to cancel.`);
      delete x.p.send.asked;
      delete x.p.send.go;
      return { ok: true, file: f, said: `Cancelled the ask for ${x.p.name}` };
    }
    case 'go': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const st = platformStatus(f, x.p.id, now);
      if (st.state !== 'waiting' || !x.p.send.asked) return no(`${appName(x.p)} is not waiting for a go.`);
      // the go is for exactly the text asked with, and only while nothing blocks it
      for (const k of x.p.fields) if (x.p.send.asked.text[k.id] !== k.text) return no(`The ${lower(k.label)} changed since the ask. Cancel the ask and ask again.`);
      for (const k of x.p.fields) for (const id of factIdsIn(k.text)) {
        const fact = f.facts.find((q) => q.id === id);
        if (fact && !fact.confirmedAt) return no(`${fact.label.charAt(0).toUpperCase()}${fact.label.slice(1)} ${fact.many ? 'are' : 'is'} not confirmed.`);
      }
      x.p.send.go = { at };
      return { ok: true, file: f, said: `Go for ${x.p.name} only` };
    }
    case 'pasteLink': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const link = typeof op.link === 'string' ? op.link.trim() : '';
      if (!LINK.test(link)) return no('That does not look like a link to a post.');
      const bad = linkProblem(x.p.kind, link);
      if (bad) return no(bad);
      x.p.send.posted = { at: x.p.send.posted?.at ?? at, link };
      return { ok: true, file: f, said: `${x.p.name} is posted: ${link}` };
    }
    case 'postedNoLink': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      if (x.p.send.posted) return no(`${appName(x.p)} is already marked posted.`);
      x.p.send.posted = { at };
      return { ok: true, file: f, said: `${x.p.name} posted by hand, the link to add later` };
    }
    case 'answer': {
      const x = find(f, op.platform, op.field);
      if (typeof x === 'string') return no(x);
      const n = x.f!.notes?.find((k) => k.id === op.note);
      if (!n) return no(`There is no note "${op.note}" under ${x.p.name} ${lower(x.f!.label)}.`);
      if (n.answered) return no('That note is already answered. Undo it first.');
      const a = n.actions.find((k) => k.id === op.action);
      if (!a) return no(`The note has no button "${op.action}".`);
      const touched = a.effect.flatMap((e) => (e.kind === 'unlink' ? [{ platform: e.platform, field: e.field }] : e.platforms.map((pl) => ({ platform: pl, field: e.field }))));
      const before = snapshot(f, touched);
      // nothing that has had its go is rewritten
      for (const pid of Object.keys(before)) {
        const st = platformStatus(f, pid, now);
        if (!st.locked) continue;
        const q = platformOf(f, pid)!;
        for (const e of a.effect) {
          // a set rewrites exactly the platforms it names (a partner it leaves out is unlinked, keeping its text);
          // a link rewrites every platform it names but the first; an unlink changes no text
          const hits = (e.kind === 'set' && e.platforms.includes(pid)) || (e.kind === 'link' && e.platforms.slice(1).includes(pid));
          if (hits) return no(`${heldWords(q, st)}. ${st.lockWhy ?? ''}`.trim());
        }
      }
      for (const e of a.effect) {
        if (e.kind === 'unlink') { const q = platformOf(f, e.platform); if (q) unlinkIn(f, q, e.field); continue; }
        if (e.kind === 'link') {
          const [first, ...rest] = e.platforms;
          const src = platformOf(f, first)?.fields.find((k) => k.id === e.field);
          if (!src) continue;
          for (const pid of rest) { const g = platformOf(f, pid)?.fields.find((k) => k.id === e.field); if (g) { g.text = src.text; if (src.own) g.own = true; else delete g.own; delete g.pick; } }
          const all = [...new Set(e.platforms.flatMap((pid) => [pid, ...(platformOf(f, pid)?.fields.find((k) => k.id === e.field)?.sharedWith ?? [])]))];
          for (const pid of all) { const g = platformOf(f, pid)?.fields.find((k) => k.id === e.field); if (g) g.sharedWith = all.filter((o) => o !== pid); }
          continue;
        }
        // set: a platform sharing the field that the effect leaves out keeps its own text from now on
        for (const pid of e.platforms) {
          const q = platformOf(f, pid);
          const g = q?.fields.find((k) => k.id === e.field);
          if (!q || !g) continue;
          for (const o of g.sharedWith ?? []) if (!e.platforms.includes(o)) { const oq = platformOf(f, o); if (oq) unlinkIn(f, oq, e.field); }
          keepOwn(g, e.text, {});
          g.text = e.text;
          delete g.own;
          delete g.pick;
        }
      }
      const nn = platformOf(f, x.p.id)!.fields.find((k) => k.id === x.f!.id)!.notes!.find((k) => k.id === n.id)!;
      nn.answered = { action: a.id, at, before };
      return { ok: true, file: f, said: `Answered Alma's note on ${x.p.name} ${lower(x.f!.label)}: ${a.label}` };
    }
    case 'undoAnswer': {
      let last: { pid: string; fid: string; nid: string; at: string } | undefined;
      for (const p of f.platforms) for (const k of p.fields) for (const n of k.notes ?? []) {
        if (n.answered && (!last || n.answered.at > last.at)) last = { pid: p.id, fid: k.id, nid: n.id, at: n.answered.at };
      }
      if (!last) return no('There is no answer to undo.');
      const n = platformOf(f, last.pid)!.fields.find((k) => k.id === last!.fid)!.notes!.find((k) => k.id === last!.nid)!;
      const before = n.answered!.before;
      for (const pid of Object.keys(before)) {
        const st = platformStatus(f, pid, now);
        if (!st.locked) continue;
        const q = platformOf(f, pid)!;
        const changed = Object.entries(before[pid]).some(([fid, was]) => q.fields.find((k) => k.id === fid)?.text !== was.text);
        if (changed) return no(`${heldWords(q, st)}. The answer cannot be undone now.`);
      }
      for (const [pid, fields] of Object.entries(before)) for (const [fid, was] of Object.entries(fields)) {
        const g = platformOf(f, pid)?.fields.find((k) => k.id === fid);
        if (!g) continue;
        g.text = was.text;
        if (was.own) g.own = true; else delete g.own;
        if (was.pick) g.pick = was.pick; else delete g.pick;
        if (was.sharedWith?.length) g.sharedWith = [...was.sharedWith]; else delete g.sharedWith;
      }
      delete n.answered;
      return { ok: true, file: f, said: 'Undid the last answer to a note' };
    }
    case 'pickThumbnail': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const t = x.p.thumbnail;
      if (!t) return no(`${appName(x.p)} has no thumbnail to pick.`);
      const o = t.options.find((k) => k.id === op.option);
      if (!o) return no(`${appName(x.p)} has no thumbnail "${op.option}".`);
      const st = platformStatus(f, x.p.id, now);
      if (st.locked) return no(`${appName(x.p)}'s thumbnail is locked. ${st.lockWhy ?? ''}`.trim());
      // the others, read before anything changes: a pick here is the pick there, unless locked or their own
      const g = coverGroup(f, x.p.id, now);
      t.pick = o.id;
      for (const q of g.follow) q.thumbnail!.pick = putFrame(q.thumbnail!, o);
      if (!g.follow.length && !g.held.length && !g.own.length) return { ok: true, file: f, said: `Picked the ${coverWord(x.p.kind)} "${o.does}" for ${x.p.name}` };
      const rest = [
        ...g.held.map((h) => `${h.p.name} ${lockedVerb(h.st)}, so it keeps the frame it has.`),
        ...(g.own.length ? [`${nameList(g.own.map((q) => q.name))} ${g.own.length > 1 ? 'keep their' : 'keeps its'} own.`] : []),
      ];
      return { ok: true, file: f, said: `Picked the cover frame "${o.does}" for ${nameList([x.p, ...g.follow].map((q) => q.name))}${rest.length ? `. ${rest.join(' ')}` : ''}` };
    }
    case 'thumbnailOwn': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const t = x.p.thumbnail;
      if (!t) return no(`${appName(x.p)} has no ${coverWord(x.p.kind)} to pick.`);
      if (typeof op.own !== 'boolean') return no('"own" is true or false.');
      const st = platformStatus(f, x.p.id, now);
      if (st.locked) return no(`${appName(x.p)}'s ${coverWord(x.p.kind)} is locked. ${st.lockWhy ?? ''}`.trim());
      if (op.own) {
        if (t.own) return { ok: true, file: f, said: `${x.p.name} already keeps its own ${coverWord(x.p.kind)}` };
        t.own = true;
        return { ok: true, file: f, said: `${x.p.name} keeps its own ${coverWord(x.p.kind)} from now on: a pick there stays there, and a pick elsewhere leaves it alone` };
      }
      if (!t.own) return { ok: true, file: f, said: `${x.p.name} already has the same cover frame as the others` };
      delete t.own;
      // the frame the others share: the pick of the first platform in posting order that has one and is not its own
      const src = f.platforms.find((q) => q.id !== x.p.id && q.thumbnail && !q.thumbnail.own && q.thumbnail.pick);
      const so = src?.thumbnail!.options.find((k) => k.id === src.thumbnail!.pick);
      if (!so) return { ok: true, file: f, said: `${x.p.name} has the same cover frame as the others again: the next pick is the pick on all of them` };
      t.pick = putFrame(t, so);
      return { ok: true, file: f, said: `${x.p.name} has the same cover frame as the others again: "${so.does}"` };
    }
    case 'request': {
      const x = find(f, op.platform);
      if (typeof x === 'string') return no(x);
      const st = platformStatus(f, x.p.id, now);
      const s = x.p.send;
      if (op.what === 'unschedule') {
        if (st.state !== 'scheduled') return no(`${appName(x.p)} is not scheduled.`);
      } else if (op.what === 'stop') {
        if (s.posted) return no(`${appName(x.p)} is already posted. To remove it, delete it in ${appName(x.p)}.`);
        if (!(s.go || s.sending)) return no(`${appName(x.p)} is not sending.`);
        if (stoppable(x.p) === 'no') return no(`Too late to stop it. To remove it, delete it in ${appName(x.p)} once it is up.`);
        if (stoppable(x.p) === 'unknown') return no('Alma has not said whether it can still be stopped. Ask her.');
      } else if (op.what === 'check') {
        if (s.posted || !(s.go || s.sending || s.scheduled || s.failed)) return no(`${appName(x.p)} has nothing going out to check.`);
      } else return no('"what" is unschedule, stop or check.');
      s.requested = { ...(s.requested ?? {}), [op.what]: at };
      const words = { unschedule: `Asked Alma to unschedule ${x.p.name}`, stop: `Asked Alma to stop sending ${x.p.name}`, check: `Asked Alma to check on ${x.p.name}` };
      return { ok: true, file: f, said: words[op.what] };
    }
  }
  return no(`There is no operation "${(op as { op: string }).op}".`);
}

/** Why `back` cannot put a box's fields back: a field it does not name, a pick that is not a candidate, or texts that
 *  do not make the text typed (the posted text must be exactly what the user sees). */
function backProblem(file: ReleaseFile, p: Platform, b: Box, back: Record<string, { text: string; own?: boolean; pick?: string }>, text: string): string | undefined {
  const ids = b.fields.map((k) => k.id);
  if (!back || typeof back !== 'object' || Object.keys(back).sort().join(',') !== [...ids].sort().join(',')) return '"back" must name every field of the box.';
  for (const g of b.fields) {
    const w = back[g.id];
    if (!w || typeof w.text !== 'string') return `"back" needs the text of "${g.id}".`;
    if (w.pick !== undefined && !g.candidates.some((c) => c.id === w.pick)) return `"${w.pick}" is not a candidate of ${p.name} ${lower(g.label)}.`;
    if (w.pick !== undefined && w.own) return `"${g.id}" cannot be both a pick and the user's own text.`;
  }
  const was = boxText(b, Object.fromEntries(ids.map((id) => [id, back[id].text])));
  if (fillFacts(file, was).trim() !== fillFacts(file, text).trim()) return 'The text is not the one the fields held before.';
  return undefined;
}

/** The id of the frame `o` among `t`'s options: the same id at the same moment, else the same moment (within 0.05 s),
 *  else `o` added (under a free id when its own is taken by another frame there). */
function putFrame(t: Thumbnail, o: ThumbOption): string {
  const near = (k: ThumbOption) => Math.abs(k.at - o.at) <= 0.05;
  const same = t.options.find((k) => k.id === o.id && near(k)) ?? t.options.find(near);
  if (same) return same.id;
  let id = o.id;
  for (let i = 2; t.options.some((k) => k.id === id); i++) id = `${o.id}-${i}`;
  t.options.push({ id, at: o.at, does: o.does });
  return id;
}

/** "TikTok and Instagram Reels" for a shared field, "TikTok" alone. */
function names(file: ReleaseFile, p: Platform, f: Field): string {
  const all = group(file, p, f).map((q) => q.name);
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0];
}

/** Naming the final: allowed until anything is posted (or going out). Naming the same master again changes nothing. */
function nameFinal(file: ReleaseFile | undefined, final: ReleaseFinal, now: Date): OpResult {
  const f = file ? copy(file) : emptyRelease(localDay(now));
  if (f.final?.path === final.path) return { ok: true, file: f, said: `The final is already the master of ${final.version}` };
  const out = f.platforms.filter((p) => p.send.posted);
  if (out.length) {
    const ns = out.map((p) => appName(p));
    return no(`${ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0]} already ${ns.length > 1 ? 'have' : 'has'} this file.`);
  }
  const going = f.platforms.find((p) => { const st = platformStatus(f, p.id, now); return st.state === 'sending' || st.state === 'scheduled' || (st.state === 'needs' && !!st.since); });
  if (going) return no(`${appName(going)} is ${platformStatus(f, going.id, now).state === 'scheduled' ? 'scheduled' : 'going out'} with this file.`);
  const before = f.final ? [...(f.final.before ?? []), { path: f.final.path, version: f.final.version, namedAt: f.final.namedAt }] : undefined;
  f.final = { ...final, namedAt: final.namedAt || now.toISOString(), ...(before ? { before } : {}) };
  return { ok: true, file: f, said: `Named the master of ${final.version} as the final (${final.path})` };
}

/** "2026-11-14": the local day of a clock. */
export const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A request body as an operation, checked for its shape (the rules are applyOp's). */
export function parseOp(raw: unknown): ReleaseOp | string {
  if (!raw || typeof raw !== 'object') return 'The operation must be a JSON object.';
  const o = raw as Record<string, unknown>;
  if (typeof o.op !== 'string' || !(OP_NAMES as string[]).includes(o.op)) return `"op" must be one of ${OP_NAMES.join(', ')}.`;
  const need = (...keys: string[]) => keys.filter((k) => typeof o[k] !== 'string');
  const want: Record<OpName, string[]> = {
    pick: ['platform', 'field', 'candidate'], saveOption: ['platform', 'field', 'candidate'], setText: ['platform', 'field', 'text'], setPartText: ['platform', 'part', 'text'], confirm: ['fact', 'value'], tick: ['platform', 'list', 'step'],
    setRoute: ['platform', 'route'], unlink: ['platform', 'field'], link: ['platform', 'field', 'with'], nameFinal: [], ask: ['platform', 'when'],
    cancelAsk: ['platform'], go: ['platform'], pasteLink: ['platform', 'link'], postedNoLink: ['platform'], answer: ['platform', 'field', 'note', 'action'], undoAnswer: [],
    pickThumbnail: ['platform', 'option'], thumbnailOwn: ['platform'], request: ['platform', 'what'],
  };
  const missing = need(...want[o.op as OpName]);
  if (missing.length) return `"${o.op}" needs ${missing.map((m) => `"${m}"`).join(', ')} as text.`;
  if (o.op === 'tick' && typeof o.done !== 'boolean') return '"tick" needs "done": true or false.';
  if (o.op === 'ask' && o.file !== undefined && typeof o.file !== 'string') return '"ask" takes "file" as text.';
  if (o.op === 'thumbnailOwn' && typeof o.own !== 'boolean') return '"thumbnailOwn" needs "own": true or false.';
  if (o.op === 'saveOption' && o.switchTo !== undefined && typeof o.switchTo !== 'string') return '"switchTo" is a candidate id.';
  for (const k of ['only', 'tags', 'mine']) if (o[k] !== undefined && typeof o[k] !== 'boolean') return `"${k}" is true or false.`;
  if ((o.op === 'unlink' || o.op === 'link') && o.fields !== undefined && !(Array.isArray(o.fields) && o.fields.every((x) => typeof x === 'string'))) return '"fields" is a list of field ids.';
  if (o.op === 'setPartText' && o.back !== undefined && !(o.back && typeof o.back === 'object' && !Array.isArray(o.back))) return '"back" is the fields as they were, by id.';
  return o as unknown as ReleaseOp;
}
