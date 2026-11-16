// A sub-agent card's credits: the spend.md rows that name the card's target, dated on or after the day the
// card started, and (when the UI saw the card start) not already in spend.md at that moment. Pure, no I/O.
import type { Cost, SpendLine, TaskCard } from '@/server/types';

/** "Alma › faces · C02 round 2" → the IDs (C02), the round or take number, and the job word ("faces"). */
export function cardTarget(title: string): { ids: string[]; round?: number; take?: number; job: string } {
  const body = title.replace(/^Alma\s*›\s*/, '');
  const [job = '', ...rest] = body.split(/\s+·\s+/);
  const target = rest.join(' · ') || body;
  const ids = [...new Set(target.match(/\b(?:[CLPSDW]\d{1,3}[A-Z]?|FIX-[\w-]+)\b/g) ?? [])];
  const round = /\b(?:round|r)\s*(\d+)\b/i.exec(target)?.[1];
  const take = /\btake\s*(\d+)\b/i.exec(target)?.[1];
  return { ids, round: round ? Number(round) : undefined, take: take ? Number(take) : undefined, job: job.toLowerCase() };
}

/** Words a row of each kind of job carries (and, third, words that say it belongs to another job);
 *  a job not listed here is matched on its target alone. */
const JOB_WORDS: [RegExp, RegExp, RegExp?][] = [
  [/^faces?$/, /\bface\b|\br\d+-\d+\b/i, /sheet|wardrobe|costume|cloth/i],
  [/^(clothing|wardrobe)$/, /wardrobe|cloth|\bW\d\b/i],
  [/^sheets?$/, /\bsheet\b/i],
  [/^voices?$/, /\bvoice/i],
  [/^elements?$/, /\belement/i],
  [/^(previz|boards?|storyboards?)$/, /previz|board/i],
  [/^(takes?|redo|pick-?ups?)$|^FIX-/i, /\btake\b|pick-?up/i],
  [/^(locations?|views?|style|plates?)$/, /location|view|style|plate|\bL\d\d\b/i],
  [/^props?$/, /\bprop\b|\bP\d\d\b/i],
];

export function lineKey(l: SpendLine): string {
  return `${l.date}|${l.what}|${l.details?.label ?? ''}|${l.jobId ?? ''}`;
}

/** The rows the card paid for (see the file comment). `baseline` = the row keys present when the card started. */
export function cardSpend(card: TaskCard, lines: SpendLine[], baseline?: Set<string>): SpendLine[] {
  const t = cardTarget(card.title);
  if (!t.ids.length) return [];
  const day = localDay(card.startedAt);
  const [, words, not] = JOB_WORDS.find(([j]) => j.test(t.job)) ?? [];
  return lines.filter((l) => {
    if (l.date < day) return false;
    if (baseline?.has(lineKey(l))) return false;
    const hay = `${l.what} ${l.details?.label ?? ''} ${l.details?.stage ?? ''}`;
    if (!t.ids.every((id) => new RegExp(`\\b${id.replace(/[-]/g, '\\-')}\\b`).test(hay))) return false;
    if (t.round !== undefined && !new RegExp(`\\bround ${t.round}\\b|\\br${t.round}-\\d+`, 'i').test(hay)) return false;
    if (t.take !== undefined && !new RegExp(`\\btake ${t.take}\\b`, 'i').test(hay)) return false;
    if (words && !words.test(hay)) return false;
    if (not && not.test(hay)) return false;
    return true;
  });
}

/** Credits and dollars of those rows, or undefined when they cost nothing. */
export function cardCost(card: TaskCard, lines: SpendLine[], baseline?: Set<string>): Cost | undefined {
  const rows = cardSpend(card, lines, baseline);
  let credits = 0;
  const usd = new Map<string, number>();
  for (const r of rows) {
    credits += r.cost.credits ?? 0;
    for (const u of r.cost.usd ?? []) usd.set(u.service, (usd.get(u.service) ?? 0) + u.amount);
  }
  credits = Math.round(credits * 100) / 100;
  if (!credits && !usd.size) return undefined;
  return {
    ...(credits ? { credits } : {}),
    ...(usd.size ? { usd: [...usd].map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 })) } : {}),
  };
}

/** spend.md dates are the user's calendar day. */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
