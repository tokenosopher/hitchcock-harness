// The script edited in place on the Story page (ASKS 64, 16 Nov 2026). Pure text functions, used by the server's
// save (src/server/actions/script.ts) and by the page (an earlier version's text, the story a script was written from,
// the fingerprint the save starts from). Nothing here reads or writes a file.
//
// What an edit may change, and nothing else: the words of one spoken line (inside its quotes) or of one direction
// (after its `[N s]`). The count and the order of the rows, who speaks, a line's delivery note and a direction's
// seconds stay as they are, because the line IDs (L01…, counted in film order), the cast and the timing follow them.
// A save is the next script version: the version it replaces is copied word for word under "## Earlier drafts", and the
// new version note goes in front of the old one, which stays after it.

export type RowKind = 'line' | 'action';
export interface Row {
  scene: string;          // "S2"
  index: number;          // place among the scene's rows (lines and directions), from 0
  kind: RowKind;
  n: number;              // a line: its number in the scene (1…); a direction: its number among the scene's directions
  speaker?: string;
  direction?: string;     // a line's delivery note, "(to the sea, not very loudly)"
  seconds?: string;       // a direction's "1" of `[1 s]`
  words: string;
  at: number;             // the row's line number in the whole file, from 0
}
export interface ScriptEdit { scene: string; index: number; kind: RowKind; old: string; new: string }
export type EditStatus = 'applies' | 'changed' | 'gone';
export interface EditCheck extends ScriptEdit { status: EditStatus; at?: number; theirs?: string; label: string }

// the same two patterns as the page's rows (derive.ts sectionRows) and the reader's lines (read/script.ts LINE_RE)
export const ACTION_RE = /^`\[(\d+(?:\.\d+)?)\s*s\]`\s*(.*)$/;
export const ROW_LINE_RE = /^\*\*([^*]+?):?\*\*\s*(?:\*\(([^)]*)\)\*)?\s*:?\s*"(.*)"\s*$/;
export const READER_LINE_RE = /^\*\*([^*]+?):?\*\*\s*(?:\*\(([^)]*)\):?\*\s*:?)?\s*:?\s*"(.*)"\s*$/;

/** FNV-1a over the text: the same number on the server and in the browser, so a save can say what it started from. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

/** Where the "## <name>" section is: the heading's line and the first line after it that is not in it. */
export function sectionSpan(lines: string[], heading: RegExp): { head: number; end: number } | undefined {
  const head = lines.findIndex((l) => heading.test(l));
  if (head < 0) return undefined;
  let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return { head, end };
}

const SCRIPT_H = /^##\s+Script\s*$/;
const EARLIER_H = /^##\s+Earlier drafts/i;

/** The rows of the current script ("## Script"), scene by scene, in file order. */
export function scriptRows(markdown: string): Row[] {
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, SCRIPT_H);
  return span ? rowsIn(lines, span.head + 1, span.end) : [];
}

function rowsIn(lines: string[], from: number, to: number): Row[] {
  const out: Row[] = [];
  let scene: string | undefined;
  let index = 0, nl = 0, na = 0;
  for (let i = from; i < to; i++) {
    const t = lines[i].trim();
    const h = /^###\s+(S\d+)\b/.exec(t);
    if (h) { scene = h[1]; index = 0; nl = 0; na = 0; continue; }
    if (/^###\s/.test(t)) { scene = undefined; continue; }
    if (!scene) continue;
    const a = ACTION_RE.exec(t);
    if (a) { out.push({ scene, index: index++, kind: 'action', n: ++na, seconds: a[1], words: a[2], at: i }); continue; }
    const m = ROW_LINE_RE.exec(t);
    if (m) out.push({ scene, index: index++, kind: 'line', n: ++nl, speaker: m[1].trim(), direction: m[2]?.trim() || undefined, words: m[3], at: i });
  }
  return out;
}

/** The spoken lines as the reader numbers them (read/script.ts): speaker and words, in film order. */
export function readerLines(markdown: string): { speaker: string; text: string; scene?: string }[] {
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, SCRIPT_H);
  if (!span) return [];
  const out: { speaker: string; text: string; scene?: string }[] = [];
  let scene: string | undefined;
  for (let i = span.head + 1; i < span.end; i++) {
    const l = lines[i].trim();
    const h = /^###\s+(S\d+[A-Za-z-]*)\b/.exec(l);
    if (h) scene = h[1];
    else if (/^###\s/.test(l)) scene = undefined;
    const m = READER_LINE_RE.exec(l);
    if (m) out.push({ speaker: m[1].trim(), text: m[3], scene });
  }
  return out;
}

/** The version note: the italic paragraph under "## Script" that starts with "*v<n>". */
export function versionNote(markdown: string): { line: number; text: string } | undefined {
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, SCRIPT_H);
  if (!span) return undefined;
  for (let i = span.head + 1; i < span.end; i++) if (/^\*v\d/.test(lines[i].trim())) return { line: i, text: lines[i].trim() };
  return undefined;
}

/** The current version and whether it is locked, from the note's first words ("*v4, LOCKED …"). */
export function currentVersion(markdown: string): { version: string; locked: boolean } | undefined {
  const n = versionNote(markdown);
  const m = n && /^\*(v\d+(?:\.\d+)*)\b([\s\S]*)$/.exec(n.text);
  if (!m) return undefined;
  return { version: m[1], locked: /^[\s,;]*LOCKED/.test(m[2]) };
}

/** Every version the file names (the note's and the earlier drafts' headings). */
function namedVersions(markdown: string): Set<string> {
  const out = new Set<string>();
  const note = versionNote(markdown)?.text ?? '';
  // a story version the note names ("the settled story v7", "story/v7.md") is not a script version
  for (const m of note.matchAll(/\bv(\d+(?:\.\d+)*)\b/g)) if (!/\bstory(?:\s+|\/)$/i.test(note.slice(Math.max(0, m.index! - 7), m.index))) out.add(`v${m[1]}`);
  for (const m of markdown.matchAll(/^###\s+(v\d+(?:\.\d+)*)\b/gm)) out.add(m[1].toLowerCase());
  return out;
}

/** v1 → v2; v2.8 → v2.9; never a name the file already uses. */
export function nextVersion(markdown: string, current: string): string {
  const taken = namedVersions(markdown);
  const parts = current.slice(1).split('.').map(Number);
  for (;;) {
    parts[parts.length - 1] += 1;
    const v = `v${parts.join('.')}`;
    if (!taken.has(v)) return v;
  }
}

/** The text of an earlier version kept under "## Earlier drafts" ("### v1 (2026-11-16, as sent)"), without its heading. */
export function earlierText(markdown: string, version: string): string | undefined {
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, EARLIER_H);
  if (!span) return undefined;
  const esc = version.replace(/\./g, '\\.');
  const head = lines.findIndex((l, i) => i > span.head && i < span.end && new RegExp(`^###\\s+${esc}\\b`, 'i').test(l.trim()));
  if (head < 0) return undefined;
  let end = lines.findIndex((l, i) => i > head && i < span.end && /^###\s+(v\d|Draft \d)/i.test(l.trim()));
  if (end < 0) end = span.end;
  return lines.slice(head + 1, end).join('\n').trim();
}

/** An earlier version's text as a script.md of its own, so the page reads its scenes the way it reads the current one. */
export function earlierAsScript(markdown: string, version: string): string | undefined {
  const t = earlierText(markdown, version);
  return t === undefined ? undefined : `## Script\n\n${t}\n`;
}

/** The story version the script was written from, as the script's own "## Story" heading or note names it
 *  ("## Story (the settled story, story/v7.md, …)"); undefined when it does not say. */
export function storyVersionOf(markdown?: string): string | undefined {
  if (!markdown) return undefined;
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, /^##\s+Story\b/);
  if (!span) return undefined;
  const head = lines.slice(span.head, Math.min(span.end, span.head + 4)).join('\n');
  return /\bstory\/(v\d+)\.md\b/.exec(head)?.[1];
}

export const rowLabel = (r: Pick<Row, 'scene' | 'kind' | 'n'>): string => (r.kind === 'line' ? `${r.scene} line ${r.n}` : `${r.scene} direction ${r.n}`);
const clean = (w: string): string => w.replace(/\s+/g, ' ').trim();

/** Where each edit lands in this text: on its row as it was (applies), on a row someone else changed (changed: the
 *  newer words are `theirs`), or nowhere (gone: its row was cut or moved out of reach). A row is found by its scene and
 *  place; when the rows above it moved, by its old words, if they are in that scene exactly once. */
export function checkEdits(markdown: string, edits: ScriptEdit[]): EditCheck[] {
  const rows = scriptRows(markdown);
  return edits.map((e) => {
    const inScene = rows.filter((r) => r.scene === e.scene && r.kind === e.kind);
    const same = inScene.find((r) => r.index === e.index);
    if (same && clean(same.words) === clean(e.old)) return { ...e, status: 'applies', at: same.at, label: rowLabel(same) };
    const byWords = inScene.filter((r) => clean(r.words) === clean(e.old));
    if (byWords.length === 1) return { ...e, index: byWords[0].index, status: 'applies', at: byWords[0].at, label: rowLabel(byWords[0]) };
    if (same) return { ...e, status: 'changed', at: same.at, theirs: same.words, label: rowLabel(same) };
    return { ...e, status: 'gone', label: `${e.scene} ${e.kind === 'line' ? 'line' : 'direction'}` };
  });
}

export class ScriptEditError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface Applied { markdown: string; from: string; version: string; changes: (EditCheck & { status: 'applies' })[]; note: string }

/** One edit's words, checked: one line of text, not empty, nothing that would end the row early. */
export function checkWords(e: ScriptEdit): string {
  const w = clean(e.new);
  if (typeof e.new !== 'string' || !w) throw new ScriptEditError(`${e.scene}: the new words are empty; to cut a ${e.kind === 'line' ? 'line' : 'direction'}, ask Alma`);
  if (/[\r\n]/.test(e.new.trim())) throw new ScriptEditError(`${e.scene}: the new words run over more than one line; a new line goes through Alma`);
  if (w.length > 2000) throw new ScriptEditError(`${e.scene}: the new words are longer than 2,000 characters`);
  if (e.kind === 'action' && /^\*\*[^*]+\*\*/.test(w)) throw new ScriptEditError(`${e.scene}: a direction that starts with a speaker's name would read as a spoken line; a new line goes through Alma`);
  if (e.kind === 'action' && /^`?\[\d/.test(w)) throw new ScriptEditError(`${e.scene}: a direction's seconds are not changed on the page; ask Alma`);
  return w;
}

/** The whole save as text: the earlier version kept, the words swapped, the new note in front. All or nothing: any
 *  edit that does not apply, or a result that reads differently from the old file in anything but those words, throws. */
export function applyEdits(markdown: string, edits: ScriptEdit[], opts: { date: string }): Applied {
  if (!edits.length) throw new ScriptEditError('nothing to save');
  const cur = currentVersion(markdown);
  if (!cur) throw new ScriptEditError('script.md has no version note under "## Script"', 409);
  if (cur.locked) throw new ScriptEditError(`script ${cur.version} is locked; to change a line, unlock it through Alma first`, 409);
  const seen = new Set<string>();
  for (const e of edits) {
    const k = `${e.scene}:${e.index}:${e.kind}`;
    if (seen.has(k)) throw new ScriptEditError(`${e.scene}: the same row is edited twice`);
    seen.add(k);
  }
  const checks = checkEdits(markdown, edits);
  const off = checks.find((c) => c.status !== 'applies');
  if (off) throw new ScriptEditError(`${off.label} is not as it was when you started`, 409);
  const changes = checks.filter((c) => clean(c.old) !== clean(c.new)) as Applied['changes'];
  if (!changes.length) throw new ScriptEditError('nothing changed');
  const words = new Map(changes.map((c) => [c.at!, checkWords(c)]));

  const lines = markdown.split('\n');
  const before = scriptRows(markdown);
  const span = sectionSpan(lines, SCRIPT_H)!;
  const kept = lines.slice(span.head + 1, span.end).join('\n').trim();

  // 1. the words, in place: the rest of each row exactly as it was
  for (const c of changes) {
    const raw = lines[c.at!];
    const w = words.get(c.at!)!;
    if (c.kind === 'line') {
      const q1 = raw.indexOf('"');
      const q2 = raw.lastIndexOf('"');
      lines[c.at!] = `${raw.slice(0, q1 + 1)}${w}${raw.slice(q2)}`;
    } else {
      const m = /^(\s*`\[[^\]]*\]`\s*)/.exec(raw)!;
      lines[c.at!] = `${m[1]}${w}`;
    }
  }

  // 2. the new note in front of the old one (the old one stays whole after it)
  const version = nextVersion(markdown, cur.version);
  const note = versionNote(markdown)!;
  const said = changes.map((c) => `${c.label}${c.kind === 'line' ? ` (${before.find((r) => r.at === c.at)?.speaker ?? ''})` : ''}: "${words.get(c.at!)}" (was "${clean(c.old)}")`).join('; ');
  const newNote = `*${version}, draft. ${opts.date}: the user's edit on the Story page, word for word: ${said}. ${note.text.replace(/^\*|\*$/g, '')}*`;
  lines[note.line] = lines[note.line].replace(note.text, newNote);

  // 3. the version it replaces, word for word, under "## Earlier drafts", newest first
  const entry = [`### ${cur.version} (${opts.date}, as sent)`, '', kept, ''];
  const earlier = sectionSpan(lines, EARLIER_H);
  if (earlier) {
    let at = earlier.head + 1;
    while (at < earlier.end && !lines[at].trim()) at++;
    if (/^none yet\.?$/i.test(lines[at]?.trim() ?? '')) { lines.splice(at, 1); }
    lines.splice(earlier.head + 1, 0, '', ...entry);
  } else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Earlier drafts', '', ...entry);
  }
  let out = lines.join('\n').replace(/\n{3,}(?=### )/g, '\n\n');
  if (!out.endsWith('\n')) out += '\n';

  // 4. the result reads as the old file did, but for the changed words
  const after = scriptRows(out);
  const sameShape = after.length === before.length && after.every((r, i) => r.scene === before[i].scene && r.kind === before[i].kind && r.speaker === before[i].speaker && r.direction === before[i].direction && r.seconds === before[i].seconds);
  if (!sameShape) throw new ScriptEditError('the new words would change the script\'s rows; ask Alma for that change');
  const changed = new Set(changes.map((c) => `${c.scene}:${c.index}`));
  for (let i = 0; i < after.length; i++) {
    const k = `${after[i].scene}:${after[i].index}`;
    const want = changed.has(k) ? words.get(before[i].at) : before[i].words;
    if (clean(after[i].words) !== clean(want ?? '')) throw new ScriptEditError(`${rowLabel(after[i])} would not read as written; ask Alma for that change`);
  }
  const rl0 = readerLines(markdown), rl1 = readerLines(out);
  if (rl0.length !== rl1.length || rl0.some((l, i) => l.speaker !== rl1[i].speaker || l.scene !== rl1[i].scene)) throw new ScriptEditError('the new words would change the spoken lines\' count or speakers; ask Alma for that change');
  const nv = currentVersion(out);
  if (nv?.version !== version || nv.locked) throw new ScriptEditError('the new version note does not read back');
  if (earlierText(out, cur.version)?.trim() !== kept) throw new ScriptEditError(`${cur.version} would not be kept word for word`);
  return { markdown: out, from: cur.version, version, changes, note: newNote };
}

/** What Alma is told after a save (recipes/story.md, "When the user edits the script on the page"). */
export const SCRIPT_EDITED_KIND = 'script-edited';
export function scriptEditedMessage(a: Pick<Applied, 'from' | 'version' | 'changes'>, rel: string): string {
  const scenes = [...new Set(a.changes.map((c) => c.scene))];
  return [
    `<harness-action kind="${SCRIPT_EDITED_KIND}" version="${a.version}" from="${a.from}"/> The user edited the script on the Story page and saved it as ${a.version}: ${rel}. ${a.from} is kept word for word under "## Earlier drafts".`,
    '',
    'What changed, word for word:',
    ...a.changes.map((c) => `- ${c.label}: "${c.new.replace(/\s+/g, ' ').trim()}" (was "${c.old.replace(/\s+/g, ' ').trim()}")`),
    '',
    `Yours, as recipes/story.md says: re-time ${scenes.join(', ')} and the whole film, check the changed lines against the video filter, fix any quote of the old words in the audit, and say in the thread whether the script now differs from the settled story. Finish ${a.version} in place: this is not a new version.`,
  ].join('\n');
}

/** The "words" cell of each generation's own timing table ("| S2 | 6 | 56 | …"), under its "### S<n>" heading in the
 *  current script: what the timing was written for. The page compares it with the words it counts now. */
export function sceneTableWords(markdown?: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!markdown) return out;
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, SCRIPT_H);
  if (!span) return out;
  let scene: string | undefined;
  let col = -1;
  for (let i = span.head + 1; i < span.end; i++) {
    const t = lines[i].trim();
    const h = /^###\s+(S\d+)\b/.exec(t);
    if (h) { scene = h[1]; col = -1; continue; }
    if (/^###\s/.test(t)) { scene = undefined; continue; }
    if (!scene || !t.startsWith('|')) continue;
    const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (col < 0) { col = cells.findIndex((c) => /^words$/i.test(c)); continue; }
    if ((cells[0] === scene || cells[0]?.startsWith(`${scene} `)) && col >= 0) { const n = Number(cells[col]); if (Number.isFinite(n)) out[scene] = n; }
  }
  return out;
}

/** The rows of the script's ID table of one kind ("location", "character"): their ID and what it is. */
export function idRows(markdown: string | undefined, what: 'character' | 'location' | 'prop'): { id: string; name: string }[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const span = sectionSpan(lines, /^##\s+IDs\b/);
  if (!span) return [];
  return lines.slice(span.head + 1, span.end).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((c) => c[0]?.toLowerCase() === what && /^[CLP]\d/.test(c[1] ?? '')).map((c) => ({ id: c[1], name: (c[2] ?? '').split(/[,:(]/)[0].trim() }));
}
