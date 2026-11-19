'use client';
// Story (stage 1): the story, the script and the brief, one at a time under the title (design/boards/Story-2.dc.html,
// ASKS 64: "the sidebar for the story … is taking up too much real estate"). No side column: the brief's key facts are
// one quiet line, the brief itself a tab; what the lock starts is a line beside the Lock button (ScriptPanel). The page
// opens on the work at hand: the story until there is a script, then the script. Every line is clickable.
import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePage } from '@/components/data/ui';
import { parseBrief } from '@/components/lib/derive';
import { Header } from '@/components/shell/Header';
import { PageBody, StageTitle, Loading } from '@/components/shell/StageTitle';
import { QCChip } from '@/components/shell/QCChip';
import { FILM_TARGET, qcEntry, qcSpec } from '@/components/lib/qc';
import { Btn, Card } from '@/components/shell/atoms';
import { IconCheck } from '@/components/shell/icons';
import { useFilmPage, filmMeta, filmPath } from './common';
import { cn } from '@/lib/utils';
import { Feed, ShownLink } from '@/components/feed/Feed';
import { StoryEditor } from './StoryEditor';
import { ScriptPanel } from './ScriptPanel';
import { storyVersionOf } from '@/lib/script-edit';
import { useUI } from '@/components/data/ui';
import { StepIntro } from '@/components/intro/StepIntro';

type Tab = 'story' | 'script' | 'brief';
const TABS: Tab[] = ['story', 'script', 'brief'];

/** A brief fact: the value, with a trailing "(…)" muted and backticks dropped ("DMA (… `DMA-`)"). */
function FieldValue({ k, v }: { k: string; v: string }) {
  const m = /^(.*?)\s+(\(.*\))$/.exec(v.replace(/`/g, ''));
  return (
    <dd className="m-0">
      <span className={cn(k === 'Code' && 'font-mono')}>{m ? m[1] : v.replace(/`/g, '')}</span>
      {m && <span className="text-sub"> {m[2]}</span>}
    </dd>
  );
}
const bare = (v?: string) => v?.replace(/`/g, '').replace(/\s*\(.*\)\s*$/, '').trim();

export function StoryPage() {
  const { state, error, tasks, base, film } = useFilmPage();
  const params = useSearchParams();
  const asked = params.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab | undefined>(asked && TABS.includes(asked) ? asked : undefined);
  const [edits, setEdits] = useState(0);
  const onEdits = useCallback((n: number) => setEdits(n), []);
  const script = state?.script;
  const versions = script?.versions ?? [];
  const current = script?.current;
  const lockedV = versions.find((v) => v.version === current)?.locked ? current : undefined;
  const storyV = state?.story?.current;
  usePage(state ? `Story · ${lockedV ? `${lockedV} locked` : current ? `${current} draft` : storyV ? `story ${storyV}${state?.story?.settled?.version === storyV ? ' settled' : ''}` : 'no story yet'}` : undefined,
    'Ask about a line, or tell Alma what to change…', lockedV ? ['Unlock to change a line'] : current && !edits ? [`Lock script ${current}.`] : []);
  // the tab in the address, so a reload or a link lands on it
  const setTab = (t: Tab) => {
    setTabState(t);
    try { const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(window.history.state, '', u); } catch { /* fine without */ }
  };
  if (!state) return <Loading error={error} />;

  const shown: Tab = tab ?? (script ? 'script' : 'story');
  const brief = parseBrief(state.brief?.markdown);
  const field = (re: RegExp) => brief.fields.find(([k]) => re.test(k))?.[1];
  const started = /Started ([^·]+)/.exec(brief.subtitle)?.[1]?.trim().replace(/\s+20\d\d$/, '');
  const facts = [state.film.aspect ?? bare(field(/ratio/i)), bare(field(/^budget/i)), bare(field(/^code/i)) ? `code ${bare(field(/^code/i))?.split(/\s/)[0]}` : undefined, started ? `started ${started}` : undefined].filter(Boolean).join(' · ');
  // the story the script was written from, as the script itself names it; said only while a newer story exists
  const from = storyVersionOf(script?.markdown);
  const newer = from && storyV && Number(storyV.slice(1)) > Number(from.slice(1)) ? from : undefined;
  const story = state.story;
  const tag: Record<Tab, string> = {
    story: story ? `${story.current} · ${story.settled?.version === story.current ? 'settled' : 'not settled'}` : 'not yet',
    script: script && current ? `${current} · ${lockedV ? 'locked' : 'draft'}${newer ? ` · from ${newer}` : ''}` : 'not yet',
    brief: '',
  };

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Story' }]}
        meta={filmMeta(state, 'script.md', 'brief.md')} phoneSub={`Story · ${lockedV ? `${lockedV} locked` : current ?? ''}`}
        actions={<ShownLink places={['story']} />} />
      <PageBody wide>
        <StageTitle kicker="Stage 1 · Setup and story" title="Story"
          sub={script ? `The brief, the story and the script.${lockedV ? ` Everything after the lock reads script ${lockedV}.` : ''}` : 'The brief and the story. The script is written from the story once you settle it.'}
          right={<QCChip spec={qcSpec('script')} targets={{ target: FILM_TARGET, label: 'script', entry: qcEntry(state, 'script', FILM_TARGET), ready: !!script, waitsFor: script ? `script ${current ?? ''}`.trim() : 'the script' }} />} />
        <StepIntro step="story" />

        <div className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="tablist" aria-label="Story, script or brief" data-story-tabs className="inline-flex max-w-full gap-0.5 rounded-[10px] border border-line bg-raised p-[3px]">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={shown === t} data-tab={t} onClick={() => setTab(t)}
                className={cn('inline-flex h-[30px] cursor-pointer items-baseline gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium leading-[30px] max-[760px]:h-11 max-[760px]:leading-[44px] transition-[background-color,color,box-shadow] duration-150 max-[420px]:px-2.5',
                  shown === t ? 'bg-bg text-ink shadow-[0_0_0_1px_#27272A]' : 'text-sub hover:text-ink-3')}>
                {t === 'story' ? 'Story' : t === 'script' ? 'Script' : 'Brief'}
                {tag[t] && <span className="text-[11.5px] font-normal text-sub max-[420px]:hidden">{tag[t]}</span>}
              </button>
            ))}
          </div>
          {facts && <span data-facts className="font-mono text-[11.5px] text-sub">{facts}</span>}
        </div>

        <div key={shown} className="flex min-w-0 flex-col gap-5 duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
          {shown === 'story' && <StoryEditor key={film} state={state} film={film} locked={!!lockedV} hasScript={!!script} />}
          {shown === 'script' && (script ? <ScriptPanel state={state} film={film} tasks={tasks} base={base} onEdits={onEdits} /> : (
            <Card className="flex max-w-[760px] flex-col items-start gap-2.5 px-6 py-7">
              <span className="text-[15px] font-medium">No script yet</span>
              <span className="max-w-[56ch] text-[13px] leading-relaxed text-sub">Alma writes the script from the story once you settle it: the lines, the cut into generations and their timing. The lock comes after, and it is yours.</span>
              <Btn className="mt-1.5 max-[760px]:h-11" onClick={() => setTab('story')}>Back to the story</Btn>
            </Card>
          ))}
          {shown === 'script' && script && <IdsCard state={state} />}
          {shown === 'brief' && <BriefTab state={state} brief={brief} />}
        </div>
        <Feed query="place=story" note="script versions, readings and research" from="the Story page" />
      </PageBody>
    </>
  );
}

function IdsCard({ state }: { state: NonNullable<ReturnType<typeof useFilmPage>['state']> }) {
  if (!(state.characters.length > 0 || state.locations.length > 0 || state.scenes.length > 0)) return null;
  return (
    <Card className="max-w-[760px]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><span className="lbl">IDs</span><span className="font-mono text-[11px] text-sub">an ID never changes and is never reused</span></div>
      <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 text-[12.5px] leading-normal">
        {[
          ['character', state.characters.map((c) => `${c.id} ${c.name}`).join(', ')],
          ['location', state.locations.map((l) => `${l.id} ${l.name}`).join(', ')],
          ['prop', state.locations.flatMap((l) => l.props ?? []).map((p) => `${p.id} ${p.name}`).join(', ')],
          ['generation', state.scenes.length ? `${state.scenes[0].id}–${state.scenes[state.scenes.length - 1].id}` : ''],
          ['spoken line', (state.script?.lines ?? []).filter((l) => l.speaker).map((l) => l.id).filter((x, i, a) => i === 0 || i === a.length - 1).join(' to ')],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-sub">{k}</dt><dd className="m-0">{v}</dd></div>
        ))}
      </dl>
      <p className="m-0 border-t border-line px-4 py-2.5 text-[12px] text-sub">{filmPath(state, 'script.md')}</p>
    </Card>
  );
}

function BriefTab({ state, brief }: { state: NonNullable<ReturnType<typeof useFilmPage>['state']>; brief: ReturnType<typeof parseBrief> }) {
  const ui = useUI();
  return (
    <>
      {state.brief ? (
        <Card className="max-w-[760px]" data-brief>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><span className="lbl">The brief</span><span className="font-mono text-[11px] text-sub">brief.md</span></div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[16px] font-semibold">{brief.title || state.film.title}</span>
              {brief.subtitle && <span className="text-[12.5px] text-sub">{brief.subtitle}</span>}
            </div>
            {brief.fields.length > 0 && (
              <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px] max-[420px]:grid-cols-[96px_1fr]">
                {brief.fields.map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-sub">{k}</dt><FieldValue k={k} v={v} /></div>
                ))}
              </dl>
            )}
            {brief.premise && <p className="m-0 max-w-[62ch] text-[14px] leading-normal text-ink-3">{brief.premise}</p>}
          </div>
          {brief.sections.filter((s) => s.items.length && !/^Characters/.test(s.heading)).map((s) => (
            <div key={s.heading} className="flex flex-col gap-2 border-t border-line px-5 py-3.5">
              <span className="lbl">{s.heading.replace(/\s*\(.*\)$/, '')}</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {s.items.map((it, i) => {
                  const id = /^(D\d+)\s+(.*)$/.exec(it.label ?? '');
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => ui.addChip({ id: `brief:${it.label ?? i}`, label: id ? `${id[1]} · ${id[2]}` : (it.label ?? it.text).slice(0, 40) })}
                        className="flex min-h-6 w-full cursor-pointer gap-2.5 rounded-md text-left text-[13px] leading-normal outline-none focus-visible:shadow-[0_0_0_2px_#A1A1AA]">
                        {id ? <span className="w-6 flex-none font-mono text-[11.5px] text-sub">{id[1]}</span> : <IconCheck size={12} className="mt-1 flex-none text-sub" />}
                        <span className="flex min-w-0 flex-col">
                          {(id?.[2] ?? it.label) && <span className="font-medium text-ink">{id?.[2] ?? it.label}</span>}
                          <span className="text-sub">{it.text}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="max-w-[760px] px-6 py-7 text-[13px] text-sub">No brief yet: Alma writes brief.md when the film starts.</Card>
      )}
      {state.research && (
        <Card className="max-w-[760px]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><span className="lbl">Research</span><span className="font-mono text-[11px] text-sub">refs/research</span></div>
          <ul className="m-0 list-none p-0">
            {state.research.map((r) => {
              const on = ui.hasChip(`file:${r.path}`);
              return (
                <li key={r.path} className="border-b border-line last:border-b-0">
                  <button type="button" aria-pressed={on} title={`${r.path} · hand it to Alma`}
                    onClick={() => ui.addChip({ id: `file:${r.path}`, label: r.path.split('/').pop()!, ref: filmPath(state, r.path) })}
                    className={cn('box-border flex min-h-10 w-full cursor-pointer items-baseline justify-between gap-3 border-0 px-4 py-2 text-left text-ink hover:bg-tile', on ? 'bg-raised' : 'bg-transparent')}>
                    <span className="min-w-0 truncate text-[13px]">{r.title}</span>
                    <span className="flex-none font-mono text-[11px] text-sub">{r.path.split('/').pop()}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
