#!/usr/bin/env bash
# Hitchcock Harness setup. Run it from this folder: ./setup.sh
# Safe to run again at any time: it only adds what is missing and never deletes a film.
#
# What it does:
#   1. checks Node 20 or newer, npm, ffmpeg, ffprobe, python3, perl and uv (and stops with the install line if one is missing);
#      checks Blender, which only the previz stage needs (a warning, not a stop)
#   2. makes the Python environment for the studio's tools: studio/.venv (Pillow, numpy, scipy, requests),
#      then installs the local tools that run free on this Mac (removing music, word timings) with
#      studio/tools/setup/install_local.sh, when that file is there
#   3. makes the folders the films live in: studio/assets/{films,library,final-cuts}
#   4. installs the app's packages (npm ci)
#   5. writes .env.local from .env.example, if there is none yet
#   6. checks Claude Code is installed and signed in, and that the Higgsfield MCP server is set up
#      (adds it for your user if it is missing; it changes nothing else in your Claude settings)
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"
STUDIO="$ROOT/studio"
OS="$(uname -s)"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
todo() { printf '  todo  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }

install_hint() {
  # $1: the Homebrew package names, $2: the apt package names
  if [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      say "  Install with:  brew install $1"
    else
      say "  Install Homebrew first (https://brew.sh):"
      say '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      say "  then:  brew install $1"
    fi
  else
    say "  Install with your package manager, for example:  sudo apt-get install -y $2"
    say "  (Node must be 20 or newer: https://nodejs.org/en/download)"
  fi
}

# ---- 1. the programs the app needs
step "Checking the programs the app needs"
missing_brew=()
missing_apt=()
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$NODE_MAJOR" -ge 20 ]; then ok "node $(node --version)"; else
    say "  Node $(node --version) is too old: the app needs Node 20 or newer."
    missing_brew+=(node); missing_apt+=(nodejs)
  fi
else
  say "  node is missing."; missing_brew+=(node); missing_apt+=(nodejs)
fi
if command -v npm >/dev/null 2>&1; then ok "npm $(npm --version)"; else
  say "  npm is missing."; [[ " ${missing_brew[*]-} " == *" node "* ]] || missing_brew+=(node); missing_apt+=(npm)
fi
for tool in ffmpeg ffprobe; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else
    say "  $tool is missing."
    [[ " ${missing_brew[*]-} " == *" ffmpeg "* ]] || missing_brew+=(ffmpeg)
    [[ " ${missing_apt[*]-} " == *" ffmpeg "* ]] || missing_apt+=(ffmpeg)
  fi
done
if command -v python3 >/dev/null 2>&1; then ok "python3 $(python3 -c 'import platform; print(platform.python_version())')"; else
  say "  python3 is missing."; missing_brew+=(python); missing_apt+=(python3 python3-venv)
fi
if command -v perl >/dev/null 2>&1; then ok "perl"; else
  say "  perl is missing."; missing_brew+=(perl); missing_apt+=(perl)
fi
# uv runs the local tools (removing music with Demucs, word timings with Whisper) on this Mac, free
UV_MISSING=""
if command -v uv >/dev/null 2>&1; then ok "uv $(uv --version 2>/dev/null | awk '{print $2}')"; else
  say "  uv is missing."; missing_brew+=(uv); UV_MISSING=1
fi
if [ "${#missing_brew[@]}" -gt 0 ] || [ "${#missing_apt[@]}" -gt 0 ]; then
  say ""
  say "Some programs are missing."
  install_hint "${missing_brew[*]-}" "${missing_apt[*]-}"
  if [ -n "$UV_MISSING" ] && [ "$OS" != "Darwin" ]; then
    say "  uv:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  fi
  say "Then run ./setup.sh again."
  exit 1
fi

# Blender: only the previz stage needs it (studio/tools/previz), so a missing one is a warning, not a stop
BLENDER_FOUND=""
if [ -n "${BLENDER_BIN:-}" ] && [ -x "${BLENDER_BIN}" ]; then BLENDER_FOUND="$BLENDER_BIN"
elif [ -x /Applications/Blender.app/Contents/MacOS/Blender ]; then BLENDER_FOUND=/Applications/Blender.app
elif command -v blender >/dev/null 2>&1; then BLENDER_FOUND="$(command -v blender)"
fi
if [ -n "$BLENDER_FOUND" ]; then
  ok "blender ($BLENDER_FOUND)"
  if [ "$BLENDER_FOUND" != /Applications/Blender.app ] && [ -z "${BLENDER_BIN:-}" ]; then
    say "        the previz tools look in /Applications/Blender.app: set BLENDER_BIN=$BLENDER_FOUND in .env.local"
  fi
else
  if [ "$OS" = "Darwin" ]; then
    say "  warn  Blender is missing; only the previz stage needs it. Install it with:  brew install --cask blender"
  else
    say "  warn  Blender is missing; only the previz stage needs it (https://www.blender.org/download/), then set BLENDER_BIN in .env.local"
  fi
fi

# ---- 2. the Python environment for the studio's tools
step "Python for the studio's tools (studio/.venv)"
VENV_PY="$STUDIO/.venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
  if ! python3 -m venv "$STUDIO/.venv"; then
    say "  Could not make the Python environment."
    [ "$OS" = "Darwin" ] || say "  On Debian or Ubuntu:  sudo apt-get install -y python3-venv   then run ./setup.sh again."
    exit 1
  fi
  ok "made studio/.venv"
else
  ok "studio/.venv is there"
fi
if "$VENV_PY" -c 'import PIL, numpy, scipy, requests' >/dev/null 2>&1; then
  ok "Pillow, numpy, scipy and requests are installed"
else
  say "  installing Pillow, numpy, scipy and requests …"
  "$VENV_PY" -m pip install --quiet --disable-pip-version-check pillow numpy scipy requests
  ok "Pillow, numpy, scipy and requests installed"
fi

# the local tools (removing music, word timings): installed by the studio's own script, when it is there
LOCAL_SETUP="studio/tools/setup/install_local.sh"
if [ -f "$LOCAL_SETUP" ]; then
  say "  installing the local tools (removing music, word timings) …"
  if ! bash "$LOCAL_SETUP"; then
    say "  The local tools did not install (see the lines above). Fix what they name, then run ./setup.sh again."
    exit 1
  fi
  ok "the local tools are installed"
fi

# ---- 3. the folders the films live in
step "The studio folders"
for d in films library final-cuts; do
  if [ -d "$STUDIO/assets/$d" ]; then ok "studio/assets/$d is there"; else
    mkdir -p "$STUDIO/assets/$d"; ok "made studio/assets/$d"
  fi
done

# ---- 4. the app's packages
step "The app's packages (npm)"
if [ -f node_modules/.package-lock.json ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  ok "already installed (delete node_modules to install again)"
else
  npm ci --no-audit --no-fund
  ok "installed"
fi

# ---- 5. the settings file
step "Settings (.env.local)"
if [ -f .env.local ]; then ok ".env.local is there (left as it is)"; else
  cp .env.example .env.local; ok "made .env.local from .env.example (every line is a default; nothing to fill in)"
fi

# ---- 6. Claude Code and Higgsfield
step "Claude Code and Higgsfield"
# a terminal inside Claude Code, or an API key in the environment, would change what `claude` reports: leave them out
claude_cmd() { env -u CLAUDECODE -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN claude "$@"; }
if ! command -v claude >/dev/null 2>&1; then
  say "  Claude Code is not installed (or not on your PATH)."
  say "  Install it with:  curl -fsSL https://claude.ai/install.sh | bash"
  say "  then open a new terminal, run  claude  once to sign in, and run ./setup.sh again."
  exit 1
fi
ok "claude $(claude_cmd --version 2>/dev/null | head -n1)"

SIGNED_IN=unknown
if AUTH="$(claude_cmd auth status --json 2>/dev/null)"; then
  if printf '%s' "$AUTH" | grep -q '"loggedIn": *true'; then SIGNED_IN=yes; else SIGNED_IN=no; fi
fi
case "$SIGNED_IN" in
  yes) ok "signed in to Claude" ;;
  no)  todo "sign in to Claude: run  claude  in a terminal once and follow the login" ;;
  *)   todo "if you have not yet: run  claude  in a terminal once and sign in" ;;
esac

# the Higgsfield MCP server: looked up from the studio folder, where Alma runs (so any scope counts)
if (cd "$STUDIO" && claude_cmd mcp get higgsfield >/dev/null 2>&1); then
  ok "the higgsfield MCP server is set up (left as it is)"
  HF_NEW=no
else
  say "  adding the higgsfield MCP server for your user …"
  claude_cmd mcp add --scope user --transport http higgsfield https://mcp.higgsfield.ai/mcp
  ok "added the higgsfield MCP server"
  HF_NEW=yes
fi

# ---- done
step "Done"
if [ "$SIGNED_IN" != "yes" ]; then
  say "Before you start: run  claude  in a terminal and sign in with your Claude account."
fi
if [ "$HF_NEW" = "yes" ]; then
  say "Sign in to Higgsfield once: open a terminal, run  claude , type  /mcp , pick higgsfield and sign in."
else
  say "If Higgsfield is not signed in yet: run  claude , type  /mcp , pick higgsfield and sign in."
fi
say ""
say "To start the app:"
say "  npm run dev"
say "then open  http://localhost:8800  in your browser. Stop it with Ctrl-C."
