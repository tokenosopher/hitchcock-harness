'use client';
// The Scene page's prompt panel: the scene's prompt (newest first; any older version on a click) with its diff to
// the version before, its media list at the reference numbers, the check, the prompt QC and the quote, the same
// way the go for the video shows every scene. "Go for <S> only" puts that one generation's go in the composer.
// design/boards/Scene-S9.dc.html "prompt → quote → go".
import Link from 'next/link';
import { useState } from 'react';
import type { FilmState, SceneRef } from '@/server/types';
import { useUI } from '@/components/data/ui';
import { repoPath } from '@/components/lib/format';
import { Btn } from '@/components/shell/atoms';
import { IconChevronRight } from '@/components/shell/icons';
import { CheckLine, Credits, MediaList, PromptQC, PromptText } from './GoScene';
import { creditsBasis, fmtCr, goMessage, useGo } from './lib';
import { cn } from '@/lib/utils';

export function ScenePromptPanel({ sc, state, base }: { sc: SceneRef; state: FilmState; base: string }) {
  const ui = useUI();
  const newest = sc.promptVersions[sc.promptVersions.length - 1]?.version;
  const [version, setVersion] = useState<string>();
  const shownVersion = version && version !== newest ? version : undefined;
  const { review, error } = useGo(state.film.slug, { scene: sc.id, version: shownVersion });
  const g = review?.scenes.find((x) => x.id === sc.id);
  const p = g?.prompt;
  const old = !!p && p.version !== newest;
  const pick = (v: string) => {
    setVersion(v);
    const pv = sc.promptVersions.find((x) => x.version === v);
    ui.addChip({ id: `prompt:${sc.id}:${v}`, label: `${sc.id} · prompt ${v}`, ref: pv ? repoPath(state.film.folder, state.film.repo, pv.path) : undefined });
  };
  const goOnly = () => {
    if (!g) return;
    ui.prefill(goMessage([g]).replace(`Go for the video: ${g.id} `, `Go for the video: ${g.id} only `), { id: `go:${g.id}`, label: `Go · ${g.id} only · ≈ ${fmtCr(g.credits ?? 0)}` });
    ui.setThreadOpen(true);
  };

  return (
    <article aria-label={`${sc.id} prompt`} className="flex min-w-0 flex-col rounded-[12px] border border-edge bg-well">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[14.5px] font-semibold">Prompt <span className="font-mono text-[13.5px] font-medium">{p?.version ?? newest ?? '—'}</span>{old && <span className="ml-2 text-[12px] font-normal text-warn">an older version · the newest is {newest}</span>}</span>
          <span className="text-[12.5px] text-sub">{sc.promptVersions.length ? `${sc.promptVersions.length} ${sc.promptVersions.length === 1 ? 'version' : 'versions'} in ${repoPath(state.film.folder, state.film.repo, `${sc.folder}/prompt`).replace(/^assets\/films\/[^/]+\//, '')}/` : 'No prompt written yet.'}</span>
        </div>
        {g && <PromptQC scene={g} s={state} />}
      </div>
      {sc.promptVersions.length > 1 && (
        <div className="scroll flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5" role="tablist" aria-label="Prompt versions">
          {[...sc.promptVersions].reverse().map((v) => {
            const on = (p?.version ?? newest) === v.version;
            return (
              <button key={v.version} type="button" role="tab" aria-selected={on} onClick={() => pick(v.version)}
                className={cn('inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-[7px] border px-2 font-mono text-[11.5px]', on ? 'border-faint bg-raised text-ink' : 'border-line text-sub hover:text-ink')}>
                <span className={cn('size-1.5 rounded-full', v.checkPassed === true ? 'bg-ok' : v.checkPassed === false ? 'bg-bad' : 'border border-mute')} title={v.checkPassed === true ? 'check passed' : v.checkPassed === false ? 'check stopped' : 'no check'} />
                {v.version}
              </button>
            );
          })}
        </div>
      )}
      {!g ? (
        <div className="px-4 py-3.5 text-[12.5px] text-sub">{error ?? (sc.promptVersions.length ? 'Reading the prompt…' : 'No prompt yet. Alma writes it from the scene file and the previz; nothing runs until you say go.')}</div>
      ) : (
        <>
          {(g.blockers.length > 0 || g.warnings.length > 0) && (
            <ul className="m-0 flex list-none flex-col gap-1 border-b border-line px-4 py-2.5">
              {g.blockers.map((b) => <li key={b} className="flex items-baseline gap-2 text-[12.5px] text-warn"><span className="size-1.5 flex-none rounded-full bg-warn" />Not ready: {b}</li>)}
              {g.warnings.map((w) => <li key={w} className="flex items-baseline gap-2 text-[12.5px] text-ink-3"><span className="size-1.5 flex-none rounded-full border border-warn" />{w}</li>)}
            </ul>
          )}
          {p && (
            <div className="flex min-w-0 flex-col gap-4 px-4 py-3.5">
              <PromptText key={p.version} scene={g} />
              <MediaList scene={g} s={state} />
              <CheckLine scene={g} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-hdr px-4 py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-baseline gap-2"><span className="lbl">Quote</span><Credits scene={g} review={review} /></span>
              <span className="text-[12px] leading-normal text-sub" title={creditsBasis(g, review)}>
                {g.duration !== undefined ? `${g.duration} s at ${p?.media?.settings.resolution ?? '480p'}` : 'no length yet'}{review?.rate ? ` · ${review.rate.crPerSec} cr/s, as spend.md's seedance_2_5 rows` : ''} · nothing is spent until you say go
              </span>
            </span>
            <span className="flex flex-none flex-wrap items-center gap-2">
              <Link href={`${base}/go`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-sub no-underline hover:text-ink">Review every scene<IconChevronRight size={13} /></Link>
              <Btn disabled={!g.ready || old} onClick={goOnly} title={old ? `The go sends the newest prompt, ${newest}` : g.ready ? undefined : g.blockers[0]}>
                Go for {sc.id} only{g.credits !== undefined ? <span className="font-normal text-sub tabular-nums">· ≈ {fmtCr(g.credits)}</span> : null}
              </Btn>
            </span>
          </div>
        </>
      )}
    </article>
  );
}
