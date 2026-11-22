"""Lay a finished song (the user's own, or an approved take) under the whole film, untouched: full range, full stereo.
Only three things are done to it:
- level: the bed is set BED dB under the dialogue's speech level, then dipped gently under speech by a sidechain from the
  film's own sound (about 8 dB under the dialogue while anyone speaks and about 2.5 dB higher in the gaps);
- stops: at each --stop T (a door slam, a beat that should land in silence) it ducks 14 dB over the 0.55 s before T,
  holds to T+1.0 and comes back over 1.2 s;
- the end: faded out over 2 s, finished --black seconds before the last frame so the final black is silent.
The film's own sound (dialogue, room, effects) is never touched; the picture is copied. A muffled lo-fi chain exists
only behind --fx lofi (or SONG_FX=lofi); never use it unless the user asks for a muffled sound in those words.

    .venv/bin/python tools/music/lay_song.py --film "$FILM" --song audio/score/song.wav --picture <dialogue render.mp4> \\
        --out audio/score/auditions/song-v<N>.mp4 [--stop 132.2 ...] [--bed-out audio/score/song-v<N>-as-mixed.wav] \\
        [--preview 30] [--lowres] [--size 480:854] [--bed-db 4.5] [--black 0.45]
Relative paths are taken from the film root. --preview N also writes OUT-first<N>-480p.mp4 (the first N s, low-res,
1 s fade); --lowres also writes OUT-480p.mp4 (the whole film, same sound). --bed-out writes the bed exactly as mixed
(level, dip, stops, fade) as a 24-bit WAV, the file laid on the cut's music track (Flow v3.3 - 11 Sound and music).
Every run prints the measured bed level under speech and in gaps."""
import argparse, os, shutil, subprocess, sys, tempfile
import numpy as np

SR = 48000
LOFI = 'highpass=f=90,lowpass=f=4200,lowpass=f=6000,vibrato=f=0.5:d=0.05,acrusher=bits=11:mode=log:aa=1:mix=0.25,extrastereo=m=0.5'
DIP = 'sidechaincompress=threshold=0.06:ratio=1.8:attack=60:release=500:makeup=1'   # gentle: 2.5:0.04 left the bed 15 dB under

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('--film', default=os.environ.get('FILM'), help='film project root (or FILM=...)')
ap.add_argument('--song', default=os.environ.get('SONG'), required=False, help='the song (WAV preferred), relative to the film root')
ap.add_argument('--picture', required=True, help='the cut without music (picture + the clips\' own sound)')
ap.add_argument('--out', required=True, help='the mixed film to write (.mp4)')
ap.add_argument('--stop', type=float, action='append', default=[], help='film second of a beat that lands in silence (repeatable)')
ap.add_argument('--stop-depth', type=float, default=14.0, help='dB the bed drops at a stop (default 14)')
ap.add_argument('--bed-db', type=float, default=4.5, help='bed level in dB under the speech level, before the dip (default 4.5)')
ap.add_argument('--level-window', type=float, default=140.0, help='seconds of the song used to measure its level (default 140)')
ap.add_argument('--black', type=float, default=0.45, help='seconds of silent final black after the fade (default 0.45)')
ap.add_argument('--bed-out', help='also write the bed as mixed (24-bit WAV), the file laid on the timeline')
ap.add_argument('--preview', type=float, help='also write the first N seconds at 480p with a 1 s fade')
ap.add_argument('--lowres', action='store_true', help='also write a 480p copy of the whole film')
ap.add_argument('--size', default='480:854', help='low-res frame size for --preview/--lowres (default 480:854, 9:16)')
ap.add_argument('--fx', default=os.environ.get('SONG_FX'), help="'lofi' brings back the rejected muffled chain; default none")
a = ap.parse_args()
if not a.film: sys.exit('lay_song.py: give --film PATH or FILM=PATH (the film project root)')
if not a.song: sys.exit('lay_song.py: give --song PATH (or SONG=...)')
F = os.path.abspath(a.film)
P = lambda p: p if os.path.isabs(p) else os.path.join(F, p)
film, song, out = P(a.picture), P(a.song), P(a.out)
tmp = tempfile.mkdtemp(prefix=f'lay-{os.path.basename(F)}-')


def dec(p, af=None, ch=2):
    c = ['ffmpeg', '-v', 'error', '-i', p] + (['-af', af] if af else []) + ['-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(c, capture_output=True, check=True).stdout, np.float32).reshape(-1, ch).copy()


def rms_db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


dia = dec(film); n = len(dia); m = dec(song, LOFI if a.fx == 'lofi' else None)
m = np.concatenate([m, np.zeros((max(0, n - len(m)), 2), np.float32)])[:n]
# level: BED dB under the dialogue speech level (speech = the half-second windows above -30 dB), before the dip
w = SR // 2; d_win = [rms_db(dia[i:i + w]) for i in range(0, n - w, w)]
speech = np.median([x for x in d_win if x > -30])
m *= 10 ** ((speech - a.bed_db - rms_db(m[:int(a.level_window * SR)])) / 20)
t = np.arange(n) / SR
g = np.ones(n)
lo = 10 ** (-a.stop_depth / 20)
for s in a.stop:      # down over the half second before the beat, held through it, back up under the next line
    gs = np.ones(n)
    for x, y, x0, x1 in ((s - 0.6, s - 0.05, 1, lo), (s - 0.05, s + 1.0, lo, lo), (s + 1.0, s + 2.2, lo, 1)):
        k = (t >= x) & (t < y); gs[k] = x0 + (x1 - x0) * (0.5 - 0.5 * np.cos(np.pi * (t[k] - x) / (y - x)))
    g *= gs
end = n / SR - a.black          # faded out by the final black
k = t >= end - 2.0; g[k] *= np.clip((end - t[k]) / 2.0, 0, 1) ** 2
m *= g[:, None]
bed = os.path.join(tmp, 'bed.f32'); open(bed, 'wb').write(m.astype(np.float32).tobytes())
# the gentle dip under speech (sidechain from the film's own sound), then the two summed and peak-limited
fc = ('[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo[mb];[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,asplit[d][sc];'
      f'[mb][sc]{DIP}[md];'
      '[d][md]amix=inputs=2:normalize=0,alimiter=limit=0.89:level=false[a]')
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', film, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', bed,
                '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out], check=True)
print(out, f'bed at {speech - a.bed_db:.1f} dB (speech {speech:.1f}); stops at', a.stop or 'none')

# the bed as mixed (after the dip), for the timeline and for measuring: measure the bed itself, never mix minus dialogue
# (re-encoding the dialogue leaves differences that read as music)
bed_out = P(a.bed_out) if a.bed_out else os.path.join(tmp, 'bed-as-mixed.wav')
os.makedirs(os.path.dirname(bed_out) or '.', exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', film, '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', bed, '-filter_complex',
                f'[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo[mb];[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[sc];[mb][sc]{DIP}[md]',
                '-map', '[md]', '-c:a', 'pcm_s24le', bed_out], check=True)
da, mb = dec(film, ch=1)[:, 0], dec(bed_out, ch=1)[:, 0]; nn = min(len(da), len(mb))
A = np.array([rms_db(da[i:i + w]) for i in range(0, nn - w, w)]); M = np.array([rms_db(mb[i:i + w]) for i in range(0, nn - w, w)]); sp = A > -30
print(f'measured: bed {np.median(A[sp]) - np.median(M[sp]):.1f} dB under the dialogue while speaking, '
      f'{np.median(A[sp]) - np.median(M[~sp]):.1f} dB under in the gaps' + (f'; bed as mixed -> {bed_out}' if a.bed_out else ''))

stem = os.path.splitext(out)[0]
if a.preview:
    pv = f'{stem}-first{int(a.preview)}-480p.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-t', str(a.preview), '-i', out, '-vf', f'scale={a.size}:flags=lanczos',
                    '-af', f'afade=t=out:st={a.preview - 1}:d=1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', pv], check=True)
    print('preview ->', pv)
if a.lowres:
    lr = f'{stem}-480p.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-vf', f'scale={a.size}:flags=lanczos', '-c:v', 'libx264', '-preset', 'fast',
                    '-crf', '22', '-c:a', 'copy', '-movflags', '+faststart', lr], check=True)
    print('low-res ->', lr)
shutil.rmtree(tmp, ignore_errors=True)   # the bed files are about 100 MB per run
