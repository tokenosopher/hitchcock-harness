// What a platform page gives Alma (Release, stage 2): the chip that carries the texts changed since she last read
// them, and the words of the two asks the pages send as the user's own message ("Ask Alma to read it", "Ask Alma to
// draft them"). Pure: the pages and scripts/release-test.ts import it. Nothing here is advice: what she does with a
// change is hers (recipes/release.md).
import type { Chip } from '@/server/types';
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
