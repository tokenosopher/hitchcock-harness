#!/usr/bin/env bash
# The local, free tools of the studio: Whisper (word times) and Demucs (stems), both run through uv.
# Run from the app folder:  bash studio/tools/setup/install_local.sh   (the app's setup.sh does). Safe to run again.
# It checks uv, then warms both tools on a two-second test clip, so the first film does not wait on downloads
# (Whisper's small.en model, about 480 MB; Demucs, PyTorch and its model, about 1 GB; all in uv's and Hugging Face's caches).
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$(dirname "$HERE")"
say() { printf '%s\n' "$*"; }

UV="${HARNESS_UV:-$(command -v uv || true)}"
if [ -z "$UV" ]; then
  for c in "$HOME/.local/bin/uv" "$HOME/.cargo/bin/uv"; do [ -x "$c" ] && UV="$c" && break; done
fi
if [ -z "$UV" ]; then
  say "  uv is missing: it runs Whisper and Demucs on this Mac."
  say "  Install it with:  brew install uv   then run this again."
  exit 1
fi
say "  ok    uv $("$UV" --version | awk '{print $2}')"
if ! command -v ffmpeg >/dev/null 2>&1; then
  say "  ffmpeg is missing. Install it with:  brew install ffmpeg   then run this again."
  exit 1
fi

WORK="$(mktemp -d -t harness-local)"
trap 'rm -rf "$WORK"' EXIT
ffmpeg -v error -y -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=2" -ac 2 "$WORK/test.wav"

say "  ...   Whisper (faster-whisper, model small.en): the first run downloads it, a few minutes"
if "$UV" run --quiet --no-project --python 3.12 --with faster-whisper==1.2.1 python "$TOOLS/stt/whisper_words.py" \
     "$WORK/test.wav" "$WORK/words.json" --model "${HARNESS_WHISPER_MODEL:-small.en}" >"$WORK/whisper.log" 2>&1; then
  say "  ok    Whisper is ready"
else
  say "  Whisper did not start. Its last lines:"; tail -n 8 "$WORK/whisper.log"; exit 1
fi

say "  ...   Demucs (htdemucs): the first run downloads it with PyTorch, a few minutes"
if "$UV" run --quiet --no-project --python 3.12 --with demucs==4.1.0 --with numpy --with soundfile \
     demucs -n htdemucs --two-stems vocals -o "$WORK/stems" "$WORK/test.wav" >"$WORK/demucs.log" 2>&1 \
   && [ -f "$WORK/stems/htdemucs/test/vocals.wav" ]; then
  say "  ok    Demucs is ready"
else
  say "  Demucs did not start. Its last lines:"; tail -n 8 "$WORK/demucs.log"; exit 1
fi
