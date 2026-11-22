// What the message box sends (Composer's submit), pure so a unit script can check it: the user's words; a file alone
// tells Alma to look at it; a button's ask in the box as a chip (Chip.command) goes with no words of its
// own, since the chip carries what Alma reads. Undefined: nothing to send.
import type { Chip } from '@/server/types';

const isUpload = (c: Chip) => c.id.startsWith('upload:');

export function outgoingText(words: string, chips: Chip[]): string | undefined {
  const w = words.trim();
  if (w) return w;
  if (chips.some((c) => !!c.command)) return '';
  const files = chips.filter(isUpload).length;
  if (files) return files === 1 ? 'Look at the attached file.' : 'Look at the attached files.';
  return undefined;
}
