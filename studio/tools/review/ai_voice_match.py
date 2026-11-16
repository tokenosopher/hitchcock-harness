"""Re-voice, step 1: make new lines (spoken on Higgsfield in a new voice, saved as files) sit like the voice the take
already has: EQ to its long-term spectrum, a hall reverb whose amount matches how much the original fills the gaps
between words, then loudness matched on speech (the hum floor removed). A template: copy it next to the fix, change the
settings below, run the copy; then run ai_voice_mix_v4.py, which reads MATCH.
    FILM=<film folder> .venv/bin/python tools/review/ai_voice_match.py         (or the film folder as the first argument)
Per scene: the take's voice stem (tools/stems/split.py), a span of the stem that holds only the floor (no voice; None =
the quietest 5 %), the new lines with the span of the original line each replaces, and an optional tempo (atempo on the
new lines). Writes <LINES>/matched/<name>.wav and MATCH (the EQ, the reverb amount and the gain per line)."""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import welch, firwin2, fftconvolve, butter, sosfilt

if '-h' in sys.argv or '--help' in sys.argv: print(__doc__); sys.exit(0)
FILM = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FILM')
if not FILM: sys.exit('give the film folder: FILM=<film folder> .venv/bin/python <this script>')
P = lambda p: p if os.path.isabs(p) else os.path.join(os.path.abspath(FILM), p)

# ---- the fix: change everything here (times in seconds on the take's timeline) -----------------------------------------
LINES = P('audio/revoice/')                     # the new lines: <LINES>/raw/<name>.mp3
MATCH = P('audio/revoice/matched/match.json')
SCENES = {
 # scene: (its voice stem, a floor-only span or None, [(new line name, the original line's span)], tempo or None)
 'S2': (P('audio/stems/S2-take1-480p/vocals.wav'), (0.0, 3.3), [('S2-a1', (3.46, 5.38)), ('S2-a2', (10.46, 12.84))], None),
 'S8': (P('audio/stems/S8-take1-480p/vocals.wav'), (0.0, 0.95), [('S8-a1', (1.0, 3.86)), ('S8-a2', (5.44, 9.02))], 1.1),
}
RT60 = 1.8
# -----------------------------------------------------------------------------------------------------------------------

SR = 44100
def load(p, tempo=None):
    af = ['-af', f'atempo={tempo}'] if tempo else []
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, *af, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']); return np.frombuffer(raw, np.float32).astype(np.float64)
def save(path, x):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_f32le', path],
                   input=np.asarray(x, np.float32).tobytes(), check=True)
def env(x, hop=0.01):
    h = int(hop*SR); n = len(x)//h; return np.array([np.mean(x[i*h:(i+1)*h]**2) for i in range(n)])
BANDS = np.array([100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 14000])
def band_db(x):
    f, Pw = welch(x, SR, nperseg=4096); return np.array([10*np.log10(Pw[(f > b/1.26) & (f < b*1.26)].mean() + 1e-20) for b in BANDS])
def eq(x, gains_db):
    g = np.clip(gains_db, -12, 12); fr = np.concatenate([[0], BANDS, [15000, SR/2]]) / (SR/2)
    gl = np.concatenate([[g[0]], g, [g[-1] - 6, -40]]); fir = firwin2(4097, fr, 10**(gl/20)); return fftconvolve(x, fir, mode='full')[2048:2048+len(x)]
def make_ir(rt60, seed=7):
    rng = np.random.default_rng(seed); n = int((rt60*1.3 + 0.03)*SR); t = np.arange(n)/SR
    lo = sosfilt(butter(2, 2500, 'low', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-6.91*t/rt60)
    hi = sosfilt(butter(2, 2500, 'high', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-6.91*t/(rt60*0.55))
    ir = lo + 0.6*hi; ir[:int(0.022*SR)] = 0; return ir / np.sqrt(np.sum(ir**2))
def valley_db(e):   # how far the level drops between words: p15 vs p90 of the speech frames
    a = e[e > e.max()*1e-4]; return 10*np.log10(np.percentile(a, 15)/np.percentile(a, 90))
IR = make_ir(RT60); report = {}
os.makedirs(os.path.join(LINES, 'matched'), exist_ok=True); os.makedirs(os.path.dirname(MATCH), exist_ok=True)
for s, (vp, flr, lines, tempo) in SCENES.items():
    v = load(vp); ev = env(v)
    floor = ev[int(flr[0]*100):int(flr[1]*100)].mean() if flr else np.percentile(ev, 5)
    spans = [sp for _, sp in lines]
    orig = np.concatenate([v[int(a*SR):int(b*SR)] for a, b in spans])
    eo = np.concatenate([np.maximum(ev[int(a*100):int(b*100)] - floor, 1e-12) for a, b in spans])
    o_val = valley_db(eo); o_bands = band_db(orig)
    dry = {n: load(os.path.join(LINES, 'raw', f'{n}.mp3'), tempo) for n, _ in lines}
    def chain(x, g_eq, wet):
        y = eq(x, g_eq); y = np.concatenate([y, np.zeros(len(IR))]); w = fftconvolve(y, IR)[:len(y)]
        return y + wet * w
    # EQ from the long-term spectra (lows above 160 Hz only: below that a stem can be hum)
    alld = np.concatenate(list(dry.values())); g = o_bands - band_db(alld); g = g - np.median(g); g[:2] = np.minimum(g[:2], 2.0)
    # wet amount: match the valley depth (how much the sound fills the gaps between words)
    best = None
    for wet in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.55, 0.7, 0.9, 1.2):
        ys = [chain(x, g, wet) for x in dry.values()]; ey = np.concatenate([env(y) for y in ys])
        d = abs(valley_db(ey) - o_val)
        if best is None or d < best[0]: best = (d, wet, valley_db(ey))
    wet = best[1]
    # second EQ pass on the full chain, then loudness on speech frames
    ys = [chain(x, g, wet) for x in dry.values()]; g2 = o_bands - band_db(np.concatenate(ys)); g2 = g2 - np.median(g2); g2[:2] = np.minimum(g2[:2], 2.0)
    g_final = g + np.clip(g2, -6, 6)
    rep = dict(orig_valley_db=round(o_val, 1), new_valley_db=round(best[2], 1), wet=wet, rt60=RT60, eq_db=dict(zip(BANDS.tolist(), np.round(np.clip(g_final, -12, 12), 1).tolist())), lines={})
    for n, sp in lines:
        y = chain(dry[n], g_final, wet); e = env(y)
        eo_l = np.maximum(ev[int(sp[0]*100):int(sp[1]*100)] - floor, 1e-12); target = 10*np.log10(np.mean(eo_l[eo_l > eo_l.max()*1e-3]))
        cur = 10*np.log10(np.mean(e[e > e.max()*1e-3])); y *= 10**((target - cur)/20)
        save(os.path.join(LINES, 'matched', f'{n}.wav'), y)
        rep['lines'][n] = dict(gain_db=round(target - cur, 1), target_db=round(target, 1))
    yb = band_db(np.concatenate([load(os.path.join(LINES, 'matched', f'{n}.wav')) for n, _ in lines])); r = (o_bands - yb); r = r - np.median(r)
    rep['residual_eq_db'] = dict(zip(BANDS.tolist(), np.round(r, 1).tolist()))
    report[s] = rep; print(s, json.dumps(rep))
json.dump(report, open(MATCH, 'w'), indent=1)
