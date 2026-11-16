"""Write speech_start / speech_end (seconds inside the clip) for every line in audio/lines.json, so shot timing can be
planned word to word: 0.5 s from the last word of one line to the first word of the next.
Energy threshold in 10 ms frames; a frame counts as speech above -38 dBFS, and runs under 40 ms are ignored. File paths
in lines.json may be relative to the film root or to audio/. record.py already writes these fields for new takes; run
this after editing files by hand, and to report each character's level and pitch (outliers are worth a listen).
    FILM=<film> .venv/bin/python tools/voices/measure_speech.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import film
from measure import speech_edges, loud, f0

if __name__ == '__main__':
    F = film.film_root(); L = film.load_lines(F); by = {}
    for l in L:
        if not l.get('file'): continue
        p = film.path_of(F, l['file'])
        s0, s1 = speech_edges(p)
        l['speech_start'], l['speech_end'] = s0, s1
        l['mean_db'] = loud(p)
        if 'f0' not in l: l['f0'] = f0(p)
        by.setdefault(l.get('name') or l.get('who') or l.get('character'), []).append(l)
    film.save_lines(F, L)
    sp = [l for l in L if l.get('file')]
    print(len(sp), 'lines measured; mean lead', round(np.mean([l['speech_start'] for l in sp]), 3), 's, mean tail',
          round(np.mean([l['seconds'] - l['speech_end'] for l in sp if l.get('seconds')]), 3), 's')
    for who, ls in by.items():
        db = [l['mean_db'] for l in ls]; hz = [l['f0'] for l in ls if l.get('f0') and l['seconds'] >= 1.0]
        print(f'{who}: level {np.median(db):.1f} dB median ({min(db):.1f}..{max(db):.1f}), pitch {np.median(hz) if hz else 0:.0f} Hz median'
              f' over lines >= 1 s ({min(hz) if hz else 0:.0f}..{max(hz) if hz else 0:.0f})')
        for l in ls:
            off = []
            if l['mean_db'] < np.median(db) - 6: off.append(f"{l['mean_db'] - np.median(db):+.1f} dB")
            if hz and l.get('f0') and l['seconds'] >= 1.0 and abs(l['f0'] / np.median(hz) - 1) > 0.4: off.append(f"{l['f0']:.0f} Hz")
            if off: print('   listen to', l.get('id') or f"{l.get('shot')}-{l.get('idx')}", ', '.join(off))
