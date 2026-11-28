// npx tsx scripts/sheet-yes-test.ts
// A sheet's yes in "Waiting for you": one tap sets it aside, "Done picking" sends it. Checks the
// pure parts: the choice's request body (parseApprovals), the line Alma gets (approvalLine, approvalBlock), the item of
// "Waiting for you" it takes out (sentItems, withSent, stillSent), on the sample film sample-sheet-yes.
// One line per check, a summary line, exit 1 when any check fails.
import { approvalBlock, approvalChoiceId, approvalLine, parseApprovals, type Approval } from '../src/components/lib/approve';
import { sentItems, stillSent, withSent, SENT_ALMA_MS } from '../src/components/lib/sent';
import { gateItems, waitingKeys } from '../src/components/lib/derive';
import { castSampleState, SHEET_SLUG, sheetMockDone } from '../src/fixtures/cast';

let bad = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown): void => {
  n++;
  if (cond) console.log(`ok · ${name}`);
  else { bad++; console.error(`✗ ${name}${got === undefined ? '' : `: ${JSON.stringify(got)}`}`); }
};

const a: Approval = { kind: 'sheet', id: 'C04', path: 'cast/C04-edda/pick.png' };
ok('the line names the id and the sheet file', approvalLine(a) === 'Sheet approved: C04 (cast/C04-edda/pick.png)', approvalLine(a));
ok('a form keeps its letter', approvalLine({ kind: 'sheet', id: 'C01a', path: 'cast/C01-maren/C01a/pick-v2.png' }) === 'Sheet approved: C01a (cast/C01-maren/C01a/pick-v2.png)');
ok('one choice per sheet', approvalChoiceId(a) === 'approve:sheet:C04');

const block = approvalBlock([a]);
ok('the block: a heading, the line, what is Alma\'s', block[1] === 'Sheets approved in "Waiting for you":' && block[2] === '- Sheet approved: C04 (cast/C04-edda/pick.png)' && /wrote nothing/.test(block[3]) && /I approve the C04 sheet/.test(block[3]), block);
ok('no approvals, no block', approvalBlock([]).length === 0);

ok('parse: a good body', JSON.stringify(parseApprovals([{ kind: 'sheet', id: 'C04', path: 'cast/C04-edda/pick.png' }])) === JSON.stringify([a]));
ok('parse: none given is none', Array.isArray(parseApprovals(undefined)) && (parseApprovals(undefined) as Approval[]).length === 0);
ok('parse: a bad id is refused', typeof parseApprovals([{ kind: 'sheet', id: 'c4', path: 'cast/x/pick.png' }]) === 'string');
ok('parse: a path outside cast/ is refused', typeof parseApprovals([{ kind: 'sheet', id: 'C04', path: '../secrets.png' }]) === 'string');
ok('parse: a climb out is refused', typeof parseApprovals([{ kind: 'sheet', id: 'C04', path: 'cast/../../x.png' }]) === 'string');
ok('parse: twice is refused', typeof parseApprovals([a, a]) === 'string');
ok('parse: another kind is refused', typeof parseApprovals([{ ...a, kind: 'face' }]) === 'string');

const now = 1_000_000;
const sent = sentItems([{ label: 'Approve · C04 · Edda sheet', approve: a }], () => undefined, now);
ok('the yes takes out the sheet\'s entry', sent.length === 1 && sent[0].key === 'gate:pick:C04:sheet', sent);
ok('kept aside while Alma records it', sent[0]?.alma === true && sent[0].until === now + SENT_ALMA_MS, sent[0]);

// on the sample film: the entry waits, leaves on the send, and stays out once the state shows the sheet approved
const s = castSampleState(SHEET_SLUG)!;
const c05 = s.characters.find((c) => c.id === 'C05');
ok('the sample: C05\'s sheet made, not approved', !!c05?.sheet?.path && !c05.sheet.approved, c05?.sheet);
ok('the sample: the sheet is in "Waiting for you"', waitingKeys(s, []).includes('gate:pick:C05:sheet'), waitingKeys(s, []));
const yes: Approval = { kind: 'sheet', id: 'C05', path: c05!.sheet!.path! };
const out = sentItems([{ label: 'x', approve: yes }], () => undefined);
ok('sent: the entry leaves at once', !waitingKeys(withSent(s, out), []).includes('gate:pick:C05:sheet') && !gateItems(withSent(s, out), []).some((g) => g.key === 'pick:C05:sheet'));
ok('sent: kept aside while the state still lists it', stillSent(s, out).length === 1);

void (async () => {
const r = sheetMockDone(SHEET_SLUG, [], [], [yes])!;
const j = (await r.json()) as { message: string };
ok('the sample send answers the message with the line', r.ok && j.message.includes('- Sheet approved: C05 (cast/C05-harbourmaster/pick.png)'), j);
const after = castSampleState(SHEET_SLUG)!;
ok('after the send the state shows it approved', !!after.characters.find((c) => c.id === 'C05')?.sheet?.approved);
ok('then it is no longer kept aside, nor waiting', stillSent(after, out).length === 0 && !waitingKeys(after, []).includes('gate:pick:C05:sheet'));
ok('another film is not the sample\'s', sheetMockDone('sample-cast', [], [], [yes]) === undefined);

console.log(`${n - bad} of ${n} passed`);
if (bad) process.exit(1);
})();
