// Stage 12 (Release): the delivery in the film's final-cuts folder, the thumbnails in social/, the social kit
// (social/kit.md: the copy per platform, the tags, what only the user can confirm, the posting order) and the
// upload checklist per platform (the kit's own instructions plus "Before every upload" from the rules note
// Flow v3.3 - 12 Release in studio/flow). The final-cuts folder and the notes are read in a child process with a
// time limit (a read can hang on a macOS permission prompt); nothing is written. Served by GET /api/films/[film]/release.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { harnessConfig } from '../../config';
import type { FilmStateX } from '../state';
import { abs, list, listSlow, natCmp, readText, redact, Warnings, type FilmCtx } from '../util';
import { fileFact, reviewSections, sentences } from './record';
import { childEnv } from '../../childEnv';

/** The rules folder the checklist cites (read-only; the rules live there): HARNESS_FLOW_DIR, else <studio>/flow. */
export const FLOW_DIR = process.env.HARNESS_FLOW_DIR || path.join(/*turbopackIgnore: true*/ harnessConfig().filmRepo, 'flow');
export const RELEASE_NOTE = 'Flow v3.3 - 12 Release';

export type DeliveredKind = 'captioned' | 'captioned-480p' | 'clean' | 'srt' | 'kit' | 'thumbnail' | 'page' | 'video' | 'folder' | 'other';
export interface DeliveredFile { name: string; bytes?: number; date?: string; kind: DeliveredKind; edition?: string; current?: boolean }
export interface DeliveredFolder {
  date: string;                 // the folder's date (the film's start), from its name
  folder: string;               // absolute path, for "Copy path" and the media route
  shown: string;                // "assets/final-cuts/2026-10-27 A Short Film"
  available: boolean;           // false when the folder did not answer in time
  files: DeliveredFile[];       // the folder's top level
  kit?: { folder: string; shown: string; files: DeliveredFile[]; edition?: string; delivered?: string };
}

export interface Thumb { name: string; path: string; time?: string }
export interface ThumbRound { title: string; sheet?: string; sheetLabel?: string; thumbs: Thumb[]; date?: string }

export interface KitGroup { label: string; lead?: string; options: { id: string; text: string; note?: string }[]; text?: string }
export interface KitPlatform { name: string; note?: string; steps: { text: string; note?: boolean }[]; groups: KitGroup[]; after: string[] }
export interface Kit {
  path: string;
  title?: string;
  intro: string[];              // the files line, the "Also in the kit" line, before every upload
  platforms: KitPlatform[];
  confirm: { label: string; text: string }[];
  posting: string[];
  postingNote?: string;
  almaThumb?: string;           // "lamp lit", from "My pick is **lamp lit**"
}

/** One row of the film's section in the published-links note: where it was posted, or why not. */
/** pending = it went out and its link is still to come (the note's "add"). */
export interface PublishedRow { platform: string; account?: string; title?: string; link?: string; posted?: string; pending?: boolean; note?: string }
export interface Published { from: string; heading: string; rows: PublishedRow[] }

export interface ReleaseInfo {
  published?: Published;
  film: string;
  delivery: DeliveredFolder[];
  thumbs: { rounds: ThumbRound[]; plain: string[]; pick?: { pick: string; date: string } };
  kit?: Kit;
  checklist: { general: string[]; from: string; available: boolean };
  play?: { path: string; label: string; twin?: string };
  picks: { what: string; pick: string; date: string }[];
  warnings: string[];
}

// ---- the final-cuts folder, with sizes, under a time limit

function run(cmd: string, args: string[], opts: { cwd?: string; ms?: number } = {}): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, env: childEnv(), signal: AbortSignal.timeout(opts.ms ?? 5000), maxBuffer: 4 << 20 }, (err, stdout) => resolve(err ? undefined : String(stdout)));
  });
}

/** Size, date and kind of each entry of a final-cuts folder, by `stat` in a child process with a time limit. */
async function statSlow(dir: string): Promise<{ name: string; bytes: number; date: string; dir: boolean }[] | undefined> {
  const names = await listSlow(dir);
  if (!names) return undefined;
  if (!names.length) return [];
  const out = await run('/usr/bin/stat', ['-f', '%z\t%m\t%HT\t%N', '--', ...names.map((n) => n.name)], { cwd: dir, ms: 5000 });
  if (out === undefined) return names.map((n) => ({ name: n.name, bytes: 0, date: '', dir: n.dir }));
  return out.split('\n').filter(Boolean).map((l) => {
    const [z, m, t, ...rest] = l.split('\t');
    return { name: rest.join('\t'), bytes: Number(z), date: new Date(Number(m) * 1000).toISOString(), dir: /directory/i.test(t) };
  });
}

function kindOf(name: string, dir: boolean): DeliveredKind {
  if (dir) return 'folder';
  if (/FINAL captioned 480p/i.test(name)) return 'captioned-480p';
  if (/FINAL captioned/i.test(name)) return 'captioned';
  if (/FINAL clean/i.test(name)) return 'clean';
  if (/\.srt$/i.test(name)) return 'srt';
  if (/\.md$/i.test(name)) return 'kit';
  if (/thumbnail/i.test(name) && /\.(jpe?g|png)$/i.test(name)) return 'thumbnail';
  if (/\.html?$/i.test(name)) return 'page';
  if (/\.(mp4|mov|m4v)$/i.test(name)) return 'video';
  return 'other';
}
const editionOf = (name: string) => /\(([^)]+)\)\s*-\s*FINAL/i.exec(name)?.[1];

/** A final-cuts folder as the pages show it: relative to the studio folder ("assets/final-cuts/<date> <Title>"),
 *  else with the home folder as ~. */
export function shownFolder(folder: string): string {
  const studio = harnessConfig().filmRepo.replace(/\/$/, '');
  if (folder.startsWith(studio + path.sep)) return folder.slice(studio.length + 1);
  return folder.replace(/^\/(?:Users|home)\/[^/]+\//, '~/');
}

async function readDelivery(s: FilmStateX, warn: Warnings): Promise<DeliveredFolder[]> {
  const out: DeliveredFolder[] = [];
  for (const d of s.film.more.deliveryFolders) {
    const shown = shownFolder(d.folder);
    const top = await statSlow(d.folder);
    if (!top) {
      warn.add(shown, 'did not answer within 5 s (the folder may be waiting on a macOS permission prompt)');
      out.push({ date: d.date, folder: d.folder, shown, available: false, files: [] });
      continue;
    }
    const files = top.map((f) => ({ name: f.name, bytes: f.dir ? undefined : f.bytes, date: f.date || undefined, kind: kindOf(f.name, f.dir) }));
    const kitDir = top.find((f) => f.dir && /^social kit$/i.test(f.name));
    let kit: DeliveredFolder['kit'];
    if (kitDir) {
      const folder = path.join(d.folder, kitDir.name);
      const inner = (await statSlow(folder)) ?? [];
      const kf: DeliveredFile[] = inner.filter((f) => !f.dir).map((f) => ({ name: f.name, bytes: f.bytes, date: f.date || undefined, kind: kindOf(f.name, false), edition: editionOf(f.name) }));
      // the current edition: the one whose FINAL captioned file is newest
      const finals = kf.filter((f) => f.kind === 'captioned').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      const edition = finals[0]?.edition;
      for (const f of kf) f.current = f.edition ? f.edition === edition : undefined;
      kf.sort((a, b) => Number(!!b.current) - Number(!!a.current) || order(a.kind) - order(b.kind) || natCmp(a.name, b.name));
      kit = { folder, shown: `${shown}/${kitDir.name}`, files: kf, edition, delivered: finals[0]?.date };
    }
    out.push({ date: d.date, folder: d.folder, shown, available: true, files, kit });
  }
  return out;
}
const ORDER: DeliveredKind[] = ['captioned', 'clean', 'captioned-480p', 'srt', 'kit', 'thumbnail', 'page', 'video', 'folder', 'other'];
const order = (k: DeliveredKind) => ORDER.indexOf(k);

// ---- the kit

/** social/kit.md → its parts. Tolerant: a kit without some section just has none of it. */
export function parseKit(md: string): Omit<Kit, 'path'> {
  const lines = md.replace(/\r/g, '').split('\n');
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.replace(/:\s*social kit$/i, '').trim();
  type Block = { kind: 'p' | 'code' | 'li' | 'ol'; text: string };
  const sections: { heading?: string; blocks: Block[] }[] = [{ blocks: [] }];
  let para: string[] = [];
  const flush = () => {
    if (para.length) sections[sections.length - 1].blocks.push({ kind: 'p', text: para.join(' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      sections[sections.length - 1].blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    if (/^##\s+/.test(l)) { flush(); sections.push({ heading: l.replace(/^##\s+/, '').trim(), blocks: [] }); continue; }
    if (/^#\s+/.test(l) || /^---\s*$/.test(l)) { flush(); continue; }
    if (/^\s*[-*]\s+/.test(l)) { flush(); sections[sections.length - 1].blocks.push({ kind: 'li', text: l.replace(/^\s*[-*]\s+/, '') }); continue; }
    if (/^\s*\d+\.\s+/.test(l)) { flush(); sections[sections.length - 1].blocks.push({ kind: 'ol', text: l.replace(/^\s*\d+\.\s+/, '') }); continue; }
    if (!l.trim()) { flush(); continue; }
    para.push(l.trim());
  }
  flush();

  const plain = (t: string) => t.replace(/\*\*/g, '').replace(/`/g, '').trim();
  const intro: string[] = [];
  const platforms: KitPlatform[] = [];
  const confirm: { label: string; text: string }[] = [];
  let posting: string[] = [];
  let postingNote: string | undefined;
  let almaThumb: string | undefined;

  // what comes before the first ## and the [CHECK] list (which sits after the last ##, under a bold line)
  for (const sec of sections) {
    let inCheck = /^\[CHECK\]/i.test(sec.heading ?? '');
    for (const b of sec.blocks) {
      if (b.kind === 'p' && /^\*\*\[CHECK\]\*\*/.test(b.text)) { inCheck = true; continue; }
      if (inCheck && b.kind === 'li') {
        const m = /^\*\*(.+?)\*\*[:,]?\s*(.*)$/.exec(b.text);
        if (m) {
          const label = m[1].replace(/\[N\]\s*/, '').replace(/[[\]]/g, '').trim();
          confirm.push({ label: label.charAt(0).toUpperCase() + label.slice(1), text: plain(m[2]).replace(/^[,:\s]+/, '') });
        }
      }
    }
  }
  for (const b of sections[0].blocks) if (b.kind === 'p') intro.push(plain(b.text));
  const thumbM = /My pick is \*\*([^*]+)\*\*/.exec(md);
  if (thumbM) almaThumb = thumbM[1].trim();

  for (const sec of sections.slice(1)) {
    const h = sec.heading ?? '';
    if (/posting order/i.test(h)) {
      posting = sec.blocks.filter((b) => b.kind === 'ol').map((b) => plain(b.text));
      postingNote = sec.blocks.find((b) => b.kind === 'p') ? plain(sec.blocks.find((b) => b.kind === 'p')!.text) : undefined;
      continue;
    }
    // the kit's own notes are not platforms: no tab, no upload list
    if (/^(files|before every upload|also in the kit|\[check\])$/i.test(h.trim())) {
      for (const b of sec.blocks) if (b.kind !== 'code' && !/^\[CHECK\]/i.test(h)) intro.push(plain(b.text));
      continue;
    }
    const name = h.replace(/\s*\(([^)]*)\)\s*$/, '').replace(/,.*$/, '').trim();
    const note = /\(([^)]*)\)\s*$/.exec(h)?.[1];
    const steps: KitPlatform['steps'] = [];
    const groups: KitGroup[] = [];
    const after: string[] = [];
    let label: string | undefined;
    let lead: string | undefined;
    let seenGroup = false;
    for (const b of sec.blocks) {
      if (b.kind === 'code') {
        const opts: KitGroup['options'] = [];
        const rest: string[] = [];
        for (const raw of b.text.split('\n')) {
          const m = /^([A-Z])\.\s*(.*)$/.exec(raw);
          if (m) opts.push({ id: m[1], text: m[2] });
          else if (opts.length) opts[opts.length - 1].text += (opts[opts.length - 1].text ? '\n' : '') + raw;
          else rest.push(raw);
        }
        for (const o of opts) {
          const cnt = /\s{2,}(\d+ characters)\s*$/.exec(o.text);
          if (cnt) { o.note = cnt[1]; o.text = o.text.slice(0, cnt.index); }
          o.text = o.text.trim();
        }
        groups.push({ label: label ?? 'Text', lead, options: opts, text: opts.length ? undefined : rest.join('\n').trim() });
        label = undefined;
        lead = undefined;
        seenGroup = true;
        continue;
      }
      if (b.kind === 'p') {
        // a bold lead ("**Caption, pick one:**") or a line ending in a colon names the next code block
        const bold = /^\*\*([^*]+)\*\*(.*)$/.exec(b.text);
        if (bold && /:\s*$|pick one/i.test(bold[1] + bold[2])) {
          label = plain(bold[1]).replace(/:$/, '');
          const tail = plain(bold[2]).replace(/^[:\s]+/, '').replace(/:$/, '');
          lead = tail ? tail.replace(/^\((.*)\)$/, '$1') : undefined;
          continue;
        }
        if (!seenGroup && !groups.length) {
          for (const sent of sentences(plain(b.text), false)) {
            if (/:$/.test(sent)) { label = sent.replace(/:$/, ''); continue; }
            steps.push({ text: sent, note: /^(Only|All three|A is|B is|C is)\b/.test(sent) || undefined });
          }
          continue;
        }
        if (/:$/.test(plain(b.text)) && b.text.length < 140) { label = plain(b.text).replace(/:$/, ''); continue; }
        after.push(plain(b.text));
        continue;
      }
      after.push(plain(b.text));
    }
    // the "**Thumbnail:** …" paragraph is the kit's thumbnail note, not an upload step
    platforms.push({ name, note, steps, groups, after });
  }
  return { title, intro, platforms, confirm, posting, postingNote, almaThumb };
}

/** The line that opens step 16 of the stage note: v3.1 "16. Write the **Before every upload** checklist:", v3.2
 *  "16. Before every upload, on each platform (…):". Both read. */
export const BEFORE_EVERY_UPLOAD = /^\d+\.\s+(?:Write the \*\*)?Before every upload\b/i;
/** The bullets of that step: the items of the note's "Before every upload", from its text. */
export function beforeEveryUploadIn(md: string): string[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => BEFORE_EVERY_UPLOAD.test(l));
  if (start < 0) return [];
  const items: string[] = [];
  for (let i = start + 1; i < lines.length && !/^\d+\.\s/.test(lines[i]); i++) {
    const m = /^\s+-\s+(.*)$/.exec(lines[i]);
    if (m) items.push(m[1].replace(/\*\*/g, '').replace(/`/g, '').trim());
  }
  return items;
}
/** "Before every upload" (step 16) of the stage note, read under a time limit. */
async function beforeEveryUpload(): Promise<{ items: string[]; available: boolean }> {
  const md = await run('/bin/cat', [path.join(FLOW_DIR, `${RELEASE_NOTE}.md`)], { ms: 4000 });
  if (md === undefined) return { items: [], available: false };
  return { items: beforeEveryUploadIn(md), available: true };
}

/** The film's posts, from the note the release stage keeps (Flow v3.3 - 12 Release, "Published links"): a section
 *  per film, a row per platform. Read-only, under a time limit; a film with no section has none.
 *  HARNESS_PUBLISHED_LINKS, else <studio>/published-links.md. */
const PUBLISHED_NOTE = process.env.HARNESS_PUBLISHED_LINKS || path.join(/*turbopackIgnore: true*/ harnessConfig().filmRepo, 'published-links.md');
/** The harness's own copy of the note as last read. A synced note can miss a read, and a read that gets no answer
 *  used to make a posted film look unposted: the kept copy is shown instead, with a warning. */
const KEPT_PUBLISHED = () => path.join(harnessConfig().harnessDir, 'published-links.md');
/** The Published links note as it is now (else the kept copy, with a warning); undefined when neither can be read. */
export async function readPublishedNote(warn?: Warnings): Promise<string | undefined> {
  let md = await run('/bin/cat', [PUBLISHED_NOTE], { ms: 4000 });
  if (md) {
    const kept = KEPT_PUBLISHED();
    if ((await readText(kept)) !== md) await fs.mkdir(path.dirname(kept), { recursive: true }).then(() => fs.writeFile(kept, md!)).catch(() => undefined);
  } else {
    md = await readText(KEPT_PUBLISHED());
    warn?.add('published-links.md', `the note did not answer within 4 s${md ? '; showing the last reading' : ''}`);
  }
  return md || undefined;
}

async function readPublished(title: string, warn?: Warnings): Promise<Published | undefined> {
  const md = await readPublishedNote(warn);
  return md ? publishedIn(md, title) : undefined;
}

/** The film's section of the note: a row per platform, and whether each went out. */
export function publishedIn(md: string, title: string): Published | undefined {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.slice(3).trim().toLowerCase().startsWith(title.toLowerCase()));
  if (start < 0) return undefined;
  const rows: PublishedRow[] = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const l = lines[i].trim();
    if (!l.startsWith('|')) continue;
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length < 4 || /^platform$/i.test(c[0]) || /^:?-+:?$/.test(c[0])) continue;
    const link = /https?:\/\/[^\s)]+/.exec(c[3])?.[0];
    const posted = c[4] || undefined;
    // the note's own words: "add" in the link cell is a link still to come; "add if posted" is a post nobody has recorded
    const pending = !link && /^add\b(?!\s+if\b)/i.test(c[3]);
    const went = !!link || !!posted || pending;
    // a row that did not go out says why in its title cell ("not posted (left out by the user)")
    const why = pending ? (/by hand/i.test(c[3]) ? 'posted by hand · link still to come' : 'link still to come')
      : went ? '' : [c[2], c[3]].filter((x) => x && !/^https?:/.test(x) && /^not /i.test(x)).join(' · ') || 'no post on record';
    rows.push({ platform: c[0], account: c[1] || undefined, title: went && c[2] && !/^not /i.test(c[2]) ? c[2] : undefined, link, posted, pending: pending || undefined, note: why || undefined });
  }
  return rows.length ? { from: 'published-links.md', heading: lines[start].slice(3).trim(), rows } : undefined;
}

// ---- thumbnails

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function readThumbs(ctx: FilmCtx): Promise<{ rounds: ThumbRound[]; plain: string[] }> {
  const files = (await list(abs(ctx, 'social'))).filter((e) => !e.dir && /^youtube-thumbnail-.+\.(jpe?g|png)$/i.test(e.name)).map((e) => e.name);
  const plain = (await list(abs(ctx, 'social/thumb-options'))).filter((e) => !e.dir && /\.(jpe?g|png)$/i.test(e.name)).map((e) => `social/thumb-options/${e.name}`);
  const secs = await reviewSections(ctx);
  // the review page shows each round as a sheet with its names ("Tobias at the door · Maren at the lamp · …"); oldest round first
  const cards = secs.flatMap((sec) => sec.cards.filter((c) => /thumbnail|frame at/i.test(c.title ?? '') && c.items.some((it) => /thumbnails?-sheet/i.test(it.file ?? '')))
    .map((c) => ({ c, date: sec.date }))).reverse();
  const used = new Set<string>();
  const stemOf = (f: string) => slugOf(f.replace(/^youtube-thumbnail-/i, '').replace(/\.[^.]+$/, ''));
  const rounds: ThumbRound[] = [];
  for (const { c, date } of cards) {
    const sheet = c.items.find((it) => /sheet/i.test(it.file ?? ''));
    const names = (sheet?.label ?? '').split('·').map((x) => x.trim()).filter(Boolean);
    const thumbs: Thumb[] = [];
    for (const n of names) {
      const want = slugOf(n);
      const exact = files.find((f) => !used.has(f) && stemOf(f) === want);
      const tail = exact ?? files.find((f) => !used.has(f) && stemOf(f).endsWith(`-${want}`));
      if (!tail) continue;
      used.add(tail);
      thumbs.push({ name: n, path: `social/${tail}` });
    }
    if (thumbs.length) rounds.push({ title: c.title ?? 'Thumbnails', sheet: sheet?.file, sheetLabel: sheet?.label, thumbs, date });
  }
  const rest = files.filter((f) => !used.has(f));
  if (rest.length) rounds.push({ title: 'Other thumbnails in social/', thumbs: rest.map((f) => ({ name: f.replace(/^youtube-thumbnail-/i, '').replace(/\.[^.]+$/, '').replace(/-/g, ' '), path: `social/${f}` })) });
  return { rounds, plain };
}

export async function readRelease(s: FilmStateX): Promise<ReleaseInfo> {
  const warn = new Warnings();
  const ctx: FilmCtx = { dir: s.film.folder, warn };
  const kitMd = await readText(abs(ctx, 'social/kit.md'));
  const kit: Kit | undefined = kitMd ? { path: 'social/kit.md', ...parseKit(redact(kitMd)) } : undefined;
  const [delivery, thumbs, general, published] = await Promise.all([readDelivery(s, warn), readThumbs(ctx), beforeEveryUpload(), readPublished(s.film.title, warn)]);
  if (!general.available) warn.add(`${RELEASE_NOTE}.md`, 'the rules note did not answer within 4 s');

  // times named in the kit's thumbnail note ("lamp lit (2:08.3, …)")
  if (kitMd) for (const r of thumbs.rounds) for (const t of r.thumbs) {
    const m = new RegExp(`\\*\\*${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*\\((\\d+:\\d+(?:\\.\\d+)?)`, 'i').exec(kitMd);
    if (m) t.time = m[1];
  }

  // the delivered cut to play: the current edition's phone copy; its twin in social/ (same size) plays from the drive
  let play: ReleaseInfo['play'];
  const kitDel = delivery.find((d) => d.kit)?.kit;
  const phone = kitDel?.files.find((f) => f.current && f.kind === 'captioned-480p') ?? kitDel?.files.find((f) => f.kind === 'captioned-480p');
  if (kitDel && phone) {
    const social = (await list(abs(ctx, 'social'))).filter((e) => !e.dir && /captioned-480p\.mp4$/i.test(e.name));
    let twin: string | undefined;
    for (const e of social) if ((await fileFact(abs(ctx, `social/${e.name}`)))?.bytes === phone.bytes) twin = `social/${e.name}`;
    play = { path: twin ?? path.join(kitDel.folder, phone.name), label: phone.name, twin };
  } else {
    const local = (await list(abs(ctx, 'social'))).filter((e) => !e.dir && /final-captioned-480p\.mp4$/i.test(e.name)).map((e) => `social/${e.name}`).sort(natCmp).pop();
    if (local) play = { path: local, label: path.basename(local) };
  }

  const picks = s.taste.filter((t) => /thumbnail|caption|title|post|kit|tiktok|youtube|reddit|linkedin/i.test(t.what)).map((t) => ({ what: t.what, pick: t.pick, date: t.date }));
  const thumbPick = picks.find((p) => /thumbnail/i.test(p.what));
  return {
    film: s.film.slug,
    published,
    delivery,
    thumbs: { ...thumbs, pick: thumbPick ? { pick: thumbPick.pick, date: thumbPick.date } : undefined },
    kit,
    checklist: { general: general.items, from: RELEASE_NOTE, available: general.available },
    play,
    picks,
    warnings: warn.list,
  };
}
