"""Check that a job ran the prompt file (Flow v3.2 - 7 Takes, step 11): the prompt Higgsfield stored for the job against the
prompt file, identical apart from trailing newlines at the end. The agent fetches the stored prompt through the connector
and saves it to a text file; this script only compares, and calls no service.

    .venv/bin/python tools/higgsfield/verify_prompt.py <prompt file> --stored <text file holding the prompt Higgsfield returned>
        [--context 2]

Prints "identical" (exit 0), or the first differing line of each with the lines around it, the column where they part,
and both lengths (exit 1). Exit 2 when a file cannot be read. Line endings are compared as they are: a CRLF copy differs."""
import argparse, sys


def read(p):
    try:
        with open(p, encoding='utf-8', newline='') as f:
            return f.read()
    except (OSError, UnicodeDecodeError) as x:
        print(f'cannot read {p}: {x}')
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('prompt', help='the prompt file that was sent')
    ap.add_argument('--stored', required=True, help='a text file holding the prompt Higgsfield stored for the job')
    ap.add_argument('--context', type=int, default=2, help='lines shown before and after the first difference')
    A = ap.parse_args()
    a, b = read(A.prompt).rstrip('\n'), read(A.stored).rstrip('\n')
    if a == b:
        print(f'identical ({len(a):,} characters)')
        return
    la, lb = a.split('\n'), b.split('\n')
    i = next((k for k in range(min(len(la), len(lb))) if la[k] != lb[k]), min(len(la), len(lb)))
    x, y = (la[i] if i < len(la) else None), (lb[i] if i < len(lb) else None)
    col = next((k for k in range(min(len(x or ''), len(y or ''))) if x[k] != y[k]), min(len(x or ''), len(y or '')))
    print(f'DIFFERENT: first at line {i + 1}, column {col + 1}. Prompt file {len(a):,} characters in {len(la)} lines, '
          f'stored {len(b):,} in {len(lb)} lines.')
    lo = max(0, i - A.context)
    for name, lines in (('prompt file', la), ('stored', lb)):
        print(f'--- {name}')
        for k in range(lo, min(len(lines), i + A.context + 1)):
            print(f'{"> " if k == i else "  "}{k + 1:4}  {lines[k]}')
        if i >= len(lines):
            print(f'> {i + 1:4}  (ends before this line)')
    if x is not None and y is not None:
        print(f'from column {col + 1}: prompt file {x[col:col + 60]!r} · stored {y[col:col + 60]!r}')
    if '<<<' in (x or '') and '@' in (y or ''):
        print('note: the backend rewrites <<<element-id>>> to @name; check whether that is the only difference')
    if x is not None and y is not None and x.rstrip('\r') == y.rstrip('\r'):
        print('note: the lines differ only in a carriage return (CRLF against LF)')
    sys.exit(1)


if __name__ == '__main__':
    main()
