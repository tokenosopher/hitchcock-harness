// `npm run films:check [-- <slug> …] [--snapshot]`: builds the registry and each film's state from
// the folders (read-only) and prints the counts and everything a reader could not parse. With
// --snapshot it also writes harness/snapshots/<slug>.json (and films.json), git-ignored, for diffing.
// Default films: the film repo's films.txt.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Cost } from '../types';
import { harnessConfig } from '../config';
import { buildRegistry } from './registry';
import { buildFilmState } from './state';

const fmt = (c: Cost | undefined): string => {
  if (!c) return '0';
  const parts: string[] = [];
  if (c.credits !== undefined) parts.push(`${c.credits.toFixed(2)} cr`);
  for (const u of c.usd ?? []) parts.push(`$${u.amount.toFixed(2)} · ${u.service}`);
  return parts.join(' + ') || '0';
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const writeFixtures = args.includes('--snapshot');
  const cfg = harnessConfig();
  const t0 = Date.now();
  const reg = await buildRegistry(cfg);
  console.log(`Registry · ${reg.films.length} films · drive ${reg.drive} · ${Date.now() - t0} ms · harness/films.json written`);
  for (const f of reg.films) {
    const where = f.repo ? path.relative(path.dirname(f.repo), f.folder) : f.folder;
    const cuts = f.more.deliveryFolders.map((d) => `${path.basename(d.folder)}${d.hasVideo ? '' : ' (no video yet)'}`).join('; ');
    console.log(`  ${f.status === 'delivered' ? 'D' : '-'} ${f.slug.padEnd(42)} ${f.title}${f.workingTitle ? ` (wt ${f.workingTitle})` : ''} · ${f.flow} · stage ${f.stage ?? '?'} · ${where}${cuts ? ` · cuts: ${cuts}` : ''}${f.more.supersededBy ? ` · carried on by ${f.more.supersededBy}` : ''}`);
  }
  for (const w of reg.warnings) console.log(`  ! ${w}`);

  const slugs = args.filter((a) => !a.startsWith('--'));
  const want = slugs.length ? slugs : reg.films.filter((f) => f.repo === cfg.filmRepo).map((f) => f.slug);
  let failed = false;
  for (const slug of want) {
    const film = reg.films.find((f) => f.slug === slug);
    if (!film) {
      console.log(`\n${slug}: not in the registry`);
      failed = true;
      continue;
    }
    const t1 = Date.now();
    const s = await buildFilmState(film);
    const c = s.extra.counts;
    console.log(`\n${film.title} (${slug}) · ${Date.now() - t1} ms`);
    console.log(`  characters ${c.characters} (${s.characters.map((x) => `${x.id} ${x.name}`).join(', ')})`);
    console.log(`  scenes ${c.scenes} (${s.extra.layout ?? 'no layout'}) · takes ${c.takes} · pick-up takes ${c.pickups}`);
    console.log(`  locations ${s.locations.length} · props ${s.locations.reduce((n, l) => n + (l.props?.length ?? 0), 0)} · script lines ${c.scriptLines} · versions ${s.script?.versions.map((v) => v.version + (v.locked ? '*' : '')).join(' ') ?? '-'} (current ${s.script?.current ?? '-'})`);
    console.log(`  spend ${c.spendLines} lines · total ${fmt(s.spend.total)} · unpriced ${s.extra.costs.unpricedLines}`);
    console.log(`  taste picks ${c.tastePicks} · review cards ${s.reviewCardsPath ?? '-'}`);
    for (const ch of s.characters)
      console.log(`    ${ch.id} ${ch.name}: face ${ch.face ? `${ch.face.rounds.length} rounds, pick ${ch.face.pick?.candidateId ?? '-'}` : '-'} · wardrobe ${ch.wardrobe ? `${ch.wardrobe.rounds.length} rounds, pick ${ch.wardrobe.pick?.candidateId ?? '-'}` : '-'} · sheet ${ch.sheet?.path ? path.basename(ch.sheet.path) : '-'}${ch.sheet?.approved ? ' (approved)' : ''} · voice ${ch.voice ? `${ch.voice.rounds.length} rounds, pick ${ch.voice.pick?.candidateId ?? '-'}` : '-'} · element ${ch.element?.state ?? '-'} · ${fmt(s.extra.costs.characters[ch.id])}`);
    for (const sc of s.scenes)
      console.log(`    ${sc.id} ${sc.title}: ${sc.seconds ?? '?'} s, ${sc.shots ?? '?'} shots${sc.planSeconds !== undefined ? ` (plan ${sc.planSeconds} s, ${sc.planShots} shots${sc.more.planSuperseded ? ', superseded' : ''})` : ''} · prompts ${sc.promptVersions.map((p) => p.version).join(' ') || '-'} · takes ${sc.takes.map((t) => t.id + (t.misses ? `[${t.misses.length} miss]` : '')).join(', ') || '-'} · ${fmt(s.extra.costs.scenes[sc.id])}`);
    for (const l of s.locations)
      console.log(`    ${l.id} ${l.name}: ${l.styleImages?.length ?? 0} rounds · master ${l.master?.path ? path.basename(l.master.path) : '-'} · ${l.views?.length ?? 0} views · props ${l.props?.map((p) => p.id).join(' ') || '-'}`);
    if (s.warnings.length) {
      console.log(`  could not parse (${s.warnings.length}):`);
      for (const w of s.warnings) console.log(`    ! ${w}`);
    } else console.log('  everything parsed');
    if (writeFixtures) {
      const out = path.join(process.cwd(), 'harness', 'snapshots', `${slug}.json`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, JSON.stringify(s, null, 1) + '\n');
      console.log(`  snapshot: ${path.relative(process.cwd(), out)} (${Math.round(JSON.stringify(s).length / 1024)} KB)`);
    }
  }
  if (writeFixtures && !slugs.length) {
    await fs.mkdir(path.join(process.cwd(), 'harness', 'snapshots'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), 'harness', 'snapshots', 'films.json'), JSON.stringify(reg.films, null, 1) + '\n');
    console.log('\nsnapshot: harness/snapshots/films.json');
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
