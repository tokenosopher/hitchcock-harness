// Pick-ups by their folders : every FIX-<name>/ under generations/ or blocks/ (scenes.ts reads
// those, with their prompts and takes) and every previz/FIX-<name>/ (new previz and boards), with how far its files go.
// The board's Edit step says from these what is being made while a pick-up has not landed (components/lib/editWork.ts).
import type { PickupWork, QCEntry } from '../../types';
import type { PickupInfo, SceneRefX } from './scenes';
import { abs, exists, list, type FilmCtx } from '../util';

const FIX = /^FIX-.+$/;
/** "FIX-S2S3-reel" → S2, S3; "FIX-sword-S9" → S9. */
const scenesOfName = (name: string): string[] =>
  [...new Set(name.split('-').flatMap((part) => (/^(?:S\d+)+[a-z]?$/.test(part) ? [...part.matchAll(/S(\d+)/g)].map((m) => `S${m[1]}`) : [])))];

export async function readPickupWork(ctx: FilmCtx, scenes: SceneRefX[], unassigned: PickupInfo[], qc: Record<string, QCEntry> | undefined): Promise<PickupWork[]> {
  // the generations side: each pick-up joined to the scene it fixes, its prompts read
  const gen = new Map<string, { info: PickupInfo; scene?: SceneRefX }>();
  for (const sc of scenes) for (const p of sc.more.pickups) gen.set(p.name, { info: p, scene: sc });
  for (const p of unassigned) if (!gen.has(p.name)) gen.set(p.name, { info: p });
  const previzDirs = (await list(abs(ctx, 'previz'))).filter((e) => e.dir && FIX.test(e.name)).map((e) => e.name);
  const names = [...new Set([...gen.keys(), ...previzDirs])].sort();
  const out: PickupWork[] = [];
  for (const name of names) {
    const g = gen.get(name);
    const pv = previzDirs.includes(name) ? `previz/${name}` : undefined;
    const pvFiles = pv ? await list(abs(ctx, pv)) : [];
    const boards = pv ? (await list(abs(ctx, `${pv}/storyboard`))).filter((e) => e.dir && /^v\d+/.test(e.name)).length : 0;
    const takes = scenes.flatMap((sc) => sc.takes.filter((t) => t.kind === 'pickup' && t.id.startsWith(`${name} ·`)));
    const pvs = g?.info.promptVersions ?? [];
    const named = scenesOfName(name);
    const dropped = (pv && await exists(abs(ctx, `${pv}/dropped.txt`))) || (g && await exists(abs(ctx, `${g.info.folder}/dropped.txt`)));
    out.push({
      name,
      scenes: named.length ? named : g?.scene ? [g.scene.id] : [],
      previz: pvFiles.some((e) => /\.blend$/i.test(e.name) || (e.dir && e.name === 'built')),
      boards,
      checked: Object.values(qc ?? {}).some((q) => q.stage === 'previz' && q.target === name),
      prompts: pvs.length,
      ...(pvs.length && pvs[pvs.length - 1].checkPassed !== undefined ? { promptPassed: pvs[pvs.length - 1].checkPassed } : {}),
      landed: takes.filter((t) => !!t.path).length,
      generating: takes.filter((t) => !t.path && !t.stopped).length,
      stopped: takes.filter((t) => !t.path && !!t.stopped).length,
      ...(dropped ? { dropped: true } : {}),
    });
  }
  return out;
}
