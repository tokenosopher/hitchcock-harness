"""Find a film folder: --film PATH or NAME (a name under the studio's assets/films/), else $FILM, else the film
folder the working directory sits in (assets/films/<film>/...). Shared by the tools/release scripts."""
import os, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILMS = os.path.join(REPO, 'assets', 'films')


def film_dir(arg=None, who='script', required=True):
    cand = arg or os.environ.get('FILM')
    if cand:
        p = os.path.abspath(os.path.expanduser(cand))
        if os.path.isdir(p):
            return p
        q = os.path.join(FILMS, cand)
        if os.path.isdir(q):
            return q
        sys.exit(f'{who}: no film folder "{cand}" (looked at {p} and {q})')
    d = os.getcwd()
    while True:
        if os.path.basename(os.path.dirname(d)) == 'films':
            return d
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    if required:
        sys.exit(f'{who}: give --film <path, or a name under {FILMS}>, set FILM, or run it from inside the film folder')
    return None
