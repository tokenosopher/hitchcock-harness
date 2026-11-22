// Whether the go for the first takes can really start: no button to press until what it starts can start, and the
// same for every step.
// Pure: read from the film's state (the same FilmState the Edit page and the film's board read), never from the step
// before merely existing. What counts is the flow's (Film Flow v3.3, 5 Previz and storyboards, 6 Scene prompts, 7 Takes
// "Inputs"): for every scene the go covers, its boards passed their check (QC 8.5, or three rounds and then the user's
// call) and carry the user's yes on the whole-film previz and storyboards; its prompt is written, passed check.py and
// its QC; and every reference is made and approved: each character's sheet locked, each speaking character's video
// element at 1080p, each extras' group picture approved, each prop approved, and a painted view for every view camera
// of the scenes' places, measured against its plate. A card about any of these that still waits for the user holds the
// go too. Nothing here holds a film rule's number but the QC's own (QC_LOCK_SCORE, QC_MAX_ROUNDS, from types.ts).
import { QC_LOCK_SCORE, QC_MAX_ROUNDS, type FilmState, type QCEntry } from '@/server/types';

export interface TakesReady {
  ready: boolean;
  /** What is missing, the most important first, each a short clause ("no scene has a prompt yet"). */
  missing: string[];
  /** The one quiet line the step shows in place of its button: "Not ready: …", the first three clauses and the count
   *  of the rest. Empty when ready. */
  line: string;
  /** Every clause, for the line's title (the whole of it on hover). */
  full: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "S1", "S1 and S2", or "every scene" when the clause covers all of them. */
const of = (xs: string[], all: string[]) => (xs.length === all.length && all.length > 1 ? 'every scene' : names(xs));

/** A QC entry passed: the newest round at 8.5 or above, or three rounds run (then it is the user's call, which the
 *  yes on the boards or the go itself carries: Flow v3.3, 5, step 24). */
export const qcPassed = (q: QCEntry | undefined): boolean =>
  !!q && ((q.latest.score ?? 0) >= QC_LOCK_SCORE || q.history.length >= QC_MAX_ROUNDS);

/** The places Alma's cards about the references sit (feed.ts): a card there that waits holds the go. */
const REF_PLACES = new Set(['faces', 'clothing', 'sheet', 'voices', 'elements', 'loc', 'views', 'previz']);

export function takesReady(s: FilmState, scenes: string[]): TakesReady {
  const miss: string[] = [];
  const sc = s.scenes.filter((x) => scenes.includes(x.id));
  const ids = sc.map((x) => x.id);

  // 1. the scene prompts: written, check.py PASS, and the QC critic's 8.5 (Flow v3.3, 6, steps 14 to 16)
  const newest = (x: (typeof sc)[number]) => x.promptVersions[x.promptVersions.length - 1];
  const noPrompt = sc.filter((x) => !newest(x)).map((x) => x.id);
  const unchecked = sc.filter((x) => newest(x) && (newest(x)!.checkPassed !== true || !qcPassed(s.qc?.[`prompt-${x.id}`]))).map((x) => x.id);
  if (noPrompt.length === ids.length && ids.length) miss.push(ids.length === 1 ? `${ids[0]} has no prompt yet` : 'no scene has a prompt yet');
  else if (noPrompt.length) miss.push(`${names(noPrompt)} ${noPrompt.length === 1 ? 'has' : 'have'} no prompt yet`);
  if (unchecked.length) miss.push(`the ${unchecked.length === 1 ? 'prompt' : 'prompts'} of ${of(unchecked, ids)} ${unchecked.length === 1 ? 'has' : 'have'} not passed ${unchecked.length === 1 ? 'its' : 'their'} check`);

  // 2. the boards: the QC critic's 8.5 per scene (qc/previz-<S>-r<n>.json), then the user's yes on the whole-film
  //    previz and storyboards, a yes card at the Previz step answered after the newest board check (Flow v3.3, 5, 24-25)
  const boardQc = (id: string) => s.qc?.[`previz-${id}`];
  const notChecked = ids.filter((id) => !qcPassed(boardQc(id)));
  if (notChecked.length) miss.push(`the boards of ${of(notChecked, ids)} have not passed their check`);
  const yes = (s.feed?.approvals ?? []).filter((a) => a.place === 'previz').sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
  const lastCheck = ids.map((id) => boardQc(id)?.latest.at ?? '').sort().pop() ?? '';
  if (!yes) miss.push('the boards have no yes from you yet');
  else if (yes.at && lastCheck && lastCheck > yes.at) miss.push('the boards changed after your yes');

  // 3. the cast: every sheet locked, every speaking character's video element at 1080p, every group picture approved
  //    (Flow v3.3, 2 Characters steps 8, 25 and 44; 3 Voices and video elements steps 24 and 25)
  const cast = s.characters;
  const group = (c: (typeof cast)[number]) => !!c.extra;
  const sheetsOpen = cast.filter((c) => !group(c) && !(c.sheet?.approved || c.reused)).map((c) => c.name);
  const groupsOpen = cast.filter((c) => group(c) && !(c.sheet?.path && c.sheet.approved)).map((c) => c.name);
  const elemsOpen = cast.filter((c) => !c.extra && !c.silent && c.element?.state !== 'final').map((c) => c.name);
  if (sheetsOpen.length) miss.push(`${plural(sheetsOpen.length, 'sheet')} not locked (${names(sheetsOpen)})`);
  if (elemsOpen.length) miss.push(`${plural(elemsOpen.length, 'video element')} not made at 1080p (${names(elemsOpen)})`);
  if (groupsOpen.length) miss.push(`${plural(groupsOpen.length, 'group picture')} not made or approved (${names(groupsOpen)})`);

  // 4. the views: of every place the scenes play in, a painted view for each camera that has a colour plate, its newest
  //    version measured against that plate (Flow v3.3, 4 Locations and props, steps 8 to 11 and 14)
  const used = new Set(sc.map((x) => /^(L\d+)/.exec(x.location ?? '')?.[1]).filter((x): x is string => !!x));
  const locs = s.locations.filter((l) => !used.size || used.has(l.id));
  let unpainted = 0;
  const unmeasured: string[] = [];
  for (const l of locs) {
    const views = (l.views ?? []).filter((v) => v.camera !== 'plan');
    const cams = l.plates ?? views.map((v) => v.camera);
    if (!cams.length) { unpainted++; continue; }
    for (const cam of cams) {
      const v = cam === 'master' ? (l.master?.path ? { path: l.master.path, measured: l.master.measured } : undefined) : views.find((x) => x.camera === cam);
      if (!v) unpainted++;
      else if (l.plates && !v.measured) unmeasured.push(`${l.id} ${cam}`);
    }
  }
  if (unpainted) miss.push(`${plural(unpainted, 'view')} not painted`);
  if (unmeasured.length) miss.push(`${plural(unmeasured.length, 'view')} not measured (${names(unmeasured)})`);

  // 5. the props: each approved by the user, by its pick or a yes card that names it (Flow v3.3, 4, step 7)
  const approvedIds = new Set((s.feed?.approvals ?? []).flatMap((a) => a.ids));
  const props = [...new Map(locs.flatMap((l) => l.props ?? []).map((p) => [p.id, p])).values()];
  const propsOpen = props.filter((p) => !p.pick && !approvedIds.has(p.id)).map((p) => p.id);
  if (propsOpen.length) miss.push(`${plural(propsOpen.length, 'prop')} not approved (${names(propsOpen)})`);

  // 6. a card about any of these that still waits for an answer (the go card itself is what the press answers)
  const open = [...(s.feed?.asks ?? []), ...(s.feed?.working ?? [])].filter((c) => REF_PLACES.has(c.place) || (c.place === 'scenes' && c.ask?.kind !== 'go'));
  if (open.length) miss.push(`${plural(open.length, 'card')} on them still ${open.length === 1 ? 'waits' : 'wait'} for an answer`);

  const shown = miss.slice(0, 3);
  const rest = miss.length - shown.length;
  const full = miss.length ? `Not ready: ${miss.join('; ')}.` : '';
  return { ready: ids.length > 0 && !miss.length, missing: miss, full, line: miss.length ? `Not ready: ${shown.join('; ')}${rest ? `; and ${plural(rest, 'thing')} more` : ''}.` : '' };
}
