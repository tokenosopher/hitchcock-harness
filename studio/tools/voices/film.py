"""Shared plumbing for the voice scripts in tools/voices/.
- film_root(): the film folder, from --film PATH or the FILM environment variable
- load_spec(): the film's own tables in <film>/voices/spec.py (copy spec_template.py there)
- lines.json read/write, a snapshot before a run changes it, and keep_previous() for a file about to be replaced
- canon(): transcript folding so "23" matches "twenty-three"
- stt_words(), stt_text(), words_of(): word times from Whisper on this Mac (tools/lib/stt.py); words_of() caches them in
  a <file>.stt.json beside the file; words_for(): cached in audio/caption-words.json under "LID:seconds"
- small ffmpeg helpers (trim to speech edges, silence, concat, atempo, dur)"""
import importlib.util, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
import stt as _stt                                   # tools/lib/stt.py: Whisper through uv
FFMPEG = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'
FFPROBE = os.environ.get('HARNESS_FFPROBE') or 'ffprobe'


def film_root(argv=None):
    argv = sys.argv if argv is None else argv
    if '-h' in argv or '--help' in argv:
        print(getattr(sys.modules.get('__main__'), '__doc__', None) or 'FILM=<film folder> .venv/bin/python <script>')
        sys.exit(0)
    path = None
    if '--film' in argv:
        i = argv.index('--film'); path = argv[i + 1]; del argv[i:i + 2]
    path = path or os.environ.get('FILM')
    if not path:
        sys.exit('Point at the film folder: FILM=<film folder> .venv/bin/python tools/voices/<script> ...  or  --film <film folder>')
    path = os.path.abspath(os.path.expanduser(path))
    if not os.path.isdir(path):
        sys.exit(f'not a folder: {path}')
    os.environ['FILM'] = path
    return path


def load_spec(F, required=True):
    p = os.path.join(F, 'voices', 'spec.py')
    if not os.path.exists(p):
        if required:
            sys.exit(f'missing {p}: copy {os.path.join(HERE, "spec_template.py")} there and fill it from story.md')
        return None
    s = importlib.util.spec_from_file_location('film_voice_spec', p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
    return m


def path_of(F, rel):
    """A file path from lines.json: relative to the film root, or to audio/."""
    if os.path.isabs(rel): return rel
    p = os.path.join(F, rel)
    return p if os.path.exists(p) else os.path.join(F, 'audio', rel)


def lines_file(F): return os.path.join(F, 'audio', 'lines.json')


def load_lines(F):
    p = lines_file(F)
    return json.load(open(p)) if os.path.exists(p) else []


def save_lines(F, L):
    os.makedirs(os.path.join(F, 'audio'), exist_ok=True)
    json.dump(L, open(lines_file(F), 'w'), indent=1, ensure_ascii=False)


def snapshot_lines(F, label):
    """Copy lines.json to audio/history/lines-<label>.json before a run changes it (every version stays readable)."""
    p = lines_file(F)
    if not os.path.exists(p): return None
    d = os.path.join(F, 'audio', 'history'); os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, f'lines-{label}-{time.strftime("%Y%m%d-%H%M%S")}.json'); shutil.copy(p, dst)
    return os.path.relpath(dst, F)


def keep_previous(F, path, tag='t'):
    """Copy a recording that is about to be replaced to audio/takes/<stem>-<tag>N<ext>; returns the film-relative path."""
    if not os.path.exists(path): return None
    d = os.path.join(F, 'audio', 'takes'); os.makedirs(d, exist_ok=True)
    stem, ext = os.path.splitext(os.path.basename(path)); n = 1
    while os.path.exists(os.path.join(d, f'{stem}-{tag}{n}{ext}')): n += 1
    dst = os.path.join(d, f'{stem}-{tag}{n}{ext}'); shutil.copy(path, dst)
    return os.path.relpath(dst, F)


# spellings and numbers the transcriber may choose for the same spoken words; a film adds its own numbers in
# spec.EQUIV ('100': 'a hundred')
EQUIV = {'summarize': 'summarise', 'summarized': 'summarised', 'neighbor': 'neighbour', 'honor': 'honour', 'ok': 'okay'}


def words(t):
    """Lower-case word tokens, with [tags] removed."""
    t = re.sub(r'\[[^\]]*\]', ' ', t).lower().replace('’', "'").replace('-', ' ')
    t = re.sub(r"[^a-z0-9' ]+", ' ', t); return t.split()


def canon(text, extra=None):
    eq = dict(EQUIV); eq.update(extra or {})
    out = []
    for t in words(text):
        t = t.strip("'")
        if t: out.extend(eq.get(t, t).split())
    return out


def stt_words(path):
    """Word times of any audio file: [{text, start, end, type}, ...] (Whisper on this Mac, free)."""
    return _stt.stt_words(path)


def stt_text(path):
    return _stt.stt_text(path)


def words_of(path, again=False):
    """Word times of a file, cached as <file without extension>.stt.json beside it (a list, or {"words": [...]})."""
    sj = os.path.splitext(path)[0] + '.stt.json'
    if os.path.exists(sj) and not again and os.path.getmtime(sj) >= os.path.getmtime(path):
        d = json.load(open(sj))
        return d['words'] if isinstance(d, dict) else d
    W = stt_words(path)
    json.dump(W, open(sj, 'w'), indent=1, ensure_ascii=False)
    return W


def words_for(F, lid, path, seconds):
    """Word timestamps of a recording (type 'word' only), transcribed once and cached under "LID:seconds"."""
    cache = os.path.join(F, 'audio', 'caption-words.json'); C = json.load(open(cache)) if os.path.exists(cache) else {}
    k = f'{lid}:{seconds}'
    if k not in C:
        C[k] = [w for w in stt_words(path) if w.get('type', 'word') == 'word']
        json.dump(C, open(cache, 'w'))
    return C[k]


def ff(*a):
    subprocess.run([FFMPEG, '-y', '-v', 'error', *a], check=True)


def trim(src, dst, lead=0.10, tail=0.35, fade=0.04):
    """Cut a take to its speech edges with room either side: lead s before the first word, tail s after the last, and a
    short fade at both ends. The edges are where the level crosses a threshold, and a soft last sound (the "th" of
    "death") decays under it before it ends, so a tighter room cuts line ends. Spacing between lines is set from the
    speech edges (record.py's table read), so the room here does not lengthen the gaps."""
    sys.path.insert(0, HERE); from measure import edges
    a, b = edges(src); a = max(0, a - lead); b = min(b + tail, _dur(src)); d = b - a
    ff('-ss', str(a), '-to', str(b), '-i', src, '-af', f'afade=t=in:d={fade},afade=t=out:st={max(0, d - fade):.3f}:d={fade}',
       '-ar', '44100', '-ac', '1', dst)


def _dur(p):
    return float(subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())


dur = _dur


def silence(sec, dst):
    ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{max(0.0, sec):.3f}', dst)


def concat(files, dst):
    lst = dst + '.concat.txt'; open(lst, 'w').write(''.join(f"file '{os.path.abspath(f)}'\n" for f in files))
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-ar', '44100', '-ac', '1', dst); os.remove(lst)


def atempo(src, dst, factor):
    """Pitch-kept speed change; factor 1.2 = 20 % faster."""
    ff('-i', src, '-filter:a', f'atempo={factor:.4f}', '-ar', '44100', '-ac', '1', dst)
