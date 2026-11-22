"""Edit sheet: what an editor needs at each cut of a version, as data and as pictures, for an AI editor that decides
with taste (the rules of first_cut.py are only suggestions in it).

    .venv/bin/python tools/edit/edit_sheet.py <film folder> <version> --out-dir <folder> [--learn <finished version>]

Writes <folder>/edit-sheet.json (one entry per cut point of the main picture track, in film order) and
<folder>/strips/cut-NN.jpg (one picture strip per cut). Each entry gives the two clips (ids, take files, in and out),
the words near the cut with their times (from the takes' cached transcriptions; none is run), the silence before and
after the cut, where the picture stops moving in the outgoing shot and starts in the incoming one (frame differences),
the sound level at the cut, and what the rules of first_cut.py suggest there.

A strip has two rows. Row 1: the outgoing shot's last 6 frames and the incoming shot's first 12, each labelled with
its offset from the cut. Row 2: the incoming shot from 12 frames past its in point, every 4th frame, where a slow
start shows. Under a frame: a yellow bar when a word is being spoken on it, a red bar when first_cut.py would take
it out, and "m" where the motion measure says the picture starts (incoming) or stops (outgoing) moving.
"""
import argparse, copy, os, re, sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json
import first_cut as fc  # noqa: E402

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = None

TW, TH = 88, 156      # one frame tile (9:16), 18 tiles make a strip about 1600 px wide
LAB = 16              # label band under a tile
HEAD = 22             # the strip's title band
BEFORE, AFTER, LATER, STEP = 6, 12, 12, 4
MOTION_N = 48         # frames measured for motion at each side of a cut


def font(size):
    for p in ('/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'):
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def smpte(f, fps):
    return '%02d:%02d:%02d:%02d' % (f // (3600 * fps), (f // (60 * fps)) % 60, (f // fps) % 60, f % fps)


def speaking(marks, sec):
    return any(w['type'] == 'word' and w['s'] <= sec <= w['e'] for w in (marks or []))


def side(clip, fps):
    return {'clip': clip['id'], 'label': clip.get('label'), 'take': clip.get('src'), 'in': clip['in'], 'out': clip['out'],
            'in_frame': fc.toF(clip['in'], fps), 'out_frame': fc.toF(clip['out'], fps), 'frames': fc.lenF(clip, fps),
            'speed': fc.speed_of(clip), 'scene': fc.scene_of(clip)}


def word_row(w, cut_sec, fps):
    return {'text': w['text'], 'who': w['who'], 'kind': w['type'], 'src_start': round(w['s'], 3), 'src_end': round(w['e'], 3),
            'tl_start': round(w['ts'], 3), 'tl_end': round(w['te'], 3),
            'start_from_cut_f': round((w['ts'] - cut_sec) * fps, 1), 'end_from_cut_f': round((w['te'] - cut_sec) * fps, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('film')
    ap.add_argument('version')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--learn')
    a = ap.parse_args()
    film = fc.Film(a.film)
    lines = fc.script_lines(film)
    cal = fc.learn(film, a.version, a.learn, lines) if a.learn else copy.deepcopy(fc.DEFAULT_CAL)
    tl = film.version(a.version)
    fps = tl['fps']
    vt, at = fc.linked_tracks(tl)
    # what the rules would do on this version, cut by cut
    res = fc.first_cut(film, a.version, cal, motion=False)
    snd_to_pic = {}
    for c in vt['clips']:
        p = fc.partner(tl, c)
        if p:
            snd_to_pic[p['id']] = c['id']
    by_clip = {}
    for ch in res['changes']:
        by_clip.setdefault(snd_to_pic.get(ch.get('id'), ch.get('id')), []).append(ch)
    notes_by = {}
    for k, where, m in res['notes']:
        notes_by.setdefault(where, []).append(m)
    proposals = res['proposals']

    shots, rows = fc.cut_table(tl, film, lines, {})
    strips = os.path.join(a.out_dir, 'strips')
    os.makedirs(strips, exist_ok=True)
    f_small, f_head = (font(11), font(13)) if Image else (None, None)
    entries = []
    for r in rows:
        A, B = r['out'], r['in']
        cut_f = fc.endF(A.v, fps)
        cut_sec = cut_f / fps
        n = r['i'] + 1
        e = {'cut': n, 'frame': cut_f, 'timecode': smpte(cut_f, fps), 'out': side(A.v, fps), 'in': side(B.v, fps),
             'sound_runs_on': bool(A.a and B.a and fc.contiguous(A.a, B.a, fps)), 'scene_change': A.scene != B.scene}
        for key, s in (('out', A), ('in', B)):
            e[key]['sound'] = ({'clip': s.a['id'], 'linked': fc.partner(tl, s.v) is s.a, 'in': s.a['in'], 'out': s.a['out'],
                                'fadeIn': s.a.get('fadeIn'), 'fadeOut': s.a.get('fadeOut'), 'gain': s.a.get('gain')} if s.a else None)
            e[key]['word_timings'] = s.stt if not s.title else 'title card'
        # words near the cut
        ow = [w for w in (A.marks or [])][-6:]
        iw = [w for w in (B.marks or [])][:6]
        e['words_before'] = [word_row(w, cut_sec, fps) for w in ow]
        e['words_after'] = [word_row(w, cut_sec, fps) for w in iw]
        lw = A.words[-1] if A.words else None
        fw = B.words[0] if B.words else None
        lm = max(A.marks, key=lambda w: w['te']) if A.marks else None
        fm = min(B.marks, key=lambda w: w['ts']) if B.marks else None
        e['silence'] = {
            'after_last_sound_of_outgoing_f': round((cut_sec - lm['te']) * fps, 1) if lm else None,
            'before_first_sound_of_incoming_f': round((fm['ts'] - cut_sec) * fps, 1) if fm else None,
            'last_word': lw['text'] if lw else None, 'last_word_by': lw['who'] if lw else None,
            'first_word': fw['text'] if fw else None, 'first_word_by': fw['who'] if fw else None,
            'word_to_word_f': round((fw['ts'] - lw['te']) * fps, 1) if lw and fw else None,
            'speaker_change': (lw['who'] != fw['who'] or lw['who'] == '?') if lw and fw else None,
            'note': 'a sound counts words and sound events Scribe heard ([laughs], [clears throat]); outgoing shot has no words' if not A.words else None,
        }
        # the sound level at the cut
        lev = {}
        if A.a and A.a.get('src'):
            sp = fc.speed_of(A.a)
            lv = film.level(A.a['src'], A.a['out'] - 0.1 * sp, A.a['out'])
            lev['out_last_100ms_dbfs'] = round(lv, 1) if lv is not None else None
        if B.a and B.a.get('src'):
            j = fc.jump_at(tl, film, B.a, at)
            if j:
                lev.update({'in_first_100ms_dbfs': round(j['in'], 1), 'in_next_300ms_dbfs': round(j['next'], 1) if j['next'] is not None else None,
                            'jump_db': round(j['jump'], 1), 'eases_in_by_itself': j['eases']})
        e['sound_level'] = lev
        # motion, measured on the frames the strip shows and a little more
        o_n = min(MOTION_N, fc.lenF(A.v, fps))
        out_frames = fc.grab(film, A.v['src'], fc.toF(A.v['out'], fps) - o_n, o_n, fps, TW, TH, rgb=True)
        i_n = min(max(MOTION_N, LATER * STEP + AFTER + 1), fc.lenF(B.v, fps))
        in_frames = fc.grab(film, B.v['src'], fc.toF(B.v['in'], fps), i_n, fps, TW, TH, rgb=True)
        mo = {}
        if out_frames is not None and len(out_frames) > 3:
            _, last = fc.motion_edges(fc.motion_profile(out_frames))
            mo['outgoing_stops_moving_f_before_cut'] = (len(out_frames) - 1 - last) if last is not None else None
        if in_frames is not None and len(in_frames) > 3:
            first, _ = fc.motion_edges(fc.motion_profile(in_frames[:MOTION_N]))
            mo['incoming_starts_moving_f_after_in'] = first
        mo['how'] = 'frame differences (mean absolute, grey, %dx%d) over %d frames each side; the first and last past 30%% of the way from the least to the most change; None means still or even' % (TW, TH, MOTION_N)
        e['motion'] = mo
        # what the rules suggest here
        sug = []
        for ch in by_clip.get(A.v['id'], []):
            if 'tail' in ch['what'] or ch['rule'] in (2, 3):
                sug.append({'rule': ch['rule'], 'clip': ch['clip'], 'what': ch['what'], 'why': ch['why']})
        for ch in by_clip.get(B.v['id'], []):
            if 'head' in ch['what'] or 'fade-in' in ch['what'] or ch['rule'] == 2:
                sug.append({'rule': ch['rule'], 'clip': ch['clip'], 'what': ch['what'], 'why': ch['why']})
        where = '%s / %s' % (fc.name_of(A.v), fc.name_of(B.v))
        e['rule_suggestions'] = sug
        e['rule_notes'] = notes_by.get(where, []) + notes_by.get(fc.name_of(B.v), [])
        e['rule_proposals'] = [m for k, m in proposals if fc.name_of(A.v) in m or fc.name_of(B.v) in m]
        tail_cut = head_cut = 0
        for s_ in sug:
            m = re.search(r'tail -(\d+) f', s_['what'])
            if m and s_['clip'] == fc.name_of(A.v):
                tail_cut = int(m.group(1))
            m = re.search(r'head \+(\d+) f', s_['what'])
            if m and s_['clip'] == fc.name_of(B.v):
                head_cut = int(m.group(1))
        # the strip
        if Image is not None:
            path = os.path.join(strips, 'cut-%02d.jpg' % n)
            W = TW * (BEFORE + AFTER) + 4
            H = HEAD + TH + LAB + 14 + TH + LAB
            img = Image.new('RGB', (W, H), (16, 16, 16))
            d = ImageDraw.Draw(img)
            gap = e['silence']['word_to_word_f']
            title = 'cut %d  %s   %s  |  %s   %s%s' % (
                n, e['timecode'], fc.name_of(A.v), fc.name_of(B.v),
                ('"%s" > "%s" %d f' % (lw['text'], fw['text'], round(gap))) if gap is not None else 'no words on one side',
                ('   rules: tail -%d, head +%d' % (tail_cut, head_cut)) if (tail_cut or head_cut) else '')
            d.text((4, 4), title[:230], fill=(235, 235, 235), font=f_head)

            def tile(arr, x, y, label, word, cut, mark):
                if arr is not None:
                    img.paste(Image.fromarray(arr), (x, y))
                else:
                    d.rectangle([x, y, x + TW - 1, y + TH - 1], fill=(40, 40, 40))
                    d.text((x + 6, y + TH // 2 - 6), 'past out', fill=(150, 150, 150), font=f_small)
                if word:
                    d.rectangle([x, y + TH, x + TW - 1, y + TH + 2], fill=(240, 200, 40))
                if cut:
                    d.rectangle([x, y + TH + 3, x + TW - 1, y + TH + 5], fill=(220, 50, 50))
                d.text((x + 3, y + TH + 4), label + ('  m' if mark else ''), fill=(220, 220, 220), font=f_small)
            y1 = HEAD
            o_last = (len(out_frames) - 1 - mo['outgoing_stops_moving_f_before_cut']) if (out_frames is not None and mo.get('outgoing_stops_moving_f_before_cut') is not None) else None
            for k in range(BEFORE):
                off = -BEFORE + k
                idx = (len(out_frames) + off) if out_frames is not None else -1
                arr = out_frames[idx] if out_frames is not None and 0 <= idx < len(out_frames) else None
                sec = (fc.toF(A.v['out'], fps) + off + 0.5) / fps
                tile(arr, k * TW, y1, '%d' % off, speaking(A.marks, sec),
                     -off <= tail_cut, o_last is not None and idx == o_last)
            x0 = BEFORE * TW + 4
            d.rectangle([BEFORE * TW, y1, BEFORE * TW + 3, y1 + TH], fill=(255, 255, 255))
            i_first = mo.get('incoming_starts_moving_f_after_in')
            for k in range(AFTER):
                arr = in_frames[k] if in_frames is not None and k < len(in_frames) else None
                sec = (fc.toF(B.v['in'], fps) + k + 0.5) / fps
                tile(arr, x0 + k * TW, y1, '+%d' % k, speaking(B.marks, sec), k < head_cut, i_first == k)
            y2 = y1 + TH + LAB
            d.text((4, y2), 'incoming shot from in+%d, every %d frames (slow starts)' % (AFTER, STEP), fill=(170, 170, 170), font=f_small)
            y2 += 14
            for k in range(LATER):
                fi = AFTER + k * STEP
                arr = in_frames[fi] if in_frames is not None and fi < len(in_frames) else None
                sec = (fc.toF(B.v['in'], fps) + fi + 0.5) / fps
                tile(arr, k * TW, y2, 'in+%d' % fi, speaking(B.marks, sec), fi < head_cut,
                     i_first is not None and fi <= i_first < fi + STEP)
            img.save(path, 'JPEG', quality=78)
            e['strip'] = os.path.relpath(path, a.out_dir)
        entries.append(e)

    sheet = {
        'film': film.slug, 'version': a.version, 'fps': fps, 'made_by': 'tools/edit/edit_sheet.py',
        'calibration': {k: v for k, v in cal.items() if k != 'why'},
        'frames_are': 'timeline frames at the cut version\'s fps; src_* in seconds of the take file; *_from_cut_f negative before the cut',
        'strip_legend': 'row 1: outgoing -6..-1 | incoming +0..+11 (white bar = the cut); row 2: incoming from in+12 every 4 f; yellow bar = a word is spoken on the frame; red bar = first_cut.py would take it out; m = where motion starts (incoming) or stops (outgoing)',
        'takes_without_word_timings': res['missing'],
        'cuts': entries,
    }
    with open(os.path.join(a.out_dir, 'edit-sheet.json'), 'w') as f:
        json.dump(sheet, f, indent=1, ensure_ascii=False)
    print('wrote %s and %d strips in %s' % (os.path.join(a.out_dir, 'edit-sheet.json'), len(entries), strips))


if __name__ == '__main__':
    main()
