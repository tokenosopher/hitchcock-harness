// A button press in the harness reaches Alma as a message that starts with the server's own <harness-action …/> tag
// and a paragraph of instructions for her. The thread shows it as one quiet line in the user's voice ("You settled the
// story · v11") instead of the whole block; the block opens on a click. Pure: no React.
// Only a real tag at the very start counts: a tag typed by hand reaches the thread defused (‹harness-action, see
// src/lib/defuse.ts) and stays the user's own bubble.

export interface HarnessAction {
  kind: string;
  attrs: Record<string, string>;
  /** what Alma read after the tag, as it was sent */
  body: string;
}

const TAG = /^\s*<harness-action((?:\s+[\w-]+="[^"]*")*)\s*\/>[ \t]*\n?/;
const ATTR = /([\w-]+)="([^"]*)"/g;

const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The tag at the start of a message, its attributes and the rest; undefined for anything else. */
export function parseHarnessAction(text: string): HarnessAction | undefined {
  const m = TAG.exec(text);
  if (!m) return undefined;
  const attrs: Record<string, string> = {};
  for (const a of m[1].matchAll(ATTR)) attrs[a[1]] = unescape(a[2]);
  if (!attrs.kind) return undefined;
  return { kind: attrs.kind, attrs, body: text.slice(m[0].length).trim() };
}

/** "dio-genes" → "Dio genes"; "story-settled" → "story settled". */
const words = (s: string) => s.replace(/[-_]+/g, ' ').trim();
const name = (s: string) => { const w = words(s); return w.charAt(0).toUpperCase() + w.slice(1); };
/** The card's title as the message names it (“…”), else its ID. */
const cardTitle = (a: HarnessAction) => /card “([^”]+)”/i.exec(a.body)?.[1] ?? a.attrs.card ?? 'a card';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One short past-tense sentence in the user's voice, for the chip. */
export function actionLabel(a: HarnessAction): string {
  const at = a.attrs;
  switch (a.kind) {
    case 'story-settled': return `You settled the story${at.version ? ` · ${at.version}` : ''}`;
    case 'script-lock': return `You locked the script${at.version ? ` · ${at.version}` : ''}`;
    case 'script-edited': return `You edited the script${at.version ? ` · ${at.version}` : ''}`;
    case 'new-film': return `You started a new film${at.slug ? ` · ${name(at.slug)}` : ''}`;
    case 'debrief': {
      const n = Number(at.answered);
      return `You sent your debrief${Number.isFinite(n) && at.answered ? ` · ${plural(n, 'answer')}` : ''}`;
    }
    case 'answers': {
      const n = Number(at.count);
      return Number.isFinite(n) && at.count ? `You sent ${plural(n, 'choice')} at once` : 'You sent your choices at once';
    }
    case 'answer': {
      const title = cardTitle(a);
      if (at.option === 'no') return `You said no to ${title}`;
      switch (at.ask) {
        case 'pick': return `You picked ${at.option ?? 'an option'} for ${title}`;
        case 'yes': return `You said yes to ${title}`;
        case 'go': return `Go for ${title}`;
        case 'why': return at.option === 'skip' ? `You skipped the why on ${title}` : `You said why on ${title}`;
        default: return `You answered ${title}`;
      }
    }
    case 'pick': {
      const target = at.target ? name(at.target) : 'it';
      if (at.what === 'sfx') {
        if (!at.candidate) return 'You picked the sounds';
        return at.candidate === 'none' ? `You took none of the tries of ${target}` : `You picked try ${at.candidate} of ${target}`;
      }
      const what = at.what === 'take' || !at.what ? target : `${target}’s ${at.what === 'location' ? 'master' : at.what}`;
      const lib = at.source === 'library' ? /picked (.+?) from the library/.exec(a.body)?.[1] : undefined;
      if (lib) return `You picked ${lib} from the library for ${what}`;
      return `You picked ${at.candidate ?? 'one'} for ${what}`;
    }
    default: return `You pressed a button: ${words(a.kind)}`;
  }
}

/** "14:05", the local time of the press. */
export function actionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
