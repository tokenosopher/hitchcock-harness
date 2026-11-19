"""Log a composed score take that Alma landed from Higgsfield (generate_audio, elevenlabs_music_v2) into
audio/score/score-log.json: the job, the credits, the prompt it was sent with, its length, loudness and the level of each
planned section. Calls no service.
    .venv/bin/python tools/music/log_take.py --film "$FILM" <CUE> <N> --job <job id> --credits <cr> [--file <path>]
        [--model elevenlabs_music_v2] [--verdict '...']
The take is audio/score/<CUE>-take<N>.mp3 (or .wav) unless --file names it. The prompt, duration and sections come from
the cue's entry in audio/score/cues.json. The entry is keyed "<CUE>-take<N>" (mix_score.py reads its "file"); an
existing entry is replaced only with --again. --verdict alone (with <CUE> <N>) updates the verdict of a logged take."""
import argparse, datetime, json, os, subprocess, sys


ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                             epilog=__doc__.split('\n', 1)[1])
ap.add_argument('cue'); ap.add_argument('take', type=int)
ap.add_argument('--film', default=os.environ.get('FILM'))
ap.add_argument('--job'); ap.add_argument('--credits', type=float)
ap.add_argument('--file'); ap.add_argument('--model', default='elevenlabs_music_v2')
ap.add_argument('--verdict'); ap.add_argument('--again', action='store_true')
A = ap.parse_args()
if not A.film: sys.exit('give --film (or set FILM)')
F = os.path.abspath(os.path.expanduser(A.film)); D = os.path.join(F, 'audio', 'score')
lp = os.path.join(D, 'score-log.json'); LOG = json.load(open(lp)) if os.path.exists(lp) else {}
key = f'{A.cue}-take{A.take}'

if A.verdict and not A.job and key in LOG:
    LOG[key]['verdict'] = A.verdict
    json.dump(LOG, open(lp, 'w'), indent=1, ensure_ascii=False); print(key, 'verdict:', A.verdict); sys.exit(0)
if key in LOG and not A.again: sys.exit(f'{key} is logged already (--again replaces it)')
f = A.file or next((os.path.join(D, f'{key}{e}') for e in ('.mp3', '.wav', '.flac') if os.path.exists(os.path.join(D, f'{key}{e}'))), None)
f = f if not f or os.path.isabs(f) else os.path.join(F, f)
if not f or not os.path.exists(f): sys.exit(f'no take file for {key} in audio/score/ (give --file)')
cp = os.path.join(D, 'cues.json'); C = (json.load(open(cp)).get('cues') or {}).get(A.cue, {}) if os.path.exists(cp) else {}


def lufs(path, ss=None, t=None):
    cmd = ['ffmpeg', '-v', 'info'] + (['-ss', f'{ss:.3f}', '-t', f'{t:.3f}'] if ss is not None else []) + ['-i', path, '-af', 'ebur128', '-f', 'null', '-']
    e = subprocess.run(cmd, capture_output=True, text=True).stderr
    try: return round(float(next(l.split('I:')[1].split('LUFS')[0] for l in e.splitlines()[::-1] if ' I:' in l)), 1)
    except StopIteration: return None


secs = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
sections = []
at = C.get('at') if isinstance(C.get('at'), (int, float)) else 0.0
start = 0.0
for s in C.get('sections') or []:
    end = float(s['to']) - at
    sections.append(dict(name=s.get('name'), start=round(start, 2), end=round(end, 2),
                         lufs=lufs(f, start, end - start) if end - start >= 0.5 and start < secs else None))
    start = end
e = dict(cue=A.cue, take=A.take, job=A.job, model=A.model, prompt=C.get('prompt'), duration_asked=C.get('duration'),
         seconds=round(secs, 2), credits=A.credits, date=datetime.date.today().isoformat(),
         file=os.path.relpath(f, F), lufs=lufs(f), sections=sections, verdict=A.verdict)
LOG[key] = e
os.makedirs(D, exist_ok=True); json.dump(LOG, open(lp, 'w'), indent=1, ensure_ascii=False)
print(f"{key}: {e['seconds']} s, {e['lufs']} LUFS, {A.credits} cr" + ''.join(f"; {s['name']} {s['lufs']}" for s in sections))
