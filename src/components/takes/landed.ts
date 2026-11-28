// What the app knows about a take that came back, beside its shots: what was asked, the model
// and its cost, and Alma's check. Pure: the server's reader (server/films/read/landed.ts) fills it from the film's files,
// the New takes page (TakesInboxPage.tsx) shows it, scripts/takesinbox-test.ts checks the readers.
//
// Where each part comes from, in order, every file optional:
//   - what was asked: the card that shows the take in review/cards.json (its title and words), and the generation's
//     README.md (its heading and first lines);
//   - the model: the spend.md row of the take's job (its `<G>-take<N>.jobid`), else the card's sub line ("job … · 15
//     credits · 5.0 s · 854x480 draft");
//   - Alma's check: her findings record `<G>/<G>-findings.json` (the shape below, recipes/edit.md), else the take's
//     findings.md ("Verdict: …" and its list), else its check.json (the words heard against the line).

/** Alma's findings record for a generation's takes, `generations/<G>/<G>-findings.json`, schema 1 (recipes/edit.md):
 *  `{"schema":1,"by":"alma","at":"<iso>","takes":{"take1":{"summary":"…","verdict":"use","lines":[{"said":"…",
 *  "heard":"…","ok":true}],"findings":["…"]}}}`. Every field but `takes` is optional; a take not in it has no record. */
export type Verdict = 'use' | 'fix' | 'reject' | 'watch';
export const VERDICTS: Verdict[] = ['use', 'fix', 'reject', 'watch'];
export interface LineCheck { said: string; heard?: string; ok?: boolean }
export interface TakeFindings { summary?: string; verdict?: Verdict; lines: LineCheck[]; findings: string[]; at?: string; by?: string }

/** check.json as the take's check tool writes it, the parts the page shows. */
export interface CheckSummary { heard?: string; missing: string[]; extra: string[]; wordsMatch?: boolean; tailOk?: boolean; seconds?: number; firstWordAt?: number }
/** findings.md beside the take: its "Verdict:" line and its list. */
export interface FindingsNote { verdict?: string; points: string[] }

/** What was paid for the take: its spend.md row (or the card's sub line). */
export interface TakeSpend {
  /** "Seedance 2.5", "MAGI-2", or the model's own name as written. */
  model?: string;
  /** "480p", "1080p". */
  res?: string;
  /** A Seedance draft: written "draft", or Seedance at 480p (the flow's drafts). */
  draft: boolean;
  seconds?: number;
  /** The credits charged, when the row says (0 for a job not charged). */
  credits?: number;
  /** The cost cell as written ("15 credits (made)"). */
  costText?: string;
  /** Where it was read: "spend.md" or "the card". */
  from: 'spend.md' | 'card';
}

export interface LandedTake {
  /** The take's folder, relative to the film repo ("assets/films/<slug>/generations/FIX-oh-S4/takes/take1"). */
  folder: string;
  gen: string;
  /** "take1": the take's folder name, the key of its entry in the findings record. */
  take: string;
  job?: string;
  card?: { title: string; sub?: string; text: string[] };
  readme?: { title?: string; lines: string[] };
  spend?: TakeSpend;
  alma?: TakeFindings;
  note?: FindingsNote;
  check?: CheckSummary;
}
export type LandedMap = Record<string, LandedTake>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : []);
const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** A verdict as Alma may write it: "use", "keep" and "good" are use; "redo" and "fix" fix; "reject", "bad", "not usable"
 *  reject; "watch", "check" watch. Anything else: none. */
export function readVerdict(v: unknown): Verdict | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if (/^(use|keep|good|ok)\b/.test(s)) return 'use';
  if (/^(fix|redo|retake)\b/.test(s)) return 'fix';
  if (/^(reject|bad|not usable|unusable|drop)\b/.test(s)) return 'reject';
  if (/^(watch|check|listen|look|unsure|maybe)\b/.test(s)) return 'watch';
  return undefined;
}

/** One take's entry of Alma's findings record, read leniently: undefined when the record is not schema 1, or has no
 *  entry for the take, or the entry says nothing. */
export function readFindings(v: unknown, take: string): TakeFindings | undefined {
  const r = rec(v);
  if (!r || r.schema !== 1) return undefined;
  const e = rec(rec(r.takes)?.[take]);
  if (!e) return undefined;
  const lines: LineCheck[] = (Array.isArray(e.lines) ? e.lines : []).flatMap((x) => {
    const l = rec(x);
    const said = str(l?.said);
    if (!l || !said) return [];
    return [{ said, ...(str(l.heard) ? { heard: str(l.heard)! } : {}), ...(typeof l.ok === 'boolean' ? { ok: l.ok } : {}) }];
  });
  const out: TakeFindings = {
    ...(str(e.summary) ? { summary: str(e.summary)! } : {}),
    ...(readVerdict(e.verdict) ? { verdict: readVerdict(e.verdict)! } : {}),
    lines, findings: strs(e.findings),
    ...(str(e.at) ?? str(r.at) ? { at: (str(e.at) ?? str(r.at))! } : {}),
    ...(str(r.by) ? { by: str(r.by)! } : {}),
  };
  return out.summary || out.verdict || out.lines.length || out.findings.length ? out : undefined;
}

/** check.json, the parts shown; undefined when it is not a check. */
export function readCheck(v: unknown): CheckSummary | undefined {
  const r = rec(v);
  if (!r || (r.transcript === undefined && r.missing === undefined && r.words_match === undefined)) return undefined;
  return {
    ...(str(r.transcript) ? { heard: str(r.transcript)! } : {}),
    missing: strs(r.missing), extra: strs(r.extra),
    ...(typeof r.words_match === 'boolean' ? { wordsMatch: r.words_match } : {}),
    ...(typeof r.tail_ok === 'boolean' ? { tailOk: r.tail_ok } : {}),
    ...(num(r.seconds) !== undefined ? { seconds: num(r.seconds)! } : {}),
    ...(num(r.first_word_at) !== undefined ? { firstWordAt: num(r.first_word_at)! } : {}),
  };
}

/** findings.md: the words after "Verdict:" and the "- " list; undefined when it has neither. */
export function readFindingsNote(text: string | undefined): FindingsNote | undefined {
  if (!text) return undefined;
  const verdict = /^\s*\**verdict\**\s*:\s*(.+)$/im.exec(text)?.[1]?.replace(/\*\*/g, '').trim();
  const points = text.split('\n').map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]?.replace(/\*\*/g, '').trim()).filter((x): x is string => !!x).slice(0, 12);
  return verdict || points.length ? { ...(verdict ? { verdict } : {}), points } : undefined;
}

/** README.md: its first heading and the lines of its first part (up to the next heading), without blank ones. */
export function readReadme(text: string | undefined): { title?: string; lines: string[] } | undefined {
  if (!text) return undefined;
  const all = text.split('\n');
  const h = all.findIndex((l) => /^#{1,3}\s/.test(l));
  const title = h >= 0 ? all[h].replace(/^#+\s*/, '').trim() : undefined;
  const rest = all.slice(h + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s/.test(l));
  const lines = (end >= 0 ? rest.slice(0, end) : rest).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  return title || lines.length ? { ...(title ? { title } : {}), lines } : undefined;
}

const MODELS: [RegExp, string][] = [
  [/seedance[_ -]?2[._]?5/i, 'Seedance 2.5'],
  [/seedance[_ -]?2(?![._]?\d)/i, 'Seedance 2'],
  [/seedance/i, 'Seedance'],
  [/magi[_ -]?2/i, 'MAGI-2'],
  [/kling[_ -]?(\d[._]?\d?)/i, 'Kling'],
  [/veo[_ -]?(\d)/i, 'Veo'],
  [/wan[_ -]?(\d)/i, 'Wan'],
];
/** The model, resolution and draft of a spend row's service cell ("Higgsfield seedance_2_5 omni_reference, 480p draft,
 *  16:9, 5 s"), or of a card's sub line ("854x480 draft"). */
export function modelOf(service: string): Pick<TakeSpend, 'model' | 'res' | 'draft' | 'seconds'> {
  const hit = MODELS.find(([re]) => re.test(service));
  const model = hit ? (hit[1] === 'Kling' || hit[1] === 'Veo' || hit[1] === 'Wan' ? `${hit[1]} ${(hit[0].exec(service)?.[1] ?? '').replace('_', '.')}`.trim() : hit[1]) : undefined;
  const p = /\b(\d{3,4})p\b/i.exec(service)?.[1] ?? /\b\d{3,4}x(\d{3,4})\b/.exec(service)?.[1];
  // "1920x1080" is 1080p; "854x480" 480p (the shorter side)
  const wh = /\b(\d{3,4})x(\d{3,4})\b/.exec(service);
  const res = wh ? `${Math.min(Number(wh[1]), Number(wh[2]))}p` : p ? `${p}p` : undefined;
  // a Seedance draft: Seedance written "draft" or at 480p; a line naming no model ("854x480 draft", a card's) at 480p.
  // MAGI-2 renders at 1080p and is never one, whatever a card calls it
  const draft = /seedance/i.test(service) ? /\bdraft\b/i.test(service) || res === '480p' : !model && /\bdraft\b/i.test(service) && res === '480p';
  const secs = /(\d+(?:\.\d+)?)\s*s\b/.exec(service.replace(/\b\d{3,4}p\b/g, ''));
  return { ...(model ? { model } : {}), ...(res ? { res } : {}), draft, ...(secs ? { seconds: Number(secs[1]) } : {}) };
}
/** "15 credits (made)" → 15; "0 credits (MAGI-2 failed, not charged)" → 0; undefined without a number of credits. */
export function creditsOf(cost: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(?:cr\b|credits?)/i.exec(cost);
  return m ? Number(m[1]) : undefined;
}

/** The chip a take's model makes: "Seedance draft · 480p", "MAGI-2 · 1080p", "Seedance 2.5". */
export function modelChip(s: TakeSpend | undefined): string | undefined {
  if (!s || (!s.model && !s.res)) return undefined;
  const m = s.model ? (s.draft && /^Seedance/.test(s.model) ? 'Seedance draft' : s.model) : s.draft ? 'Draft' : undefined;
  return [m, s.res].filter(Boolean).join(' · ');
}

/** Alma's word on a take, from the best source there is: her record, else findings.md's verdict, else the card's
 *  opening word ("Good:", "Not usable:"). */
export function verdictOf(l: LandedTake | undefined): { v: Verdict; words: string; from: 'record' | 'findings.md' | 'card' } | undefined {
  if (!l) return undefined;
  if (l.alma?.verdict) return { v: l.alma.verdict, words: l.alma.summary ?? '', from: 'record' };
  const nv = l.note?.verdict ? readVerdict(l.note.verdict) : undefined;
  if (nv && l.note?.verdict) return { v: nv, words: l.note.verdict.replace(/^[a-z ]+[—–:-]\s*/i, ''), from: 'findings.md' };
  const first = l.card?.text[0];
  const m = first ? /^\s*(good|not usable|usable|bad|redo)\s*[:.—–-]\s*(.*)$/i.exec(first) : undefined;
  const cv = m ? readVerdict(m[1].toLowerCase() === 'usable' ? 'use' : m[1]) : undefined;
  return cv && m ? { v: cv, words: m[2], from: 'card' } : undefined;
}
export const VERDICT_WORDS: Record<Verdict, string> = { use: 'Alma: use it', fix: 'Alma: fix it', reject: 'Alma: reject', watch: 'Alma: watch it' };
