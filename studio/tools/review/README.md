# tools/review

Word-fix and re-voice templates: each holds one fix's paths and times in a settings block at its top. Copy one next to the
fix (for example `$FILM/audio/fixes/<G>-<word>/`), change the settings, and run the copy with the film folder:
`FILM="$FILM" .venv/bin/python <the copy>`. They call no service: the word or line in the character's voice is a Higgsfield
call Alma makes (a voice saved from the take's voice stem with `create_voice_from_confirmed_audio`, then the line in it),
saved as a file; the take's voice and background stems come from `tools/stems/split.py`; word times from
`tools/stt/transcribe.py --audio`. The method: `flow/Flow v3.3 - 3 Voices and video elements.md`. All are unproven in this
studio: listen to every result.

| Template | What it does |
|---|---|
| `s4_parse_ab.py` | audio A/Bs of one replaced word: the original line, a pause, the new line; a "hybrid" (own consonants, new vowel) and a "whole new word", each dry and with two slight echoes |
| `s4_parse_c6_insert.py` | the whole new word placed dry on the original vowel peak, loudness matched, over the take's background; as is and tone-matched |
| `s4_parse_c6_voice_only.py` | the voice-only line for the cut's dialogue track: the voice stem up to the word, the new word, a 60 ms end fade, padded to the picture |
| `ai_voice_match.py` | re-voice step 1: new lines EQ'd to the original voice's spectrum, reverb matched to how the original fills the gaps, levels matched; writes the match file |
| `ai_voice_mix_v4.py` | re-voice step 2: the old voice swapped for the background over each line and its tail, the matched lines laid in with a stereo hall and solved to the original's loudness |
| `ai_voice_mix_v6_s8.py` | step 2 for one scene whose old voice leaks past the mask: the mask starts earlier |

Each writes its result beside the take or into the fix's folder and keeps the original.
