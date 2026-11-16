"""The score laid against the locked cut, two ways: one WAV per cue, ready to lay on the cut's music track on the Edit page,
and a full-film preview. Every cue in audio/score/cues.json with a "use" block is laid in at its film time ("at", or
"end" = ends on the last frame), set to its "level" (LUFS), given per-section "gains" (dB by section index), cut at
"until" (film s) and ended "hard" (exactly on the cut, 30 ms) or "natural" (300 ms tail fade), then ducked under the
dialogue (sidechain on the dialogue; the gain reduction depends only on the dialogue, so each cue is ducked on its own and
the sum equals the ducked bus). Level and ducking are baked into the per-cue files; each file starts on a whole frame
(silence pads the sub-frame offset), so it can be placed by frame. The take of a cue is read from audio/score/score-log.json
("<CUE>-take<N>": {"file": ...}); shapes in tools/music/README.md.
    .venv/bin/python tools/music/mix_score.py NAME --film "$FILM" --picture <render.mp4> [--dialogue <dialogue.wav>]
        [--out audio/score/cues-mixed] [--previews DIR]
        -> <out>/<NN>-<CUE>.wav + manifest.json, <previews>/NAME.mp4
  --picture   the locked cut rendered with its dialogue only (tools/finish/cut_render.py --tracks <the dialogue tracks>);
              its length is the film's, its sound is the dialogue unless --dialogue names another file
  --previews  where NAME.mp4 goes (default: the --picture file's folder)
Paths are film-relative or absolute. Unproven: check df first (it writes a WAV per cue and a whole-film preview). Leaves
mix-* temp folders in $TMPDIR; delete them after a run."""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
ap = argparse.ArgumentParser(description='Cue score: one WAV per cue plus a full-film preview', formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
ap.add_argument('name', help='preview name: <previews>/NAME.mp4')
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--picture', help='the locked cut rendered with its dialogue (required)')
ap.add_argument('--dialogue', help='the dialogue as its own file (default: the picture\'s sound)')
ap.add_argument('--out', default=os.path.join('audio', 'score', 'cues-mixed'))
ap.add_argument('--previews')
A = ap.parse_args()
miss = [f'--{k}' for k in ('film', 'picture') if not getattr(A, k)]
if miss: sys.exit(f'mix_score.py: give {", ".join(miss)}')
T = os.path.abspath(os.path.expanduser(A.film)); P = lambda *a: os.path.join(T, *a)
E = lambda v: v if os.path.isabs(v) else P(v)
FPS, SR = 24, 48000
PIC = E(A.picture); DIA = E(A.dialogue) if A.dialogue else PIC
CFG = json.load(open(P('audio', 'score', 'cues.json'))); LOG = json.load(open(P('audio', 'score', 'score-log.json')))
OUT = E(A.out); PREV = E(A.previews) if A.previews else os.path.dirname(PIC)

def lufs(path):
    e = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(next(l.split('I:')[1].split('LUFS')[0] for l in e.splitlines()[::-1] if ' I:' in l))

def decode(path, ss=None, t=None):
    cmd = ['ffmpeg', '-v', 'error'] + (['-ss', f'{ss:.4f}', '-t', f'{t:.4f}'] if ss is not None else []) + ['-i', path, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32).reshape(-1, 2).copy()

def write_wav(path, x, fmt='pcm_f32le'):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', fmt, path], input=x.astype(np.float32).tobytes(), check=True)

def seconds(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout.strip())

def shaped(cue, c, u, film_end):
    """The cue at its level with section gains, cut and faded; returns (film start s, samples)."""
    f = P(LOG[f"{cue}-take{u['take']}"]['file']); x = decode(f)
    g = u.get('level', -21) - lufs(f); x *= 10 ** (g / 20)
    if 'gains' in u:
        edges = [c['at']] + [s['to'] for s in c['sections']]; env = np.ones(len(x), np.float32)
        for k, db in u['gains'].items():
            env[int((edges[int(k)] - edges[0]) * SR):int((edges[int(k) + 1] - edges[0]) * SR)] = 10 ** (db / 20)
        r = int(0.1 * SR); env = np.convolve(env, np.ones(r) / r, mode='same'); x *= env[:, None]
    at = film_end - len(x) / SR if u.get('at', c.get('at')) == 'end' else c['at']
    if u.get('end') == 'hard': x = x[:int(round((u.get('cut_at', c['sections'][-1]['to']) - at) * SR))]   # cues may overrun the cut so they are still playing there
    if 'until' in u: x = x[:int(round((u['until'] - at) * SR))]
    fade = int((0.03 if u.get('end') == 'hard' else 0.3) * SR); x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return at, x[:int((film_end - at) * SR)], g

def duck(x, key, tmp):
    a, k, o = (os.path.join(tmp, n) for n in ('c.wav', 'k.wav', 'o.wav')); tail = np.zeros((SR, 2), np.float32)
    write_wav(a, np.concatenate([x, tail])); write_wav(k, np.concatenate([key, tail]))   # the filter drops the last block: pad, then trim
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a, '-i', k, '-filter_complex', '[0:a][1:a]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=750:makeup=1[o]',
                    '-map', '[o]', '-c:a', 'pcm_f32le', o], check=True)
    return decode(o)[:len(x)]

def main():
    name = A.name; tmp = tempfile.mkdtemp(prefix='mix-')
    film_end = seconds(PIC); n = int(round(film_end * SR)); pic = PIC
    dia = np.zeros((n, 2), np.float32); x = decode(DIA)[:n]; dia[:len(x)] = x
    dpath = os.path.join(tmp, 'dia.wav'); write_wav(dpath, dia); dia_gain = -16 - lufs(dpath); dia *= 10 ** (dia_gain / 20)
    cues = sorted(((c['at'] if c.get('at') is not None and (c.get('use') or {}).get('at') != 'end' else 1e9, k) for k, c in CFG['cues'].items() if c.get('use')))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.wav'): os.remove(os.path.join(OUT, f))
    bus = np.zeros((n, 2), np.float32); manifest = []
    for no, (_, cue) in enumerate(cues, 1):
        c = CFG['cues'][cue]; at, x, g = shaped(cue, c, c['use'], film_end)
        f0 = int(np.floor(at * FPS + 1e-6)); pad = int(round((at - f0 / FPS) * SR))       # start the file on a whole frame
        x = np.concatenate([np.zeros((pad, 2), np.float32), x]); s0 = int(round(f0 / FPS * SR))
        key = dia[s0:s0 + len(x)]; key = np.concatenate([key, np.zeros((len(x) - len(key), 2), np.float32)])
        y = duck(x, key, tmp); bus[s0:s0 + len(y)] += y[:n - s0]
        wav = os.path.join(OUT, f'{no:02d}-{cue}.wav'); write_wav(wav, y, 'pcm_s24le')
        manifest.append(dict(cue=cue, file=os.path.relpath(wav, T), record_frame=f0, frames=int(np.ceil(len(y) / SR * FPS)), start_s=round(f0 / FPS, 3),
                             end_s=round(f0 / FPS + len(y) / SR, 3), level=c['use'].get('level'), gain_db=round(g, 2), purpose=c.get('purpose')))
    json.dump(dict(picture=os.path.relpath(PIC, T), film_end_s=round(film_end, 3), cues=manifest), open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    mix = os.path.join(tmp, 'mix.wav'); write_wav(mix, dia + bus)
    g = -14 - lufs(mix); os.makedirs(PREV, exist_ok=True); out = os.path.join(PREV, f'{name}.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', pic, '-i', mix, '-af', f'volume={g:.2f}dB,alimiter=limit=0.891:level=disabled', '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', str(SR), '-movflags', '+faststart', out], check=True)
    fmt = lambda s: f'{int(s // 60)}:{s % 60:05.2f}'
    for m in manifest: print(f"  {m['cue']:6} {fmt(m['start_s'])} - {fmt(m['end_s'])}  frame {m['record_frame']}")
    cov = np.abs(bus).max(1) > 10 ** (-60 / 20); gaps = []; s = None
    for i in range(0, n, SR // 10):
        if not cov[i:i + SR // 10].any():
            s = i if s is None else s
        elif s is not None:
            if (i - s) / SR >= 1.5: gaps.append((fmt(s / SR), fmt(i / SR)))
            s = None
    print('music gaps >= 1.5 s:', gaps)
    print(f'{name}: {fmt(film_end)}, dialogue {dia_gain:+.1f} dB to -16 LUFS, mix gain {g:+.1f} dB to -14 LUFS -> {out}')

if __name__ == '__main__': main()
