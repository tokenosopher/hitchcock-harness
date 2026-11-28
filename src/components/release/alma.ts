// What a platform page gives Alma (Release, stage 2): the chip that carries the texts changed since she last read
// them, and the words of the two asks the pages send as the user's own message ("Ask Alma to read it", "Ask Alma to
// draft them"). Pure: the pages and scripts/release-test.ts import it. Nothing here is advice: what she does with a
// change is hers (recipes/release.md).
import type { Chip, TaskCard, ThreadEvent } from '@/server/types';
import { appName, fieldList, type Change } from './derive';
import { RELEASE_REL, type Platform, type ReleaseFinal } from './file';

/** The chip's id: one per platform, kept by its page while it has changes (it goes with every message until she
 *  has read them, and leaves with the page). */
export const editedChipId = (pid: string): string => `keep:release-edited:${pid}`;

const quote = (s: string) => (s ? `"${s.replace(/\n/g, ' / ')}"` : 'empty');

/** "Edited: TikTok caption" (one box, named as the page names it, ASKS 57) or "Edited: TikTok, 2 texts", with the old
 *  and new text of each box and the fields that changed in it. */
export function editedChip(film: string, p: Pick<Platform, 'id' | 'name'>, changes: Change[]): Chip {
  const name = appName(p);
  const label = changes.length === 1 ? `Edited: ${name} ${changes[0].label.toLowerCase()}` : `Edited: ${name}, ${changes.length} texts`;
  const ids = (c: Change) => { const xs = c.field.split(', '); return `${xs.length > 1 ? 'fields' : 'field'} ${xs.map((x) => `"${x}"`).join(', ')}`; };
  const lines = changes.map((c) => `- ${c.label} (${ids(c)}): was ${quote(c.was)}, now ${quote(c.now)}`);
  return {
    id: editedChipId(p.id),
    label,
    ref: `The user changed ${name}'s text since you last read it, in assets/films/${film}/${RELEASE_REL} (platform "${p.id}"):\n${lines.join('\n')}`,
  };
}

/** The user's message behind "Ask Alma to read it". */
export const readAsk = (p: Pick<Platform, 'name'>, changes: Change[]): string =>
  `Read what I changed in ${appName(p)}'s text: ${fieldList(changes.map((c) => c.label))}.`;

/** The user's message behind "Ask Alma to draft them" (a release with a final and no platforms yet). */
export const draftAsk = (film: string, final: Pick<ReleaseFinal, 'name' | 'version' | 'path'>): string =>
  `Draft the release texts. The final is ${final.name} (the master of ${final.version}, ${final.path}). The release file is assets/films/${film}/${RELEASE_REL}; recipes/release.md says how to start its platforms.`;

// ---- Naming the final asks for the texts: once the final is named, Alma starts drafting the text for every platform.
// Sent at the press as the user's own message, a chip carrying the request.

export const TEXTS_CHIP_ID = 'release:texts';
/** The chip's label: "Release texts · cut v12" (the final's cut version). */
export const textsLabel = (version: string): string => `Release texts · cut ${version}`;
/** The request the chip carries: the text for every platform for this final, in recipes/release.md's words. */
export const finalTextsAsk = (film: string, final: Pick<ReleaseFinal, 'name' | 'version' | 'path'>): string =>
  `I named the final: ${final.name} (the master of ${final.version}, ${final.path}). Draft the text for every platform for this final now. The release file is assets/films/${film}/${RELEASE_REL}; recipes/release.md ("Starting the platforms") says how to start its platforms.`;
/** The chip that goes to Alma right after the final is named, when the release file has no platforms (texts) yet. */
export const textsChip = (film: string, final: Pick<ReleaseFinal, 'name' | 'version' | 'path'>): Chip & { command: string } =>
  ({ id: TEXTS_CHIP_ID, label: textsLabel(final.version), ref: final.path, command: finalTextsAsk(film, final) });
/** Send the texts' ask after naming this final? Only when the file has no platforms yet (texts for any final stay: a
 *  changed final with texts sends nothing) and the final really changed (naming the same master again changes nothing). */
export const wantsTexts = (file: { platforms: unknown[]; final?: unknown }, said?: string): boolean =>
  !!file.final && file.platforms.length === 0 && !/^The final is already/.test(said ?? '');

/** Alma is drafting the texts for the final: the release has a final and no platforms, the thread holds the user's
 *  "Release texts · cut <the final's version>" ask, and her turn after it has not ended, or a release task of hers is
 *  live. Her turn ending without texts lets the step read "no texts yet" again (the Release page can ask again). */
export function textsAsked(events: ThreadEvent[], tasks: TaskCard[], release: { final?: { version: string }; platforms: number } | undefined): boolean {
  const v = release?.final?.version;
  if (!v || release.platforms > 0) return false;
  const label = textsLabel(v);
  let i = -1;
  for (let k = events.length - 1; k >= 0 && i < 0; k--) {
    const e = events[k];
    if (e.kind === 'user' && e.context?.selected?.some((c) => c.id === TEXTS_CHIP_ID && c.label === label)) i = k;
  }
  if (i < 0) return false;
  if (tasks.some((t) => (t.state === 'running' || t.state === 'queued') && /release|texts?\b|caption/i.test(t.title))) return true;
  return !events.slice(i + 1).some((e) => e.kind === 'result');
}
