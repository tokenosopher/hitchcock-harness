"""A word fix, audio A/B set: one spoken word replaced in a take, heard against the original. A template: copy it next to
the fix (for example $FILM/audio/fixes/<G>-<word>/), change the settings below, run the copy.
    FILM=<film folder> .venv/bin/python tools/review/s4_parse_ab.py        (or the film folder as the first argument)
Inputs: the take; its voice stem and background stem (tools/stems/split.py, two stems); and NEW_TAKE, the line spoken
again in the character's cloned voice (a Higgsfield call Alma makes: create_voice_from_confirmed_audio from the voice
stem, then the word in that voice, saved as a file). Two builds, each dry / barely (-48 dB) / very slight (-42 dB) echo
(RT60 1.0 s, 20 ms pre-delay; the echo's level 150-350 ms after the vowel, under the vowel peak):
  hybrid: the character's own first consonant (to KEEP_START_END) and last sound (from KEEP_END_START) from the take's
          voice, only the vowel swapped for the new take's vowel (HYBRID_VOWEL), tone-matched and level-matched;
  whole:  the new take's whole word (WHOLE_WORD), tone-matched and level-matched, its vowel peak on the original's.
Each file: the original span AB_SPAN, 0.8 s of silence, then the same span with the new word; plus the whole clip's audio.
Writes OUT/<name>.wav, OUT/full clip audio - <name>.wav and OUT/ab-log.json."""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import firwin2, fftconvolve, butter, sosfilt

if '-h' in sys.argv or '--help' in sys.argv: print(__doc__); sys.exit(0)
FILM = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FILM')
if not FILM: sys.exit('give the film folder: FILM=<film folder> .venv/bin/python <this script>')
P = lambda p: p if os.path.isabs(p) else os.path.join(os.path.abspath(FILM), p)

# ---- the fix: change everything here (times in seconds; take times on the take's own timeline) -----------------------
CLIP = P('generations/S4/takes/take2/S4-take2-480p.mp4')        # the take
VOICE = P('audio/stems/S4-take2-480p/vocals.wav')               # its voice stem
BED = P('audio/stems/S4-take2-480p/no_vocals.wav')              # its background stem
NEW_TAKE = P('audio/fixes/S4-word/S4-word-clone.mp3')           # the line in the cloned voice
OUT = P('audio/fixes/S4-word/')
WORD = 'word'                                                   # for the file names
LINE_EQ = (10.30, 12.22)        # the character's line before the word, for the tone match
NEW_EQ = (0.12, 2.10)           # the same words in NEW_TAKE
MIX_FROM = (12.16, 12.21)       # crossfade from the original audio to background + edited voice
ORIG_VOWEL = (12.32, 12.46)     # the original word's vowel (level reference)
ORIG_PEAK = 12.355              # the original vowel's peak
KEEP_START_END, KEEP_END_START = 12.318, 12.485   # hybrid: the original's own consonants before and after the vowel
HYBRID_VOWEL = (2.178, 2.355)   # hybrid: the new vowel in NEW_TAKE
WHOLE_WORD = (2.10, 2.64)       # whole: the new word in NEW_TAKE
WHOLE_VOWEL = (2.18, 2.32)      # whole: its vowel (level), its end (echo timing) and peak (placement)
WHOLE_VOWEL_END, WHOLE_PEAK = 2.38, 2.22
ORIG_CUT = 12.24                # whole: the original voice is silenced from here
AB_SPAN = (11.45, 12.98)        # the span heard in the A/B
ECHO = [(None, 'dry'), (-48, 'barely any echo'), (-42, 'very slight echo')]
# -----------------------------------------------------------------------------------------------------------------------

SR = 44100
def ld(p, ch=1):
    x = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']), np.float32).astype(float)
    return x.reshape(-1, ch) if ch > 1 else x
def save(path, x, ch=2):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-', '-c:a', 'pcm_s24le', path],
                   input=np.asarray(x, np.float32).tobytes(), check=True)
os.makedirs(OUT, exist_ok=True)
orig = ld(CLIP, 2); voice = ld(VOICE); bed = ld(BED, 2)
n = len(orig); bed = np.vstack([bed, np.zeros((max(0, n - len(bed)), 2))])[:n]; voice = np.concatenate([voice, np.zeros(max(0, n - len(voice)))])[:n]
clone = ld(NEW_TAKE)
B = np.array([100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500])
def bands(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))**2; f = np.fft.rfftfreq(len(x), 1/SR)
    return np.array([10*np.log10(X[(f > b / 2**(1/6)) & (f < b * 2**(1/6))].mean() + 1e-20) for b in B])
S = lambda x, a, b: x[int(a*SR):int(b*SR)]
g = bands(S(voice, *LINE_EQ)) - bands(S(clone, *NEW_EQ))
g = np.convolve(np.pad(g - np.median(g), 1, mode='edge'), np.ones(3)/3, mode='valid'); g = np.clip(g, -8, 8)
fr = np.concatenate([[0], B, [14000, SR/2]]) / (SR/2); gl = np.concatenate([[g[0]], g, [g[-1] - 6, -40]])
cl = fftconvolve(clone, firwin2(8193, fr, 10**(gl/20)), mode='full')[4096:4096+len(clone)]
def make_ir(rt60, seed):
    rng = np.random.default_rng(seed); m = int((rt60*1.2 + 0.03)*SR); t = np.arange(m)/SR
    lo = sosfilt(butter(2, 3000, 'low', fs=SR, output='sos'), rng.standard_normal(m)) * np.exp(-6.91*t/rt60)
    hi = sosfilt(butter(2, 3000, 'high', fs=SR, output='sos'), rng.standard_normal(m)) * np.exp(-6.91*t/(rt60*0.5))
    ir = lo + 0.5*hi; ir[:int(0.02*SR)] = 0; return ir / np.sqrt(np.sum(ir**2))
IR = make_ir(1.0, 31)
def rms(x): return np.sqrt(np.mean(x**2) + 1e-20)
def add_echo(seg, vowel_end, level_db):
    """seg dry; returns seg + wet*reverb with the echo 150-350 ms after vowel_end (s) sitting level_db under the vowel peak."""
    y = np.concatenate([seg, np.zeros(int(0.8*SR))])
    if level_db is None: return y, 0.0
    rv = fftconvolve(y, IR)[:len(y)]; h = int(0.01*SR)
    peak = max(np.mean(seg[i:i+h]**2) for i in range(0, len(seg) - h, h))
    i0, i1 = int((vowel_end + 0.15)*SR), int((vowel_end + 0.35)*SR)
    wet = np.sqrt(peak * 10**(level_db/10) / np.mean(rv[i0:i1]**2)); return y + wet*rv, float(wet)
def place(track, x, at):
    j = int(at*SR); m = min(len(track) - j, len(x)); track[j:j+m] += x[:m]
def xf(n_): return np.linspace(0, 1, n_)
def mix_from(newvoice):
    m = orig.copy(); i0, i1 = int(MIX_FROM[0]*SR), int(MIX_FROM[1]*SR); f = xf(i1 - i0)[:, None]
    m[i0:i1] = orig[i0:i1]*(1 - f) + (bed[i0:i1] + newvoice[i0:i1, None])*f; m[i1:] = bed[i1:] + newvoice[i1:, None]; return m
orig_vowel = rms(S(voice, *ORIG_VOWEL))
def hybrid(level):
    a, b = HYBRID_VOWEL; v = S(cl, a, b).copy(); v *= orig_vowel / rms(v[int(0.02*SR):int(0.15*SR)])
    k = int(0.008*SR); v[:k] *= xf(k); k2 = int(0.012*SR); v[-k2:] *= xf(k2)[::-1]
    v, wet = add_echo(v, b - a, level)
    nv = voice.copy(); s0, s1 = int(KEEP_START_END*SR), int(KEEP_END_START*SR)
    nv[s0:s1] *= 0; nv[s0-k:s0] *= xf(k)[::-1]; nv[s1:s1+k2] *= xf(k2)   # the first consonant fades out as the vowel comes in; the last fades back in
    place(nv, v, KEEP_START_END); return mix_from(nv), wet
def whole(level):
    a, b = WHOLE_WORD; w = S(cl, a, b).copy(); t = np.arange(len(w))/SR + a
    k = int(0.01*SR); w[:k] *= xf(k); fo = t >= b - 0.05; w[fo] *= xf(np.sum(fo))[::-1]**1.5
    w *= orig_vowel / rms(S(cl, *WHOLE_VOWEL))
    w, wet = add_echo(w, WHOLE_VOWEL_END - a, level)
    nv = voice.copy(); nv[int(ORIG_CUT*SR):] = 0; place(nv, w, ORIG_PEAK - (WHOLE_PEAK - a)); return mix_from(nv), wet
gap = np.zeros((int(0.8*SR), 2))
def write_ab(m, name):
    save(os.path.join(OUT, name + '.wav'), np.concatenate([S(orig, *AB_SPAN), gap, S(m, *AB_SPAN)]))
    save(os.path.join(OUT, 'full clip audio - ' + name + '.wav'), m)
log = {}
for lv, lab in ECHO:
    for kind, fn in [('hybrid (own consonants, new vowel)', hybrid), ('whole new word', whole)]:
        m, wet = fn(lv); name = f'{WORD} - {kind} - {lab}'; write_ab(m, name); log[name] = dict(echo_db=lv, wet=round(wet, 3)); print(name, round(wet, 3))
json.dump(dict(eq_db=dict(zip(map(str, B.tolist()), np.round(g, 2).tolist())), files=log), open(os.path.join(OUT, 'ab-log.json'), 'w'), indent=1)
