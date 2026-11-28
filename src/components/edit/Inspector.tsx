'use client';
// The clip inspector, a 300px column right of the timeline: the clip, its source take, in / out /
// record-in as SMPTE, gain and fades, "replace with take" from the scene's takes, "open scene", the
// "to confirm" badge with its confirm action, and what changed on this clip: the history's steps that name it (since
// 15 Nov, stage 3b of "saving apart from history": an edit is a step, no longer a version with a note).
import Link from 'next/link';
import { useState } from 'react';
import type { FilmState, Timeline, TimelineClip, TimelineTrack } from '@/server/types';
import { repoPath, smpte, takeLabel, fmtDate } from '@/components/lib/format';
import { Btn } from '@/components/shell/atoms';
import { IconX } from '@/components/shell/icons';
import { cn } from '@/lib/utils';
import { clipName, lenF, partnerOf, pastEnd, pastShot, patchClip, shotFrames, replaceTake, retimeClips, speedOf, startF, superseded, toConfirm, toF, type ClipFrames, type ClipRef, type Edit } from './model';
import { setFade, setFadeLevel, setFlip, smoothChange } from './controls';
import { asFades, clipAfter, clipBefore, fmtLevel, levelAtEnd, levelAtStart, smoothOffer } from './fades';
import type { HistoryStep } from './history';
import { isLine } from './subs';
import { SpeedControl } from './SpeedControl';
import { retypeLine } from './subsEdit';

interface Props {
  tl: Timeline;
  sel?: ClipRef;
  state: FilmState;
  base: string;
  /** The history's steps up to the cut now, oldest first (useCut().history). */
  steps: HistoryStep[];
  readOnly?: boolean;
  srcSeconds: (src: string) => number | undefined;
  /** What a clip may use of its file (shots.ts clipFrames), for the note on a clip that shows another shot's frames. */
  framesOf?: (c: TimelineClip) => ClipFrames;
  onEdit: (e: Edit | undefined) => void;
  /** A speed tried in the Speed row, shown and heard on the timeline before it is kept (undefined: none). */
  onTrySpeed?: (ref: ClipRef, pct: number | undefined) => void;
  onClose: () => void;
  onAsk: () => void;
  onChip: () => void;
}

const Row = ({ k, children, mono = true }: { k: string; children: React.ReactNode; mono?: boolean }) => (
  <div className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline gap-2 py-[5px] text-[12.5px]">
    <span className="text-sub">{k}</span>
    <span className={cn('min-w-0 truncate text-right text-ink', mono && 'font-mono text-[12px]')}>{children}</span>
  </div>
);

/** A number field that writes a version when it loses focus or on Enter, only if the value changed. */
function NumField({ label, value, unit, step, min, max, disabled, onCommit }: { label: string; value: number; unit: string; step: number; min?: number; max?: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string>();
  const shown = text ?? String(value);
  const done = () => {
    if (text === undefined) return;
    const v = Number(text);
    setText(undefined);
    if (Number.isFinite(v) && v !== value) onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
  };
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 py-[3px] text-[12.5px]">
      <span className="text-sub">{label}</span>
      <span className="flex items-center justify-end gap-1.5">
        <input type="number" inputMode="decimal" aria-label={label} disabled={disabled} step={step} min={min} max={max} value={shown}
          onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setText(undefined); }}
          className="h-7 w-[72px] rounded-[6px] border border-edge bg-bg px-2 text-right font-mono text-[12px] text-ink outline-none focus:border-sub disabled:opacity-50" />
        <span className="w-[16px] font-mono text-[11px] text-mute">{unit}</span>
      </span>
    </label>
  );
}

/** A subtitle line's words (14 Nov): two rows at most; Enter saves (one version), Shift-Enter starts the second
 *  row, Escape puts back what is saved; leaving the field saves. */
/** Where a sound fade starts (in) or ends (out): silence, the level of the clip beside it at the
 *  split, or a level typed in. Writes on the choice, or when the typed level loses focus or on Enter. */
function LevelPick({ label, value, near, nearWord, disabled, onPick }: { label: string; value: number | undefined; near?: number; nearWord: string; disabled?: boolean; onPick: (db: number | undefined) => void }) {
  const mode = value === undefined ? 'silence' : near !== undefined && Math.abs(value - near) < 0.05 ? 'near' : 'level';
  const [typing, setTyping] = useState<string>();
  const [own, setOwn] = useState(false);
  const shown = own || mode === 'level';
  const done = () => {
    if (typing === undefined) return;
    const v = Number(typing);
    setTyping(undefined);
    if (typing.trim() !== '' && Number.isFinite(v) && v !== value) onPick(v);
  };
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 py-[3px] text-[12.5px]">
      <span className="text-sub">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <select aria-label={label} disabled={disabled} value={own ? 'level' : mode}
          onChange={(e) => { const m = e.target.value; setOwn(m === 'level'); if (m === 'silence') onPick(undefined); else if (m === 'near' && near !== undefined) onPick(near); }}
          className="h-7 min-w-0 max-w-[200px] truncate rounded-[6px] border border-edge bg-bg px-1.5 text-[12px] text-ink outline-none transition-colors duration-150 focus:border-sub disabled:opacity-50">
          <option value="silence">Silence</option>
          {near !== undefined && <option value="near">{nearWord} ({fmtLevel(near)})</option>}
          <option value="level">A level</option>
        </select>
        {shown && (
          <input type="number" inputMode="decimal" aria-label={`${label}, dB`} disabled={disabled} step={0.5} min={-96} max={24} value={typing ?? (value ?? '')}
            onChange={(e) => setTyping(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTyping(undefined); }}
            className="h-7 w-[60px] rounded-[6px] border border-edge bg-bg px-2 text-right font-mono text-[12px] text-ink outline-none duration-150 animate-in fade-in-0 focus:border-sub disabled:opacity-50" />
        )}
        <span className="w-[16px] font-mono text-[11px] text-mute">{shown ? 'dB' : ''}</span>
      </span>
    </label>
  );
}

function WordsField({ text, disabled, onCommit }: { text: string; disabled?: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState<string>();
  const shown = v ?? text;
  const done = () => { if (v === undefined) return; setV(undefined); if (v !== text) onCommit(v); };
  return (
    <label className="flex flex-col gap-1 py-[3px] text-[12.5px]">
      <span className="text-sub">Words</span>
      <textarea rows={2} aria-label="Words of the line" disabled={disabled} value={shown} spellCheck={false}
        onChange={(e) => setV(e.target.value.split('\n').slice(0, 2).join('\n'))} onBlur={done}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          else if (e.key === 'Enter' && shown.includes('\n')) e.preventDefault();
          else if (e.key === 'Escape') { e.preventDefault(); setV(undefined); }
        }}
        className="resize-none rounded-[6px] border border-edge bg-bg px-2 py-1.5 text-[12.5px] leading-[1.35] text-ink outline-none transition-colors duration-150 focus:border-sub disabled:opacity-50" />
      <span className="text-[11px] text-mute">Enter saves · ⇧Enter second row · Esc puts it back</span>
    </label>
  );
}

export function Inspector({ tl, sel, state, base, steps, readOnly, srcSeconds, framesOf, onEdit, onTrySpeed, onClose, onAsk, onChip }: Props) {
  const fps = tl.fps;
  const track: TimelineTrack | undefined = sel ? tl.tracks.find((t) => t.id === sel.trackId) : undefined;
  const clip: TimelineClip | undefined = track?.clips.find((c) => c.id === sel?.clipId);

  if (!sel || !track || !clip) {
    const clips = tl.tracks.reduce((n, t) => n + t.clips.length, 0);
    return (
      <div className="flex flex-col gap-3 p-4">
        <span className="lbl">Clip inspector</span>
        <p className="m-0 text-[13px] leading-normal text-sub">Click a clip to see its take, in and out, gain and fades. V1 and A1 of a block select together.</p>
        <p className="m-0 text-[12px] leading-normal text-mute">{tl.tracks.length} tracks · {clips} clips · {tl.markers.length} {tl.markers.length === 1 ? 'marker' : 'markers'}</p>
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[12px] leading-normal text-mute">
          <span>Space play · J K L shuttle · ← → frame</span>
          <span>I / O set in / out · B blade · ⌘B split</span>
          <span>⌫ delete · ⌘Z undo · ⇧⌘Z redo</span>
          <span>pinch, ⌘ or ⌥ + scroll zoom</span>
        </div>
      </div>
    );
  }

  const ref = sel;
  const partner = partnerOf(tl, ref);
  const s = startF(clip, fps), len = lenF(clip, fps);
  const scene = clip.takeRef ? state.scenes.find((x) => x.id === clip.takeRef!.scene) : undefined;
  const takes = (scene?.takes ?? []).filter((t) => t.path);
  const sup = superseded(clip);
  const name = clipName(clip);
  const locked = readOnly || !!track.locked;
  const recent = steps.filter((x) => x.words.includes(name)).slice(-4).reverse();
  const srcLen = srcSeconds((clip.src ?? ''));
  // a sound clip's fades as heard (Alma's head pair of level points is a fade, fades.ts), the levels of the clips
  // beside it at a split, and the offer to smooth the change from the clip before
  const fc = track.kind === 'audio' ? asFades(clip).clip : clip;
  const before = track.kind === 'audio' ? clipBefore(track, clip, fps) : undefined, after = track.kind === 'audio' ? clipAfter(track, clip, fps) : undefined;
  const nearIn = before ? levelAtEnd(before) : undefined, nearOut = after ? levelAtStart(after) : undefined;
  const smooth = track.kind === 'audio' ? smoothOffer(tl, track.id, clip) : undefined;

  const replace = (takeId: string) => {
    const t = takes.find((x) => x.id === takeId);
    if (!t?.path || !scene) return;
    const src = repoPath(state.film.folder, state.film.repo, t.path);
    onEdit(replaceTake(tl, ref, src, { scene: scene.id, take: t.id }, `${scene.id} · ${takeLabel(t.id)}`, t.seconds));
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <span className="lbl">Clip inspector</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-mute">{track.id}{partner ? ` + ${partner.trackId}` : ''} · {track.name}</span>
          <button type="button" aria-label="Close the inspector" onClick={onClose} className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] text-sub hover:text-ink"><IconX size={11} /></button>
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={cn('m-0 text-[16px] font-semibold tracking-[-0.01em]', sup && 'text-mute')}>{name}</h2>
          {toConfirm(clip) && <span className="inline-flex h-5 items-center rounded-[10px] border border-dashed border-warn px-[7px] text-[11px] font-medium text-warn">to confirm</span>}
          {speedOf(clip) !== 1 && <span title="TimelineClip.speed" className="inline-flex h-5 items-center rounded-[10px] border border-edge-strong px-[7px] font-mono text-[11px] text-ink-3">{Math.round(speedOf(clip) * 100)}%</span>}
        </div>
        {sup && <p className="m-0 text-[12px] text-mute">{sup}</p>}
        {toConfirm(clip) && (
          <div className="flex items-center justify-between gap-2 rounded-[7px] border border-dashed border-edge-strong px-2.5 py-2 text-[12px] text-sub">
            <span>The record does not settle this placement.</span>
            <Btn className="h-7 px-2.5 text-[12px]" disabled={locked} onClick={() => onEdit(patchClip(tl, ref, { label: (clip.label ?? '').replace(/\s*\(to confirm\)\s*/i, '').trim() }, `confirmed ${name}`, true))}>Confirm</Btn>
          </div>
        )}
      </div>
      {isLine(clip) ? (
      <div className="flex flex-col border-b border-line px-4 py-2.5">
        <WordsField key={`w-${clip.id}-${clip.text}`} text={clip.text ?? ''} disabled={locked} onCommit={(v) => onEdit(retypeLine(tl, ref, v))} />
        <Row k="Length"><span title={`${(len / fps).toFixed(2)} s`}>{len} f · {smpte(len / fps, fps)}</span></Row>
        <Row k="Record in"><span title={`${(s / fps).toFixed(2)} s`}>{smpte(s / fps, fps)}</span></Row>
        <Row k="Record out"><span>{smpte((s + len) / fps, fps)}</span></Row>
      </div>
      ) : (
      <div className="flex flex-col border-b border-line px-4 py-2.5">
        <Row k="Source" mono={false}><span className="font-mono text-[12px]" title={clip.src}>{clip.takeRef ? `${clip.takeRef.scene} · ${takeLabel(clip.takeRef.take)}` : (clip.src ?? '').split('/').pop()}</span></Row>
        <Row k="Source in"><span title={`${clip.in.toFixed(3)} s`}>{smpte(clip.in, fps)}</span></Row>
        <Row k="Source out"><span title={`${clip.out.toFixed(3)} s`}>{smpte(clip.out, fps)}</span></Row>
        <Row k="Length"><span title={`${(len / fps).toFixed(2)} s`}>{len} f · {smpte(len / fps, fps)}</span></Row>
        <Row k="Record in"><span title={`${(s / fps).toFixed(2)} s`}>{smpte(s / fps, fps)}</span></Row>
        {srcLen !== undefined && <Row k="Source length"><span title={`${srcLen.toFixed(2)} s`}>{toF(srcLen, fps)} f</span></Row>}
        {pastEnd(clip, srcLen, fps) > 0 && <p className="m-0 pt-1 text-[12px] leading-normal text-warn">Runs {pastEnd(clip, srcLen, fps)} f past the end of its file: that part has no picture or sound of its own. Drag the clip&apos;s end in to fix it.</p>}
        {(() => {
          // a shot extended past its own frames before trims stopped there: what it shows of the shot beside
          const fr = framesOf?.(clip), sh = shotFrames(fr), ps = pastShot(clip, fr, fps);
          if (!sh || (!ps.head && !ps.tail)) return null;
          return <p data-past-shot-note="" className="m-0 pt-1 text-[12px] leading-normal text-warn">
            {ps.head ? `Starts ${ps.head} f before shot ${sh.first}'s own frames: those frames are the shot before's. Drag the clip's start in to fix it. ` : ''}
            {ps.tail ? `Runs ${ps.tail} f past shot ${sh.last}'s own frames: those frames are the next shot's. Drag the clip's end in to fix it.` : ''}
          </p>;
        })()}
        <p className="m-0 truncate pt-1 font-mono text-[10.5px] text-mute" title={clip.src}>{clip.src}</p>
      </div>
      )}
      <div className="flex flex-col border-b border-line px-4 py-2.5">
        {track.kind !== 'captions' && (
          // the same control as the clip menu's Speed panel: tried at once, kept when it rests, on Enter or
          // when the row is left; Esc puts it back
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-2 py-[4px] text-[12.5px]">
            <span className="pt-[7px] text-sub">Speed</span>
            <SpeedControl key={`sp-${clip.id}-${speedOf(clip)}`} mode="row" pct={Math.round(speedOf(clip) * 100)} srcs={[clip.out - clip.in]} nowF={len} fps={fps} disabled={locked}
              onChange={(p) => onTrySpeed?.(ref, p)} onCommit={(p) => onEdit(retimeClips(tl, [ref], p / 100))} onCancel={() => onTrySpeed?.(ref, undefined)} />
          </div>
        )}
 {!isLine(clip) && <NumField key={`g-${clip.id}-${clip.gain ?? 0}`} label="Gain" unit="dB" step={0.5} min={-60} max={12} value={clip.gain ?? 0} disabled={locked}
          onCommit={(v) => onEdit(patchClip(tl, ref, { gain: v }, `${track.id} ${name} gain ${clip.gain ?? 0} → ${v} dB`))} />}
        {/* each fade on its own clip (13 Nov): the picture's fades the picture from and to black, the sound's the sound */}
        {track.kind !== 'captions' && (
          <>
            <NumField key={`fi-${clip.id}-${fc.fadeIn ?? 0}`} label={`${track.kind === 'video' ? 'Picture' : 'Sound'} fade in`} unit="f" step={1} min={0} max={len} value={toF(fc.fadeIn ?? 0, fps)} disabled={locked}
              onCommit={(v) => onEdit(setFade(tl, ref, 'fadeIn', Math.round((v / fps) * 1e6) / 1e6))} />
            {track.kind === 'audio' && (
              <LevelPick key={`fif-${clip.id}-${fc.fadeInFrom ?? 's'}`} label="Fades in from" value={(fc.fadeIn ?? 0) > 0 ? fc.fadeInFrom : undefined} near={nearIn} nearWord="The clip before" disabled={locked}
                onPick={(db) => onEdit(setFadeLevel(tl, ref, 'fadeIn', db))} />
            )}
            <NumField key={`fo-${clip.id}-${fc.fadeOut ?? 0}`} label={`${track.kind === 'video' ? 'Picture' : 'Sound'} fade out`} unit="f" step={1} min={0} max={len} value={toF(fc.fadeOut ?? 0, fps)} disabled={locked}
              onCommit={(v) => onEdit(setFade(tl, ref, 'fadeOut', Math.round((v / fps) * 1e6) / 1e6))} />
            {track.kind === 'audio' && (
              <LevelPick key={`fot-${clip.id}-${fc.fadeOutTo ?? 's'}`} label="Fades out to" value={(fc.fadeOut ?? 0) > 0 ? fc.fadeOutTo : undefined} near={nearOut} nearWord="The clip after" disabled={locked}
                onPick={(db) => onEdit(setFadeLevel(tl, ref, 'fadeOut', db))} />
            )}
            {smooth && !locked && (
              <div data-smooth="" className="flex items-center justify-between gap-2 py-[5px] text-[12px] text-sub duration-200 animate-in fade-in-0">
                <span className="min-w-0">Jumps from {fmtLevel(smooth.from)} at the split</span>
                <Btn className="h-7 shrink-0 px-2.5 text-[12px]" title={`Fade in from ${fmtLevel(smooth.from)} over ${(smooth.len).toFixed(1)} s, so the level rises (or falls) smoothly from the clip before`}
                  onClick={() => onEdit(smoothChange(tl, ref))}>Smooth the change</Btn>
              </div>
            )}
          </>
        )}
        {track.kind === 'video' && (
          <label className="flex items-center justify-between py-[5px] text-[12.5px]" title="The picture shown mirrored left to right, in the player, the 480p and the master; its sound stays as it is">
            <span className="text-sub">Mirrored</span>
            <input type="checkbox" aria-label="Mirrored left to right" checked={!!clip.flip} disabled={locked} onChange={() => onEdit(setFlip(tl, ref, !clip.flip))} className="accent-[#FAFAFA]" />
          </label>
        )}
        {track.kind === 'audio' && (
          <Row k="Level points" mono={false}><span className="text-[12px] text-ink-3">{fc.gainPoints?.length ? `${fc.gainPoints.length} · drag them on the level line` : '⌥-click the level line to add'}</span></Row>
        )}
        <label className="flex items-center justify-between py-[5px] text-[12.5px]">
          <span className="text-sub">Clip muted</span>
          <input type="checkbox" checked={!!clip.muted} disabled={locked} onChange={() => onEdit(patchClip(tl, ref, { muted: clip.muted ? undefined : true }, `${clip.muted ? 'unmuted' : 'muted'} ${name}`))} className="accent-[#FAFAFA]" />
        </label>
      </div>
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        {takes.length > 1 && (
          <label className="flex flex-col gap-1 text-[12px] text-sub">
            Replace with take
            <select disabled={locked} value={clip.takeRef?.take ?? ''} onChange={(e) => replace(e.target.value)} aria-label="Replace with take"
              className="h-8 rounded-lg border border-edge-strong bg-bg px-2 text-[13px] text-ink outline-none focus:border-sub disabled:opacity-50">
              {takes.map((t) => <option key={t.id} value={t.id}>{takeLabel(t.id)}{t.seconds ? ` · ${t.seconds} s` : ''}{t.kind === 'pickup' ? ' · pick-up' : ''}</option>)}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {scene && <Link href={`${base}/scenes/${scene.id}`} className="inline-flex h-8 items-center rounded-lg border border-edge-strong px-3 text-[13px] font-medium text-ink no-underline hover:bg-raised">Open {scene.id}</Link>}
          <Btn onClick={onAsk}>Ask Alma</Btn>
          <button type="button" onClick={onChip} className="cursor-pointer text-[13px] text-sub hover:text-ink">Add to Alma sees</button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <span className="lbl">Recent on this clip</span>
        {recent.length ? recent.map((x) => (
          <div key={x.rev} data-clip-step className="flex gap-2 text-[12px] leading-[1.45]">
            {(x.saved ?? x.version) && <span className="font-mono text-mute">{x.saved ?? x.version}</span>}
            <span className="min-w-0 text-ink-3">{x.words}<span className="text-mute"> · {x.by === 'alma' ? 'Alma' : 'you'} · {fmtDate(x.at)}</span></span>
          </div>
        )) : <span className="text-[12px] text-mute">No step names this clip yet.</span>}
      </div>
    </div>
  );
}
