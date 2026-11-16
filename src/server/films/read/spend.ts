// spend.md → SpendLine[]: one row per paid job. Costs keep their units: Higgsfield credits ("cr"),
// dollars with the service that charged them, never a bare number. In this copy every paid job runs on Higgsfield,
// so every row counts as Higgsfield, whatever model it names (a Higgsfield voice or music model such as
// elevenlabs_v4 or elevenlabs_music_v2_5 included).
import type { Cost, SpendLine } from '../../types';
import { abs, readText, redact, stripMd, tables, type FilmCtx } from '../util';

/** What a spend row says beyond the contract's fields. */
export interface SpendExtra {
  stage?: string;          // "2 Characters", "5 blocks"
  label?: string;          // "C01 r1-2", "S3 take 2": the version or take the row paid for
  units?: string;          // "1 image", "5 s"
  rate?: string;           // "0.12 cr, plan rate"
  costText: string;        // the cost cell as written
  unpriced?: boolean;      // the row names no amount ("on the plan", "~3 image edits")
  estimate?: boolean;      // "about", "~", or an "each" rate multiplied out
  seconds?: number;        // video seconds, when the row gives them
  refund?: boolean;        // a refund row ("+72 cr", service "… (refund)"): its cost is negative
  line: number;            // 1-based line in spend.md
}
export type SpendLineX = SpendLine & { more: SpendExtra };

const SERVICES: [RegExp, string][] = [
  [/higgsfield/i, 'Higgsfield'],
];
export function serviceOf(text: string): string | undefined {
  for (const [re, name] of SERVICES) if (re.test(text)) return name;
  return undefined;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const SHORT = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8}\b/gi;

/** The job id a row paid for: a full UUID, or the 8-hex prefix the older rows use. */
export function jobIdOf(text: string): string | undefined {
  const retry = /retry\s+([0-9a-f]{8}(?:-[0-9a-f-]{27})?)/i.exec(text);
  if (retry) return retry[1].toLowerCase();
  const u = UUID.exec(text);
  if (u) return u[0].toLowerCase();
  const s = text.match(SHORT);
  return s ? s[0].toLowerCase() : undefined;
}

/** A refund row: the cost cell starts with "+" ("+72 cr") or the service says "(refund)". */
export const isRefund = (costText: string, serviceText: string): boolean => /^\s*\+/.test(costText) || /\(refund\)/i.test(serviceText);

/** Parses a cost cell into credits and dollars; `count` multiplies an "each" rate. A refund row comes back negative. */
export function parseCost(costText: string, serviceText: string, count?: number): { cost: Cost; unpriced: boolean; estimate: boolean; refund: boolean } {
  const refund = isRefund(costText, serviceText);
  const parsed = parseAmount(costText.replace(/^\s*\+\s*/, ''), serviceText, count);
  if (refund) {
    if (parsed.cost.credits) parsed.cost.credits = -parsed.cost.credits;
    for (const u of parsed.cost.usd ?? []) u.amount = -u.amount;
  }
  return { ...parsed, refund };
}

function parseAmount(costText: string, serviceText: string, count?: number): { cost: Cost; unpriced: boolean; estimate: boolean } {
  const t = costText.replace(/[×x]\s*(?=\d)/g, '× ');
  const estimate = /about|~|≈|confirm|if they complete/i.test(t);
  const each = /\beach\b/i.test(t);
  const mult = each && count && count > 1 ? count : 1;
  const cost: Cost = {};
  // Higgsfield credits: the number right before "cr" (the result of "12 × 0.12 = 1.4 cr")
  const cr = [...t.matchAll(/(\d+(?:\.\d+)?)\s*cr\b/gi)];
  if (cr.length) cost.credits = round(Number(cr[cr.length - 1][1]) * mult);
  const usd = /\$\s*(\d+(?:\.\d+)?)/.exec(t);
  if (usd) {
    const service = serviceOf(t) ?? serviceOf(serviceText) ?? 'Higgsfield';
    cost.usd = [{ amount: round(Number(usd[1]) * mult, 2), service }];
  }
  if (cost.credits === undefined && !cost.usd) {
    // a plain zero: no charge, in the unit of the service that would have charged
    if (/^(0|none|\$0)\b/i.test(t.trim())) {
      const service = serviceOf(serviceText);
      if (service === 'Higgsfield' || !service) cost.credits = 0;
      else cost.usd = [{ amount: 0, service }];
      return { cost, unpriced: false, estimate: false };
    }
    return { cost, unpriced: true, estimate };
  }
  return { cost, unpriced: false, estimate: estimate || mult > 1 };
}

const round = (n: number, d = 3): number => Math.round(n * 10 ** d) / 10 ** d;

/** Sums costs, keeping credits and each service's dollars apart. */
export function addCosts(costs: Cost[]): Cost {
  let credits = 0;
  let anyCredits = false;
  const usd = new Map<string, number>();
  for (const c of costs) {
    if (c.credits !== undefined) {
      credits += c.credits;
      anyCredits = true;
    }
    for (const u of c.usd ?? []) usd.set(u.service, (usd.get(u.service) ?? 0) + u.amount);
  }
  const out: Cost = {};
  if (anyCredits) out.credits = round(credits, 2);
  const paid = [...usd].filter(([, amount]) => amount !== 0); // a "$0 · local" line stays on its line, not in the sum
  if (paid.length) out.usd = paid.map(([service, amount]) => ({ service, amount: round(amount, 2) }));
  return out;
}

function col(header: string[], ...tests: RegExp[]): number {
  for (const re of tests) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** The film's spend: every row, the net total (refunds subtracted), what was charged and what came back. */
export async function readSpend(ctx: FilmCtx): Promise<{ lines: SpendLineX[]; total: Cost; charged: Cost; refunded?: Cost } | undefined> {
  const text = await readText(abs(ctx, 'spend.md'));
  if (text === undefined) return undefined;
  const lines: SpendLineX[] = [];
  const all = tables(text).filter((t) => t.header.includes('date') && col(t.header, /^cost$/, /credits/, /\$/) >= 0);
  if (!all.length) ctx.warn.add('spend.md', 'no spend table (a table with "date" and a cost column)');
  for (const t of all) {
    const h = t.header;
    const iDate = col(h, /^date$/);
    const iStage = col(h, /^stage$/);
    const iService = col(h, /service/);
    const iJob = col(h, /^job/);
    const iUnits = col(h, /^units$/, /^seconds$/);
    const iRate = col(h, /^rate$/);
    const iCost = col(h, /^cost$/, /credits/, /\$/);
    const iLabel = col(h, /version|take/);
    const iWhat = col(h, /purpose/, /what for/, /^what$/);
    const iGo = col(h, /go$/, /user/);
    t.rows.forEach((r, k) => {
      const lineNo = t.line + 2 + k;
      const get = (i: number): string => (i >= 0 && i < r.length ? redact(r[i]) : '');
      const date = get(iDate);
      if (!/^\d{4}-\d\d-\d\d/.test(date)) {
        ctx.warn.add('spend.md', `line ${lineNo}: no date in the first column, row skipped`);
        return;
      }
      if (r.length !== h.length) ctx.warn.add('spend.md', `line ${lineNo}: ${r.length} cells for ${h.length} columns`);
      const service = get(iService);
      const costText = get(iCost);
      const jobText = get(iJob);
      const unitsText = get(iUnits);
      // older rows reuse the "seconds" column for the user's go and the "stage" column for the job's name
      let userWords = iGo >= 0 && iGo !== iUnits ? get(iGo) : undefined;
      let units: string | undefined = unitsText;
      let note: string | undefined;
      if (iGo < 0 || iGo === iUnits) {
        if (/^user\b/i.test(unitsText)) {
          userWords = unitsText.replace(/^user:?\s*/i, '');
          units = undefined;
        } else if (unitsText && !/^[–-]$/.test(unitsText) && !/^\d/.test(unitsText)) {
          note = unitsText;
          units = undefined;
        }
      }
      if (units && /^[–-]$/.test(units)) units = undefined;
      const stageCell = get(iStage);
      let what = get(iWhat);
      let stage: string | undefined = stageCell || undefined;
      if (stageCell && !/^\d/.test(stageCell)) {
        // a named job in the stage column: it is the what, and "what for" is the note
        note = [note, what].filter(Boolean).join(' · ') || undefined;
        what = stageCell;
        stage = undefined;
      }
      const count = Number((/(\d+)\s*(?:jobs?|images?|takes?)\b/i.exec(jobText + ' ' + unitsText) ?? [])[1]) || undefined;
      // a path where an amount should be ("/bin/zsh": a "$0" the shell expanded when the row was written)
      if (/^\//.test(costText.trim())) ctx.warn.add('spend.md', `unreadable cost cell, line ${lineNo} ("${costText.slice(0, 40)}"; a shell-expanded $0?)`);
      const parsed = parseCost(costText, service, count);
      const secs = /(\d+(?:\.\d+)?)\s*s\b(?!\w)/.exec(unitsText && /\bs\b/.test(unitsText) ? unitsText : service);
      if (parsed.unpriced) note = [note, `cost as written: ${costText || '(empty)'}`].filter(Boolean).join(' · ');
      const line: SpendLineX = {
        date: date.slice(0, 10),
        what: stripMd(what),
        service,
        jobId: jobIdOf(jobText),
        userWords: userWords || undefined,
        cost: parsed.cost,
        note,
        more: {
          stage,
          label: get(iLabel) || undefined,
          units: units || undefined,
          rate: get(iRate) || undefined,
          costText,
          unpriced: parsed.unpriced || undefined,
          estimate: parsed.estimate || undefined,
          seconds: secs ? Number(secs[1]) : undefined,
          refund: parsed.refund || undefined,
          line: lineNo,
        },
      };
      lines.push(line);
    });
  }
  const unpriced = lines.filter((l) => l.more.unpriced);
  if (unpriced.length)
    ctx.warn.add('spend.md', `${unpriced.length} rows name no amount (${[...new Set(unpriced.map((l) => l.more.costText))].slice(0, 6).join('; ')}); counted as unpriced`);
  const refunds = lines.filter((l) => l.more.refund);
  const back = addCosts(refunds.map((l) => l.cost));
  const refunded: Cost | undefined = refunds.length
    ? { credits: back.credits !== undefined ? -back.credits : undefined, usd: back.usd?.map((u) => ({ ...u, amount: -u.amount })) }
    : undefined;
  return { lines, total: addCosts(lines.map((l) => l.cost)), charged: addCosts(lines.filter((l) => !l.more.refund).map((l) => l.cost)), refunded };
}
