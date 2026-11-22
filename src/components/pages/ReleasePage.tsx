'use client';
// Release (stage 12). Since 14 Nov 2026 the Release page is the film and where it goes (src/components/release/):
// closed until a final is named, then the platforms from social/release.json. A film with only the old social/kit.md
// (no release file, no final) keeps the page below, read-only, as it was: KitRelease.
// The kit page: the delivery in the final-cuts folder, the thumbnails, the social kit (social/kit.md)
// and the upload checklist per platform, the delivered cut playing. design/boards/Release.dc.html.
// Every line and every post is the user's: clicking a thumbnail or a caption puts it in "Alma sees",
// the buttons put a message in the composer. The upload ticks are kept in this browser only (the record
// has no place for them). Data: the film state plus GET /api/films/[film]/release.
import { useEffect, useState } from 'react';
import type { DeliveredFile, KitPlatform, ReleaseInfo } from '@/server/films/read/release';
import { usePage } from '@/components/data/ui';
import { fmtDate, plural } from '@/components/lib/format';
import { FILM_TARGET, qcEntry, qcSpec } from '@/components/lib/qc';
import { Media } from '@/components/media/Media';
import { VideoShelf, day, finalTag, finalsFirst } from '@/components/media/Shelf';
import { Header } from '@/components/shell/Header';
import { QCChip } from '@/components/shell/QCChip';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Badge, Btn, Card, ReadingNotes } from '@/components/shell/atoms';
import { IconCheck, IconChevronDown, IconChevronRight, IconFile, IconPlay } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { filmMeta, filmPath, useFilmPage } from './common';
import { fmtBytes, PanelHead, smpteFrames, SubLabel, ToConfirm } from './postCommon';
import { useRelease } from '@/components/release/ui';
import { ClosedRelease, OpenRelease } from '@/components/release/ReleaseOpen';
import { Feed, ShownLink } from '@/components/feed/Feed';
import { StepRunning } from '@/components/flow/RunningNow';
import { Reveal } from '@/components/shell/Reveal';
import { releaseWords } from '@/components/lib/flow';
import { StepIntro } from '@/components/intro/StepIntro';

const KIND_LABEL: Partial<Record<DeliveredFile['kind'], string>> = {
  captioned: 'Captioned · 1080×1920', clean: 'Clean master', 'captioned-480p': 'Phone copy · 480p', srt: 'Subtitles', kit: 'The kit', page: 'Page',
};

/** The upload ticks: per film, in this browser only. */
function useTicks(film: string) {
  const key = `hh:release-ticks:${film}`;
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring this browser's ticks after mount
      setTicks(JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, boolean>);
    } catch { /* storage blocked */ }
  }, [key]);
  const toggle = (id: string) => setTicks((t) => {
    const next = { ...t, [id]: !t[id] };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage blocked */ }
    return next;
  });
  return { ticks, toggle };
}

export function ReleasePage() {
  const { film, state, error } = useFilmPage();
  const rel = useRelease(film);
  if (!state || !rel.view) return <Loading error={error ?? rel.error} />;
  if (rel.view.legacy) return <KitRelease r={rel.view.legacy} />;
  return rel.view.file?.final ? <OpenRelease rel={rel} /> : <ClosedRelease rel={rel} />;
}

/** The page for a film with only social/kit.md, unchanged. */
function KitRelease({ r }: { r: ReleaseInfo }) {
  const { film, state, error, ui, base } = useFilmPage();
  const { ticks, toggle } = useTicks(film);
  const [tab, setTab] = useState(0);
  const [openFiles, setOpenFiles] = useState(false);
  const [copied, setCopied] = useState(false);
  const del = r?.delivery.find((d) => d.kit) ?? r?.delivery[0];
  const tiktok = r?.kit?.platforms.find((p) => /tiktok/i.test(p.name));
  usePage(state && r ? `stage 12 · ${del?.kit?.delivered ? `delivered ${fmtDate(del.kit.delivered)}` : releaseWords(state.film)}${r.kit ? ' · kit ready' : ''}` : undefined,
    'Pick a line, a thumbnail, or tell Alma what to change…',
    [tiktok?.groups[0]?.options[0] ? `Line ${tiktok.groups[0].options[0].id} for TikTok` : '', r?.kit?.almaThumb ? `Thumbnail: ${r.kit.almaThumb}` : ''].filter(Boolean), ['Where is it posted?']);
  if (!state) return <Loading error={error} />;

  const p = (rel: string) => filmPath(state, rel);
  const fps = state.cut?.fps ?? 24;
  const kitFile = del?.kit?.files.find((f) => f.kind === 'kit');
  const kitFiles = del?.kit?.files.filter((f) => f.current && ['captioned', 'clean', 'captioned-480p'].includes(f.kind)) ?? [];
  const srt = del?.kit?.files.filter((f) => f.kind === 'srt').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  const platform = r.kit?.platforms[tab];
  const lengthLine = r.kit?.intro.find((l) => /under 3:00|Premium above|whole film goes/i.test(l));
  const nothing = !del?.kit && !r.kit && !r.thumbs.rounds.length;
  // the posting record (the published-links note): what went out, and what did not and why
  const posts = r.published?.rows ?? [];
  const out = posts.filter((x) => x.link || x.posted || x.pending);
  const sent = out.length > 0; // it is out: what was waiting on the user is now the record
  const postOf = (name: string) => posts.find((x) => x.platform.split(/\s+/)[0].toLowerCase() === name.split(/\s+/)[0].toLowerCase());
  const finals = finalsFirst(state.post?.finals ?? []);

  const thumbsCard = r.thumbs.rounds.length > 0 && (
          <Card>
            <PanelHead title="Thumbnails" sub={sent ? 'Typeset, one idea each · preview size and feed size' : 'Typeset, one idea each · preview size and feed size · pick by name'}
              right={r.thumbs.pick ? <span className="text-[12px] text-sub">picked: {r.thumbs.pick.pick}</span> : sent ? undefined : <span className="text-[12px] text-sub">none picked</span>} />
            {r.thumbs.rounds.map((round, ri) => (
              <div key={round.title} className="flex flex-col gap-2.5 border-b border-line px-4 py-3.5 last:border-b-0">
                <SubLabel right={`${round.thumbs.length} · 9:16${round.date ? ` · ${fmtDate(round.date)}` : ''}`}>{`Round ${ri + 1} · ${round.title.replace(/\s*\(.*\)\s*$/, '')}`}</SubLabel>
                <div className="flex flex-wrap gap-x-4 gap-y-5">
                  {round.thumbs.map((t) => {
                    const id = `thumb:${t.path}`;
                    const on = ui.hasChip(id);
                    const alma = r.kit?.almaThumb && t.name.toLowerCase() === r.kit.almaThumb.toLowerCase() && ri === 0;
                    return (
                      <button key={t.path} type="button" aria-pressed={on} onClick={() => ui.addChip({ id, label: `thumbnail · ${t.name}`, ref: p(t.path) })}
                        className="flex flex-none cursor-pointer flex-col gap-1.5 text-left">
                        <span className="flex items-end gap-2">
                          <Media path={p(t.path)} w={320} className={cn('aspect-[9/16] w-[104px] rounded-[6px] border', on ? 'border-ink outline outline-1 outline-offset-2 outline-ink' : 'border-edge')} />
                          <span className="flex flex-col items-start gap-1">
                            <Media path={p(t.path)} w={160} className="aspect-[9/16] w-[38px] rounded-[3px] border border-edge" />
                            <span className="text-[10px] text-mute">feed</span>
                          </span>
                        </span>
                        <span className="flex max-w-[150px] flex-wrap items-center gap-1.5 text-[12.5px]">{t.name}{alma && <Badge className="h-[18px] text-[10.5px]">Alma’s pick</Badge>}</span>
                        {t.time && <span className="font-mono text-[10.5px] text-mute">{t.time}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {r.thumbs.plain.length > 0 && <p className="m-0 border-t border-line px-4 py-2.5 text-[12px] text-mute">{r.thumbs.plain.length} plain frames (no type) in social/thumb-options/.</p>}
          </Card>
        );
  const kitCard = r.kit && (
              <Card>
                <PanelHead title="Social kit" sub={`${r.kit.path} · one file for every platform`} />
                {(kitFiles.length > 0 || srt) && (
                  <div className="flex flex-col border-b border-line">
                    {[...kitFiles, ...(srt ? [srt] : [])].map((f) => (
                      <div key={f.name} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                        {f.kind === 'srt' ? <IconFile size={14} className="flex-none text-sub" /> : <IconPlay size={13} className="flex-none text-sub" />}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[13px] font-medium">{KIND_LABEL[f.kind] ?? f.kind}</span>
                          <span className="truncate font-mono text-[11px] text-mute" title={f.name}>{f.name}</span>
                        </span>
                        <span className="flex-none font-mono text-[12px]">{fmtBytes(f.bytes)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div role="tablist" aria-label="Platforms" className="scroll flex flex-nowrap gap-x-4 overflow-x-auto border-b border-line px-4">
                  {r.kit.platforms.map((pl, i) => (
                    <button key={pl.name} role="tab" type="button" aria-selected={tab === i} onClick={() => setTab(i)}
                      className={cn('-mb-px h-9 flex-none cursor-pointer whitespace-nowrap border-b-2 text-[13px] font-medium', tab === i ? 'border-ink text-ink' : 'border-transparent text-sub hover:text-ink')}>
                      {pl.name}
                    </button>
                  ))}
                </div>
                {platform && <PlatformCopy pl={platform} film={state.film.title} pick={(g, o) => ui.addChip({ id: `kit:${platform.name}:${g}:${o.id}`, label: `${platform.name} · ${g.replace(/,? pick one/i, '').toLowerCase()} ${o.id}` })} has={(g, id) => ui.hasChip(`kit:${platform.name}:${g}:${id}`)} picks={r.picks} sent={sent} />}
                {r.kit.confirm.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                    <SubLabel>{sent ? 'Checked by you before it went out' : 'Only you can confirm'}</SubLabel>
                    {r.kit.confirm.map((c) => (
                      <div key={c.label} className="flex items-start justify-between gap-3 py-1">
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[13px] font-medium">{c.label}</span>
                          <span className="text-[12px] leading-normal text-sub">{c.text}</span>
                        </span>
                        {!sent && (
                          <span className="flex flex-none items-center gap-2">
                            <ToConfirm />
                            <Btn onClick={() => ui.about({ id: `confirm:${c.label}`, label: `kit · ${c.label.toLowerCase()}` }, `confirming ${c.label} in the kit`, `Confirm ${c.label.toLowerCase()} in the kit…`)}>Confirm</Btn>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
  const playCard = r.play && (
              <Card className="flex gap-4 p-4 max-[760px]:flex-col">
                <Media path={r.play.twin ? p(r.play.twin) : r.play.path} w={640} t={8} play fit="contain"
                  onPlay={() => ui.addChip({ id: 'release:cut', label: `delivered cut · ${r.play!.label}` })}
                  className="aspect-[9/16] w-[180px] flex-none rounded-[9px] border border-edge bg-black max-[760px]:w-full max-[760px]:max-w-[260px]" />
                <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
                  <span className="lbl">Delivered cut</span>
                  <span className="font-medium">{del?.kit?.edition ? `${state.film.title} (${del.kit.edition})` : state.film.title}</span>
                  <span className="text-[12.5px] text-sub">The phone copy, as in the final-cuts folder.{r.play.twin ? ' It plays from social/ in the film folder (the same file, byte for byte).' : ''}</span>
                  <span className="break-all font-mono text-[11px] text-mute">{r.play.label}</span>
                </div>
              </Card>
            );
  const finalsShelf = finals.length > 0 && <VideoShelf s={state} title="Finished films" note="cut/ and social/" files={finals} onChip={(id, label) => ui.addChip({ id, label })}
              tag={(f) => [finalTag(f), day(state.post?.written?.[f])].filter(Boolean).join(' · ')} />;
  const checklist = (
            <Card>
              <PanelHead title="To tick at upload" sub={lengthLine ?? 'From the kit and Flow v3 - 12 Release.'} />
              {r.checklist.general.length > 0 && (
                <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3">
                  <SubLabel right={r.checklist.from}>Before every upload</SubLabel>
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-normal text-ink-3 marker:text-mute">
                    {r.checklist.general.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              )}
              {!r.checklist.available && <p className="m-0 border-b border-line px-4 py-3 text-[12px] text-sub">The rules note {r.checklist.from} did not answer in time; the kit’s own steps are below.</p>}
              {r.kit?.platforms.map((pl) => {
                const items = pl.steps.filter((s) => !s.note);
                const done = items.filter((s) => ticks[`${pl.name}:${s.text}`]).length;
                const post = postOf(pl.name);
                const went = !!(post?.link || post?.posted || post?.pending);
                const steps = items.map((s) => {
                  const id = `${pl.name}:${s.text}`;
                  return (
                    <label key={id} className="flex cursor-pointer items-start gap-2.5 py-1 text-[12.5px] leading-normal">
                      <input type="checkbox" checked={!!ticks[id]} onChange={() => toggle(id)} className="mt-[3px] size-3.5 flex-none cursor-pointer accent-[#FAFAFA]" />
                      <span className={cn(ticks[id] && 'text-sub line-through')}>{s.text}</span>
                    </label>
                  );
                });
                return (
                  <div key={pl.name} className="flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium">{pl.name}{pl.note ? <span className="font-normal text-sub"> · {pl.note}</span> : ''}</span>
                      <span className="flex-none text-[12px] tabular-nums text-sub">{went ? <span className="inline-flex items-center gap-1 text-ink-3"><IconCheck size={11} />posted{post?.posted ? ` ${post.posted.split(',')[0]}` : ''}</span> : post?.note ?? `${done} of ${items.length}`}</span>
                    </div>
                    {/* a platform the film already went out on, or was left off, keeps its steps one click away */}
                    {post ? items.length > 0 && (
                      <details className="text-[12px] text-sub">
                        <summary className="cursor-pointer py-0.5 hover:text-ink">The {items.length} upload steps</summary>
                        {steps}
                      </details>
                    ) : steps}
                  </div>
                );
              })}
              {r.kit && r.kit.posting.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
                  <SubLabel>Posting order</SubLabel>
                  {r.kit.posting.map((x, i) => {
                    const m = /^(\d{1,2}:\d{2})(?:\s*your time)?:?\s*(.*)$/.exec(x) ?? (/next (?:morning|day)/i.test(x) ? ['', 'next day', x] : null);
                    return (
                      <div key={i} className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-[12.5px] leading-normal">
                        <span className="font-mono text-[11.5px] text-sub">{m ? m[1] : `${i + 1}`}</span>
                        <span>{m ? m[2] || x : x}</span>
                      </div>
                    );
                  })}
                  {r.kit.postingNote && <p className="m-0 pt-1 text-[11.5px] leading-normal text-mute">{r.kit.postingNote.replace(/:$/, '.')}</p>}
                </div>
              )}
              <p className="m-0 border-t border-line px-4 py-2.5 text-[11.5px] text-mute">Ticks stay in this browser; nothing is posted from here.</p>
            </Card>
  );

  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Release' }]}
        meta={filmMeta(state, [state.cut?.render, state.cut?.frames ? smpteFrames(state.cut.frames, fps) : '', del?.kit?.delivered ? `delivered ${fmtDate(del.kit.delivered)}` : '', kitFile?.date ? `social kit ${fmtDate(kitFile.date)}` : ''].filter(Boolean).join(' · '))}
        phoneSub={`Release · ${del?.kit?.delivered ? `delivered ${fmtDate(del.kit.delivered)}` : releaseWords(state.film)}`}
        actions={<ShownLink places={['release']} />} />
      <PageBody wide>
        <StageTitle kicker="Stage 12 · Release" title="Release" sub={sent ? `Out on ${plural(out.length, 'platform')}. The posts, the finished files, and the thumbnails and copy made for them.` : 'Every line and every post on your word: you pick the thumbnail and each platform’s copy; nothing goes out without your go.'}
          right={<QCChip spec={qcSpec('kit')} targets={{ target: FILM_TARGET, label: 'kit', entry: qcEntry(state, 'kit', FILM_TARGET), ready: !!r.kit, waitsFor: r.kit ? 'the social kit and the platform checklist' : 'social/kit.md' }} />} />
        <StepIntro step="release" />
        <StepRunning step="release" />

        {/* ---- the delivery strip */}
        <Card>
          {r.delivery.length === 0 ? (
            <p className="m-0 px-4 py-3 text-[13px] text-sub">No final-cuts folder for this film yet. Delivery copies the FINAL files into <span className="font-mono text-[12px]">assets/final-cuts/&lt;date&gt; {state.film.title}/Social kit/</span> (Flow v3.3 - 12).</p>
          ) : r.delivery.map((d) => {
            const shown = d.kit?.shown ?? d.shown;
            const n = d.kit?.files.length ?? d.files.length;
            // a final-cuts folder with a video but no FINAL files: a copy to watch, not a release (ASKS 37)
            const copy = !d.kit?.delivered ? state.film.copies?.find((c) => c.folder === d.folder) : undefined;
            return (
              <div key={d.folder} className="border-b border-line last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  {d.kit?.delivered
                    ? <span className="inline-flex h-7 flex-none items-center gap-1.5 rounded-[14px] border border-edge-strong px-2.5 text-[12px] font-medium"><IconCheck size={12} />Delivered {fmtDate(d.kit.delivered)}</span>
                    : <span className="inline-flex h-7 flex-none items-center rounded-[14px] border border-dashed border-edge-strong px-2.5 text-[12px] text-sub">{!d.available ? 'No answer from the folder' : copy ? `A copy since ${fmtDate(copy.date)} · not released` : 'Not delivered yet'}</span>}
                  <span className="flex-none text-[12.5px] text-sub">Final cuts</span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere] font-mono text-[11.5px] max-[760px]:order-last max-[760px]:basis-full" title={shown}>{shown}</span>
                  <Btn onClick={() => { void navigator.clipboard?.writeText(d.kit?.folder ?? d.folder).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
                    <IconFile size={13} />{copied ? 'Copied' : 'Copy path'}
                  </Btn>
                  {d.available && n > 0 && <Btn ghost aria-expanded={openFiles} onClick={() => setOpenFiles(!openFiles)}>{plural(n, 'file')}<IconChevronDown size={12} className={cn('transition-transform', openFiles && 'rotate-180')} /></Btn>}
                </div>
                {copy && <p className="m-0 px-4 pb-3 text-[12.5px] leading-normal text-sub">A copy of a video is in this folder, to watch on the phone. Release: nothing recorded yet (no FINAL files in a Social kit, no post in Published links).</p>}
                {copy && <Reveal open={openFiles}>
                  <ul className="m-0 flex list-none flex-col border-t border-line px-4 py-2 pl-4">
                    {d.files.filter((f) => f.kind !== 'folder').map((f) => (
                      <li key={f.name} className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
                        <span className="min-w-0 truncate font-mono text-[11.5px]">{f.name}</span>
                        <span className="flex-none text-sub">{fmtBytes(f.bytes)} · {fmtDate(f.date)}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>}
                {!d.available && <p className="m-0 px-4 pb-3 text-[12px] text-sub">The folder did not answer within 5 s: macOS is likely waiting on a permission prompt on this Mac (Privacy &amp; Security → Files and Folders).</p>}
                {d.available && !n && <p className="m-0 px-4 pb-3 text-[12px] text-sub">The folder is there and empty: nothing delivered yet.</p>}
                {d.kit && <Reveal open={openFiles}>
                  <ul className="m-0 flex list-none flex-col border-t border-line px-4 py-2 pl-4">
                    {d.kit.files.map((f) => (
                      <li key={f.name} className={cn('flex items-baseline justify-between gap-3 py-1 text-[12px]', f.current === false && 'opacity-55')}>
                        <span className="min-w-0 truncate font-mono text-[11.5px]">{f.name}</span>
                        <span className="flex-none text-sub">{f.current === false ? 'earlier edition · ' : ''}{fmtBytes(f.bytes)} · {fmtDate(f.date)}</span>
                      </li>
                    ))}
                    {d.files.filter((f) => f.kind !== 'folder').length > 0 && <li className="pt-1.5 text-[11.5px] text-mute">Beside the Social kit: {d.files.filter((f) => f.kind === 'folder' && !/social kit/i.test(f.name)).length} folders and {d.files.filter((f) => f.kind !== 'folder').length} files from the making (drafts, rounds, previz).</li>}
                  </ul>
                </Reveal>}
              </div>
            );
          })}
        </Card>

        {/* ---- where it was posted */}
        {posts.length > 0 && (
          <Card>
            <PanelHead title="Posted" sub={`${out.length} of ${posts.length} platforms · from ${r.published!.from} in the studio folder`} />
            <ul className="m-0 flex list-none flex-col p-0">
              {posts.map((x) => {
                const went = !!(x.link || x.posted || x.pending);
                return (
                  <li key={x.platform} className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5 text-[13px] last:border-b-0', !went && 'text-sub')}>
                    <span className="w-[132px] flex-none font-medium max-[760px]:w-auto">{x.platform}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-sub max-[760px]:basis-full max-[760px]:whitespace-normal">{went ? [x.account, x.posted ?? x.note].filter(Boolean).join(' · ') : x.note ?? 'not posted'}</span>
                    {x.link && <a href={x.link} target="_blank" rel="noreferrer" className="flex-none text-[12.5px] underline decoration-edge-strong underline-offset-4 hover:decoration-ink">Open the post</a>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {nothing && <p className="m-0 text-[13px] leading-normal text-sub">Nothing for stage 12 yet: no social/kit.md, no thumbnails in social/. They follow the captions on the 1080p master (Finish).</p>}

        {sent ? (
          <>
            {/* it is out: the film and its files first; what was used to post it folds away under them */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-4 max-[1180px]:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-4">{playCard}</div>
              <div className="flex min-w-0 flex-col gap-4">{finalsShelf}</div>
            </div>
            {thumbsCard && <Fold title="Thumbnails" sub={`${plural(r.thumbs.rounds.reduce((a, x) => a + x.thumbs.length, 0), 'typeset frame')} in ${plural(r.thumbs.rounds.length, 'round')}`}>{thumbsCard}</Fold>}
            {kitCard && <Fold title="Social kit" sub="the copy written for each platform">{kitCard}</Fold>}
            <Fold title="Upload steps" sub="the checklist used at upload, per platform">{checklist}</Fold>
          </>
        ) : (
          <>
            {thumbsCard}
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4 max-[1180px]:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-4">{kitCard}</div>
              <div className="flex min-w-0 flex-col gap-4">{playCard}{finalsShelf}{checklist}</div>
            </div>
          </>
        )}
        <ReadingNotes notes={r.warnings} />
        <Feed query="place=release" note="title, thumbnails, captions and posts" from="the Release page" />
      </PageBody>
    </>
  );
}

/** A part of the page folded to one line: the record keeps it, the page does not lead with it. */
function Fold({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details className="group flex flex-col">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-[9px] border border-edge px-4 py-3 text-[13px] font-medium hover:bg-raised group-open:mb-3 [&::-webkit-details-marker]:hidden">
        <IconChevronRight size={13} className="flex-none text-sub transition-transform group-open:rotate-90" />
        <span className="flex-none">{title}</span>
        {sub && <span className="min-w-0 truncate font-normal text-sub">{sub}</span>}
      </summary>
      {children}
    </details>
  );
}

function PlatformCopy({ pl, pick, has, picks, film, sent }: { pl: KitPlatform; pick: (group: string, o: { id: string; text: string }) => void; has: (group: string, id: string) => boolean; picks: ReleaseInfo['picks']; film: string; sent?: boolean }) {
  const picked = picks.find((x) => x.what.toLowerCase().includes(pl.name.toLowerCase()));
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {pl.groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2">
          <SubLabel right={g.options.length ? (picked ? `picked: ${picked.pick}` : sent ? undefined : 'none picked') : undefined}>{`${pl.name} · ${g.label.replace(/,? pick one/i, '')}`}</SubLabel>
          {g.lead && <p className="m-0 text-[12px] leading-normal text-sub">{g.lead.charAt(0).toUpperCase() + g.lead.slice(1)}{/[.:]$/.test(g.lead) ? '' : '.'}</p>}
          {g.options.map((o) => {
            const on = has(g.label, o.id);
            return (
              <button key={o.id} type="button" aria-pressed={on} onClick={() => pick(g.label, o)}
                className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left', on ? 'border-sub bg-raised' : 'border-edge hover:bg-raised')}>
                {/* after it went out the options are the record of what was offered: no empty radio to fill */}
                {(!sent || on) && <span aria-hidden="true" className={cn('mt-[3px] flex size-3.5 flex-none items-center justify-center rounded-full border', on ? 'border-ink' : 'border-mute')}>{on && <span className="size-1.5 rounded-full bg-ink" />}</span>}
                <span className="w-3 flex-none pt-px font-mono text-[11.5px] text-sub">{o.id}</span>
                <span className="min-w-0 flex-1 whitespace-pre-line text-[12.5px] leading-normal">{o.text}</span>
                {o.note && <span className="flex-none text-[11px] text-mute">{o.note}</span>}
              </button>
            );
          })}
          {g.text && (/^#/.test(g.text.trim()) || g.text.length < 160
            ? <p className="m-0 whitespace-pre-line font-mono text-[12px] leading-normal text-ink-3">{g.text}</p>
            : (
              <details className="rounded-lg border border-edge bg-well px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] text-sub">{g.text.split('\n')[0].slice(0, 90)}{g.text.split('\n')[0].length > 90 ? '…' : ''}</summary>
                <p className="m-0 mt-2 whitespace-pre-line text-[12.5px] leading-normal text-ink-3">{g.text}</p>
              </details>
            ))}
        </div>
      ))}
      {pl.after.map((a) => <p key={a} className="m-0 text-[12px] leading-normal text-sub">{a}</p>)}
      {!pl.groups.length && !pl.after.length && <p className="m-0 text-[12.5px] text-sub">No copy for {pl.name} in the kit of {film}.</p>}
    </div>
  );
}
