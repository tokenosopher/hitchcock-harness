// script.md → versions (which one is locked), the spoken lines with IDs in film order, and the
// ID table's names (C01 Maren, L01 the shore, P01 the bottle) the other readers use.
import type { ScriptLine, ScriptVersion } from '../../types';
import { abs, cells, firstDate, readJson, readText, type FilmCtx } from '../util';

export type ScriptLineX = ScriptLine & { direction?: string };

export interface ScriptInfo {
  versions: ScriptVersion[];
  current?: string;
  lines: ScriptLineX[];
  markdown: string;
  /** Names from the ID table: "C01" → "Maren", "L01" → "the shore", "P01" → "the bottle". */
  names: Map<string, string>;
  /** Roles from the "Working names" note: "C01" → "the keeper of the light". */
  roles: Map<string, string>;
}

const LINE_RE = /^\*\*([^*]+?):?\*\*\s*(?:\*\(([^)]*)\):?\*\s*:?)?\s*:?\s*"(.*)"\s*$/;

function section(text: string, heading: RegExp): string | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return undefined;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

export async function readScript(ctx: FilmCtx): Promise<ScriptInfo | undefined> {
  const markdown = await readText(abs(ctx, 'script.md'));
  if (markdown === undefined) return undefined;
  const info = readScriptText(markdown, ctx.warn);
  const lines = info.lines;

  // the captions' script.json numbers the same lines; say so when the counts disagree
  const social = await readJson<unknown[]>(ctx, 'social/script.json');
  if (Array.isArray(social) && social.length !== lines.length)
    ctx.warn.add('script.md', `${lines.length} spoken lines, social/script.json has ${social.length} (the cut's lines; IDs here follow script.md)`);
  return info;
}

/** The same reading from the text alone (the Story page's samples, the script save's own check). */
export function readScriptText(markdown: string, warn: { add: (file: string, what: string) => void } = { add: () => undefined }): ScriptInfo {
  const ctx = { warn };
  const names = new Map<string, string>();
  const roles = new Map<string, string>();

  // the ID table: | what | ID | this film |
  const ids = section(markdown, /^##\s+IDs\b/);
  if (ids) {
    for (const row of ids.split('\n').filter((l) => l.trim().startsWith('|'))) {
      const c = cells(row);
      const film = c[c.length - 1] ?? '';
      if (!/^(character|location|prop)/i.test(c[0] ?? '')) continue;
      // the IDs of one cell are set apart by a comma, a middle dot or a semicolon ("C01 Maren · C02 Tobias")
      for (const part of film.split(/\s*[,·;]\s*(?=[CLP]\d)/)) {
        const m = /^([CLP]\d+[a-z]?)\s+(.+)$/.exec(part.trim());
        if (!m) continue;
        // "Maren, the lighthouse keeper": the name, then who she is (a role; the script note's own role wins below)
        const text = m[2].trim();
        let depth = 0, cut = -1;
        for (let i = 0; i < text.length && cut < 0; i++) {
          if (text[i] === '(') depth++;
          else if (text[i] === ')') depth = Math.max(0, depth - 1);
          else if (text[i] === ',' && !depth) cut = i;
        }
        names.set(m[1], (cut < 0 ? text : text.slice(0, cut)).trim());
        if (cut >= 0 && /^C/.test(m[1])) roles.set(m[1], text.slice(cut + 1).trim());
      }
    }
  }

  const body = section(markdown, /^##\s+Script\s*$/);
  if (!body) {
    ctx.warn.add('script.md', 'no "## Script" section; lines not read');
    return { versions: [], lines: [], markdown, names, roles };
  }

  // the version note: the italic paragraph under "## Script"
  const note = body.split('\n').find((l) => /^\*v\d/.test(l.trim())) ?? '';
  for (const m of note.matchAll(/([A-Z][\w']+(?: [A-Z][\w']+)?) \((C\d+[a-z]?), ([^)]+)\)/g)) roles.set(m[2], m[3].trim());
  const versions: ScriptVersion[] = [];
  const seen = new Set<string>();
  // a story version named in the note ("written from the settled story v7", "story/v7.md") is not a script version
  const tokens = [...note.matchAll(/\bv(\d+(?:\.\d+)*)\b/g)].filter((t) => !/\bstory(?:\s+|\/)$/i.test(note.slice(Math.max(0, t.index! - 7), t.index)));
  tokens.forEach((t, i) => {
    const v = `v${t[1]}`;
    const after = note.slice(t.index! + t[0].length, tokens[i + 1]?.index ?? note.length);
    const locked = /^[\s,]*LOCKED/.test(after);
    // a version saved from the Story page says so in its own part of the note (src/lib/script-edit.ts)
    const mine = /^[\s,]*draft\.\s*[\d-]+:\s*the user's edit on the Story page/.test(after);
    const have = versions.find((x) => x.version === v);
    if (have) {
      // a later mention can carry the lock or the date ("v2.6 LOCKED by the user 27 Oct 2026")
      if (locked) have.locked = true;
      have.date ??= firstDate(after);
      return;
    }
    seen.add(v);
    versions.push({ version: v, date: firstDate(after), locked, path: 'script.md', ...(mine ? { by: 'you' as const } : {}) });
  });
  const current = versions[0]?.version;
  if (!current) ctx.warn.add('script.md', 'no version note ("*vN, LOCKED …*") under "## Script"');

  // earlier drafts: "### v3 (2026-11-06, as sent)" or "### Draft 2 (2026-10-27, …)"
  const earlier = section(markdown, /^##\s+Earlier drafts/i);
  for (const l of (earlier ?? '').split('\n')) {
    const m = /^###\s+((?:v\d+(?:\.\d+)*)|(?:Draft \d+))\s*(?:\(([^)]*)\))?/i.exec(l);
    if (!m) continue;
    const v = /^v/i.test(m[1]) ? m[1].toLowerCase() : m[1];
    if (seen.has(v)) continue;
    seen.add(v);
    versions.push({ version: v, date: firstDate(m[2]), locked: false, path: 'script.md' });
  }

  // the spoken lines, film order; IDs L01… (the ID table's "spoken line" rule)
  const lines: ScriptLineX[] = [];
  let sceneId: string | undefined;
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    const h = /^###\s+(S\d+[A-Za-z-]*)\b/.exec(l);
    if (h) sceneId = h[1];
    else if (/^###\s/.test(l)) sceneId = undefined; // "### Timing"
    const m = LINE_RE.exec(l);
    if (!m) {
      if (/^\*\*[A-Z][A-Z' .-]+:?\*\*/.test(l) && /"/.test(l)) ctx.warn.add('script.md', `a line not read: ${l.slice(0, 70)}`);
      continue;
    }
    lines.push({
      id: `L${String(lines.length + 1).padStart(2, '0')}`,
      speaker: m[1].trim(),
      text: m[3],
      sceneId,
      direction: m[2]?.trim() || undefined,
    });
  }

  return { versions, current, lines, markdown, names, roles };
}
