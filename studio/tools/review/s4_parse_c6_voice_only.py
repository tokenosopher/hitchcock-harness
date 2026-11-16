"""A word fix as a voice-only line for the cut's dialogue track: the take's voice stem up to the word, then the new word
(tone-matched to the line, dry, at the same place and level as the full-mix version from s4_parse_c6_insert.py), a 60 ms
fade to silence at END, padded to the picture (FRAMES at FPS), 48 kHz. A template: copy it next to the fix, change the
settings below, run the copy.
    FILM=<film folder> .venv/bin/python tools/review/s4_parse_c6_voice_only.py  (or the film folder as the first argument)
STEM is the take's voice stem from tools/stems/split.py; NEW_TAKE the line spoken again in the character's cloned voice
(a Higgsfield call Alma makes, saved as a file). Writes DST."""
import os, subprocess, sys
import numpy as np
from scipy.signal import firwin2, fftconvolve

if '-h' in sys.argv or '--help' in sys.argv: print(__doc__); sys.exit(0)
FILM = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('FILM')
if not FILM: sys.exit('give the film folder: FILM=<film folder> .venv/bin/python <this script>')
P = lambda p: p if os.path.isabs(p) else os.path.join(os.path.abspath(FILM), p)

# ---- the fix: change everything here (times in seconds) ----------------------------------------------------------------
STEM = P('audio/stems/S4-take2-480p/vocals.wav')                # the take's voice stem
NEW_TAKE = P('audio/fixes/S4-word/S4-word-clone-c6.mp3')        # the line in the cloned voice
DST = P('audio/fixes/S4-word/S4-take2 voice with the new word.wav')
LINE_EQ = (10.30, 12.22)        # the original line before the word, for the tone match
NEW_EQ = (0.10, 2.42)           # the same words in NEW_TAKE
WORD_SPAN = (2.42, 2.98)        # the new word in NEW_TAKE
WORD_VOWEL = (2.51, 2.61)       # its vowel (level) and peak (placement)
WORD_PEAK = 2.53
ORIG_VOWEL = (12.32, 12.46)     # the original vowel (level reference) and its peak
ORIG_PEAK = 12.355
FADE_OUT = (12.215, 12.235)     # the original voice fades out here
END = 12.96                     # the line ends here, with a 60 ms fade
FRAMES, FPS = 313, 24           # padded to the picture
# -----------------------------------------------------------------------------------------------------------------------

SR = 44100
def ld(p, ch=1):
    x = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']), np.float32).astype(float)
    return x.reshape(-1, ch) if ch > 1 else x
stem = ld(STEM, 2); voice = stem.mean(1)
new = ld(NEW_TAKE)
B = np.array([100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500])
def bands(x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))**2; f = np.fft.rfftfreq(len(x), 1/SR)
    return np.array([10*np.log10(X[(f > b / 2**(1/6)) & (f < b * 2**(1/6))].mean() + 1e-20) for b in B])
def rms(x): return np.sqrt(np.mean(x**2) + 1e-20)
S = lambda x, a, b: x[int(a*SR):int(b*SR)]
g = bands(S(voice, *LINE_EQ)) - bands(S(new, *NEW_EQ))
g = np.convolve(np.pad(g - np.median(g), 1, mode='edge'), np.ones(3)/3, mode='valid'); g = np.clip(g, -8, 8)
fr = np.concatenate([[0], B, [14000, SR/2]]) / (SR/2); gl = np.concatenate([[g[0]], g, [g[-1] - 6, -40]])
x = fftconvolve(new, firwin2(8193, fr, 10**(gl/20)), mode='full')[4096:4096+len(new)]
a, b = WORD_SPAN; w = S(x, a, b).copy(); k = int(0.008*SR); w[:k] *= np.linspace(0, 1, k); w[-k:] *= np.linspace(1, 0, k)
w *= rms(S(voice, *ORIG_VOWEL)) / rms(S(x, *WORD_VOWEL))
out = stem.copy(); c0, c1 = int(FADE_OUT[0]*SR), int(FADE_OUT[1]*SR); out[c0:c1] *= np.linspace(1, 0, c1 - c0)[:, None]; out[c1:] = 0
at = ORIG_PEAK - (WORD_PEAK - a); j = int(at*SR); m = min(len(out) - j, len(w)); out[j:j+m] += w[:m, None]
end = int(END*SR); out = out[:end]; f = int(0.06*SR); out[-f:] *= (np.cos(np.linspace(0, np.pi, f))*0.5 + 0.5)[:, None]
os.makedirs(os.path.dirname(DST), exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', 'aresample=48000,apad',
                '-t', f'{FRAMES/FPS:.6f}', '-c:a', 'pcm_s24le', DST], input=out.astype(np.float32).tobytes(), check=True)
print('ok', DST)
