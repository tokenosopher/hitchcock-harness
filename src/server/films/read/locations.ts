// locations/<LID>-<name>/ and props/<PID>-<name>/ → LocationRef[]: style rounds, the master,
// the empty views (newest version per camera), and the props.
import type { LocationRef, Round } from '../../types';
import type { TastePickX } from './taste';
import { abs, IMAGE_RE, isoDay, list, natCmp, statOf, titleCase, type FilmCtx } from '../util';

export interface LocationExtra {
  picks: { file: string; candidateId: string }[];    // "L01-shore-pick-u5b-2.png" → u5b-2 (the contract's Round has no pick)
  masterVersions: string[];                           // every master image, oldest first
  top?: string;                                       // the plan from above
  lighting?: string;                                  // the lighting description in force
}
export type LocationRefX = LocationRef & { more: LocationExtra };

const LOC_DIR = /^(L\d+)-(.+)$/;
const PROP_DIR = /^(P\d+)-(.+)$/;
const SKIP_ROUNDS = /^(views|refs?|light-tests|master.*)$/i;

/** "L01-shore-steps-v3.png" → { camera: "steps", v: 3 }. */
function viewOf(file: string, prefix: string): { camera: string; v: number } {
  let base = file.replace(/\.[^.]+$/, '');
  for (const p of [`${prefix}-`]) if (base.startsWith(p)) base = base.slice(p.length);
  base = base.replace(/^L\d+-/, '');
  const m = /^(.*?)-v(\d+)[a-z]?$/.exec(base);
  return m ? { camera: m[1], v: Number(m[2]) } : { camera: base, v: 0 };
}

async function imagesUnder(ctx: FilmCtx, rel: string, depth = 1): Promise<string[]> {
  const out: string[] = [];
  for (const e of await list(abs(ctx, rel))) {
    if (e.dir && depth > 0 && !/^refs?$/.test(e.name)) out.push(...(await imagesUnder(ctx, `${rel}/${e.name}`, depth - 1)));
    else if (!e.dir && IMAGE_RE.test(e.name)) out.push(`${rel}/${e.name}`);
  }
  return out;
}

export async function readLocations(
  ctx: FilmCtx,
  names: Map<string, string>,
  sceneLocations: Map<string, string>,
  propScenes: Map<string, Set<string>>,
  sceneLoc: Map<string, string>,
  taste: TastePickX[],
): Promise<LocationRefX[]> {
  const out: LocationRefX[] = [];
  for (const d of (await list(abs(ctx, 'locations'))).filter((e) => e.dir && LOC_DIR.test(e.name))) {
    const [, lid, slug] = LOC_DIR.exec(d.name)!;
    const folder = `locations/${d.name}`;
    const entries = await list(abs(ctx, folder));
    const styleImages: Round[] = [];
    for (const e of entries.filter((x) => x.dir && !SKIP_ROUNDS.test(x.name))) {
      const imgs = (await list(abs(ctx, `${folder}/${e.name}`))).filter((f) => !f.dir && IMAGE_RE.test(f.name));
      if (!imgs.length) continue;
      const st = await statOf(abs(ctx, `${folder}/${e.name}/${imgs[0].name}`));
      styleImages.push({
        id: e.name,
        date: st ? isoDay(st.mtime) : undefined,
        candidates: imgs.map((f) => ({ id: f.name.replace(/\.[^.]+$/, '').replace(new RegExp(`^${lid}(-${slug})?-`), ''), path: `${folder}/${e.name}/${f.name}` })),
      });
    }
    // picks at the root: "<L>-<slug>-pick-<candidate>.png"
    const picks = entries
      .filter((e) => !e.dir && /-pick-/.test(e.name))
      .map((e) => ({ file: `${folder}/${e.name}`, candidateId: e.name.replace(/\.[^.]+$/, '').replace(/^.*-pick-/, '') }));
    for (const p of picks) {
      const r = styleImages.find((x) => x.candidates.some((c) => c.id === p.candidateId));
      if (!r) ctx.warn.add(p.file, `the pick ${p.candidateId} is in no round folder`);
    }
    // predictions from taste.md rows that name this location ("L01 the shore, round 2")
    for (const row of taste.filter((t) => new RegExp(`^${lid}\\b`).test(t.what))) {
      const ids = new Set(styleImages.flatMap((r) => r.candidates.map((c) => c.id)));
      const predicted = (row.prediction ?? '').split(/[ ,]+/).map((w) => w.replace(/[^\w-]/g, '')).find((w) => ids.has(w));
      const r = predicted ? styleImages.find((x) => x.candidates.some((c) => c.id === predicted)) : undefined;
      if (r && !r.prediction) r.prediction = predicted;
    }

    const all = await imagesUnder(ctx, folder, 1);
    const masters = all.filter((p) => /master/i.test(p.split('/').pop()!) && !/staging/i.test(p)).sort(natCmp);
    const rootMaster = entries.find((e) => !e.dir && /-master\.(png|jpe?g)$/i.test(e.name));
    const masterPath = rootMaster ? `${folder}/${rootMaster.name}` : masters[masters.length - 1];
    const approvedInTaste = taste.some((t) => new RegExp(`^${lid}\\b.*master`, 'i').test(t.what) && /approved|yes|correct/i.test(t.pick));
    const top = all.filter((p) => /-top(-v\d+)?\.(png|jpe?g)$/i.test(p)).sort(natCmp).pop();

    // the views: newest version per camera
    const views: { camera: string; path: string }[] = [];
    const viewDirs = entries.filter((e) => e.dir && e.name === 'views').map((e) => `${folder}/${e.name}`);
    const best = new Map<string, { v: number; path: string }>();
    for (const vd of viewDirs)
      for (const f of (await list(abs(ctx, vd))).filter((x) => !x.dir && IMAGE_RE.test(x.name))) {
        const { camera, v } = viewOf(f.name, `${lid}-${slug}`);
        const cur = best.get(camera);
        if (!cur || v > cur.v) best.set(camera, { v, path: `${vd}/${f.name}` });
      }
    // no views/ folder: the versioned images at the root that are not a master, plan, staging or pick
    if (!viewDirs.length)
      for (const f of entries.filter((x) => !x.dir && IMAGE_RE.test(x.name) && /-v\d+[a-z]?\.\w+$/.test(x.name) && !/master|top|staging|pick/i.test(x.name))) {
        const { camera, v } = viewOf(f.name, `${lid}-${slug}`);
        const cur = best.get(camera);
        if (!cur || v > cur.v) best.set(camera, { v, path: `${folder}/${f.name}` });
      }
    for (const [camera, b] of [...best].sort((a, b) => natCmp(a[0], b[0]))) views.push({ camera, path: b.path });

    const lighting = entries.find((e) => !e.dir && /-lighting\.md$/.test(e.name));
    out.push({
      id: lid,
      name: sceneLocations.get(lid) ?? names.get(lid) ?? titleCase(slug),
      folder,
      styleImages: styleImages.length ? styleImages : undefined,
      master: masterPath ? { path: masterPath, picked: !!rootMaster || approvedInTaste } : undefined,
      views: views.length ? views : undefined,
      props: [],
      more: { picks, masterVersions: masters, top, lighting: lighting ? `${folder}/${lighting.name}` : undefined },
    });
  }

  // props: on the location of the scenes that name them; the first location when no scene does
  for (const d of (await list(abs(ctx, 'props'))).filter((e) => e.dir && PROP_DIR.test(e.name))) {
    const [, pid, slug] = PROP_DIR.exec(d.name)!;
    const folder = `props/${d.name}`;
    const entries = await list(abs(ctx, folder));
    const files = entries.filter((f) => !f.dir && IMAGE_RE.test(f.name)).map((f) => f.name);
    const pick = files.find((f) => /^pick\.(png|jpe?g)$/i.test(f)) ?? files.sort(natCmp).pop();
    // the rounds: one folder each (props/P01-bottle/r1, r2-extract …), made on its own or cut out of a place
    const rounds: Round[] = [];
    const sizes = new Map<string, number>(); // candidate path → bytes, to find which one pick.png copies
    for (const e of entries.filter((x) => x.dir && !SKIP_ROUNDS.test(x.name)).sort((a, b) => natCmp(a.name, b.name))) {
      const imgs = (await list(abs(ctx, `${folder}/${e.name}`))).filter((f) => !f.dir && IMAGE_RE.test(f.name));
      if (!imgs.length) continue;
      const candidates: Round['candidates'] = [];
      let date: string | undefined;
      for (const f of imgs) {
        const rel = `${folder}/${e.name}/${f.name}`;
        const st = await statOf(abs(ctx, rel));
        if (st) { sizes.set(rel, st.size); date ??= isoDay(st.mtime); }
        candidates.push({ id: f.name.replace(/\.[^.]+$/, '').replace(new RegExp(`^${pid}-`), ''), path: rel });
      }
      rounds.push({ id: e.name, date, candidates });
    }
    let picked: string | undefined;
    const pickStat = pick && /^pick\./i.test(pick) ? await statOf(abs(ctx, `${folder}/${pick}`)) : undefined;
    if (pickStat) {
      for (const r of rounds) for (const c of r.candidates) if (c.path && sizes.get(c.path) === pickStat.size) { picked = c.id; r.pick = c.id; }
    }
    if (!picked) {
      const row = taste.find((t) => new RegExp(`^${pid}\\b`).test(t.what));
      const ids = rounds.flatMap((r) => r.candidates.map((c) => c.id));
      const id = row ? row.pick.replace(/\*/g, '').split(/[\s,()]+/).find((w) => ids.includes(w)) : undefined;
      if (id) { picked = id; const r = rounds.find((x) => x.candidates.some((c) => c.id === id)); if (r) r.pick = id; }
    }
    const prop = { id: pid, name: names.get(pid) ?? titleCase(slug), path: pick ? `${folder}/${pick}` : undefined, rounds: rounds.length ? rounds : undefined, pick: picked };
    const locs = new Set([...(propScenes.get(pid) ?? [])].map((s) => sceneLoc.get(s)).filter((l): l is string => !!l));
    const targets = out.filter((l) => locs.has(l.id));
    (targets.length ? targets : out.slice(0, 1)).forEach((l) => l.props!.push(prop));
    if (!out.length) ctx.warn.add(folder, 'a prop with no location folder to sit under');
  }
  return out;
}
