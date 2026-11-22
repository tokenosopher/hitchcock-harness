// What the user is looking at, sent to Alma ahead of their words: the <harness-context> block.
import type { Chip, HarnessContext } from './types';
import { defuse } from '../lib/defuse';

const OPEN = '<harness-context';
export const isUpload = (c: Chip): boolean => c.id.startsWith('upload:');
const CLOSE = '</harness-context>';

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');
}
function unattr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** `<harness-context film="…" page="…" pinned="…" selected='[…]' playhead="…">` plus one line per chip, so the model reads it either way. */
export function buildContextBlock(ctx: HarnessContext): string {
  const selected = ctx.selected.map((c) => ({ id: c.id, label: c.label, ...(c.ref ? { ref: c.ref } : {}), ...(c.about ? { about: c.about } : {}) }));
  const json = JSON.stringify(selected).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let open = `${OPEN} film="${attr(ctx.film)}" page="${attr(ctx.page)}" pinned="${attr(ctx.pinned)}" selected='${json}'`;
  if (ctx.playhead) open += ` playhead="${attr(ctx.playhead)}"`;
  open += '>';
  // a chip whose id starts "upload:" is a file the user pasted or attached; its ref is the file's full path
  // a ref of several lines (the takes marked for Seedance) is a list in itself: it follows the label on lines of its own
  const line = (c: Chip) => defuse(`- ${c.label.replace(/\n/g, ' ')}${c.ref ? (c.ref.includes('\n') ? `:\n${c.ref}` : ` (${c.ref})`) : ''}`);
  // a chip that opened the box about its thing: the message is about it (the words the box used to start with)
  const about = ctx.selected.filter((c) => c.about && !isUpload(c)).map((c) => `${line(c)}: ${defuse(c.about!.replace(/\n/g, ' '))}`);
  const lines = ctx.selected.filter((c) => !c.about && !isUpload(c)).map(line);
  const files = ctx.selected.filter(isUpload).map(line);
  const body = (about.length ? `\nThe user's message is about ${about.length === 1 ? 'this' : 'these'}:\n${about.join('\n')}\n` : '')
    + (lines.length ? `\nThe user selected:\n${lines.join('\n')}\n` : '')
    + (files.length ? `\nThe user attached ${files.length === 1 ? 'this file' : 'these files'} to the message. Open ${files.length === 1 ? 'it' : 'each'} with Read before you answer (a picture is shown to you that way); copy one into the film folder only if it belongs there:\n${files.join('\n')}\n` : '');
  return `${open}${body}${CLOSE}`;
}

const NOTE_OPEN = '<harness-note>';
const NOTE_CLOSE = '</harness-note>';

/** The text Alma receives: the context block, a blank line, then the user's own words. A note from the harness
 *  itself (an earlier Alma was stopped after a restart) goes between them as <harness-note>…</harness-note>. */
export function prefixContext(text: string, ctx?: HarnessContext, note?: string): string {
  const words = note ? `${NOTE_OPEN}${note.replace(/</g, '&lt;')}${NOTE_CLOSE}\n\n${text}` : text;
  return ctx ? `${buildContextBlock(ctx)}\n\n${words}` : words;
}

/** Takes a leading harness note off the words (the thread shows the user's own words only). */
function stripNote(text: string): string {
  if (!text.startsWith(NOTE_OPEN)) return text;
  const end = text.indexOf(NOTE_CLOSE);
  return end < 0 ? text : text.slice(end + NOTE_CLOSE.length).replace(/^\s+/, '');
}

function readAttr(open: string, name: string): string | undefined {
  const dq = new RegExp(`\\s${name}="([^"]*)"`).exec(open);
  if (dq) return unattr(dq[1]);
  const sq = new RegExp(`\\s${name}='([^']*)'`).exec(open);
  return sq ? unattr(sq[1]) : undefined;
}

/** Splits a stored prompt back into the user's words and the context it carried (for the thread history). */
export function parseContextBlock(prompt: string): { text: string; context?: HarnessContext } {
  const start = prompt.indexOf(OPEN);
  if (start !== 0) return { text: stripNote(prompt) };
  const openEnd = prompt.indexOf('>', start);
  const end = prompt.indexOf(CLOSE, openEnd);
  if (openEnd < 0 || end < 0) return { text: stripNote(prompt) };
  const open = prompt.slice(start, openEnd);
  let selected: Chip[] = [];
  try {
    const raw: unknown = JSON.parse(readAttr(open, 'selected') ?? '[]');
    if (Array.isArray(raw)) {
      selected = raw
        .filter((c): c is { id: unknown; label: unknown; ref?: unknown; about?: unknown } => !!c && typeof c === 'object')
        .map((c) => ({ id: String(c.id), label: String(c.label), ...(typeof c.ref === 'string' ? { ref: c.ref } : {}), ...(typeof c.about === 'string' && c.about ? { about: c.about } : {}) }));
    }
  } catch {
    selected = [];
  }
  const context: HarnessContext = {
    film: readAttr(open, 'film') ?? '',
    page: readAttr(open, 'page') ?? '',
    pinned: readAttr(open, 'pinned') ?? '',
    selected,
    ...(readAttr(open, 'playhead') ? { playhead: readAttr(open, 'playhead') } : {}),
  };
  return { text: stripNote(prompt.slice(end + CLOSE.length).replace(/^\s+/, '')), context };
}
