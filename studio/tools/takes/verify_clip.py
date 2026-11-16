"""Check a landed take before showing it to anyone (Flow v3.2 - 7 Takes, step 13 and Checks): the transcript against the generation's
lines, the cuts against the planned shots, the tail after the last word, and a contact sheet by frame index.
    .venv/bin/python tools/takes/verify_clip.py "$FILM/generations/S4/takes/take2" --film "$FILM" [--no-stt] [--out DIR]
    options: [--gen G] [--lines FILE] [--shots FILE] [--panels DIR] [--threshold 0.18]
TAKE is a take folder generations/<G>/takes/take<N>/ (its 480p draft is checked: <G>-take<N>-480p.mp4, the landing tool's
name, FIX-<name>-take<N>-480p.mp4 for a pick-up; else the older take<N>-480p.mp4) or a clip file; a relative
path is taken from --film, else from the working directory. The film is --film, $FILM, or the folder above generations/
(or blocks/) in TAKE's path; <G> is the folder above takes/ (or --gen).
- lines: --lines (a JSON list of strings or of {"text"|"line", "who"}), else the "lines" of the generation's <G>-shots.json,
  else the generation's section of the film's script.md (### <G> ·); none for a pick-up that has neither
- words: Whisper's transcript of the clip (on this Mac, tools/lib/stt.py) against the lines: missing and extra words, the
  first word's start, the last word's end. A transcript already beside the clip is reused, under the names
  tools/stt/transcribe.py writes: stt.json for the 480p draft in its own take<N>/ folder (<id>-take<N>-480p.mp4 or
  take<N>-480p.mp4), <clip name>-stt.json for any other clip (a 1080p pass); otherwise Whisper runs and writes it
  there. --no-stt skips the words.
- cuts: ffmpeg scene score > 0.18 (0.30 misses a real cut between two shots of one room) against the planned cuts, the
  shots' t1 in <G>-shots.json (the previz timings; prompts carry none), in seconds
- the tail: seconds after the last word (0.45 s wanted, Flow v3.2 - 9 Edit, step 2) and the last second's mean loudness
- a contact sheet: the first storyboard panel of each shot on top (panels.json of the storyboard named in the generation's
  newest *media*.json, or --panels DIR holding panels.json), the first frame and the middle frame of each detected shot
  below, taken by frame index (decoding from the start), never by -ss seeking
Writes check.json and check.jpg beside the draft in its take folder (<clip name>-check.json/.jpg beside any other clip),
or <clip name>-check.json/.jpg into --out.
The verdict is a prompt for your own look and listen: the user judges by eye and ear, so open the sheet and play the clip.
The checks are unproven on a landed take with a real transcript."""
import argparse, difflib, glob, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(TOOLS, 'lib'))
import script_md

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('take', help='take folder (generations/<G>/takes/take<N>/) or clip file')
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--gen', help='the generation, when the path does not say it')
ap.add_argument('--lines', help='JSON list of the lines the take should say')
ap.add_argument('--shots', help="the generation's shots file (default <G>/<G>-shots.json)")
ap.add_argument('--panels', help='storyboard folder holding panels.json')
ap.add_argument('--no-stt', action='store_true', help='skip the transcript')
ap.add_argument('--out')
ap.add_argument('--threshold', type=float, default=0.18)
A = ap.parse_args()

# --- where things are
t = os.path.expanduser(A.take)
if not os.path.isabs(t):
    t = os.path.join(os.path.abspath(os.path.expanduser(A.film)) if A.film else os.getcwd(), t)
t = os.path.abspath(t)
if os.path.isdir(t):
    vids = sorted(f for f in os.listdir(t) if f.lower().endswith('.mp4') and not f.startswith('.'))
    m = re.fullmatch(r'take(\d+[A-Za-z]?)', os.path.basename(t)); gid = os.path.basename(os.path.dirname(os.path.dirname(t)))
    named = [f for f in ((f'{gid}-take{m.group(1)}-480p.mp4', f'E-{gid}-take{m.group(1)}-480p.mp4', f'take{m.group(1)}-480p.mp4') if m else ())
             if f in vids]                                      # the landing tool's unique name first, then the older one
    drafts = [f for f in vids if f.endswith('-480p.mp4')]
    pick = named[:1] or (drafts if len(drafts) == 1 else [])
    if len(pick) != 1: sys.exit(f'verify_clip.py: cannot tell which clip in {t} is the take: {vids}')
    vid = os.path.join(t, pick[0])
elif os.path.isfile(t):
    vid = t
else:
    sys.exit(f'verify_clip.py: no such take folder or clip: {t}')
tf = re.fullmatch(r'take(\d+[A-Za-z]?)', os.path.basename(os.path.dirname(vid)))
plain = bool(tf and re.fullmatch(r'(?:.+-)?take' + tf.group(1) + r'-480p', os.path.splitext(os.path.basename(vid))[0]))   # tools/stt/transcribe.py's rule
parts = vid.split(os.sep)
top = max((i for i, p in enumerate(parts) if p in ('generations', 'blocks')), default=None)
F = os.path.abspath(os.path.expanduser(A.film)) if A.film else (os.sep.join(parts[:top]) if top else None)
if not F: sys.exit('verify_clip.py: give --film (the clip is not under generations/ or blocks/)')
G = A.gen or (parts[top + 1] if top is not None and len(parts) > top + 2 else None)
if not G: sys.exit('verify_clip.py: give --gen')
GD = os.path.join(F, parts[top] if top is not None else 'generations', G)
stem = os.path.splitext(os.path.basename(vid))[0]
OUT = os.path.abspath(A.out) if A.out else os.path.dirname(vid)
os.makedirs(OUT, exist_ok=True)
name = (lambda k: os.path.join(OUT, f'{k}')) if (plain and not A.out) else (lambda k: os.path.join(OUT, f'{stem}-{k}'))
rel = lambda p: os.path.relpath(p, F) if os.path.abspath(p).startswith(F + os.sep) else p

probe = lambda *a: subprocess.run(['ffprobe', '-v', 'error', *a, vid], capture_output=True, text=True).stdout.strip()
dur = float(probe('-show_entries', 'format=duration', '-of', 'csv=p=0'))
num, den = probe('-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0').split('/'); fps = float(num) / float(den)
W0, H0 = (int(x) for x in probe('-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x').split('x'))

# --- the plan: lines and shots
shots_p = A.shots or next((p for p in (os.path.join(GD, f'{G}-shots.json'), os.path.join(GD, 'shots.json')) if os.path.exists(p)), None)
shots = json.load(open(shots_p)) if shots_p else {}
lines_from = None
if A.lines:
    raw = json.load(open(A.lines)); lines_from = rel(A.lines)
elif shots.get('lines'):
    raw = shots['lines']; lines_from = rel(shots_p) + ' "lines"'
elif os.path.exists(os.path.join(F, 'script.md')):
    raw = [r['line'] for r in script_md.lines(os.path.join(F, 'script.md')) if r['gen'] == G]
    lines_from = f'script.md ### {G}' if raw else None
else:
    raw = []
lines = [x if isinstance(x, str) else (x.get('text') or x.get('line') or '') for x in raw]
sh = shots.get('shots') or []
planned = [round(float(s['t1']), 2) for s in sh[:-1] if 't1' in s] if sh else None
planned_last = round(float(sh[-1]['t1']), 2) if sh and 't1' in sh[-1] else (shots.get('duration'))

def words(t):   # same normalisation as voices/film.py words()
    t = re.sub(r'\[[^\]]*\]', ' ', t).lower().replace('-', ' ')
    t = re.sub(r"[^a-z0-9' ]+", ' ', t); return t.split()

res = dict(gen=G, video=rel(vid), seconds=round(dur, 2), fps=round(fps, 3), lines_from=lines_from, shots_from=rel(shots_p) if shots_p else None)

# --- 1. transcript
expected = words(re.sub(r"(?<![A-Za-z])'|'(?![A-Za-z])", ' ', ' '.join(re.sub(r'\([^)]*\)', ' ', l) for l in lines)))
if not A.no_stt:
    cache = os.path.join(os.path.dirname(vid), 'stt.json' if plain else f'{stem}-stt.json')
    if os.path.exists(cache):
        allw = json.load(open(cache)); res['transcript_from'] = rel(cache) + ' (cached, no cost)'
    else:
        import stt
        allw = stt.stt_words(vid); json.dump(allw, open(cache, 'w'), indent=1); res['transcript_from'] = rel(cache) + ' (Whisper, now)'
    ws = [w for w in allw if w.get('type', 'word') == 'word']
    heard = words(' '.join(w['text'] for w in ws))
    res.update(transcript=' '.join(w['text'] for w in ws),
               first_word_at=round(ws[0]['start'], 2) if ws else None, last_word_end=round(ws[-1]['end'], 2) if ws else None)
    if ws: res['tail_after_last_word'] = round(dur - ws[-1]['end'], 2); res['tail_ok'] = res['tail_after_last_word'] >= 0.45
    if expected:
        sm = difflib.SequenceMatcher(None, expected, heard)
        res.update(missing=[' '.join(expected[a:b]) for op, a, b, c, e in sm.get_opcodes() if op in ('delete', 'replace')],
                   extra=[' '.join(heard[c:e]) for op, a, b, c, e in sm.get_opcodes() if op in ('insert', 'replace')])
        res['words_match'] = not res['missing'] and not res['extra']

# --- 2. cuts
o = subprocess.run(['ffmpeg', '-v', 'info', '-i', vid, '-vf', f"select='gt(scene,{A.threshold})',showinfo", '-f', 'null', '-'], capture_output=True, text=True).stderr
cuts = [round(float(x), 2) for x in re.findall(r'pts_time:([\d.]+)', o)]
res.update(cuts=cuts, planned_cuts=planned, planned_last=planned_last)

# --- 3. the last second
o = subprocess.run(['ffmpeg', '-v', 'info', '-sseof', '-1', '-i', vid, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
m = re.search(r'mean_volume: (-?[\d.]+) dB', o); res['tail_db'] = float(m.group(1)) if m else None

# --- 4. contact sheet, frames by index
panels_dir = A.panels
if not panels_dir:
    media = sorted(glob.glob(os.path.join(GD, '*media*.json')) + glob.glob(os.path.join(GD, '*', '*media*.json')), key=os.path.getmtime)
    for mp in reversed(media):
        try: sb = json.load(open(mp)).get('storyboard')
        except (ValueError, AttributeError): sb = None
        if sb: panels_dir = sb if os.path.isabs(sb) else os.path.join(F, sb); break
top_row = []
if panels_dir and os.path.exists(os.path.join(panels_dir, 'panels.json')):
    seen = set()
    for pnl in json.load(open(os.path.join(panels_dir, 'panels.json'))):
        if pnl.get('shot') in seen: continue
        seen.add(pnl.get('shot')); top_row.append((os.path.join(panels_dir, pnl['file']), f"shot {pnl.get('shot')} panel"))
    res['panels_from'] = rel(panels_dir)
bounds = [0.0] + cuts + [dur]
picks = [(0, 'first')] + [(int(round((a + b) / 2 * fps)), f'shot {i + 1}') for i, (a, b) in enumerate(zip(bounds, bounds[1:]))]
tw, th = (270, 480) if H0 >= W0 else (480, 270); cols = max(len(top_row), len(picks))
font = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
has_dt = ' drawtext ' in subprocess.run(['ffmpeg', '-hide_banner', '-filters'], capture_output=True, text=True).stdout   # Homebrew ffmpeg 8 may lack it
label = lambda t: f",drawtext=fontfile='{font}':text='{t}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6" if has_dt and os.path.exists(font) else ''
fit = f'scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2'
rows = ([top_row] if top_row else []) + [[(n, f'f{n} {lab}') for n, lab in picks]]
with tempfile.TemporaryDirectory() as tmp:
    tiles = []
    for row in rows:
        for k in range(cols):
            p = os.path.join(tmp, f'{len(tiles):03d}.png'); tiles.append(p)
            if k >= len(row):
                subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=0x141414:s={tw}x{th}', '-frames:v', '1', p], check=True); continue
            src, lab = row[k]
            if isinstance(src, int):
                subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', vid, '-vf', f'select=eq(n\\,{src}),{fit}' + label(lab), '-frames:v', '1', p], check=True)
            elif subprocess.run(['ffmpeg', '-y', '-v', 'quiet', '-i', src, '-vf', fit + label(lab), '-frames:v', '1', p]).returncode:
                print(f'panel unreadable, blank tile: {src}', file=sys.stderr)   # a missing panel must not stop the check
                subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=0x400000:s={tw}x{th}', '-frames:v', '1', p], check=True)
    sheet = name('check.jpg')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(tmp, '%03d.png'), '-vf', f'tile={cols}x{len(rows)}', '-frames:v', '1', '-q:v', '3', sheet], check=True)
res['sheet'] = rel(sheet); res['frames'] = [n for n, _ in picks]
res['sheet_tiles'] = dict(top=[lab for _, lab in top_row], bottom=[f'f{n} {lab}' for n, lab in picks], labelled=bool(label('x')))
json.dump(res, open(name('check.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k not in ('frames',)}, indent=1, ensure_ascii=False))
