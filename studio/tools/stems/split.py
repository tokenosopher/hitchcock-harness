"""Split a take or any audio file into stems with Demucs, on this Mac (free): the voice and the rest (two stems), or
vocals, drums, bass and other (four).
    .venv/bin/python tools/stems/split.py $FILM <take.mp4 | audio file> [--name <name>] [--four] [--again]
Writes $FILM/audio/stems/<name>/vocals.wav and no_vocals.wav (two stems), or vocals.wav, drums.wav, bass.wav, other.wav
(--four), 44.1 kHz stereo WAV, full length. <name> defaults to the file's name without its extension. A folder that
already holds the stems is left as it is unless --again. Demucs runs through uv, so it never depends on the studio's
own Python; the first run downloads it and its model (about 1 GB in all; tools/setup/install_local.sh does it ahead).
Without uv, the fallback is Higgsfield's separate_stems (tools/stems/README.md)."""
import argparse, os, shutil, subprocess, sys, tempfile

DEMUCS = ['run', '--quiet', '--no-project', '--python', '3.12', '--with', 'demucs==4.1.0', '--with', 'numpy',
          '--with', 'soundfile', 'demucs', '-n', 'htdemucs']
FFMPEG = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'


def uv_bin():
    u = os.environ.get('HARNESS_UV') or shutil.which('uv')
    if not u:
        for c in (os.path.expanduser('~/.local/bin/uv'), os.path.expanduser('~/.cargo/bin/uv')):
            if os.path.isfile(c):
                return c
        sys.exit('uv is not installed: run  brew install uv  (or bash tools/setup/install_local.sh); '
                 'the fallback is Higgsfield separate_stems, tools/stems/README.md')
    return u


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n', 1)[1])
    ap.add_argument('film', help='the film folder')
    ap.add_argument('src', help='a take (mp4) or an audio file')
    ap.add_argument('--name', help='the stems folder name (default: the file name)')
    ap.add_argument('--four', action='store_true', help='vocals, drums, bass, other (default: vocals and no_vocals)')
    ap.add_argument('--again', action='store_true', help='split again when the folder already holds the stems')
    A = ap.parse_args()
    film = os.path.abspath(os.path.expanduser(A.film))
    src = os.path.abspath(os.path.expanduser(A.src))
    if not os.path.isdir(film): sys.exit(f'not a folder: {film}')
    if not os.path.isfile(src): sys.exit(f'no such file: {src}')
    name = A.name or os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(film, 'audio', 'stems', name)
    want = ['vocals', 'drums', 'bass', 'other'] if A.four else ['vocals', 'no_vocals']
    if all(os.path.exists(os.path.join(out, s + '.wav')) for s in want) and not A.again:
        print(f'{out}: the stems are there already ({", ".join(want)}); --again splits again')
        return
    work = tempfile.mkdtemp(prefix='stems-')
    try:
        wav = os.path.join(work, 'input.wav')
        subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', src, '-vn', '-ac', '2', '-ar', '44100', wav], check=True)
        cmd = [uv_bin()] + DEMUCS + ([] if A.four else ['--two-stems', 'vocals']) + ['-o', work, wav]
        print('Demucs (htdemucs) on this Mac ...', flush=True)
        r = subprocess.run(cmd, capture_output=True, text=True)
        res = os.path.join(work, 'htdemucs', 'input')
        if r.returncode != 0 or not all(os.path.exists(os.path.join(res, s + '.wav')) for s in want):
            tail = '\n'.join((r.stderr or r.stdout).strip().splitlines()[-8:])
            sys.exit(f'Demucs failed (exit {r.returncode}):\n{tail}')
        os.makedirs(out, exist_ok=True)
        for s in want:
            shutil.move(os.path.join(res, s + '.wav'), os.path.join(out, s + '.wav'))
        with open(os.path.join(out, 'source.txt'), 'w') as f:
            f.write(f'{os.path.relpath(src, film) if src.startswith(film + os.sep) else src}\nDemucs htdemucs, '
                    f'{"four" if A.four else "two"} stems\n')
        print(f'wrote {", ".join(s + ".wav" for s in want)} in {os.path.relpath(out, film)}')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
