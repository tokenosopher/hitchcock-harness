"""Make 1080p copies of 480p takes, one file per take with the same file name and EXACTLY the same frame count: the
picture from the take's 1080p source, the sound copied untouched from the 480p take, so anything cut from the 480p take
keeps its in and out points. The picture is cut to N frames by the trim filter, not -frames:v, which would stop the mux
early and clip the last ~15 ms of the copied audio.
    FILM=<film> .venv/bin/python tools/finish/conform_1080.py --bin scenes [--clips GLOB ...] [--out DIR] [--upscaled DIR] [NAME ...]
    FILM=<film> .venv/bin/python tools/finish/conform_1080.py --bin pick-ups ...
  --bin       the group of takes; it names the report and picks the default clips:
                scenes   -> the draft in every generations/<G>/takes/take<N>/ but FIX-* ones
                pick-ups -> the draft in every generations/FIX-<name>/takes/take<N>/
              the draft being <id>-take<N>-480p.mp4 (tools/film/land.py's name)
  --clips     film-relative globs of clips or take folders instead (repeatable)
  --out       default video/1080/conform. Every output keeps the clip's path under the film folder
              (OUT/generations/S4/takes/take2/S4-take2-480p.mp4).
  --upscaled  a folder of upscaled takes named <clip name>-up.mp4, flat or mirrored like OUT
  NAME        only these clips (file name, or path under the film)
  Picture source per clip, first found: the Seedance finalize beside the draft (<id>-take<N>-1080p.mp4, the name land.py
  gives a 1080p pass); else the upscaled take beside it (<id>-take<N>-1080p-up.mp4, or <clip name>-up.mp4); else under
  --upscaled (mirrored, then flat). A finalize is frame-aligned with its draft: when it has the clip's frame count it starts
  at frame 0, otherwise the clip's first 12 frames are matched against it. An upscaled take must have the clip's frame
  count. Clips with no 1080p source yet are listed and skipped.
  Writes OUT/conform-report-<bin>.json (clip, source, frames, ok). Unproven: run on synthetic clips only."""
import argparse, glob, json, os, re, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('only', nargs='*', help='only these clips (file name or film-relative path)')
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--bin', help='the group of takes: scenes or pick-ups')
ap.add_argument('--clips', action='append', default=[], help='film-relative glob or file of 480p clips (repeatable)')
ap.add_argument('--out', help='default video/1080/conform')
ap.add_argument('--upscaled', help='folder of <clip name>-up.mp4 upscaled takes')
A = ap.parse_args()
if not A.film: sys.exit('conform_1080.py: set FILM (or --film) to the film folder')
if not (A.bin or A.clips): sys.exit('conform_1080.py: give --bin scenes|pick-ups or --clips GLOB')
T = os.path.abspath(os.path.expanduser(A.film)); P = lambda *a: os.path.join(T, *a)
R = lambda p: p if os.path.isabs(p) else P(p)
only = set(A.only)


def nframes(p):
    return int(subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets',
                               '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)
def size(p):
    return tuple(map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p],
                                         capture_output=True, text=True).stdout.strip().split(',')[:2]))
def sizes_for(first):
    portrait = size(first)[1] > size(first)[0]
    return ((120, 214) if portrait else (214, 120)), ((1080, 1920) if portrait else (1920, 1080))   # matching size, output size
def gray(p, W, H, n=None):
    args = ['ffmpeg', '-v', 'error', '-i', p, '-vf', f'scale={W}:{H}:flags=area,format=gray'] + (['-frames:v', str(n)] if n else []) + ['-f', 'rawvideo', '-']
    return np.frombuffer(subprocess.run(args, capture_output=True).stdout, np.uint8).reshape(-1, H, W).astype(np.float32)
_ref = {}
def best_start(clip, ref, W, H):
    """Frame index in REF where CLIP starts (best match of the clip's first 12 frames), with the best and next score."""
    if ref not in _ref: _ref[ref] = gray(ref, W, H)
    D = _ref[ref]; C = gray(clip, W, H, 12); k = len(C)
    scores = [float(np.abs(D[i:i + k] - C).mean()) for i in range(0, len(D) - k + 1)]
    i = int(np.argmin(scores)); s = sorted(scores) + [float('nan')]
    return i, round(s[0], 2), round(s[1], 2)
def conform(pic, src480, out, start, n, OW, OH):
    vf = f"[0:v]trim=start_frame={start}:end_frame={start + n},setpts=PTS-STARTPTS,scale={OW}:{OH}:flags=lanczos,fps=24,format=yuv420p[v]"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', pic, '-i', src480, '-filter_complex', vf, '-map', '[v]', '-map', '1:a?',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-g', '24', '-r', '24', '-c:a', 'copy', '-movflags', '+faststart', out], check=True)
    return nframes(out)


def take_clip(folder):
    """The 480p draft in a take<N>/ folder: <id>-take<N>-480p.mp4 (tools/film/land.py's unique name, <id> = <G>, FIX-<name>
    or E-<CID>), else the older take<N>-480p.mp4, else the folder's only *-480p.mp4."""
    m = re.fullmatch(r'take(\d+[A-Za-z]?)', os.path.basename(folder.rstrip(os.sep)))
    gid = os.path.basename(os.path.dirname(os.path.dirname(folder.rstrip(os.sep))))
    if m:
        for name in (f'{gid}-take{m.group(1)}-480p.mp4', f'E-{gid}-take{m.group(1)}-480p.mp4', f'take{m.group(1)}-480p.mp4'):
            if os.path.isfile(os.path.join(folder, name)): return os.path.join(folder, name)
    c = sorted(glob.glob(os.path.join(folder, '*-480p.mp4')))
    return c[0] if len(c) == 1 else None


def take_mode():
    BIN = A.bin or 'clips'
    pats = A.clips
    if not pats:
        top = 'generations' if os.path.isdir(P('generations')) else 'blocks'
        low = BIN.lower()
        sel = 'FIX-*' if 'pick' in low else '[!F]*' if 'scene' in low else None
        if not sel: sys.exit(f'conform_1080.py: no default clips for bin "{BIN}": pass --clips')
        pats = [f'{top}/{sel}/takes/take*/'] if top == 'generations' else [f'{top}/{sel}/takes/*-480p.mp4']
    clips = []
    for pat in pats:
        for c in sorted(glob.glob(R(pat))):
            if os.path.isdir(c): c = take_clip(c)                       # a take folder: its draft
            if c and c.endswith('.mp4') and c not in clips: clips.append(c)
    if only:
        clips = [c for c in clips if os.path.basename(c) in only or os.path.relpath(c, T) in only]
    if not clips: sys.exit(f'conform_1080.py: no clips match {pats}' + (f' and {sorted(only)}' if only else ''))
    OUT = R(A.out or os.path.join('video', '1080', 'conform')); SV = R(A.upscaled) if A.upscaled else None
    (W, H), (OW, OH) = sizes_for(clips[0])
    stems = [os.path.basename(c) for c in clips]
    report = []
    for c in clips:
        rc, rt = os.path.realpath(c), os.path.realpath(T)      # the film may be named through a link
        rel = os.path.relpath(rc, rt) if rc.startswith(rt + os.sep) else os.path.basename(c)
        name = os.path.splitext(os.path.basename(c))[0]; n = nframes(c); out = os.path.join(OUT, rel)
        fin = c[:-len('-480p.mp4')] + '-1080p.mp4' if c.endswith('-480p.mp4') else None
        sv = ([c[:-len('-480p.mp4')] + '-1080p-up.mp4'] if c.endswith('-480p.mp4') else []) + [os.path.join(os.path.dirname(c), f'{name}-up.mp4')]
        if SV: sv += [os.path.join(SV, os.path.splitext(rel)[0] + '-up.mp4'), os.path.join(SV, f'{name}-up.mp4')]
        if fin and os.path.exists(fin):
            m = nframes(fin)
            if m == n: start, how = 0, f'Seedance finalize {os.path.relpath(fin, T)}, frame-aligned ({m} frames)'
            else:
                start, best, second = best_start(c, fin, W, H)
                how = f'Seedance finalize {os.path.relpath(fin, T)}, frames {start}-{start + n} of {m} (match {best} vs next {second})'
            pic = fin
        else:
            pic = next((p for p in sv if os.path.exists(p)), None)
            if not pic: print(f'{rel}: skip, no 1080p source yet'); continue
            if pic == sv[-1] and SV and stems.count(os.path.basename(c)) > 1:
                print(f'{rel}: SKIP, {os.path.basename(pic)} is a flat name shared by {stems.count(os.path.basename(c))} clips; use mirrored outputs or the name beside the clip'); continue
            m = nframes(pic)
            if m != n: print(f'{rel}: SKIP, the upscaled take has {m} frames, the clip has {n}'); continue
            start, how = 0, f'upscale {os.path.relpath(pic, T) if pic.startswith(T + os.sep) else pic}'
        got = conform(pic, c, out, start, n, OW, OH); ok = got == n
        report.append(dict(clip=rel, out=os.path.relpath(out, T) if out.startswith(T + os.sep) else out, source=how, frames=n, ok=ok))
        print(f"{rel}: {'OK ' if ok else 'BAD'} {got}/{n} frames  {how}", flush=True)
    os.makedirs(OUT, exist_ok=True)
    rp = os.path.join(OUT, f"conform-report-{BIN.replace('/', '-')}.json")
    json.dump(dict(bin=BIN, size=f'{OW}x{OH}', clips=report), open(rp, 'w'), indent=1)
    print(sum(r['ok'] for r in report), '/', len(report), 'clips OK ->', OUT, '| report', rp)


take_mode()
