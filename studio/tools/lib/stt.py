"""Word-level speech-to-text with Whisper, run on this Mac (free). The one place every script gets its word times from.

    stt_words(path)  -> [{"text", "start", "end", "type": "word", "probability"}, ...]   (seconds, in the order spoken)
    stt_text(path)   -> the words joined into one string
    .venv/bin/python tools/lib/stt.py CLIP.mp4|LINE.wav ...     prints word[start-end] ...

Whisper is faster-whisper, started through uv (`tools/stt/whisper_words.py`), so it never depends on the studio's own
Python version. `tools/setup/install_local.sh` warms it. Set HARNESS_WHISPER_MODEL to use another model (default
small.en). A run that fails stops the script with uv's last lines."""
import json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
HELPER = os.path.join(TOOLS, 'stt', 'whisper_words.py')
MODEL = os.environ.get('HARNESS_WHISPER_MODEL') or 'small.en'
PYTHON = '3.12'


def uv_bin():
    u = os.environ.get('HARNESS_UV') or shutil.which('uv')
    if not u:
        for c in (os.path.expanduser('~/.local/bin/uv'), os.path.expanduser('~/.cargo/bin/uv')):
            if os.path.isfile(c):
                return c
        sys.exit('uv is not installed: run  brew install uv  (or bash tools/setup/install_local.sh), then try again')
    return u


def whisper_cmd(audio, out_json, model=None):
    """The exact command that runs Whisper on one file and writes the words to out_json."""
    return [uv_bin(), 'run', '--quiet', '--no-project', '--python', PYTHON, '--with', 'faster-whisper==1.2.1',
            'python', HELPER, audio, out_json, '--model', model or MODEL]


def stt_words(path, model=None):
    """Word-level transcript of an audio or video file: a list of {text, start, end, type, probability}."""
    fd, out = tempfile.mkstemp(suffix='.json', prefix='whisper-')
    os.close(fd)
    try:
        r = subprocess.run(whisper_cmd(os.path.abspath(path), out, model), capture_output=True, text=True)
        if r.returncode != 0:
            tail = '\n'.join((r.stderr or r.stdout).strip().splitlines()[-6:])
            sys.exit(f'Whisper failed on {path} (exit {r.returncode}):\n{tail}')
        return json.load(open(out, encoding='utf-8'))
    finally:
        if os.path.exists(out):
            os.remove(out)


def stt_text(path, model=None):
    return ' '.join(w['text'] for w in stt_words(path, model) if w.get('type', 'word') == 'word')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    for p in sys.argv[1:]:
        print(p, ' '.join(f"{w['text']}[{w['start']:.2f}-{w['end']:.2f}]" for w in stt_words(p)))
