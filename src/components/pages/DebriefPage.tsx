'use client';
// The debrief (Flow v3.2 fixes item 22, Flow v3.3 - 12 Release steps 39 to 42). The user: "when
// the film is done, I think Alma should start asking questions around 'Why did you make the changes that you made?'
// ... kind of like a debrief session at the end of every video". One page per film: Alma's questions from
// review/debrief.json, grouped by kind (cutting, sound, previz, prompts) in the film's order, each showing its change
// (the change in a line, two prompts side by side, a picture, a clip or a sound) with a few likely answers to tap, a
// box for the user's own words, and a skip. Each answer is kept as it is given (review/debrief-answers.json), so the
// page can be left and taken up again on the phone; "Send the answers to Alma" sends them all as one message.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePage } from '@/components/data/ui';
import { Header } from '@/components/shell/Header';
import { Loading, PageBody, StageTitle } from '@/components/shell/StageTitle';
import { Btn, Card } from '@/components/shell/atoms';
import { Media } from '@/components/media/Media';
import { PlayButton, PlayLine } from '@/components/media/Sound';
import { WhyQuestion } from '@/components/feed/WhyPanel';
import { fmtDate } from '@/components/lib/format';
import { countsOf, groupsOf, isAnswered, KIND_WORDS, type Debrief, type DebriefAnswer, type DebriefAnswers, type DebriefQuestion } from '@/components/lib/debrief';
import { cn } from '@/lib/utils';
import { filmMeta, filmPath, useFilmPage } from './common';
import { useJson } from './postCommon';

interface Data { debrief?: Debrief; answers: DebriefAnswers; problems: string[] }
const AUDIO = /\.(wav|mp3|m4a|aac|flac|ogg)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;

function Shown({ q, toPath }: { q: DebriefQuestion; toPath: (rel: string) => string }) {
  const sounds = q.media.filter((m) => AUDIO.test(m.file));
  const seen = q.media.filter((m) => !AUDIO.test(m.file));
  return (
    <>
      {(q.before || q.after) && (
        <div className="grid grid-cols-2 gap-2.5 max-[760px]:grid-cols-1">
          {[['Proposed', q.before], ['Yours', q.after]].map(([k, t]) => t && (
            <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-well px-3 py-2">
              <span className="lbl">{k}</span>
              <span className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.5] text-ink-2">{t}</span>
            </div>
          ))}
        </div>
      )}
      {seen.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {seen.map((m) => (
            <figure key={m.file} className="m-0 flex w-[150px] min-w-0 flex-col gap-1 max-[760px]:w-[calc(50%-5px)]">
              <Media path={toPath(m.file)} w={320} t={m.from ?? 0.5} play={VIDEO.test(m.file)} fit="contain" alt={m.label ?? m.file} className="aspect-[9/16] w-full rounded-[6px] border border-edge bg-black" />
              {m.label && <figcaption className="truncate text-[11.5px] text-sub">{m.label}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {sounds.map((m) => (
        <div key={m.file} className="flex min-w-0 items-center gap-3">
          <PlayButton path={toPath(m.file)} label={m.label ?? m.file.split('/').pop()!} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] text-ink-2">{m.label ?? m.file.split('/').pop()}</span>
            <PlayLine path={toPath(m.file)} className="max-w-[420px]" />
          </div>
        </div>
      ))}
    </>
  );
}

function Question({ film, q, a, n, toPath, onSave }: { film: string; q: DebriefQuestion; a?: DebriefAnswer; n: number; toPath: (rel: string) => string; onSave: (id: string, v: { picked?: string[]; words?: string; skipped?: boolean }) => Promise<boolean> }) {
  const [picked, setPicked] = useState<string[]>(a?.picked ?? []);
  const [words, setWords] = useState(a?.words ?? '');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'kept' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = (v: { picked?: string[]; words?: string; skipped?: boolean }) => {
    clearTimeout(timer.current);
    setSaved('saving');
    void onSave(q.id, v).then((ok) => setSaved(ok ? 'kept' : 'error'));
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const skipped = !!a?.skipped;
  const done = isAnswered(a);
  return (
    <Card as="article" data-question={q.id} className={cn('flex min-w-0 flex-col gap-3 px-4 py-3.5 transition-opacity duration-300', skipped && 'opacity-60')}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn('mt-[3px] flex size-[18px] flex-none items-center justify-center rounded-full border text-[10.5px] tabular-nums transition-colors duration-200', done ? 'border-ink bg-ink text-bg' : 'border-edge-strong text-sub')}>{n}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="m-0 text-[14px] font-medium leading-snug">{q.question}</h3>
          {q.change && <span className="text-[12.5px] leading-normal text-sub">{q.change}</span>}
          {q.at && <Link href={`/films/${film}/edit`} className="w-fit text-[12px] text-sub underline decoration-edge-strong underline-offset-4 hover:text-ink">On the Edit page, at {q.at}</Link>}
        </div>
      </div>
      <Shown q={q} toPath={toPath} />
      {skipped ? (
        <div className="flex flex-wrap items-center gap-2 duration-200 animate-in fade-in-0">
          <span className="text-[12.5px] text-sub">Skipped.</span>
          <Btn ghost className="h-7 text-[12.5px]" onClick={() => save({})}>Answer it after all</Btn>
        </div>
      ) : (
        <>
          <WhyQuestion id={q.id} answers={q.answers} picked={picked} words={words} multi
            onPick={(pk) => { setPicked(pk); save({ picked: pk, words }); }}
            onWords={(w) => { setWords(w); clearTimeout(timer.current); timer.current = setTimeout(() => save({ picked, words: w }), 900); }}
            onBlur={() => { if (words !== (a?.words ?? '')) save({ picked, words }); }} />
          <div className="flex flex-wrap items-center gap-2">
            {!done && <Btn ghost className="-ml-2.5 h-7 text-[12.5px]" onClick={() => { setPicked([]); setWords(''); save({ skipped: true }); }}>Skip this one</Btn>}
            <span aria-live="polite" className={cn('text-[12px] transition-opacity duration-300', saved === 'idle' ? 'opacity-0' : 'opacity-100', saved === 'error' ? 'text-bad' : 'text-mute')}>
              {saved === 'saving' ? 'Keeping it…' : saved === 'error' ? 'Not kept: the harness server did not answer' : 'Kept'}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function DebriefPage() {
  const { film, state, error, base } = useFilmPage();
  const { data, error: derr } = useJson<Data>(`/api/films/${film}/debrief`, state?.updatedAt);
  const [answers, setAnswers] = useState<DebriefAnswers | undefined>();
  const [send, setSend] = useState<{ k: 'idle' | 'confirm' | 'busy' } | { k: 'error'; text: string }>({ k: 'idle' });
  const a = answers ?? data?.answers;
  const d = data?.debrief;
  const k = d && a ? countsOf(d, a) : undefined;
  usePage(state ? `the debrief${k ? ` · ${k.answered} of ${k.questions} answered` : ''}` : undefined, 'Say more about a change, or ask Alma about the debrief…',
    ['Why did you ask about this?', 'Turn my answers into lessons'], ['What has changed since the last film?']);
  if (!state || !data || !a) return <Loading error={error ?? derr} />;
  const toPath = (rel: string) => filmPath(state, rel);
  const onSave = async (id: string, v: { picked?: string[]; words?: string; skipped?: boolean }): Promise<boolean> => {
    try {
      const r = await fetch(`/api/films/${film}/debrief`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: id, ...v }) });
      const j = (await r.json().catch(() => ({}))) as { answers?: DebriefAnswers };
      if (r.ok && j.answers) setAnswers(j.answers);
      return r.ok;
    } catch {
      return false;
    }
  };
  const sendAll = async () => {
    setSend({ k: 'busy' });
    try {
      const r = await fetch(`/api/films/${film}/debrief`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ send: true }) });
      const j = (await r.json().catch(() => ({}))) as { answers?: DebriefAnswers; error?: string };
      if (!r.ok) { setSend({ k: 'error', text: j.error ?? `Not sent (${r.status})` }); return; }
      if (j.answers) setAnswers(j.answers);
      setSend({ k: 'idle' });
    } catch {
      setSend({ k: 'error', text: 'The harness server is not answering' });
    }
  };
  // the questions' numbers run through the groups, in the order they show
  const order = d ? groupsOf(d).flatMap((g) => g.questions.map((q) => q.id)) : [];
  return (
    <>
      <Header crumbs={[{ label: 'Films' }, { label: state.film.title, href: base }, { label: 'Debrief' }]}
        meta={filmMeta(state, k ? `${k.questions} questions` : '')} phoneSub={k ? `Debrief · ${k.answered} of ${k.questions} answered` : 'Debrief'} />
      <PageBody>
        <StageTitle kicker="After the release · the debrief" title="Why you changed what you changed"
          sub={d?.intro ?? 'Alma asks about your changes to her proposals where the reason is not plain, so the next film starts closer to how you work. Tap an answer, write your own, or skip any.'} />
        {!d?.questions.length ? (
          <Card dashed className="px-4 py-3.5 text-[13px] leading-normal text-sub">No debrief yet. Alma writes its questions once the film is released.</Card>
        ) : (
          <>
            {d.counts && (
              <dl className="m-0 grid grid-cols-4 gap-2.5 max-[760px]:grid-cols-2">
                {d.counts.map((c) => (
                  <div key={c.label} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line px-3 py-2">
                    <dt className="text-[11.5px] leading-snug text-sub">{c.label}</dt>
                    <dd className="m-0 text-[15px] font-medium tabular-nums">{c.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {groupsOf(d).map((g) => (
              <section key={g.kind} aria-label={KIND_WORDS[g.kind]} className="flex min-w-0 flex-col gap-2.5">
                <span className="lbl">{KIND_WORDS[g.kind]} · {g.questions.length}</span>
                {g.questions.map((q) => <Question key={q.id} film={film} q={q} a={a.answers[q.id]} n={order.indexOf(q.id) + 1} toPath={toPath} onSave={onSave} />)}
              </section>
            ))}
            {data.problems.length > 0 && <p className="m-0 text-[11.5px] text-mute">{data.problems.join(' · ')}</p>}
          </>
        )}
      </PageBody>
      {d?.questions.length && k ? (
        <div className="sticky bottom-0 z-20 mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge-strong bg-bg/95 px-6 py-3 backdrop-blur max-[760px]:bottom-[112px] max-[760px]:px-4">
          <span className="text-[12.5px] tabular-nums text-ink-3">
            {k.answered} of {k.questions} answered{k.skipped ? ` · ${k.skipped} skipped` : ''}
            {a.sent && <span className="text-sub"> · sent {fmtDate(a.sent)}</span>}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {send.k === 'confirm' ? (
              <>
                <Btn primary onClick={() => void sendAll()}>Confirm · send {k.answered + k.skipped === 1 ? 'it' : 'them'}</Btn>
                <Btn ghost onClick={() => setSend({ k: 'idle' })}>Cancel</Btn>
              </>
            ) : a.sent ? (
              <span className="text-[12.5px] text-sub duration-200 animate-in fade-in-0">Alma has your answers. A change here can be sent again.</span>
            ) : (
              <Btn primary disabled={send.k === 'busy' || (!k.answered && !k.skipped)} onClick={() => setSend({ k: 'confirm' })}>{send.k === 'busy' ? 'Sending…' : 'Send the answers to Alma'}</Btn>
            )}
          </span>
          {send.k === 'error' && <span role="alert" className="basis-full text-[12px] text-bad">{send.text}</span>}
        </div>
      ) : null}
    </>
  );
}
