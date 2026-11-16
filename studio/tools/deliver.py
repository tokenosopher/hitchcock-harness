"""Copy a finished film's files into its delivery folder, assets/final-cuts/<folder>[/<sub>] in the studio, then compare
each copy byte for byte with its source.
    .venv/bin/python tools/deliver.py --film $FILM SRC "Name.mp4" [SRC "Name" ...] [--sub "Social kit"] [--480p] [--folder NAME]
    .venv/bin/python tools/deliver.py --film $FILM --check          say which folder it is and whether it exists
SRC is relative to the film folder (or absolute). <folder> comes from --folder, else from "delivery_folder" in
<film>/review/cards.json (written by tools/film/new_film.py: "<YYYY-MM-DD> <Title>"; an older cards file's key is read
as a fallback); the folder and --sub are created.
--480p also delivers "<name> 480p.mp4" for every .mp4: a quick phone copy (480 px wide, CRF 22, audio copied, faststart).
Replacing a file under the same name is deliberate (FINAL files are replaced in place so there is no old copy to mix up).
Exit 1 when a copy differs from its source."""
import argparse, filecmp, json, os, shutil, subprocess, sys, tempfile

STUDIO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL_CUTS = os.path.join(STUDIO, 'assets', 'final-cuts')
FFMPEG = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'


def folder_of(film):
    cj = os.path.join(film, 'review', 'cards.json')
    if not os.path.exists(cj):
        return None
    d = json.load(open(cj, encoding='utf-8'))
    f = d.get('delivery_folder') or d.get('icloud_folder')      # the older key, read as a fallback
    return os.path.basename(f.rstrip('/')) if f else None      # only the folder's own name counts


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n', 1)[1])
    ap.add_argument('pairs', nargs='*', help='SRC NAME [SRC NAME ...]')
    ap.add_argument('--film', default=os.environ.get('FILM'))
    ap.add_argument('--folder', help='the delivery folder\'s name inside assets/final-cuts/')
    ap.add_argument('--sub', default='', help='a subfolder inside it, e.g. "Social kit" (created if missing)')
    ap.add_argument('--480p', dest='p480', action='store_true', help='also deliver a 480p copy of each .mp4')
    ap.add_argument('--check', action='store_true')
    A = ap.parse_args()
    if not A.film:
        sys.exit('give --film PATH or FILM=PATH')
    film = os.path.abspath(os.path.expanduser(A.film))
    if not os.path.isdir(film):
        sys.exit(f'not a folder: {film}')
    folder = A.folder or folder_of(film)
    if not folder:
        sys.exit('which folder? give --folder "<YYYY-MM-DD> <Title>" or set "delivery_folder" in review/cards.json')
    dest = os.path.join(FINAL_CUTS, folder, A.sub) if A.sub else os.path.join(FINAL_CUTS, folder)
    shown = os.path.relpath(dest, STUDIO)
    if A.check:
        print(f'{shown}: ' + ('exists' if os.path.isdir(dest) else 'not made yet (the first delivery makes it)'))
        return
    if not A.pairs or len(A.pairs) % 2:
        sys.exit('give pairs: SRC "Name.mp4" ...')

    os.makedirs(dest, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='deliver-')
    jobs = []
    try:
        for src, name in zip(A.pairs[::2], A.pairs[1::2]):
            p = src if os.path.isabs(src) else os.path.join(film, src)
            if not os.path.isfile(p):
                sys.exit(f'no such file: {p}')
            if '/' in name:
                sys.exit(f'a name, not a path: {name!r} (use --sub for a subfolder)')
            jobs.append((p, name))
            if A.p480 and p.lower().endswith('.mp4'):
                small = os.path.join(tmp, os.path.basename(p)[:-4] + '-480p.mp4')
                subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', p, '-vf', 'scale=480:-2:flags=lanczos', '-c:v', 'libx264',
                                '-preset', 'fast', '-crf', '22', '-c:a', 'copy', '-movflags', '+faststart', small], check=True)
                jobs.append((small, os.path.splitext(name)[0] + ' 480p.mp4'))
        for p, name in jobs:
            out = os.path.join(dest, name)
            shutil.copyfile(p, out)
            if not filecmp.cmp(p, out, shallow=False):
                sys.exit(f'COPY DIFFERS from the source: {name}')
            print(f'ok  {os.path.join(shown, name)}  ({os.path.getsize(p) / 1e6:.0f} MB, byte for byte)')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print('Tell the user the full path (folder > subfolder > file).')


if __name__ == '__main__':
    main()
