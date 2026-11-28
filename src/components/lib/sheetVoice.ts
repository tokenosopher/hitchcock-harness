// The voice heard with a character's sheet: every sheet has its voice beside it. A sheet
// is approved as face, clothing and voice together, so wherever a sheet is shown the voice plays beside it. A form of a
// character ("C01a", "C01b": the same person in other clothes) has no voice of its own: it speaks with its character's.
import type { CharacterRef } from '@/server/types';

export interface SheetVoice {
  /** Whose voice it is: the character itself, or the character a form belongs to. */
  owner: CharacterRef;
  /** The voice the user picked: the picked option's preview. */
  picked?: { path: string; seconds?: number; option: string };
  /** The line the video element speaks with, once made. */
  line?: { path: string; seconds?: number };
}

const own = (c: CharacterRef): Omit<SheetVoice, 'owner'> => {
  const id = c.voice?.pick?.candidateId;
  const k = id ? c.voice?.rounds.flatMap((r) => r.candidates).find((x) => x.id === id) : undefined;
  const line = c.voice?.elementLine?.path ? { path: c.voice.elementLine.path, seconds: c.voice.elementLine.seconds } : undefined;
  return { ...(k?.path ? { picked: { path: k.path, seconds: k.seconds, option: k.id } } : {}), ...(line ? { line } : {}) };
};

/** The voice to play with the sheet of `id`: its own, else (a form, "C01a") its character's. Undefined when neither has one. */
export function sheetVoice(characters: CharacterRef[], id: string): SheetVoice | undefined {
  const c = characters.find((x) => x.id === id);
  const baseId = /^(C\d+)[a-z]$/.exec(id)?.[1];
  for (const owner of [c, baseId ? characters.find((x) => x.id === baseId) : undefined]) {
    if (!owner) continue;
    const v = own(owner);
    if (v.picked || v.line) return { owner, ...v };
  }
  return undefined;
}
