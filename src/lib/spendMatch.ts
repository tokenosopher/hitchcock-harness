// Which spend.md rows belong to a character: shared by the server (FilmState's CharacterRef.cost) and the
// Character page's spend groups, so the header total and the rows always agree.

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A row is the character's when its "version or take" label names the character's ID as a whole word
 *  ("C01 r1-2", "E-C01 take 1", "L01 light test C01"); a name in the purpose ("the view for Maren's close-ups")
 *  does not count. Records written before the label column (no row has a label) fall back to the ID or the name
 *  in the row's text. */
export function characterRowTest(id: string, name: string, labelled: boolean): (label: string | undefined, what: string) => boolean {
  const idRe = new RegExp(`(?:^|[^\\w-]|E-)${esc(id)}(?![\\w-]*\\w)`, 'i');
  if (labelled) return (label) => !!label && idRe.test(label);
  const word = new RegExp(`\\b(${esc(id)}|${esc(name.replace(/^the /i, '').replace(/[^\w ]/g, ''))})\\b`, 'i');
  return (label, what) => word.test(`${label ?? ''} ${what}`);
}
