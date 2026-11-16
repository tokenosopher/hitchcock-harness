"""Word-level transcript of one audio or video file with Whisper (faster-whisper), run on this Mac, free.

Not run on the studio's own Python: transcribe.py starts it through uv, which brings its own Python and packages:
    uv run --quiet --no-project --python 3.12 --with faster-whisper python tools/stt/whisper_words.py IN OUT.json [--model small.en]
Writes OUT.json: a list of {"text", "start", "end", "type": "word", "probability"}, in seconds, in the order spoken.
The first run downloads the model (small.en, about 480 MB) into the Hugging Face cache; later runs reuse it."""
import argparse, json, os, subprocess, sys

ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
ap.add_argument('audio')
ap.add_argument('out')
ap.add_argument('--model', default='small.en')
ap.add_argument('--language', default='en')
A = ap.parse_args()

import numpy as np
from faster_whisper import WhisperModel

# decoded by ffmpeg (16 kHz mono float), so the package's own decoder is never needed
ffmpeg = os.environ.get('HARNESS_FFMPEG') or 'ffmpeg'
pcm = subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-i', A.audio, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, dtype=np.float32)
model = WhisperModel(A.model, device='cpu', compute_type='int8')
segments, info = model.transcribe(audio, language=A.language, word_timestamps=True, beam_size=5,
                                  condition_on_previous_text=False, vad_filter=False)
words = []
for seg in segments:
    for w in seg.words or []:
        t = w.word.strip()
        if t:
            words.append({'text': t, 'start': round(w.start, 3), 'end': round(w.end, 3), 'type': 'word',
                          'probability': round(w.probability, 3)})
with open(A.out, 'w', encoding='utf-8') as f:
    json.dump(words, f, indent=1, ensure_ascii=False)
print(f'{len(words)} words, {info.duration:.2f} s of audio', file=sys.stderr)
