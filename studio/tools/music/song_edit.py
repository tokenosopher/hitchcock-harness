"""Edit a composed take into the film on its measured beat grid: bar-line cuts and repeats (15 ms crossfades), organ swells
into hand-overs, smooth ducks for beats that should land in near-silence, an end fade. Everything film-specific is in a
JSON spec in the film (its shape and an example: tools/music/README.md).
    .venv/bin/python tools/music/song_edit.py --film "$FILM" audio/score/song-edit.json audio/score/<CUE>-take<N>-edit.mp3

Spec (times in seconds; a time may also be {"bar": k} = first_beat + k * bar, on the TAKE's grid):
  take          the composed take, relative to the film root
  grid          {"first_beat": s, "bar": s}  from beat_grid.py (bar = 4 beats in 4/4)
  segments      [[from, to], ...] stretches of the take, played in order (usually {"bar": k} bar lines; null = the
                take's end). The result is cut (or padded with silence) to "length", by default the take's own
                length. Repeat staccato passages; a repeated sliding lead re-attacks audibly.
  length        optional total length in seconds (e.g. the cut's), to fill a take that is too short with an earlier
                groove section
  xfade         crossfade at each join (default 0.015)
  organ         optional: a synthesised mono, dry, band-limited tremolo organ chord swelling into each hand-over:
                {"chord_hz": [...], "handover_bars": [...], "film_offset": s (film time = take time + offset),
                 "swell": 2.0, "hold": 0.5, "tail": 2.0, "decay": 0.5, "level_db": -8, "ref_window": [16, 36], "seed": 3}
                Build the chord from the take's MEASURED key: a pitch-shifted wrong chord keeps its clash.
  ducks         [{"down": [d0, d1], "up": [u0, u1], "depth_db": 14}, ...] in film time, cosine ramps; a duck sounds
                natural where a bass-only stem sounds thin
  fade          [e0, e1]: faded out between e0 and e1, silent after (fade before the take's own drop-out)"""
import argparse, json, os, subprocess, sys
import numpy as np

SR = 48000
ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('--film', default=os.environ.get('FILM'), help='film project root (or FILM=...)')
ap.add_argument('spec', help='the edit spec (JSON), relative to the film root')
ap.add_argument('out', help='output audio (.mp3 or .wav), relative to the film root')
a = ap.parse_args()
if not a.film: sys.exit('song_edit.py: give --film PATH or FILM=PATH (the film project root)')
F = os.path.abspath(a.film)
P = lambda p: p if os.path.isabs(p) else os.path.join(F, p)
S = json.load(open(P(a.spec)))
PH, BAR = S['grid']['first_beat'], S['grid']['bar']
B = lambda k: PH + k * BAR
T = lambda v: B(v['bar']) if isinstance(v, dict) else float(v)


def dec(p): return np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout, np.float32).reshape(-1, 2)


song = dec(P(S['take'])); n = len(song)
segs = [(T(x), n / SR if y is None else T(y)) for x, y in S['segments']]
xf = int(S.get('xfade', 0.015) * SR); out = np.zeros((0, 2), np.float32)
for x, y in segs:
    piece = song[int(x * SR):int(y * SR) + xf].copy()
    if len(out):
        w = np.linspace(0, 1, xf)[:, None]; out[-xf:] = out[-xf:] * (1 - w) + piece[:xf] * w; piece = piece[xf:]
    out = np.concatenate([out, piece])
L = int(round(float(S['length']) * SR)) if S.get('length') else n
out = np.concatenate([out, np.zeros((max(0, L - len(out)), 2), np.float32)])[:L].copy()

O = S.get('organ')
if O:
    rng = np.random.default_rng(O.get('seed', 3))      # one generator for all swells, in order (as the original)

    def organ(dur):
        t = np.arange(int(dur * SR)) / SR; sig = np.zeros((len(t), 2))
        for f0 in O['chord_hz']:
            for h, amp in zip((1, 2, 3, 4, 6, 8), (1, .7, .4, .35, .2, .15)):
                for det in (-3, 3):                                           # two voices a few cents apart, both centred: mono like the band
                    sig += (amp * np.sin(2 * np.pi * f0 * h * 2 ** (det / 1200) * t + rng.uniform(0, 6.28)))[:, None]
        sig *= (1 - 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 6.8 * t)))[:, None]   # tremolo
        k = int(0.0006 * SR); sig = np.apply_along_axis(lambda c: np.convolve(c, np.ones(k) / k, 'same'), 0, sig)  # darker top
        X = np.fft.rfft(sig, axis=0); f = np.fft.rfftfreq(len(sig), 1 / SR)   # vintage tape: ~250 Hz-3 kHz, gently saturated
        X *= ((1 / (1 + (250 / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / 3000) ** 4)))[:, None]
        sig = np.fft.irfft(X, n=len(sig), axis=0); sig = np.tanh(1.8 * sig / np.abs(sig).max())
        return sig / np.sqrt((sig ** 2).mean())

    r0, r1 = O.get('ref_window', [16, 36])
    ref = np.sqrt((song[int(r0 * SR):int(r1 * SR)] ** 2).mean())
    sw, hold, tail, decay = O.get('swell', 2.0), O.get('hold', 0.5), O.get('tail', 2.0), O.get('decay', 0.5)
    for k in O['handover_bars']:
        hand = B(k) + O.get('film_offset', 0.0)                              # in film time (after any intro cut)
        dur = sw + hold + tail; o = organ(dur); t = np.arange(len(o)) / SR
        env = np.where(t < sw, (t / sw) ** 2, np.where(t < sw + hold, 1.0, np.exp(-(t - (sw + hold)) / decay)))
        at = int((hand - sw) * SR); seg = o * env[:, None] * ref * 10 ** (O.get('level_db', -8) / 20)
        out[at:at + len(seg)] += seg[:len(out) - at]

t = np.arange(len(out)) / SR
for d in S.get('ducks', []):
    g = np.ones(len(out)); lo = 10 ** (-d.get('depth_db', 14) / 20)
    d0, d1 = (T(v) for v in d['down']); u0, u1 = (T(v) for v in d['up'])
    m = (t >= d0) & (t < d1); g[m] = lo + (1 - lo) * 0.5 * (1 + np.cos(np.pi * (t[m] - d0) / (d1 - d0)))
    g[(t >= d1) & (t < u0)] = lo
    m = (t >= u0) & (t < u1); g[m] = lo + (1 - lo) * 0.5 * (1 - np.cos(np.pi * (t[m] - u0) / (u1 - u0)))
    out *= g[:, None]
if S.get('fade'):
    e0, e1 = (T(v) for v in S['fade']); m = (t >= e0) & (t < e1)
    out[m] *= (0.5 * (1 + np.cos(np.pi * (t[m] - e0) / (e1 - e0))))[:, None]; out[t >= e1] = 0
out = np.clip(out, -1, 1)
dst = P(a.out); os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-b:a', '256k', dst], input=out.astype(np.float32).tobytes(), check=True)
print(dst, f'{len(out) / SR:.2f}s; segments (take s):', [(round(x, 3), round(y, 3)) for x, y in segs],
      '; organ swells peak at film', [round(B(k) + O.get('film_offset', 0.0), 2) for k in O['handover_bars']] if O else 'none',
      '; ducks', [(round(T(d['down'][0]), 2), round(T(d['up'][1]), 2)) for d in S.get('ducks', [])])
