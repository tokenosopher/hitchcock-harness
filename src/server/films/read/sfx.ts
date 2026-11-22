// The sound designer's pick card (Flow v3.3 - 11 Sound and music, steps 31 to 34). A card in
// review/cards.json names the sounds it asks about ("sfx": ["surf-bed", {"sound": "gull-cry", "prediction": 2}]);
// the harness reads, for each, where it sits on the cut (audio/sfx/plan.json, else the effect sfx.py kept in the
// sound's prompts.json) and its tries (prompts.json "tries", else the older shape: "prompts" and the
// <name>-try<N>.wav files beside it). The pick itself is sfx.py's (src/server/actions/pick.ts, kind "sfx").
// soundsOf is pure (scripts/soundpick-test.ts); readSounds does the reading.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FeedSound } from '../../types';

/** What a card says of one sound: its folder name and, optionally, Alma's prediction (a try number). */
export interface SfxRef { name: string; prediction?: number }

interface PlanPoint { tc?: unknown; frame?: unknown }
interface PlanEffect {
  id?: unknown; name?: unknown; file?: unknown; kind?: unknown; what?: unknown; reason?: unknown;
  start?: PlanPoint; end?: PlanPoint; seconds?: unknown; level_db?: unknown; fade_in_frames?: unknown; fade_out_frames?: unknown;
}
export interface SfxPlan { fps?: unknown; scenes?: { scene?: unknown; frames?: unknown }[]; effects?: PlanEffect[] }
export interface SfxPrompts {
  prompts?: unknown[];
  tries?: { try?: unknown; file?: unknown; prompt?: unknown; style?: unknown; seconds?: unknown; lufs?: unknown }[];
  effect?: PlanEffect;
  picked?: { try?: unknown; date?: unknown; note?: unknown };
}
export interface SfxFolder { prompts?: SfxPrompts; files: string[] }

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
/** sfx.py's slug: lower case, every run of other characters one hyphen. */
export const sfxSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The folder name sfx.py gives a plan's effect (its effect_name): "name", else the last part of "file", else
 *  "<id>-<kind>". */
export function effectName(e: PlanEffect): string {
  if (str(e.name)) return sfxSlug(str(e.name)!);
  if (str(e.file)) return sfxSlug(str(e.file)!.split('/').pop()!);
  return sfxSlug(`${str(e.id) ?? 'fx'}-${str(e.kind) ?? 'sound'}`);
}

/** The card's "sfx" list read loosely: names, or {sound|name, prediction}. Unknown shapes are left out. */
export function sfxRefs(v: unknown): SfxRef[] {
  if (!Array.isArray(v)) return [];
  const out: SfxRef[] = [];
  for (const x of v) {
    const o = typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? (x as Record<string, unknown>) : undefined;
    const name = o ? str(o.name) ?? str((o as Record<string, unknown>).sound) : undefined;
    if (!name || out.some((r) => r.name === sfxSlug(name))) continue;
    const p = o ? Number((o as Record<string, unknown>).prediction) : NaN;
    out.push({ name: sfxSlug(name), ...(Number.isInteger(p) && p > 0 ? { prediction: p } : {}) });
  }
  return out;
}

/** Every sound of a card, with its place on the cut and its tries, in the card's order. Pure. */
export function soundsOf(refs: SfxRef[], plan: SfxPlan | undefined, folders: Record<string, SfxFolder | undefined>): FeedSound[] {
  const effects = Array.isArray(plan?.effects) ? plan!.effects : [];
  const scenes = (Array.isArray(plan?.scenes) ? plan!.scenes : []).flatMap((s) => {
    const f = Array.isArray(s.frames) ? s.frames.map(Number) : [];
    return str(s.scene) && f.length === 2 && f.every(Number.isFinite) ? [{ scene: str(s.scene)!, from: f[0], to: f[1] }] : [];
  });
  const filmFrames = scenes.length ? Math.max(...scenes.map((s) => s.to)) : undefined;
  const fps = num(plan?.fps);
  return refs.map((r) => {
    const folder = folders[r.name];
    const pj = folder?.prompts;
    const e = effects.find((x) => effectName(x) === r.name) ?? pj?.effect;
    const startFrame = num(e?.start?.frame);
    const effect: FeedSound['effect'] = e ? {
      id: str(e.id), kind: str(e.kind), what: str(e.what), reason: str(e.reason),
      startTc: str(e.start?.tc), endTc: str(e.end?.tc), startFrame, endFrame: num(e.end?.frame), seconds: num(e.seconds),
      levelDb: num(e.level_db), fadeIn: num(e.fade_in_frames), fadeOut: num(e.fade_out_frames),
    } : undefined;
    const scene = startFrame !== undefined ? scenes.find((s) => startFrame >= s.from && startFrame < s.to)?.scene : undefined;
    // the tries: prompts.json "tries" first; then the older "prompts" with the <name>-try<N>.wav files
    const tries = new Map<number, FeedSound['tries'][number]>();
    for (const t of Array.isArray(pj?.tries) ? pj!.tries : []) {
      const n = num(t.try);
      if (!n) continue;
      tries.set(n, { n, file: str(t.file), style: str(t.style), prompt: str(t.prompt), seconds: num(t.seconds), lufs: num(t.lufs) });
    }
    const prompts = Array.isArray(pj?.prompts) ? pj!.prompts : [];
    prompts.forEach((p, i) => { if (!tries.has(i + 1) && str(p)) tries.set(i + 1, { n: i + 1, prompt: str(p) }); });
    for (const f of folder?.files ?? []) {
      const m = /try(\d+)(?:-[^/]*)?\.(wav|mp3)$/i.exec(f);
      if (!m) continue;
      const n = Number(m[1]);
      const had = tries.get(n);
      if (!had) tries.set(n, { n, file: f });
      else if (!had.file) had.file = f;
    }
    const pk = pj?.picked;
    const pn = num(pk?.try);
    return {
      name: r.name,
      ...(effect ? { effect } : {}),
      ...(scene ? { scene } : {}),
      ...(filmFrames ? { filmFrames } : {}),
      ...(fps ? { fps } : {}),
      tries: [...tries.values()].sort((a, b) => a.n - b.n),
      ...(r.prediction ? { prediction: r.prediction } : {}),
      ...(pn ? { picked: { n: pn, note: str(pk?.note), date: str(pk?.date) } } : {}),
    };
  });
}

/** Reads what soundsOf needs from the film folder: the plan and each sound's folder. A missing file is no error. */
export async function readSounds(filmDir: string, refs: SfxRef[]): Promise<FeedSound[]> {
  const json = async <T>(p: string): Promise<T | undefined> => {
    try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; } catch { return undefined; }
  };
  const sfx = path.join(filmDir, 'audio', 'sfx');
  const plan = await json<SfxPlan>(path.join(sfx, 'plan.json'));
  const folders: Record<string, SfxFolder> = {};
  for (const r of refs) {
    const d = path.join(sfx, r.name);
    const names = await fs.readdir(d).catch(() => [] as string[]);
    folders[r.name] = {
      prompts: await json<SfxPrompts>(path.join(d, 'prompts.json')),
      files: names.filter((n) => /\.(wav|mp3)$/i.test(n)).map((n) => `audio/sfx/${r.name}/${n}`),
    };
  }
  return soundsOf(refs, plan, folders);
}

/** The answers store keeps one entry per sound of a card: "<card key>#sfx:<name>". */
export const soundAnswerKey = (card: string, name: string): string => `${card}#sfx:${name}`;

/** The command the pick runs (Flow v3.3 - 11, step 34), as arguments after the script. Pure. */
export function sfxPickArgs(filmDir: string, name: string, n: number, note?: string, predicted?: number): string[] {
  return [filmDir, name, '--pick', String(n), ...(note ? ['--note', note] : []), ...(predicted ? ['--predicted', String(predicted)] : [])];
}
