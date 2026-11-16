"""One generation's frame count, the frames of its own shot changes, and its words with times, with each shot change marked
between the words: where its dead head and tail are, and the frames where the speaker changes.
    .venv/bin/python tools/edit/probe_clip.py --film PATH video/raw/G05-draft.mp4 [--thresh 18] [--no-words]
Shot changes: mean absolute difference between consecutive frames of a 96x170 grey decode above THRESH (18 finds every cut in
Seedance generations). The decode uses -fps_mode passthrough and counts frames from the start, never -ss.
Words: Whisper on this Mac (tools/lib/stt.py); --no-words skips it. The clip is any
path relative to the film root, e.g. generations/S4/takes/take2/S4-take2-480p.mp4."""
import argparse, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))   # stt.py lives in tools/lib/
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('clip', help='path relative to the film root, or absolute')
ap.add_argument('--film', default=os.environ.get('FILM'), help='film project root (or FILM=...)')
ap.add_argument('--thresh', type=float, default=18.0)
ap.add_argument('--fps', type=float, default=24.0)
ap.add_argument('--no-words', action='store_true')
a = ap.parse_args()
F = os.path.abspath(a.film) if a.film else os.getcwd(); os.environ['FILM'] = F
path = os.path.join(F, a.clip)

r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'scale=96:170,format=gray', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                   capture_output=True, check=True).stdout
X = np.frombuffer(r, np.uint8).reshape(-1, 170 * 96).astype(np.float32)
d = np.abs(np.diff(X, axis=0)).mean(1)
cuts = [int(i + 1) for i in np.where(d > a.thresh)[0]]
print(f'{a.clip}: {len(X)} frames = {len(X) / a.fps:.3f} s')
print('shot changes (first frame of the new shot):', ', '.join(f'{c} ({c / a.fps:.3f} s)' for c in cuts) or 'none')
shots = [0] + cuts + [len(X)]
short = [(s, e) for s, e in zip(shots[:-1], shots[1:]) if e - s < 3]
if short: print('WARNING shots under 3 frames (flash risk):', short)

if not a.no_words:
    import stt
    wav = f'/tmp/probe-{os.path.basename(path)}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
    W = stt.stt_words(wav)
    out, ci = [], 0
    for w in W:
        while ci < len(cuts) and cuts[ci] / a.fps <= w['start']:
            out.append(f'\n  || shot change at frame {cuts[ci]} ({cuts[ci] / a.fps:.3f} s) ||\n'); ci += 1
        tag = w['text'] if w['type'] == 'word' else f"({w['text']})"
        out.append(f"{tag}[{w['start']:.2f}-{w['end']:.2f}]")
    while ci < len(cuts):
        out.append(f'\n  || shot change at frame {cuts[ci]} ({cuts[ci] / a.fps:.3f} s) ||'); ci += 1
    print('words:', ' '.join(out))
    ws = [w for w in W if w['type'] == 'word']
    if ws: print(f"first word at {ws[0]['start']:.2f} s, last word ends {ws[-1]['end']:.2f} s (clip ends {len(X) / a.fps:.2f} s)")
