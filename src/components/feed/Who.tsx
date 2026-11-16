'use client';
// Who a card or a voice round is about: the character's picked face (once there is one) and who they are, in the
// words of the brief's Cast list, or of the card's own "who" when Alma wrote one. So a face is picked knowing the
// part, and a voice is picked looking at the face it will come out of.
import type { CharacterRef, FilmState } from '@/server/types';
import { Media } from '@/components/media/Media';
import { repoPath } from '@/components/lib/format';

/** The picked face's file: the candidate the pick names, else the flow's own copy, cast/<folder>/pick-face.png. */
export function pickedFace(c: CharacterRef): string | undefined {
  if (!c.face?.pick) return undefined;
  const hit = c.face.rounds.flatMap((r) => r.candidates).find((x) => x.id === c.face!.pick!.candidateId && x.path);
  return hit?.path ?? `${c.folder}/pick-face.png`;
}

/** "- **C02 Tobias**, rows the post; speaks in S1…" → that text, for C02. C04 also takes "C04a …" and "C04b …". */
export function whoIs(briefMd: string | undefined, id: string): string | undefined {
  const cast = /^## Cast\b[^\n]*\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m.exec(briefMd ?? '')?.[1] ?? '';
  const lines = cast.split('\n').filter((l) => new RegExp(`^\\s*[-*]\\s*\\*\\*${id}[a-z]?\\b`).test(l));
  if (!lines.length) return undefined;
  return lines.map((l) => l.replace(/^\s*[-*]\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim()).join(' ');
}

export function Who({ state, ids, text, face = true }: { state: FilmState; ids: string[]; text?: string; face?: boolean }) {
  const cast = ids.filter((i) => /^C\d+[a-z]?$/.test(i)).map((i) => state.characters.find((c) => c.id === i || c.id === i.replace(/[a-z]$/, ''))).filter((c): c is CharacterRef => !!c);
  const rows = [...new Map(cast.map((c) => [c.id, c])).values()].map((c) => ({ c, who: (cast.length === 1 && text) || whoIs(state.brief?.markdown, c.id), pic: face ? pickedFace(c) : undefined }));
  const shown = rows.filter((r) => r.who || r.pic);
  if (!shown.length) return text ? <p className="m-0 max-w-[72ch] text-[12.5px] leading-normal text-ink-3"><span className="text-sub">Who: </span>{text}</p> : null;
  return (
    <div className="flex flex-col gap-2.5">
      {shown.map(({ c, who, pic }) => (
        <div key={c.id} className="flex min-w-0 items-start gap-3">
          {pic && <Media path={repoPath(state.film.folder, state.film.repo, pic)} w={160} alt={`${c.id} ${c.name}, the picked face`} className="aspect-[3/4] w-[58px] flex-none rounded-[6px] border border-edge" />}
          <p className="m-0 min-w-0 max-w-[72ch] text-[12.5px] leading-normal text-ink-3">
            <span className="text-sub">Who: </span>{who ?? `${c.id} ${c.name}`}
            {!pic && face && c.face && !c.face.pick && <span className="text-mute"> · no face picked yet</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
