"""A word fix, the whole new word inserted dry into the original sentence. A template: copy it next to the fix, change the
settings below, run the copy.
    FILM=<film folder> .venv/bin/python tools/review/s4_parse_c6_insert.py     (or the film folder as the first argument)
NEW_TAKE is the line spoken again in the character's cloned voice (a Higgsfield call Alma makes, saved as a file). Its
whole word (WORD_SPAN), dry, own pitch, its vowel peak on the original vowel peak, loudness matched to the original vowel;
the original line up to the word untouched, the take's background stem under the new word. Two tone options: as is, and
tone-matched to the original line (1/3 octave EQ). Writes, for each, OUT/<name>.wav (the original span, 0.8 s of silence,
the new span) and OUT/full clip audio - <name>.wav."""
import os, subprocess, sys
import numpy as np
from scipy.signal import firwin2, fftconvolve

if '-h' in sys.argv or '--help' in sys.argv: print(__doc__); sys.exit(0)
FILM = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FILM')
if not FILM: sys.exit('give the film folder: FILM=<film folder> .venv/bin/python <this script>')
P = lambda p: p if os.path.isabs(p) else os.path.join(os.path.abspath(FILM), p)

# ---- the fix: change everything here (times in seconds) ----------------------------------------------------------------
CLIP = P('generations/S4/takes/take2/S4-take2-480p.mp4')        # the take
VOICE = P('audio/stems/S4-take2-480p/vocals.wav')               # its voice stem (tools/stems/split.py)
BED = P('audio/stems/S4-take2-480p/no_vocals.wav')              # its background stem
NEW_TAKE = P('audio/fixes/S4-word/S4-word-clone-c6.mp3')        # the line in the cloned voice
OUT = P('audio/fixes/S4-word/')
WORD = 'word'                   # for the file names
LINE_EQ = (10.30, 12.22)        # the original line before the word, for the tone match
NEW_EQ = (0.10, 2.42)           # the same words in NEW_TAKE
WORD_SPAN = (2.42, 2.98)        # the new word in NEW_TAKE
WORD_VOWEL = (2.51, 2.61)       # its vowel (level) and the vowel's peak (placement)
WORD_PEAK = 2.53
ORIG_VOWEL = (12.32, 12.46)     # the original word's vowel (level reference) and its peak
ORIG_PEAK = 12.355
ORIG_CUT = 12.235               # the original voice is silenced from here
MIX_FROM = (12.16, 12.21)       # crossfade from the original audio to background + edited voice
AB_SPAN = (11.45, 12.98)        # the span heard in the A/B
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
new = ld(NEW_TAKE)
B = np.array([100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500])
def bands(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))**2; f = np.fft.rfftfreq(len(x), 1/SR)
    return np.array([10*np.log10(X[(f > b / 2**(1/6)) & (f < b * 2**(1/6))].mean() + 1e-20) for b in B])
def rms(x): return np.sqrt(np.mean(x**2) + 1e-20)
S = lambda x, a, b: x[int(a*SR):int(b*SR)]
orig_vowel = rms(S(voice, *ORIG_VOWEL))
def build(eq):
    x = new
    if eq:
        g = bands(S(voice, *LINE_EQ)) - bands(S(new, *NEW_EQ))
        g = np.convolve(np.pad(g - np.median(g), 1, mode='edge'), np.ones(3)/3, mode='valid'); g = np.clip(g, -8, 8)
        fr = np.concatenate([[0], B, [14000, SR/2]]) / (SR/2); gl = np.concatenate([[g[0]], g, [g[-1] - 6, -40]])
        x = fftconvolve(new, firwin2(8193, fr, 10**(gl/20)), mode='full')[4096:4096+len(new)]
    a, b = WORD_SPAN; w = S(x, a, b).copy(); k = int(0.008*SR); w[:k] *= np.linspace(0, 1, k); w[-k:] *= np.linspace(1, 0, k)
    w *= orig_vowel / rms(S(x, *WORD_VOWEL))
    at = ORIG_PEAK - (WORD_PEAK - a)
    nv = voice.copy(); nv[int(ORIG_CUT*SR):] = 0; j = int(at*SR); m = min(n - j, len(w)); nv[j:j+m] += w[:m]
    mix = orig.copy(); i0, i1 = int(MIX_FROM[0]*SR), int(MIX_FROM[1]*SR); f = np.linspace(0, 1, i1 - i0)[:, None]
    mix[i0:i1] = orig[i0:i1]*(1 - f) + (bed[i0:i1] + nv[i0:i1, None])*f; mix[i1:] = bed[i1:] + nv[i1:, None]
    return mix, at
gap = np.zeros((int(0.8*SR), 2))
for eq, lab in [(False, 'as is'), (True, 'tone-matched')]:
    mix, at = build(eq); name = f'{WORD} - whole new word - dry - {lab}'
    save(os.path.join(OUT, name + '.wav'), np.concatenate([S(orig, *AB_SPAN), gap, S(mix, *AB_SPAN)]))
    save(os.path.join(OUT, 'full clip audio - ' + name + '.wav'), mix)
    print(name, 'word at', round(at, 3), 'peak', round(20*np.log10(np.abs(mix).max()), 1), 'dBFS')
