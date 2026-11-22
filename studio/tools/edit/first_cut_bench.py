"""Measure a first cut against the user's own finished edit of the same base.

    .venv/bin/python tools/edit/first_cut_bench.py <film folder> <base version> <first cut json> <finished version>
        [--report <file.md>] [--tolerance 3]

Only shots that use the same take file in the base and in the finished cut are compared, and only cut points whose
two shots still meet in the finished cut. For each one: the user's head and tail trims against the tool's (frames),
the gap between lines, and the fades on the sound. A trim or fade counts as reproduced when the tool made it on the
same edge within the tolerance (3 frames by default). Writes nothing but the report.
"""
import argparse, os, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json
import first_cut as fc  # noqa: E402


def pieces(tl, base_clip):
    """The finished cut's picture clips that play the same file over part of the base clip's source range."""
    fps = tl['fps']
    vt, _ = fc.linked_tracks(tl)
    out = []
    for c in sorted(vt['clips'], key=lambda k: k['at']):
        if c.get('src') != base_clip.get('src'):
            continue
        lo, hi = max(c['in'], base_clip['in']), min(c['out'], base_clip['out'])
        if (hi - lo) * fps >= 1:
            out.append(c)
    return out


def edges(fps, base_clip, ps):
    """Head and tail trims (source frames, positive = shorter), what was taken out inside, and the speeds."""
    if not ps:
        return None
    ins = min(fc.toF(p['in'], fps) for p in ps)
    outs = max(fc.toF(p['out'], fps) for p in ps)
    srt = sorted(ps, key=lambda p: p['in'])
    inside = sum(max(0, fc.toF(b['in'], fps) - fc.toF(a['out'], fps)) for a, b in zip(srt, srt[1:]))
    return {'head': ins - fc.toF(base_clip['in'], fps), 'tail': fc.toF(base_clip['out'], fps) - outs, 'inside': inside,
            'speeds': sorted({fc.speed_of(p) for p in ps if fc.speed_of(p) != 1})}


def sound_fades(tl, ps):
    """The fade-in on the sound of the first piece and the fade-out on the sound of the last, in frames."""
    fps = tl['fps']
    if not ps:
        return (0, 0)
    first, last = min(ps, key=lambda p: p['at']), max(ps, key=lambda p: p['at'])
    a, b = fc.sound_of(tl, first), fc.sound_of(tl, last)
    fi = fc.jround((a.get('fadeIn') or 0) * fps) if a else 0
    fo = fc.jround((b.get('fadeOut') or 0) * fps) if b else 0
    return (fi, fo)


def gap_rows(tl, film, lines):
    _, rows = fc.cut_table(tl, film, lines, {})
    return {(r['out'].v['id'], r['in'].v['id']): r for r in rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('film')
    ap.add_argument('base')
    ap.add_argument('tool')
    ap.add_argument('finished')
    ap.add_argument('--report')
    ap.add_argument('--tolerance', type=int, default=3)
    a = ap.parse_args()
    tol = a.tolerance
    film = fc.Film(a.film)
    lines = fc.script_lines(film)
    B = film.version(a.base)
    with open(a.tool) as f:
        T = json.load(f)
    U = film.version(a.finished)
    fps = B['fps']
    bv, _ = fc.linked_tracks(B)
    uv, _ = fc.linked_tracks(U)
    bclips = sorted(bv['clips'], key=lambda k: k['at'])
    uorder = [c['id'] for c in sorted(uv['clips'], key=lambda k: k['at'])]

    info = []
    for c in bclips:
        up = pieces(U, c)
        _, tc = fc.find(T, c['id'])
        tp = [tc] if tc is not None else []
        info.append({'b': c, 'u': up, 't': tp, 'ue': edges(fps, c, up), 'te': edges(fps, c, tp),
                     'uf': sound_fades(U, up), 'tf': sound_fades(T, tp)})

    gU, gT, gB = gap_rows(U, film, lines), gap_rows(T, film, lines), gap_rows(B, film, lines)
    words_cache = {}

    def has_words(c):
        if c['id'] not in words_cache:
            snd = fc.sound_of(B, c)
            ms = film.marks(snd['src']) if snd is not None and snd.get('src') else None
            words_cache[c['id']] = bool(ms) and any(w.get('type') == 'word' and w['end'] > snd['in'] and w['start'] < snd['out'] for w in ms)
        return words_cache[c['id']]

    cuts = []
    for i in range(len(bclips) - 1):
        x, y = info[i], info[i + 1]
        row = {'out': x, 'in': y, 'name': '%s / %s' % (fc.name_of(x['b']), fc.name_of(y['b']))}
        if not x['u'] or not y['u']:
            row['why'] = 'take changed in %s' % a.finished
        else:
            lu, fu = max(x['u'], key=lambda p: p['at'])['id'], min(y['u'], key=lambda p: p['at'])['id']
            if uorder.index(fu) != uorder.index(lu) + 1:
                row['why'] = 'the two shots no longer meet in %s' % a.finished
            else:
                row['ids_u'] = (lu, fu)
        row['speech'] = has_words(x['b']) and has_words(y['b'])
        cuts.append(row)

    comp = [r for r in cuts if 'ids_u' in r]
    # edge by edge: the outgoing tail and the incoming head of every comparable cut
    E = []
    for r in comp:
        for side, key in (('out', 'tail'), ('in', 'head')):
            it = r[side]
            u, t = it['ue'][key], it['te'][key] if it['te'] else 0
            E.append({'cut': r, 'clip': fc.name_of(it['b']), 'edge': key, 'u': u, 't': t, 'speech': r['speech']})
    user_trims = [e for e in E if e['u'] != 0]
    hit = [e for e in user_trims if e['t'] != 0 and (e['t'] > 0) == (e['u'] > 0) and abs(e['t'] - e['u']) <= tol]
    miss = [e for e in user_trims if e not in hit]
    extra = [e for e in E if e['t'] != 0 and e['u'] == 0]
    off = [e for e in E if e['t'] != 0 and e['u'] != 0 and e not in hit]
    # cut by cut: the frames taken out at the join, whichever side
    C = []
    for r in comp:
        u = r['out']['ue']['tail'] + r['in']['ue']['head']
        t = (r['out']['te']['tail'] if r['out']['te'] else 0) + (r['in']['te']['head'] if r['in']['te'] else 0)
        C.append({'cut': r, 'u': u, 't': t})
    cu = [c for c in C if c['u'] != 0]
    chit = [c for c in cu if c['t'] != 0 and abs(c['t'] - c['u']) <= tol]
    cextra = [c for c in C if c['t'] != 0 and c['u'] == 0]
    # fades on the sound of comparable shots
    F = []
    for it in info:
        if not it['u']:
            continue
        for k, label in ((0, 'fade-in'), (1, 'fade-out')):
            F.append({'clip': fc.name_of(it['b']), 'kind': label, 'u': it['uf'][k], 't': it['tf'][k]})
    fu = [f for f in F if f['u'] > 0]
    fplace = [f for f in fu if f['t'] > 0]
    flen = [f for f in fplace if abs(f['t'] - f['u']) <= tol]
    fextra = [f for f in F if f['t'] > 0 and f['u'] == 0]

    L = []
    L.append('# Benchmark: first cut of %s against the user\'s %s' % (film.slug, a.finished))
    L.append('')
    L.append('Base %s; tool output `%s`; tolerance %d f. Calibration was learned from this same finished cut, so the numbers are in-sample: an upper bound for a new film.' % (a.base, a.tool, tol))
    L.append('')
    L.append('Comparable: %d of %d base shots keep their take file in %s; %d of %d cut points have both shots meeting there (%d of them with words on both sides).' % (
        sum(1 for it in info if it['u']), len(info), a.finished, len(comp), len(cuts), sum(1 for r in comp if r['speech'])))
    L.append('')
    L.append('## Counts')
    L.append('')
    L.append('| what | user made | tool reproduced (within %d f) | tool missed | tool made, user did not | tool trimmed, user trimmed by a different amount |' % tol)
    L.append('|---|---|---|---|---|---|')
    L.append('| trims, edge by edge | %d | %d | %d | %d | %d |' % (len(user_trims), len(hit), len(miss), len(extra), len(off)))
    L.append('| trims at speech-to-speech cuts (rule 1 scope) | %d | %d | %d | %d | %d |' % (
        sum(1 for e in user_trims if e['speech']), sum(1 for e in hit if e['speech']), sum(1 for e in miss if e['speech']),
        sum(1 for e in extra if e['speech']), sum(1 for e in off if e['speech'])))
    L.append('| frames taken out at a cut, either side | %d | %d | %d | %d | - |' % (len(cu), len(chit), len(cu) - len(chit), len(cextra)))
    L.append('| fades on dialogue (placed on the same edge) | %d | %d | %d | %d | - |' % (len(fu), len(fplace), len(fu) - len(fplace), len(fextra)))
    L.append('| fades with the length within %d f | %d | %d | %d | - | - |' % (tol, len(fu), len(flen), len(fu) - len(flen)))
    L.append('')
    L.append('## Cut by cut (frames; + is shorter)')
    L.append('')
    L.append('| cut | words both sides | user tail / head | tool tail / head | gap base / user / tool (f) | note |')
    L.append('|---|---|---|---|---|---|')
    for r in cuts:
        if 'ids_u' not in r:
            L.append('| %s | %s | - | %s | - | not compared: %s |' % (r['name'], 'yes' if r['speech'] else 'no',
                     '%d / %d' % ((r['out']['te'] or {}).get('tail', 0), (r['in']['te'] or {}).get('head', 0)), r['why']))
            continue
        ue, te = (r['out']['ue']['tail'], r['in']['ue']['head']), (r['out']['te']['tail'], r['in']['te']['head'])
        gb = gB.get((r['out']['b']['id'], r['in']['b']['id']))
        gt = gT.get((r['out']['b']['id'], r['in']['b']['id']))
        gu = gU.get(r['ids_u'])
        gs = '-'
        if gb and gb.get('kind') == 'speech':
            gs = '%d / %s / %s' % (fc.jround(gb['gap']), ('%d' % fc.jround(gu['gap'])) if gu and gu.get('kind') == 'speech' else '?',
                                   ('%d' % fc.jround(gt['gap'])) if gt and gt.get('kind') == 'speech' else '?')
        note = []
        if r['out']['ue']['inside'] or r['out']['ue']['speeds']:
            note.append('user also took %d f out inside %s%s' % (r['out']['ue']['inside'], fc.name_of(r['out']['b']),
                        (' and set speed %s' % ', '.join('%d%%' % round(s * 100) for s in r['out']['ue']['speeds'])) if r['out']['ue']['speeds'] else ''))
        if r['out']['u'] and any(p.get('unlinked') for p in r['out']['u']):
            note.append('user unlinked the outgoing sound')
        if r['out']['t'] and r['out']['t'][0].get('unlinked'):
            note.append('tool unlinked the outgoing sound')
        L.append('| %s | %s | %d / %d | %d / %d | %s | %s |' % (r['name'], 'yes' if r['speech'] else 'no', ue[0], ue[1], te[0], te[1], gs, '; '.join(note)))
    L.append('')
    L.append('## Fades on comparable shots (frames)')
    L.append('')
    L.append('| clip | fade | user | tool |')
    L.append('|---|---|---|---|')
    for f in F:
        if f['u'] or f['t']:
            L.append('| %s | %s | %d | %d |' % (f['clip'], f['kind'], f['u'], f['t']))
    L.append('')
    L.append('## Misses, largest first')
    L.append('')
    for e in sorted(miss, key=lambda e: -abs(e['u'] - e['t'])):
        L.append('- %s %s: user %+d f, tool %+d f%s' % (e['clip'], e['edge'], e['u'], e['t'], '' if e['speech'] else ' (a shot without words: outside rule 1)'))
    L.append('')
    L.append('## Trims the user did not make, largest first')
    L.append('')
    for e in sorted(extra, key=lambda e: -abs(e['t'])):
        L.append('- %s %s: tool %+d f' % (e['clip'], e['edge'], e['t']))
    # edges of shots that keep their take where the shot on the other side of the cut changed take: the user trimmed
    # them against a different neighbour, so they are listed apart and not counted above
    L.append('')
    L.append('## Edges of kept shots whose neighbour changed take (not counted above)')
    L.append('')
    for r in cuts:
        if 'ids_u' in r:
            continue
        for sd, key in (('out', 'tail'), ('in', 'head')):
            it = r[sd]
            if it['u'] and (it['ue'][key] or (it['te'] or {}).get(key, 0)):
                L.append('- %s %s: user %+d f, tool %+d f (%s)' % (fc.name_of(it['b']), key, it['ue'][key], (it['te'] or {}).get(key, 0), r['why']))
    # a variation made from a take with the same sound (variation.json) compares by its sound
    L.append('')
    L.append('## Shots replaced by a variation with the same sound (compared by sound, not counted above)')
    L.append('')
    for it in info:
        if it['u']:
            continue
        vt_, _ = fc.linked_tracks(U)
        for c in vt_['clips']:
            vj = os.path.join(os.path.dirname(film.path(c.get('src') or 'x')), 'variation.json')
            if c.get('src') and os.path.isfile(vj):
                with open(vj) as fh:
                    if json.load(fh).get('from') != it['b'].get('src'):
                        continue
                if not (c['in'] < it['b']['out'] and c['out'] > it['b']['in']):
                    continue
                us = fc.sound_of(U, c)
                _, tcl = fc.find(T, it['b']['id'])
                ts = fc.sound_of(T, tcl) if tcl is not None else None
                L.append('- %s (now %s): picture tail user %+d f, tool %+d f; sound tail user %+d f, tool %+d f; sound unlinked: user %s, tool %s' % (
                    fc.name_of(it['b']), os.path.basename(c['src']),
                    fc.toF(it['b']['out'], fps) - fc.toF(c['out'], fps), fc.toF(it['b']['out'], fps) - fc.toF(tcl['out'], fps) if tcl else 0,
                    fc.toF(it['b']['out'], fps) - fc.toF(us['out'], fps) if us else 0, fc.toF(it['b']['out'], fps) - fc.toF(ts['out'], fps) if ts else 0,
                    'yes' if c.get('unlinked') else 'no', 'yes' if tcl is not None and tcl.get('unlinked') else 'no'))
    rep = '\n'.join(L) + '\n'
    if a.report:
        with open(a.report, 'w') as f:
            f.write(rep)
    print(rep)


if __name__ == '__main__':
    main()
