"""<Film>: the film's own tables for the voice scripts. Copy to <film>/voices/spec.py and fill it from the locked script.
The entries below are a made-up example that shows the shapes; replace them."""

TITLE = 'The Lighthouse Keeper'    # used in saved voice names: "<TITLE> – <name>"

# ---- the candidates (hf_candidates.py) and pick.py: one entry per speaking character ---------------------------------
# desc: the voice brief, written from the picked face. Age, accent, manner and pitch in words ("deep, low ... well below
#   average pitch") and loudness ("speaks up clearly, never whispering"). Avoid "breathy", "close-mic", "never raising
#   her voice" (they make the voice whisper) and era words ("vintage 1940s film"; they give an old-radio timbre).
# instruction: the variants' instruction for qwen_audio_tts, at most 128 characters.
# text: the candidate text: the element line first, then the character's own calm lines, at least 12 s of speech.
# samples: (line, tags) lines to hear the saved voice on (optional; pick.py --test prints the calls).
SPEC = {
 'C01': dict(name='Agnes',
   desc=('A weathered Scottish woman in her late sixties with a low, husky alto voice, well below average pitch, dry and '
         'unhurried, every word placed with care. She speaks up clearly, never whispering.'),
   instruction='low, husky and dry; unhurried; soft Scottish accent; speaks up, never breathy',
   text=('This is how I look and this is how I sound. The lamp has not gone out in forty years. '
         'Not once. Not for the storm, and not for you.'),
   samples=[("Not once.", 'dry, quiet'),
            ("The lamp has not gone out in forty years.", 'matter-of-fact')]),
}

# ---- record.py --------------------------------------------------------------------------------------------------------
# (id, character, delivery tags, parts). Parts are the line split at its written (beat)s; a part may be a tuple
# (text, tags, silence before it in s) for its own direction. Tags: a few words, one idea each ("dry, deadpan").
# A second direction can sit inside the text: "Come in. [suddenly wary] Who sent you?"
# Each part's raw take is saved by Alma as audio/raw/<id>-<name>-<part number>.mp3.
LINES = [
 ('V01', 'C01', 'flat, tired', ["Who's there?"]),
 ('V02', 'C01', 'dry, then softer', ["Forty years.", "Not once."]),
]
GAP, BEAT = 0.5, 0.8      # s word to word between lines; s of silence at a written (beat) inside a line
GAP_BEFORE = {            # where the script writes a pause (or an interruption: negative overlaps the previous line)
 'V02': 2.0,              # the door opens
}
TEMPO = 1.2               # atempo on every take (pitch kept); 1.0 = as spoken; or per character: {'C01': 1.25, 'default': 1.2}
EQUIV = {'40': 'forty'}   # transcript folding: how Whisper may write the film's numbers
ALLOW_EVENTS = set()      # line ids whose transcript may contain a non-speech event ([laughs]); others are marked to check
