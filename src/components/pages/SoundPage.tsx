'use client';
// Sound (stage 11): the place to hear a round and answer it. On top, everything Alma has shown about sound
// (readings of a word, music takes, mixes), with the cards that wait for an answer first. Under it, what the
// sound folders hold, newest first, each with a play button. Read-only: a click on a file hands it to Alma as
// a chip. Data: the film state, GET /api/films/[film]/feed?place=sound and GET /api/films/[film]/sound.
import Link from 'next/link';
import { useState } from 'react';
import type { SoundFile, SoundGroup, SoundInfo } from '@/server/types';
import { usePage } from '@/components/data/ui';
import { Feed } from '@/components/feed/Feed';
import { fmtDate, plural } from '@/components/lib/format';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { Header } from '@/components/shell/Header';
import { StepRunning } from '@/components/flow/RunningNow';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Card } from '@/components/shell/atoms';
import { IconChevronRight } from '@/components/shell/icons';
import { finalsFirst } from '@/components/media/Shelf';
import { cn } from '@/lib/utils';
import { filmMeta, filmPath, useFilmPage } from './common';
import { fmtBytes, PanelHead, useJson } from './postCommon';
import { StepIntro } from '@/components/intro/StepIntro';

const FIRST = 6;

function FileRow({ f, group, path, on, onChip }: { f: SoundFile; group: SoundGroup; path: string; on: boolean; onChip: () => void }) {
  // the folder inside the group, when the file sits deeper than the group's own folder ("clone-keeper/q8")
  const dir = f.path.split('/').slice(0, -1).join('/');
  const inside = group.folder.split(', ').reduce((d, root) => (d === root ? '' : d.startsWith(`${root}/`) ? d.slice(root.length + 1) : d), dir);
  return (
    <li className={cn('flex min-w-0 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0', on && 'bg-raised')}>
      <PlayButton path={path} label={f.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={onChip} title={`${f.path} · hand it to Alma`} aria-pressed={on} className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left text-ink">
          <span className="block truncate font-mono text-[12px]">{f.name}</span>
        </button>
        <PlayLine path={path} />
        <span className="truncate text-[11.5px] text-mute">{[inside, f.date ? fmtDate(f.date) : '', fmtBytes(f.bytes)].filter(Boolean).join(' · ')}</span>
      </div>
    </li>
  );
}

function Group({ g, toPath, hasChip, onChip }: { g: SoundGroup; toPath: (rel: string) => string; hasChip: (id: string) => boolean; onChip: (f: SoundFile) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? g.files : g.files.slice(0, FIRST);
  const total = g.files.length + (g.more ?? 0);
  return (
    <Card>
      <PanelHead title={g.title} right={<span className="flex-none text-[12px] tabular-nums text-sub">{plural(total, 'file')}</span>}
        sub={<>{g.note}<span className="mt-0.5 block truncate font-mono text-[10.5px] text-mute" title={g.folder}>{g.folder}</span></>} />
      <ul className="m-0 list-none p-0">
        {shown.map((f) => <FileRow key={f.path} f={f} group={g} path={toPath(f.path)} on={hasChip(`file:${f.path}`)} onChip={() => onChip(f)} />)}
      </ul>
      {(g.files.length > shown.length || (all && g.more)) && (
        <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-sub">
          {g.files.length > shown.length
            ? <button type="button" onClick={() => setAll(true)} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-sub hover:text-ink">{g.more ? `Show the newest ${g.files.length} of ${total}` : `Show all ${g.files.length}`}</button>
            : <span className="text-mute">{g.more} older on disk, in {g.folder}</span>}
        </div>
      )}
    </Card>
  );
}

/** Two columns that each stack on their own, so a short card leaves no hole beside a long one. Each group
 *  goes to the shorter column so far (by the rows it shows closed); the order down the page stays the order
 *  of the list. A column keeps its cards when one opens. */
function twoColumns(groups: SoundGroup[]): SoundGroup[][] {
  const cols: SoundGroup[][] = [[], []];
  const rows = [0, 0];
  for (const g of groups) {
    const i = rows[1] < rows[0] ? 1 : 0;
    cols[i].push(g);
    rows[i] += Math.min(g.files.length, FIRST) + 2;
  }
  return cols.filter((c) => c.length);
}

export function SoundPage() {
  const { film, state, error, ui, base } = useFilmPage();
  const { data, error: serr } = useJson<SoundInfo>(`/api/films/${film}/sound`, state?.updatedAt);
  const waits = state?.feed?.asks.filter((c) => c.place === 'sound').length ?? 0;
  const counts = state?.sound?.counts ?? {};
  usePage(state ? `stage 11 · sound${waits ? ` · ${plural(waits, 'round')} waiting for you` : counts.mix ? ` · ${plural(counts.mix, 'mix', 'mixes')}` : ''}` : undefined,
    'Ask about the music, a word, an effect or the mix…',
    ['Make a music round', 'Fix a word in a take', 'Mix the film sound'], ['Which mix went out?', 'What was fixed in the voices?']);
  // the rounds sit above the folders: the page waits for them too, or the folders drew first and were pushed
  // down the page when the rounds came (the same read as the Feed's own, so one request)
  const feedUrl = state && !(state.film.status === 'delivered' && !waits) ? `/api/films/${film}/feed?place=sound` : undefined;
  const feedRead = useJson<unknown>(feedUrl, state?.updatedAt);
  if (!state || !data || (feedUrl && feedRead.loading)) return <Loading error={error ?? serr} />;

  const total = data.groups.reduce((n, g) => n + g.files.length + (g.more ?? 0), 0);
  // a film that went out: its sound is inside the finished film; the folders are the record of how it got there
  const settled = state.film.status === 'delivered' && !waits;
  const final = settled ? finalsFirst(state.post?.finals ?? [])[0] : undefined;
  const feed = <Feed query="place=sound" title="Played to you" note="rounds, readings and mixes" startOpen={!settled} from="the Sound page" />;
  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Sound' }]}
        meta={filmMeta(state, total ? plural(total, 'sound file') : '')}
        phoneSub={`Sound · ${waits ? `${waits} waiting` : total ? plural(total, 'file') : 'nothing yet'}`} />
      <PageBody wide>
        <StageTitle kicker="Stage 11 · Sound and music" title="Sound"
          sub={settled ? 'The music, effects, voice fixes and mixes made for this film, by folder, then the rounds Alma played you.'
            : 'Music, effects, voice fixes and the mix. A round to choose from waits here until you answer it; the rest is what Alma has played you and what the folders hold.'} />
        <StepIntro step="sound" />
        <StepRunning step="sound" />

        {final && (
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
            <span className="font-medium">The sound that went out</span>
            <span className="min-w-0 flex-1 text-sub max-[760px]:basis-full">is inside the finished film <span className="font-mono text-[11.5px] [overflow-wrap:anywhere]">{final.split('/').pop()}</span></span>
            <Link href={`${base}/release`} className="inline-flex flex-none items-center gap-0.5 text-[12.5px] text-ink no-underline hover:underline">Play it on Release<IconChevronRight size={12} /></Link>
          </Card>
        )}
        {!settled && feed}

        {data.groups.length > 0 ? (
          <div className="flex items-start gap-4 max-[1180px]:flex-col max-[1180px]:items-stretch">
            {twoColumns(data.groups).map((col, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
                {col.map((g) => (
                  <Group key={g.key} g={g} toPath={(rel) => filmPath(state, rel)} hasChip={ui.hasChip}
                    onChip={(f) => ui.addChip({ id: `file:${f.path}`, label: f.name.length > 32 ? `${f.name.slice(0, 31)}…` : f.name, ref: filmPath(state, f.path) })} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <Card dashed className="px-4 py-3.5 text-[13px] leading-normal text-sub">No sound files yet. Voices are cast on the Voices page; music, effects and the mix land here once Alma makes them.</Card>
        )}
        {settled && feed}
        {data.warnings.length > 0 && <p className="m-0 text-[11.5px] text-mute">{data.warnings.join(' · ')}</p>}
      </PageBody>
    </>
  );
}
