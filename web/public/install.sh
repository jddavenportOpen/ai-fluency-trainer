#!/usr/bin/env bash
# Clawdacademy one-line installer — the hosted front door.
#
#   bash -c "$(curl -fsSL https://clawdacademy.app/install.sh)"
#
# Or with a handle you already claimed at clawdacademy.app/start:
#   CLAWDACADEMY_HANDLE=you CLAWDACADEMY_TOKEN=aif_xxx \
#     bash -c "$(curl -fsSL https://clawdacademy.app/install.sh)"
#
# It fetches the PUBLIC repo and runs its installer (which wires the Claude Code
# plugin + your score-first profile). No prior clone, no plugin-first chicken-and-egg.
set -euo pipefail

REPO_URL="https://github.com/JDDavenport/ai-fluency-trainer"
SRC="${CLAWDACADEMY_HOME:-$HOME/.clawdacademy/src}"

say() { printf '\033[36m›\033[0m %s\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required. Install it (macOS: xcode-select --install; Debian/Ubuntu: sudo apt install git) then re-run."

# Ensure Claude Code exists (the plugin runs inside it). Best-effort; never fatal —
# the plugin/config still lands and starts scoring once Claude Code is present.
if ! command -v claude >/dev/null 2>&1; then
  say "Claude Code not found — attempting install…"
  if command -v npm >/dev/null 2>&1; then
    npm install -g @anthropic-ai/claude-code >/dev/null 2>&1 || say "Could not auto-install Claude Code; get it at https://claude.com/claude-code then re-run."
  else
    say "No npm found. Install Claude Code from https://claude.com/claude-code, then re-run this one-liner."
  fi
fi

say "Fetching Clawdacademy…"
mkdir -p "$(dirname "$SRC")"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" pull --ff-only --quiet || die "Could not update $SRC. Delete it and re-run."
else
  git clone --depth 1 --quiet "$REPO_URL" "$SRC" || die "Could not clone $REPO_URL"
fi

say "Running the installer…"
# Pass the whole environment (CLAWDACADEMY_HANDLE / _TOKEN / _API) + any args through.
exec bash "$SRC/install.sh" "$@"
