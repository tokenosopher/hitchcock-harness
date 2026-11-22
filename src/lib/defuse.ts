// A <harness-action …/> tag is a button press to Alma (her standing prompt says so), and <harness-context>/<harness-note>
// are the harness's own blocks: only the server writes them. Text a person typed (the chat, a card's note, a pick, a
// new film's title and idea) goes through defuse() first, so a tag typed by hand reaches Alma as ‹harness-action and
// counts for nothing. <harness-ref …/> is left alone: it is the composer's own tag inside the user's words.
const TAG = /<(\s*\/?\s*harness-(?:action|context|note))/gi;

export function defuse(text: string): string {
  return text.replace(TAG, '‹$1');
}

/** defuse() on every string field of an input object (other fields kept as they are). */
export function defuseFields<T extends object>(input: T): T {
  const out = { ...input } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string') out[k] = defuse(v);
  return out as T;
}
