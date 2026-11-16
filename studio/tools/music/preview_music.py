"""Preview a score cue under a stretch of the locked cut: the cue is laid in at a film time, ducked under the dialogue
(sidechain), mixed and normalised to -14 LUFS / -1 dBTP.
    .venv/bin/python tools/music/preview_music.py CUE.mp3 MUSIC_AT FROM TO NAME --film "$FILM" --picture <render.mp4>
        [--dialogue <dialogue.wav>] [--previews DIR] [--music-lufs -21]
      times in film seconds (MUSIC_AT may be 'end' = the cue ends on the last frame; TO may be 'end') -> <previews>/NAME.mp4
  --picture   the locked cut rendered with its dialogue only (tools/finish/cut_render.py --tracks <the dialogue tracks>);
              its sound is the dialogue unless --dialogue names another file
  --previews  where NAME.mp4 goes (default: the picture's folder)
Paths are film-relative or absolute; CUE.mp3 is a path as given. Unproven."""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
ap = argparse.ArgumentParser(description='One score cue under a stretch of the locked cut', formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
ap.add_argument('cue'); ap.add_argument('music_at'); ap.add_argument('start'); ap.add_argument('end'); ap.add_argument('name')
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--picture', help='the locked cut rendered with its dialogue (required)')
ap.add_argument('--dialogue', help='the dialogue as its own file (default: the picture\'s sound)')
ap.add_argument('--previews')
ap.add_argument('--music-lufs', type=float, default=-21.0)
A = ap.parse_args()
miss = [f'--{k}' for k in ('film', 'picture') if not getattr(A, k)]
if miss: sys.exit(f'preview_music.py: give {", ".join(miss)}')
T = os.path.abspath(os.path.expanduser(A.film)); P = lambda *a: os.path.join(T, *a)
E = lambda v: v if os.path.isabs(v) else P(v)
FPS, SR = 24, 48000

def lufs(path):
    e = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(next(l.split('I:')[1].split('LUFS')[0] for l in e.splitlines()[::-1] if ' I:' in l))

def main():
    cue, at, a, b, name = A.cue, A.music_at, A.start, A.end, A.name
    music_lufs = A.music_lufs
    pic_src = E(A.picture); dia_src = E(A.dialogue) if A.dialogue else pic_src
    film_end = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', pic_src], capture_output=True, text=True).stdout)
    a = float(a); b = film_end if b == 'end' else float(b)
    cue_len = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', cue], capture_output=True, text=True).stdout)
    at = film_end - cue_len if at == 'end' else float(at)
    tmp = tempfile.mkdtemp(prefix='mpv-')
    # picture: the window, frame-exact (decoded from the start, trimmed by frame number)
    fa, fb = round(a * FPS), round(b * FPS)
    pic = os.path.join(tmp, 'pic.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', pic_src, '-vf', f'trim=start_frame={fa}:end_frame={fb},setpts=PTS-STARTPTS',
                    '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', pic], check=True)
    # dialogue: the same window
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{a:.4f}', '-t', f'{b - a:.4f}', '-i', dia_src, '-vn', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    dia = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    dpath = os.path.join(tmp, 'dia.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', dpath], input=dia.tobytes(), check=True)
    dg = -16 - lufs(dpath); mg = music_lufs - lufs(cue)
    off = at - a                                      # music start inside the preview (may be negative: starts before the window)
    mus = f"[2:a]aresample={SR},volume={mg:.2f}dB," + (f"adelay={int(off * 1000)}|{int(off * 1000)}," if off > 0 else f"atrim=start={-off:.3f},asetpts=PTS-STARTPTS,") + f"apad,atrim=0:{b - a:.3f}[m]"
    fc = (f"[1:a]volume={dg:.2f}dB,asplit=2[d][key];{mus};"
          f"[m][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=750:makeup=1[md];"
          f"[d][md]amix=inputs=2:duration=first:normalize=0[a]")
    mix = os.path.join(tmp, 'mix.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', dpath, '-i', dpath, '-i', cue, '-filter_complex', fc.replace('[1:a]', '[0:a]'), '-map', '[a]', '-c:a', 'pcm_f32le', mix], check=True)
    g = -14 - lufs(mix)                               # measured gain to -14 LUFS, then a -1 dBTP limiter for the peaks
    prev = E(A.previews) if A.previews else os.path.dirname(pic_src); os.makedirs(prev, exist_ok=True); out = os.path.join(prev, f'{name}.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', pic, '-i', mix, '-af', f'volume={g:.2f}dB,alimiter=limit=0.891:level=disabled', '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', str(SR), '-movflags', '+faststart', out], check=True)
    print(f'{name}: film {a:.2f}-{b:.2f}s, cue at {at:.2f}s (ends {at + cue_len:.2f}, film ends {film_end:.2f}); dialogue {dg:+.1f} dB to -16 LUFS, '
          f'music {mg:+.1f} dB to {music_lufs} LUFS, ducked under speech; final loudness {lufs(out):.1f} LUFS -> {out}')

if __name__ == '__main__': main()
