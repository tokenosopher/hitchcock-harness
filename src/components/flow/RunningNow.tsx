'use client';
// "Running now": the live sub-agents on a step, one line each. Under the flow for a step shown there (NodePage), and at
// the top of the pages a step on the flow opens at once (Story, Scenes, Finish, Sound, Release), where it moved from
// the summary that used to show under the flow. Nothing when nothing runs.
import { useMemo } from 'react';
import { useFilm } from '@/components/data/film';
import { useThread } from '@/components/data/thread';
import { flowOf } from '@/components/lib/flow';
import type { FlowKey, TaskAim } from '@/components/lib/derive';
import { Dot } from '@/components/shell/atoms';
import { Reveal } from '@/components/shell/Reveal';

export function RunningLines({ aims }: { aims: TaskAim[] }) {
  const live = aims.filter((a) => a.task.state === 'running' || a.task.state === 'queued')
    .filter((a, i, all) => all.findIndex((b) => b.task.id === a.task.id) === i);
  return (
    <Reveal open={live.length > 0} className="min-w-0">
      <div data-running-now className="flex flex-col gap-1.5">
        <span className="lbl">Running now</span>
        {live.map((a) => (
          <span key={a.task.id} className="flex min-w-0 items-center gap-2 text-[13px] duration-200 animate-in fade-in-0"><Dot state={a.task.state === 'queued' ? 'queued' : 'running'} />{a.task.title}{a.task.liveLine && <span className="truncate text-sub">· {a.task.liveLine}</span>}</span>
        ))}
      </div>
    </Reveal>
  );
}

/** At the top of a step's own page: what runs on that step, from the same flow the board reads. */
export function StepRunning({ step }: { step: FlowKey }) {
  const { state } = useFilm();
  const { tasks } = useThread();
  const aims = useMemo(() => (state ? flowOf(state, tasks).nodes[step].aims : []), [state, tasks, step]);
  return <RunningLines aims={aims} />;
}
