// What a scene is doing right now, in plain words, for the Scenes overview (13 Nov 2026): the one status a
// scene shows, the take that stands for it, and the takes still on their way.
import type { CutInfo, SceneRef, TakeRef, TaskCard } from '@/server/types';
import { cutTakeIds, liveAims } from './derive';
import { outsideCutClips, posterTake } from './cut';
import { takeLabel } from './format';

export type SceneTone = 'ok' | 'part' | 'warn' | 'bad' | 'run' | 'idle';
export interface SceneNow {
  tone: SceneTone;
  label: string;           // "Needs a redo", "Take 2 is rendering", "Take holds"
  line?: string;           // the reason or the detail, one sentence
  best?: TakeRef;          // the take that stands for the scene: the one in the cut, else the best checked, else the newest
  inCut: string[];
  cut?: boolean;           // the take shown is in the current cut
  /** The cut uses clips that are none of the scene's takes (test takes): their files, the first one shown large. */
  outside?: string[];
}

const rank = (t: TakeRef): number => (t.verdict === 'good' ? 3 : t.verdict === 'usable' ? 2 : t.verdict === 'redo' ? 0 : 1);
const lower = (s?: string): string => (s ? s[0].toLowerCase() + s.slice(1) : '');

export function sceneNow(sc: SceneRef, cut: CutInfo | undefined, tasks: TaskCard[], delivered: boolean): SceneNow {
  const takes = sc.takes;
  const landed = takes.filter((t) => t.path);
  const running = takes.filter((t) => !t.path && !t.stopped);
  const stopped = takes.filter((t) => !t.path && t.stopped);
  const inCut = cutTakeIds(sc, cut);
  // newest first, then the best verdict wins; the cut's own take wins over both
  const byWorth = [...landed].reverse().sort((a, b) => rank(b) - rank(a));
  const best = (inCut.length ? posterTake(sc, cut) : undefined) ?? byWorth[0];
  const so = best ? `${takeLabel(best.id)} so far` : undefined;
  // The cut may use a clip that is none of the scene's takes: a test take that came out better. Then that clip
  // stands for the scene, whatever its own takes' checks say.
  const outside = outsideCutClips(sc, cut);
  if (outside.length && !delivered) {
    const names = [...new Set(outside.map((c) => (c.takeRef?.take ?? c.label ?? 'a test take').replace(new RegExp(`^${sc.id}\\s*·\\s*`), '').replace(/\s*·\s*(whole|shots?\s[\d\s,to-]+|to confirm)$/i, '')))];
    const own = best ? ` Its own ${takeLabel(best.id).toLowerCase()} ${best.verdict === 'redo' ? 'needs a redo' : best.verdict === 'good' ? 'holds' : best.verdict === 'usable' ? 'is usable' : 'is not checked'}.` : '';
    return { best: undefined, inCut, outside: [...new Set(outside.flatMap((c) => (c.src ? [c.src] : [])))], tone: 'ok', label: 'In the cut', line: `The cut uses ${names.length === 1 ? 'a test take' : `${names.length} test takes`}: ${names.slice(0, 3).join(', ')}.${own}` };
  }
  const base = { best, inCut };
  if (delivered) return { ...base, tone: 'ok', label: 'In the film', line: inCut.length > 1 ? `Made of ${inCut.filter((i) => !i.startsWith('FIX-')).map(takeLabel).join(' and ').toLowerCase() || 'its takes'}${inCut.some((i) => i.startsWith('FIX-')) ? ` with ${inCut.filter((i) => i.startsWith('FIX-')).length === 1 ? 'one pick-up' : `${inCut.filter((i) => i.startsWith('FIX-')).length} pick-ups`}` : ''}` : undefined };
  if (running.length) return { ...base, tone: 'run', label: `${takeLabel(running[0].id)} is rendering`, line: so ? `${so}${best?.finding ? `: ${lower(best.finding)}` : ''}` : 'The first clip of this scene' };
  const aims = liveAims(tasks, 'scenes', sc.id);
  if (aims.length) return { ...base, tone: 'run', label: 'Alma is working on it', line: aims.map((a) => a.job).join(', ') };
  if (best) {
    // the ringed tile says which take this is; the line says only why
    const b = { ...base, cut: inCut.includes(best.id), line: best.finding };
    // "…shot 1 can be kept", "…kept as parts": the take is not lost, part of it is redone
    const partly = /can be kept|as parts|(first|second) half/i.test(best.finding ?? '');
    // "For its second half; shot 1 can be kept" reads as what to do: "Redo its second half; shot 1 can be kept"
    if (best.verdict === 'redo') return partly ? { ...b, tone: 'part', label: 'Redo in part', line: best.finding?.replace(/^For\s+/, 'Redo ') } : { ...b, tone: 'warn', label: 'Needs a redo' };
    if (best.verdict === 'good') return { ...b, tone: 'ok', label: 'Holds' };
    if (best.verdict === 'usable') return { ...b, tone: 'ok', label: 'Usable' };
    return { ...b, tone: 'idle', label: 'Landed, not checked yet' };
  }
  if (stopped.length) {
    const last = stopped[stopped.length - 1];
    const how = stopped.every((t) => t.stopped === 'blocked') ? 'blocked' : stopped.every((t) => t.stopped === 'failed') ? 'failed' : 'blocked or failed';
    return { ...base, tone: 'bad', label: stopped.length === 1 ? `${takeLabel(last.id)} ${last.stopped}` : `${stopped.length} takes ${how}`, line: last.stoppedWhy ? `No clip yet. Last: ${lower(last.stoppedWhy)}` : 'No clip yet' };
  }
  const v = sc.promptVersions[sc.promptVersions.length - 1];
  if (!v) return { ...base, tone: 'idle', label: 'Not started', line: sc.sceneFile ? 'The shot list is written; no prompt yet' : 'No prompt yet' };
  if (v.checkPassed === false) return { ...base, tone: 'warn', label: 'Prompt check failed', line: `prompt ${v.version}` };
  if (v.checkPassed) return { ...base, tone: 'idle', label: 'Ready for the go', line: `prompt ${v.version} passed its check; no take yet` };
  return { ...base, tone: 'idle', label: 'Prompt being written', line: `prompt ${v.version}, not checked yet` };
}

// a partial redo is the same amber as a full one, hollow or striped: less of it, not dimmer
export const TONE_DOT: Record<SceneTone, string> = { ok: 'bg-ok', part: 'box-border border-[1.5px] border-warn bg-transparent', warn: 'bg-warn', bad: 'bg-bad', run: 'bg-ink animate-pulse', idle: 'bg-mute' };
export const TONE_BAR: Record<SceneTone, string> = { ok: 'bg-ok', part: 'bg-[repeating-linear-gradient(90deg,var(--color-warn)_0_7px,transparent_7px_11px)]', warn: 'bg-warn', bad: 'bg-bad', run: 'bg-ink animate-pulse', idle: 'bg-edge-strong' };
/** The status as a chip: a tinted ground and the tone's own colour for the words. */
export const TONE_CHIP: Record<SceneTone, string> = {
  ok: 'bg-ok/12 text-ok', part: 'border border-warn/40 text-warn', warn: 'bg-warn/15 text-warn', bad: 'bg-bad/15 text-bad', run: 'bg-ink/10 text-ink', idle: 'bg-raised text-sub',
};
