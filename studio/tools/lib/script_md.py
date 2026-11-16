"""The spoken lines of a video-driven film's script.md: the "### S<n> · <title> · <location>" sections under "## Script"
(the whole file when it has no such heading), one entry per dialogue row in film order. A dialogue row is
    **NAME:** "words"      or      **NAME** *(direction):* "words"
and only the words in quotes are spoken; rows without quotes, action lines and "[N s]" timings are skipped.
    lines(path) -> [{"gen": "S1", "n": 1, "who": "Cher", "name": "CHER", "line": "How much longer? I can't hold it!"}, ...]
"who" is the name as the captions spell it: a capitalised name is title-cased (CHER -> Cher), two-letter names stay (AI).
Shared by tools/release/make_script_json.py and tools/takes/verify_clip.py."""
import re

GEN = re.compile(r'^###\s+((?:S\d+[A-Za-z]?|FIX-[\w-]+))\b')
ROW = re.compile(r'^\*\*(?P<name>[^*:]+?):?\*\*\s*(?:\*\((?P<dir>[^)]*)\):?\*)?\s*:?\s*(?P<rest>.*)$')
QUOTE = re.compile(r'"([^"]+)"|“([^”]+)”')


def who_of(name):
    name = name.strip()
    return name.title() if name.isupper() and len(name.replace(' ', '')) > 2 else name


def lines(path):
    text = open(path, encoding='utf-8').read().splitlines()
    start = next((i for i, l in enumerate(text) if re.match(r'^##\s+Script\b', l)), None)
    if start is not None:
        end = next((i for i in range(start + 1, len(text)) if re.match(r'^##\s', text[i])), len(text))
        text = text[start + 1:end]
    out, gen, n = [], None, 0
    for l in text:
        s = l.strip()
        if s.startswith('### '):
            m = GEN.match(s); gen = m.group(1) if m else None; n = 0
            continue
        if not gen:
            continue
        m = ROW.match(s)
        if not m:
            continue
        said = ' '.join(a or b for a, b in QUOTE.findall(m.group('rest'))).strip()
        if not said:
            continue
        n += 1
        out.append(dict(gen=gen, n=n, who=who_of(m.group('name')), name=m.group('name').strip(), line=said))
    return out


if __name__ == '__main__':
    import json, sys
    for r in lines(sys.argv[1]):
        print(json.dumps(r, ensure_ascii=False))
