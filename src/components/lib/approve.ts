// A yes to a thing the app itself asks about in "Waiting for you" (today: a character's sheet),
// set aside in one tap and sent with "Done picking" like every other choice. The user, on "C04 the cup servant (no
// lines) sheet · Ready": "Why does clicking "Approve this sheet" take me to the text box? Shouldn't it be the same as
// everything else?" The harness writes nothing for it: Alma records the approval, as she does when the user types
// "I approve the C04 sheet." Pure, no React; the browser (choices.ts, ChoicesTray) and the server (POST …/done,
// sendChoices) both use it.

export interface Approval {
  kind: 'sheet';
  /** The character or form whose sheet it is: "C04", "C01a", "C06-C07". */
  id: string;
  /** The sheet file in the film folder, as the state has it ("cast/C04-cup-servant/pick.png"): the version approved. */
  path: string;
}

const ID = /^[A-Z]\d+[a-z]?(?:-[A-Z]\d+[a-z]?)*$/;
const PATH = /^cast\/[^\s<>"]+\.(?:png|jpe?g|webp)$/i;

/** The choice id of a sheet's yes: one per sheet. */
export const approvalChoiceId = (a: Pick<Approval, 'id'>): string => `approve:sheet:${a.id}`;

/** The item of "Waiting for you" it answers: the gate's sheet entry (derive.ts gateItems, "pick:<id>:sheet"). */
export const approvalWaitKey = (a: Pick<Approval, 'id'>): string => `gate:pick:${a.id}:sheet`;

/** The line Alma gets for it, inside the Done-picking message. */
export const approvalLine = (a: Approval): string => `Sheet approved: ${a.id} (${a.path})`;

/** The approvals of a request body, checked; a string says what is wrong. */
export function parseApprovals(v: unknown): Approval[] | string {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return 'approvals must be a list';
  const out: Approval[] = [];
  for (const x of v) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (r.kind !== 'sheet') return 'an approval\'s kind must be sheet';
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const path = typeof r.path === 'string' ? r.path.trim() : '';
    if (!ID.test(id)) return 'an approval needs an ID such as C04 or C01a';
    if (!PATH.test(path) || path.split('/').includes('..')) return `the approval of ${id} needs its sheet file, such as cast/${id}-…/pick.png`;
    out.push({ kind: 'sheet', id, path });
  }
  if (new Set(out.map((a) => a.id)).size !== out.length) return 'a sheet is approved twice';
  return out;
}

/** The part of the Done-picking message that lists the sheets approved: empty when there are none. */
export function approvalBlock(approvals: Approval[]): string[] {
  if (!approvals.length) return [];
  return [
    '',
    'Sheets approved in "Waiting for you":',
    ...approvals.map((a) => `- ${approvalLine(a)}`),
    `The harness wrote nothing in the film folder for ${approvals.length === 1 ? 'it' : 'these'}. Yours: record each approval of that sheet file, exactly as when the user writes "I approve the ${approvals[0].id} sheet.", and the work it starts.`,
  ];
}
