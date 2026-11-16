"""Re-voice, step 2: replace a voice in a take with the matched new lines. Per scene: the old voice is swapped for the
take's background stem over each line and its tail (up to the next other speaker); each new line is EQ'd to the original
voice's long-term spectrum (MATCH, from ai_voice_match.py), given a stereo hall reverb (RT60 1.6 s, tail about -20 dB at
0.2 s), and its level is solved so that the mix over the line is as loud (LUFS) as the original clip over the original
line, then trimmed by VOICE_TRIM_DB. A template: copy it next to the fix, change the settings below, run the copy.
    FILM=<film folder> .venv/bin/python tools/review/ai_voice_mix_v6_s8.py   (or the film folder as the first argument)
The new lines are files Alma made on Higgsfield (<LINES>/raw/<name>.mp3); their word times come from
`.venv/bin/python tools/stt/transcribe.py --audio <line>.mp3 --words-out <line>.stt.json`. Writes the take with its new
sound beside it (<take>-<SUFFIX>-480p.mp4, the original kept) and LOG.
The one-scene form: the same as ai_voice_mix_v4.py for a scene where the old voice's onset leaks past the mask, so
the mask (the first replace span) starts earlier, here 0.5 s instead of 0.92 s."""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from scipy.signal import firwin2, fftconvolve, butter, sosfilt, lfilter

if '-h' in sys.argv or '--help' in sys.argv: print(__doc__); sys.exit(0)
FILM = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FILM')
if not FILM: sys.exit('give the film folder: FILM=<film folder> .venv/bin/python <this script>')
P = lambda p: p if os.path.isabs(p) else os.path.join(os.path.abspath(FILM), p)

# ---- the fix: change everything here (times in seconds on the take's timeline) -----------------------------------------
LINES = P('audio/revoice/')                     # the new lines: <LINES>/raw/<name>.mp3 and their word times <name>.stt.json
MATCH = P('audio/revoice/matched/match.json')   # written by ai_voice_match.py: the EQ per scene
PLAN = {
 # scene: clip = the take; bed = its background stem (tools/stems/split.py); replace = spans where the old voice gives way
 # to the bed (each line AND its tail, up to the next other speaker); lines = (new line, where it starts or None = 0.45 s
 # after the one before, the original line's span); tempo = atempo on the new lines or None
 'S8': dict(clip=P('generations/S8/takes/take1/S8-take1-480p.mp4'), bed=P('audio/stems/S8-take1-480p/no_vocals.wav'),
            replace=[(0.50, 19.1)], lines=[('S8-a1', 1.0, (1.0, 3.86)), ('S8-a2', None, (5.44, 9.02))], tempo=1.1),
}
VOICE_TRIM_DB = -4.0            # the new voice against the loudness match
WET = 0.4                       # one reverb amount for the voice in every scene (the tail 0.15-0.3 s after the words about 20 dB under)
RT60 = 1.6
SUFFIX = 'aivoice2'            # the new clip: <take>-<SUFFIX>-480p.mp4 beside the take
LOG = P('audio/revoice/mix-S8.json')
# -----------------------------------------------------------------------------------------------------------------------

SR = 44100
def load(p, tempo=None, ch=2):
    af = ['-af', f'atempo={tempo}'] if tempo else []
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, *af, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'])
    a = np.frombuffer(raw, np.float32).astype(np.float64); return a.reshape(-1, ch) if ch > 1 else a
def _biquad(kind, G, Q, fc):
    A = 10**(G/40); w0 = 2*np.pi*fc/SR; al = np.sin(w0)/(2*Q); c = np.cos(w0)
    if kind == 'shelf':
        b = [A*((A+1)+(A-1)*c+2*np.sqrt(A)*al), -2*A*((A-1)+(A+1)*c), A*((A+1)+(A-1)*c-2*np.sqrt(A)*al)]
        a = [(A+1)-(A-1)*c+2*np.sqrt(A)*al, 2*((A-1)-(A+1)*c), (A+1)-(A-1)*c-2*np.sqrt(A)*al]
    else:
        b = [(1+c)/2, -(1+c), (1+c)/2]; a = [1+al, -2*c, 1-al]
    return np.array(b)/a[0], np.array(a)/a[0]
KW = [_biquad('shelf', 4.0, 1/np.sqrt(2), 1500.0), _biquad('hp', 0.0, 0.5, 38.0)]
def lufs(x):
    """Integrated loudness, ITU-R BS.1770 (K-weighting, 400 ms blocks, absolute and relative gates)."""
    y = x if x.ndim > 1 else x[:, None]
    for b, a in KW: y = lfilter(b, a, y, axis=0)
    blk, hop = int(0.4*SR), int(0.1*SR)
    if len(y) < blk: return -70.0
    z = np.array([np.mean(y[i:i+blk]**2, axis=0).sum() for i in range(0, len(y) - blk + 1, hop)])
    l = -0.691 + 10*np.log10(z + 1e-20); z = z[l > -70]
    if not len(z): return -70.0
    rel = -0.691 + 10*np.log10(z.mean()) - 10; z = z[-0.691 + 10*np.log10(z) > rel]
    return float(-0.691 + 10*np.log10(z.mean()))
BANDS = np.array([100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 14000])
EQ = json.load(open(MATCH))
def eq(x, gains):
    g = np.clip(np.array(gains), -6, 9); fr = np.concatenate([[0], BANDS, [15000, SR/2]]) / (SR/2)
    gl = np.concatenate([[g[0]], g, [g[-1] - 6, -40]]); fir = firwin2(4097, fr, 10**(gl/20)); return fftconvolve(x, fir, mode='full')[2048:2048+len(x)]
def make_ir(rt60, seed):
    rng = np.random.default_rng(seed); n = int((rt60*1.3 + 0.03)*SR); t = np.arange(n)/SR
    lo = sosfilt(butter(2, 2500, 'low', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-6.91*t/rt60)
    hi = sosfilt(butter(2, 2500, 'high', fs=SR, output='sos'), rng.standard_normal(n)) * np.exp(-6.91*t/(rt60*0.55))
    ir = lo + 0.6*hi; ir[:int(0.022*SR)] = 0; return ir / np.sqrt(np.sum(ir**2))
IRL, IRR = make_ir(RT60, 7), make_ir(RT60, 8)
def voice(dry, gains, wet):
    y = eq(dry, gains); y = np.concatenate([y, np.zeros(len(IRL))])
    return np.stack([y + wet*fftconvolve(y, IRL)[:len(y)], y + wet*fftconvolve(y, IRR)[:len(y)]], 1)
def xfade_replace(o, bed, a, b, f=0.05):
    i, j, k = int(a*SR), int(min(b, len(o)/SR)*SR), int(f*SR); w = np.ones(j-i); w[:k] = np.linspace(0, 1, k); w[-k:] = np.linspace(1, 0, k)
    o[i:j] = o[i:j]*(1-w[:, None]) + bed[i:j]*w[:, None]
def words(name):
    p = os.path.join(LINES, 'raw', f'{name}.stt.json')
    if not os.path.exists(p): sys.exit(f'no word times for {name}: .venv/bin/python tools/stt/transcribe.py --audio {os.path.join(LINES, "raw", name + ".mp3")} --words-out {p}')
    w = json.load(open(p)); return w['words'] if isinstance(w, dict) else w
log = {}
tmp = tempfile.mkdtemp(prefix='revoice-')
for s, p in PLAN.items():
    orig = load(p['clip']); bed = load(p['bed']); n = min(len(orig), len(bed)); orig, bed = orig[:n], bed[:n]
    mix = orig.copy()
    for a, b in p['replace']: xfade_replace(mix, bed, a, b)
    gains = [EQ[s]['eq_db'][str(b)] for b in BANDS]; gains[0] = min(gains[0], 2); gains[1] = min(gains[1], 2)
    t_prev = None; placed = []; tf = p['tempo'] or 1.0
    for name, at, span in p['lines']:
        w = words(name); w0s, w1 = w[0]['start']/tf, w[-1]['end']/tf
        dry = load(os.path.join(LINES, 'raw', f'{name}.mp3'), p['tempo'], 1)[int(max(0, w0s - 0.04)*SR):]
        v = voice(dry, gains, WET); dur = w1 - w0s
        if at is None: at = t_prev + 0.45
        i = int((at - 0.04)*SR); j = min(n, i + len(v)); seg = v[:j-i]
        target = lufs(orig[int(span[0]*SR):int(span[1]*SR)])
        lo_i, lo_j = int(at*SR), int(min(n/SR, at + dur)*SR)
        g = 1.0
        for _ in range(6):   # solve the voice gain so the mix over the new line is as loud as the original over the old one
            test = mix.copy(); test[i:j] += seg*g
            cur = lufs(test[lo_i:lo_j]); g *= 10**((target - cur)/20)
        g *= 10**(VOICE_TRIM_DB/20)
        mix[i:j] += seg*g; t_prev = at + dur
        placed.append(dict(line=name, at=round(at, 2), ends=round(at+dur, 2), voice_gain_db=round(20*np.log10(g), 1), target_lufs=round(target, 1)))
    pk = np.abs(mix).max()
    if pk > 0.98: mix *= 0.98/pk
    wav = os.path.join(tmp, f'{s}.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', wav], input=mix.astype(np.float32).tobytes(), check=True)
    out = p['clip'].replace('-480p.mp4', f'-{SUFFIX}-480p.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p['clip'], '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True)
    log[s] = dict(out=out, wet=WET, rt60=RT60, eq_db=dict(zip(BANDS.tolist(), np.round(np.clip(gains, -6, 9), 1).tolist())), replaced=p['replace'], lines=placed, peak_scaled=bool(pk > 0.98))
    print(s, json.dumps(log[s]))
shutil.rmtree(tmp, ignore_errors=True)
os.makedirs(os.path.dirname(LOG), exist_ok=True); json.dump(log, open(LOG, 'w'), indent=1)
