'use client';
// Characters (ASKS 46): every character as a card, the same cards the flow's people steps show under the board.
// /character opens on the faces; ?part=clothing|sheet|voices|elements puts that part in front. A card opens the
// character. No tabs: the Voices and Elements pages still open by their addresses, from links that name them.
import { useSearchParams } from 'next/navigation';
import { usePage } from '@/components/data/ui';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { Feed } from '@/components/feed/Feed';
import { CAST_PARTS, CharacterCards, castLine, PART_NAME, type CastPart } from '@/components/characters/Cards';
import { useFilmPage, filmMeta } from './common';

export function CharactersPage() {
  const { state, error, ui, base } = useFilmPage();
  const asked = useSearchParams().get('part') as CastPart | null;
  const part: CastPart = asked && CAST_PARTS.includes(asked) ? asked : 'faces';
  usePage(state ? `Characters · ${PART_NAME[part]} · ${castLine(state, part).split(' · ')[0]}` : undefined);
  if (!state) return <Loading error={error} />;
  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Characters' }]} meta={filmMeta(state)} phoneSub="Characters" />
      <PageBody wide>
        <StageTitle kicker={`Stages 2 and 3 · ${PART_NAME[part]}`} title="Characters" sub={castLine(state, part)} />
        <CharacterCards s={state} part={part} base={base} onChip={(id, label, ref) => ui.addChip({ id, label, ref })} />
        <Feed query="place=faces,clothing,sheet,voices,elements" note="faces, clothing, sheets, voices and elements" from="the Characters page" />
      </PageBody>
    </>
  );
}
