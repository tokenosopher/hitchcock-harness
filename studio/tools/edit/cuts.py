"""Cut detection and clip probing shared by the edit, finish and take tools.
A cut is a frame whose ffmpeg scene score is above 0.18 (0.30 misses a cut between two shots of the same room). Change the
threshold here, nowhere else.
    .venv/bin/python tools/edit/cuts.py <clip.mp4> [<clip.mp4> ...] [--threshold 0.18] [--json]
prints each clip's length, frame count and cut points (seconds and the frame number of the first frame of the new shot)."""
import argparse, json, re, subprocess, sys

THRESHOLD = 0.18


def probe(path):
    """{duration, frames, fps, width, height, has_audio, audio_duration} of a clip, from ffprobe (frames counted by packet, not estimated)."""
    def q(*a):
        return subprocess.run(['ffprobe', '-v', 'error', *a, path], capture_output=True, text=True).stdout.strip()
    v = q('-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_packets', '-of', 'json')
    s = (json.loads(v or '{}').get('streams') or [{}])[0]
    if not s:
        raise SystemExit(f'not a video file (no video stream): {path}')
    num, den = (s.get('r_frame_rate') or '24/1').split('/')
    fps = float(num) / float(den or 1)
    dur = float(q('-show_entries', 'format=duration', '-of', 'csv=p=0') or 0)
    frames = int(s.get('nb_read_packets') or round(dur * fps))
    a = q('-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0')
    has_audio = bool(a)
    adur = float(a) if a and a.replace('.', '', 1).isdigit() else (dur if has_audio else 0.0)
    return dict(duration=round(dur, 3), frames=frames, fps=fps, width=int(s.get('width') or 0), height=int(s.get('height') or 0),
                has_audio=has_audio, audio_duration=round(adur, 3))


def detect_cuts(path, threshold=THRESHOLD):
    """The clip's own cut points in seconds (pts of the first frame of each new shot), ffmpeg scene score > threshold."""
    o = subprocess.run(['ffmpeg', '-v', 'info', '-nostats', '-an', '-i', path, '-vf', f"select='gt(scene,{threshold})',showinfo", '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    return [round(float(x), 3) for x in re.findall(r'pts_time:([0-9.]+)', o)]


def cut_frames(cuts, fps):
    """Frame numbers (counted from the clip's first frame) of the cut times."""
    return [int(round(t * fps)) for t in cuts]


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('clips', nargs='+')
    ap.add_argument('--threshold', type=float, default=THRESHOLD)
    ap.add_argument('--json', action='store_true', help='print one json object per clip')
    a = ap.parse_args()
    for c in a.clips:
        p = probe(c); cs = detect_cuts(c, a.threshold)
        if a.json:
            print(json.dumps(dict(clip=c, threshold=a.threshold, cuts=cs, cut_frames=cut_frames(cs, p['fps']), **p)))
        else:
            print(f"{c}: {p['frames']} frames, {p['duration']:.3f} s at {p['fps']:g} fps, {p['width']}x{p['height']}{'' if p['has_audio'] else ', no audio'}")
            print('  cuts (scene > %g): ' % a.threshold + (', '.join(f'{t:.3f} s (frame {f})' for t, f in zip(cs, cut_frames(cs, p['fps']))) or 'none'))
