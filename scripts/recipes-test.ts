// npm run recipes:test
// Alma's recipes say things the code has to agree with: which words in a sub-agent's name light which step of
// the board (recipes/dispatch.md, against aimOf), and which places a card can name (recipes/show.md, against
// FEED_PLACES). This reads the recipes and checks them against the code, so one cannot drift from the other.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { aimOf } from '../src/components/lib/derive';
import { RECIPES } from '../src/server/recipes';
import { FEED_PLACES, type TaskCard } from '../src/server/types';
import { pageHref } from '../src/components/shell/AlmaText';
import { validateRelease, RELEASE_REL } from '../src/components/release/file';
import { OP_NAMES } from '../src/components/release/ops';
import { PLATFORM_KINDS } from '../src/components/release/platforms';
import { optionsTag } from '../src/server/edit/render-options';
import { variantBase } from '../src/server/edit/render';
import { ALMA_APPEND_PROMPT } from '../src/server/claude/process';
import { checkDrop, DROP_DIR, DROP_NAME, isDropFile } from '../src/server/edit/alma-drop';
import { QC_SPECS } from '../src/components/lib/qc';
import { SCRIPT_EDITED_KIND, scriptEditedMessage } from '../src/lib/script-edit';
import { BEFORE_EVERY_UPLOAD, beforeEveryUploadIn, FLOW_DIR, RELEASE_NOTE } from '../src/server/films/read/release';

const STEP: Record<string, string> = {
  Story: 'story', Locations: 'loc', Views: 'views', Shots: 'shots', Previz: 'previz', Faces: 'faces', Clothing: 'clothing', Sheet: 'sheet', Voices: 'voices',
  Elements: 'elements', Scenes: 'scenes', Edit: 'edit', Finish: 'finish', Sound: 'sound', Release: 'release',
};
let bad = 0;
const fail = (m: string): void => { bad++; console.error(`✗ ${m}`); };
const node = (name: string): string | undefined => aimOf({ title: `Alma › ${name}` } as TaskCard).node;

for (const [k, p] of Object.entries(RECIPES)) if (!existsSync(p)) fail(`recipe "${k}" is missing: ${p}`);

const dispatch = readFileSync(RECIPES.dispatch, 'utf8');
let checked = 0;
for (const line of dispatch.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  const want = STEP[cells[1] ?? ''];
  if (!want || cells.length < 5) continue;
  // every word the row promises, as a bare job name, and every example
  const words = cells[2].split(',').map((w) => w.trim()).filter(Boolean).map((w) => `${w} · x`);
  const examples = [...cells[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  for (const name of [...words, ...examples]) {
    checked++;
    const got = node(name);
    if (got !== want) fail(`dispatch.md: "${name}" should light ${want}, lights ${got ?? 'nothing'}`);
  }
}
if (checked < 40) fail(`dispatch.md: only ${checked} names found in the table (the table moved?)`);
for (const [name, want] of [['qc · S4 take 2', 'scenes'], ['QC · C01', 'sheet'], ['qc · L01', 'loc'], ['QC · S3', 'scenes'], ['QC · film', 'edit'], ['voice fix · C02', 'sound'], ['caption cut · v3', 'edit'], ['1080p master · v12', 'finish'], ['master · L01', 'loc']] as const) {
  if (node(name) !== want) fail(`"${name}" should light ${want}, lights ${node(name) ?? 'nothing'}`);
}
const ids = aimOf({ title: 'Alma › pick-up · FIX-S3-laugh for C05-C06 at L01' } as TaskCard).ids.join(',');
const two = aimOf({ title: 'Alma › pick-up · FIX-S2S3-reel' } as TaskCard);
if (two.ids.join(',') !== 'S2,S3' || two.node !== 'scenes') fail(`"FIX-S2S3-reel" read as ${two.node} on "${two.ids.join(',')}"`);
if (ids !== 'S3,C05-C06,L01') fail(`ids read as "${ids}"`);

const show = readFileSync(RECIPES.show, 'utf8');
const atLine = show.split('\n').find((l) => l.startsWith('- `"at"`')) ?? '';
const said = [...atLine.split('One of')[1]?.split('. ')[0]?.matchAll(/`([a-z]+)`/g) ?? []].map((m) => m[1]);
if (said.join(',') !== FEED_PLACES.join(',')) fail(`show.md lists the places as [${said.join(', ')}], the reader takes [${FEED_PLACES.join(', ')}]`);

// the release recipe (14 Nov): its example is a file the harness accepts, its kinds are the module's, its file is the
// one the page writes, dispatch names the file's writers, and a platform's own page is a place a link can name
const rel = readFileSync(RECIPES.release, 'utf8');
const example = /```json\n([\s\S]*?)\n```/.exec(rel)?.[1];
try { const v = validateRelease(JSON.parse(example ?? '')); if (v.problems.length) fail(`release.md: the example does not check out: ${v.problems.join(' ')}`); } catch (e) { fail(`release.md: the example is not JSON (${(e as Error).message})`); }
const kindsLine = rel.split('\n').find((l) => l.includes('`kind`: one of')) ?? '';
const kinds = [...kindsLine.split('one of')[1]?.split('(')[0]?.matchAll(/`([a-z-]+)`/g) ?? []].map((m) => m[1]);
if (kinds.join(',') !== PLATFORM_KINDS.join(',')) fail(`release.md lists the kinds as [${kinds.join(', ')}], the module has [${PLATFORM_KINDS.join(', ')}]`);
if (!rel.includes(RELEASE_REL)) fail(`release.md does not name ${RELEASE_REL}`);
if (!dispatch.includes(`\`${RELEASE_REL}\``)) fail(`dispatch.md's "Who writes what" does not name ${RELEASE_REL}`);
for (const op of ['ask', 'go', 'answer']) if (!OP_NAMES.includes(op as never)) fail(`the page has no "${op}" operation`);
if (pageHref('f', 'page:release/tiktok')?.href !== '/films/f/release/tiktok') fail(`page:release/tiktok leads to ${pageHref('f', 'page:release/tiktok')?.href}`);
if (!/page:release\/tiktok/.test(show)) fail('show.md does not say how to link a platform\'s page');

// the edit recipe (14 Nov, stage 4 of "saving apart from history"): Alma changes the cut only with a drop, reads its
// answer, never writes the working cut, a version or the history; the old "every change is a new version" is gone
const edit = readFileSync(RECIPES.edit, 'utf8');
const EDIT_SAYS = [
  // a variation of a take (ASKS 51): the folder's variation.json, and never put in the film by her
  '`{"from": "<the source take\'s file, exactly as the chip gave it>", "note": "<the user\'s words>", "startedAt": "<ISO time>"}`',
  '**A variation is never put in the film by you.**',
  'You change it with one drop file per piece of work: the harness checks it, takes it in as one step the user can undo, and saves it as a version with your note.',
  '**You change the cut only with a drop.** Read `cut/working.json`, keep its `rev`, and write your change as one new file, `cut/alma/<YYYYMMDD-HHMMSS>.json`, with a one-line note. One drop per piece of work.',
  'Never write `cut/working.json`, a version `cut/v<n>.json`, the history (`harness/cut-history.json`, `harness/cut-states/`) or an answer file, yours or anyone\'s, and never delete a file in `cut/`.',
  '**Every cut change goes through a drop first, the terminal way included.**',
  '1. **Read `assets/films/<film>/cut/working.json`** right before you start, and keep its `rev`.',
  '3. **Write the drop**, `cut/alma/<YYYYMMDD-HHMMSS>.json`',
  'Write the file to a temp name in the same folder, then rename it, so the harness never reads half a file.',
  'mv -n "cut/alma/$stamp.json.tmp" "cut/alma/$stamp.json"',
  '4. **Read the answer**, `cut/alma/<the same name>.answer.json`, a few seconds later. `{"taken": true, "rev": 15, "version": "v241"}`',
  '5. **If it is refused**, the answer says `"taken": false` and `why` says why in plain words. Nothing was written to the cut.',
  '`since` lists the words of the steps made since: read `cut/working.json` again, make your change on it and write a new drop.',
  'Never change or rewrite a drop or an answer; every try is a new drop with a new name.',
  '**To render the cut as it is now**, it must be a saved version. When you changed the cut, write the drop first: a taken drop names its version in the answer, and that is the version to render.',
  'ask the user to save (Save on the Edit page). Never save the user\'s edits for them.',
  'They become a version only when the user saves.',
  'and every change is a step (Command-Z undoes it).',
  '**Back to v3**: the user does this on the Edit page',
  '- **One drop per piece of work**, with its note in one line,',
];
for (const line of EDIT_SAYS) if (!edit.includes(line)) fail(`edit.md does not say: ${line.slice(0, 90)}`);
// the timeline from day one (15 Nov 2026): the one cut route Alma posts to, its three actions as the route takes them,
// and the line in dispatch.md that says when
for (const line of ['**You never write a planned clip**', "-d '{\"action\":\"update\"}'", '{"action":"take","scene":"S3","take":"take 1"}', '{"action":"boards","scene":"S3"}', 'except `cut/plan`, below.', 'It renders once every scene\'s take is in.']) {
  if (!edit.includes(line)) fail(`edit.md does not say: ${line}`);
}
if (!dispatch.includes('**The timeline follows the work.** After the script lock, after the shot lists and after each scene\'s boards, bring the timeline up to date')) fail('dispatch.md does not say when to bring the timeline up to date');
const EDIT_GONE = ['every change is a new file', 'Never edit a version in place', 'Every cut change goes through a version first', 'Find the current version', 'Undo to v3', 'One change per version', 'every change is a version', 'are saved as one version once the user stops pressing', 'into the cut as the next version', 'write it as the next version', 'Fix it in the next version'];
for (const old of EDIT_GONE) if (edit.includes(old)) fail(`edit.md still says the old way: "${old}"`);
const sh = /```sh\n([\s\S]*?)\n\s*```/.exec(edit)?.[1] ?? '';
if (!sh.includes(`mkdir -p ${DROP_DIR}`) || !/date -u \+%Y%m%d-%H%M%S/.test(sh)) fail('edit.md: the drop\'s shell lines do not make the folder and the name the watcher takes');
const stamp = '20261114-101500';
if (!DROP_NAME.test(`${stamp}.json`) || !DROP_NAME.test(`${stamp}-2.json`) || isDropFile(`${stamp}.json.tmp`) || isDropFile(`${stamp}.answer.json`)) fail('the drop names the recipe gives are not the ones the watcher takes');
const dropExample = { basedOnRev: 14, note: 'S7 head trimmed 12 frames at 00:01:56:01, ripple', tracks: [{ id: 'V1', kind: 'video', clips: [] }], markers: [] };
if (checkDrop(dropExample).problems.length) fail(`a drop as the recipe writes it is refused: ${checkDrop(dropExample).problems.join('; ')}`);
for (const k of ['basedOnRev', 'note', 'tracks', 'markers']) if (!edit.includes(`"${k}"`)) fail(`edit.md does not name the drop's field "${k}"`);
const almaLine = ALMA_APPEND_PROMPT.split('\n').find((l) => l.startsWith('Edits of the cut')) ?? '';
for (const bit of ['read cut/working.json, keep its rev, and write one drop, cut/alma/<YYYYMMDD-HHMMSS>.json, per piece of work, then read its answer beside it', 'Never write cut/working.json, a cut/v<n>.json or the history yourself', 'is written as a drop before it is rendered', RECIPES.edit]) {
  if (!almaLine.includes(bit)) fail(`ALMA_APPEND_PROMPT's edit line does not say: ${bit.slice(0, 80)}`);
}
if (/a new cut\/v<n>\.json per change|as the next cut\/v<n>\.json/.test(ALMA_APPEND_PROMPT)) fail('ALMA_APPEND_PROMPT still tells Alma to write versions');

// the smaller file (ASKS 56): the file names edit.md gives are the ones the render writes, and both recipes say how it
// is asked for and that the final stays the user's to name
for (const o of [{ loudness: { lufs: -14, truePeak: -1 }, small: true as const }, { small: true as const }]) {
  const name = `${variantBase('v230', 'master', optionsTag(o)).split('/').pop()}.mp4`;
  if (!edit.includes(`\`${name}\``)) fail(`edit.md does not name the smaller file as the render writes it: ${name}`);
}
if (!/- `small: true`/.test(edit) || !/"Smaller file"/.test(edit)) fail('edit.md does not list the option small, or how the user asks for it ("Smaller file")');
if (!/you never write `final\.path`, a smaller final included/.test(rel)) fail('release.md does not say the smaller final is named by the user, never written by Alma');

// Film Flow v3.2 (16 Nov 2026): every note the app and the QC recipe name is a v3.2 note, and none of the recipes or
// Alma's prompt still speaks of the old way (the review page and its build and tunnel, DaVinci Resolve, the long take,
// a finished film apart from the app's master, answers "by ID"). When the rules folder answers (read under a time limit, it can
// hang on a permission prompt), each note named is there and the Release note's "Before every upload" still reads.
const FLOW = 'Flow v3.2 - ';
const qcRecipe = readFileSync(RECIPES.qc, 'utf8');
const recipeNotes = [...qcRecipe.matchAll(/\| (Flow v[\d.]+ - [^|(]+?)\s*(?:\(|\|)/g)].map((m) => m[1].trim());
if (recipeNotes.length < 12) fail(`qc-critic.md: only ${recipeNotes.length} stage notes found in its table`);
for (const nm of [...QC_SPECS.map((q) => q.note), ...recipeNotes, RELEASE_NOTE]) if (!nm.startsWith(FLOW)) fail(`a note named the old way: "${nm}"`);
for (const q of QC_SPECS) if (!recipeNotes.includes(q.note)) fail(`qc-critic.md does not name ${q.note} (the ${q.stage} chip's note)`);
if (!/\/flow$/.test(FLOW_DIR) && !process.env.HARNESS_FLOW_DIR) fail(`the rules folder is not studio/flow: ${FLOW_DIR}`);
const OLD_WAY = ['build.py', 'review page', 'tunnel', 'final-clean', 'Resolve', 'long take', 'longtake', 'by ID', 'Flow v3.1', 'Film Flow v3.1'];
for (const [k, p] of Object.entries(RECIPES)) {
  const text = readFileSync(p, 'utf8');
  for (const w of OLD_WAY) if (text.includes(w)) fail(`recipes/${path.basename(p)} (${k}) still says "${w}"`);
  if (k !== 'release' && text.includes('kit.md')) fail(`recipes/${path.basename(p)} still names kit.md`);
}
for (const w of OLD_WAY) if (ALMA_APPEND_PROMPT.includes(w)) fail(`ALMA_APPEND_PROMPT still says "${w}"`);
const v32Step16 = '15. Write all copy to these rules:\n    - Bring the evidence.\n16. Before every upload, on each platform (what Buffer sets):\n    - Upload the smaller encode.\n    - Turn the AI label on.\n17. **TikTok**\n    - not this';
const v31Step16 = '16. Write the **Before every upload** checklist:\n    - Upload the FINAL.\n17. **TikTok**';
if (beforeEveryUploadIn(v32Step16).join('|') !== 'Upload the smaller encode.|Turn the AI label on.') fail(`"Before every upload" as v3.2 writes it reads as ${JSON.stringify(beforeEveryUploadIn(v32Step16))}`);
if (beforeEveryUploadIn(v31Step16).join('|') !== 'Upload the FINAL.') fail('"Before every upload" as v3.1 wrote it no longer reads');
const vaultRead = (file: string): string | undefined => { try { return execFileSync('/bin/cat', [file], { timeout: 8000, encoding: 'utf8' }); } catch { return undefined; } };
let vaultNotes = 0;
const releaseMd = vaultRead(path.join(FLOW_DIR, `${RELEASE_NOTE}.md`));
if (releaseMd === undefined) console.log(`· the rules folder did not answer (${FLOW_DIR}): the notes on disk were not checked`);
else {
  for (const nm of new Set([...QC_SPECS.map((q) => q.note), ...recipeNotes, 'Flow v3.2 - 6b Acting', 'Flow v3.2 - 6c Fight scene'])) {
    if (vaultRead(path.join(FLOW_DIR, `${nm}.md`)) === undefined) fail(`the rules folder has no note "${nm}" in ${FLOW_DIR}`); else vaultNotes++;
  }
  if (!releaseMd.split('\n').some((l) => BEFORE_EVERY_UPLOAD.test(l))) fail(`${RELEASE_NOTE}: no step opens "Before every upload" any more`);
  else if (beforeEveryUploadIn(releaseMd).length < 3) fail(`${RELEASE_NOTE}: "Before every upload" reads as only ${beforeEveryUploadIn(releaseMd).length} items`);
  const five = vaultRead(path.join(FLOW_DIR, 'Flow v3.2 - 5 Previz and storyboards.md')) ?? '';
  if (!/Size, Placement, Angle, Lens, Mount, Focus/.test(five)) fail('Flow v3.2 - 5 no longer has the shot block qc-critic.md names (Size, Placement, Angle, Lens, Mount, Focus)');
}

// the Story page's script save (ASKS 64): the message kind the harness sends is the one the story recipe explains
{
  const story = readFileSync(RECIPES.story, 'utf8');
  const sent = scriptEditedMessage({ from: 'v1', version: 'v2', changes: [{ scene: 'S2', index: 6, kind: 'line', old: 'a', new: 'b', status: 'applies', label: 'S2 line 4' }] }, 'assets/films/x/script.md');
  if (!sent.includes(`<harness-action kind="${SCRIPT_EDITED_KIND}"`)) fail('the script save does not send its harness-action kind');
  if (!story.includes(`kind="${SCRIPT_EDITED_KIND}"`)) fail(`story.md does not explain kind="${SCRIPT_EDITED_KIND}"`);
  if (!story.includes('Flow v3.2 - 1 Setup and story')) fail('story.md does not point to the stage 1 note for the script\'s rules');
  if (!sent.includes('recipes/story.md')) fail('the script save\'s message does not name recipes/story.md');
  for (const bit of ['## Earlier drafts', 'the user\'s edit on the Story page', 'Re-time']) if (!story.includes(bit)) fail(`story.md does not say "${bit}"`);
}
console.log(bad ? `${bad} problem(s)` : `ok · ${checked} job names and ${said.length} places agree with the code; the release recipe's example, ${kinds.length} platform kinds and the platform page link too; the edit recipe's ${EDIT_SAYS.length} drop sentences and the edit line of Alma's prompt; the smaller file's names; ${QC_SPECS.length} QC notes and the release note are v3.2's${vaultNotes ? ` (${vaultNotes} found in studio/flow, \"Before every upload\" reads)` : ''}, no recipe speaks of the old way`);
process.exit(bad ? 1 : 0);
