"""Disk space for a film: free space on the Mac, where the film's space went, and which old renders could go.
    .venv/bin/python tools/disk_report.py --film $FILM                       report only (nothing is deleted)
    .venv/bin/python tools/disk_report.py --film $FILM --prune               list what could go and how much it would free
    .venv/bin/python tools/disk_report.py --film $FILM --prune --yes --keep "<approved render>" [...]
                                                                             delete that list (only on the user's ask)
Prune candidates are rendered video files in the film's cut/ folder (cut/renders/ and cut/ itself) and its scratch
folders (cut/*.nosync), never anything else: the newest render of each kind (the highest v<N>), every file named with
--keep, every cut file (*.json), every take, every element and every delivered file are always kept. The script cannot
know which version the user approved, so --yes refuses to run without --keep. Delete nothing without the user's yes on
the exact list."""
import argparse, os, re, shutil, sys

VIDEO = re.compile(r'\.(mp4|mov|m4v|wav)$', re.I)
VER = re.compile(r'^v(\d+)-(.+)$')


def size_of(path):
    if os.path.isfile(path):
        return os.path.getsize(path)
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.lstat(os.path.join(root, f)).st_size
            except OSError:
                pass
    return total


def gb(n):
    return f'{n / 1e9:6.2f} GB'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n', 1)[1])
    ap.add_argument('--film', default=os.environ.get('FILM'))
    ap.add_argument('--prune', action='store_true', help='list what could go')
    ap.add_argument('--yes', action='store_true', help='with --prune: delete the list (only on the user\'s ask)')
    ap.add_argument('--keep', action='append', default=[], help='a file name to keep (repeatable)')
    A = ap.parse_args()
    if not A.film:
        sys.exit('give --film PATH or FILM=PATH')
    film = os.path.abspath(os.path.expanduser(A.film))
    if not os.path.isdir(film):
        sys.exit(f'not a folder: {film}')

    du = shutil.disk_usage(film)
    print(f'free on this disk: {gb(du.free)} of {gb(du.total)}' + ('   LOW: under 20 GB' if du.free < 20e9 else ''))
    print(f'\n{os.path.basename(film)}: {gb(size_of(film))}')
    for name in sorted(os.listdir(film)):
        p = os.path.join(film, name)
        if os.path.isdir(p):
            n = size_of(p)
            if n > 50e6:
                print(f'  {gb(n)}  {name}/')

    cut = os.path.join(film, 'cut')
    if not A.prune:
        return
    files = []
    for d in (cut, os.path.join(cut, 'renders')):
        if os.path.isdir(d):
            files += [os.path.join(d, f) for f in os.listdir(d) if VIDEO.search(f) and os.path.isfile(os.path.join(d, f))]
    newest = {}
    for p in files:
        m = VER.match(os.path.basename(p))
        if m:
            k = (os.path.dirname(p), m.group(2))
            newest[k] = max(newest.get(k, 0), int(m.group(1)))
    keep = set(A.keep)
    cand, kept = [], []
    for p in sorted(files):
        n = os.path.basename(p)
        m = VER.match(n)
        if n in keep or not m or int(m.group(1)) == newest[(os.path.dirname(p), m.group(2))]:
            kept.append(n); continue
        cand.append(p)
    if os.path.isdir(cut):
        cand += [os.path.join(cut, d) for d in os.listdir(cut) if d.endswith('.nosync') and os.path.isdir(os.path.join(cut, d))]
    total = sum(size_of(p) for p in cand)
    print(f'\ncould go ({gb(total)}):')
    for p in cand:
        print(f'  {gb(size_of(p))}  {os.path.relpath(p, film)}')
    print(f'kept: {", ".join(kept) or "-"} (the newest of each kind and every --keep)')
    if not A.yes:
        return
    if not keep:
        sys.exit('refusing to delete without --keep: name the approved render(s)')
    for p in cand:
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    print(f'deleted {len(cand)} items, {gb(total).strip()} freed')


if __name__ == '__main__':
    main()
