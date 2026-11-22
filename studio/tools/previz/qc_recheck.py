"""Earlier misses checked again every round: a miss a QC round marked fixed stays on a list
that every later round's critic looks at first, so a fix that undoes another is caught at once (on a film this was made on, "the cup floats
beside his fingers" came back in rounds 7 and 12).
    .venv/bin/python tools/previz/qc_recheck.py <film> <G> [--stage previz] [--qc-dir <folder>]
Reads every <qc-dir>/<stage>-<G>-r<n>.json (qc-dir defaults to <film>/qc; a test beside a film passes its own) and writes
<qc-dir>/<stage>-<G>-fixed-misses.json: each miss ever marked fixed (open: false), with the round that fixed it, its title, where,
the fix that was made and its evidence, newest first; a miss fixed and later opened again is marked "reopened". It prints the
list as the critic's first reading. The file name does not end in -r<n>.json, so the harness does not read it as a round.

The critic's step (the brief says it, before grading round n of 2 or more): open this list first; look again at every item on the
newest take and boards; a miss that is back is carried with its old id, "open": true and "reopened": true, never as a new id."""
import glob, json, os, re, sys


def main():
    a = sys.argv[1:]
    if a[:1] in (['-h'], ['--help']): print(__doc__); sys.exit(0)
    if len(a) < 2: sys.exit(__doc__)
    film, G = os.path.abspath(a[0]), a[1]
    stage = a[a.index('--stage') + 1] if '--stage' in a else 'previz'
    qd = os.path.abspath(a[a.index('--qc-dir') + 1]) if '--qc-dir' in a else os.path.join(film, 'qc')
    rounds = []
    for p in glob.glob(os.path.join(qd, '%s-%s-r*.json' % (stage, G))):
        m = re.search(r'-r(\d+)\.json$', p)
        if m:
            with open(p) as fh: rounds.append((int(m.group(1)), p, json.load(fh)))
    rounds.sort()
    if not rounds: sys.exit('qc_recheck: no %s-%s-r<n>.json in %s' % (stage, G, qd))
    hist = {}
    for n, p, r in rounds:
        for mi in r.get('misses', []):
            h = hist.setdefault(mi['id'], dict(id=mi['id'], states=[], last=mi))
            h['states'].append((n, bool(mi.get('open', True)))); h['last'] = mi
    out = []
    for i, h in hist.items():
        fixed = [n for n, o in h['states'] if not o]
        if not fixed: continue
        first_fix = fixed[0]; reopened = any(o for n, o in h['states'] if n > first_fix)
        mi = h['last']
        out.append(dict(id=i, fixed_in_round=first_fix, fixedIn=mi.get('fixedIn'), open_now=bool(mi.get('open', True)), reopened=reopened,
                        category=mi.get('category'), where=mi.get('where'), title=mi.get('title') or mi.get('finding', '')[:140],
                        fix=mi.get('fix'), evidence=mi.get('evidence', [])))
    out.sort(key=lambda x: (-x['fixed_in_round'], x['id']))
    res = dict(stage=stage, target=G, rounds=[n for n, _, _ in rounds], next_round=rounds[-1][0] + 1, fixed=out,
               note='Look at every item first, on the newest take and boards: a miss that is back keeps its id, "open": true, "reopened": true.')
    dst = os.path.join(qd, '%s-%s-fixed-misses.json' % (stage, G))
    with open(dst, 'w') as fh: json.dump(res, fh, indent=1)
    print('%d earlier misses marked fixed in %s %s rounds %s -> %s' % (len(out), stage, G, ', '.join(str(n) for n, _, _ in rounds), dst))
    for x in out:
        print('  %-5s fixed in r%d%s  %s: %s' % (x['id'], x['fixed_in_round'], ' (REOPENED)' if x['reopened'] else '', x['where'], x['title']))


if __name__ == '__main__':
    main()
