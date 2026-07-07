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

# ── Runtime preflight ──────────────────────────────────────────────────────────
# The plugin hooks require python3 (scoring) and node (intervention/coaching).
# Without them the hooks exit silently and the user sees a blank profile forever.
# Check here, loudly, before we install anything.
preflight_check() {
  local ok=1

  # python3 (>=3.8 required)
  if ! command -v python3 >/dev/null 2>&1; then
    printf '\033[31m✗ python3 not found.\033[0m\n' >&2
    printf '  The AI Fluency scorer requires Python 3.8+.\n' >&2
    printf '  Install it:\n' >&2
    printf '    macOS:         brew install python3\n' >&2
    printf '    Debian/Ubuntu: sudo apt install python3\n' >&2
    printf '    Fedora/RHEL:   sudo dnf install python3\n' >&2
    ok=0
  else
    local pyver
    pyver="$(python3 -c 'import sys; print("%d%02d" % sys.version_info[:2])' 2>/dev/null || echo "0")"
    if [ "$pyver" -lt 308 ] 2>/dev/null; then
      printf '\033[31m✗ python3 is too old (need 3.8+, got %s).\033[0m\n' \
        "$(python3 --version 2>&1 | awk '{print $2}')" >&2
      printf '  Upgrade: brew upgrade python3  OR  sudo apt install python3\n' >&2
      ok=0
    fi
  fi

  # node (any reasonably modern version; the hook just needs require/fs)
  if ! command -v node >/dev/null 2>&1; then
    printf '\033[31m✗ node not found.\033[0m\n' >&2
    printf '  The AI Fluency intervention hook requires Node.js.\n' >&2
    printf '  Install it:\n' >&2
    printf '    macOS:         brew install node\n' >&2
    printf '    Debian/Ubuntu: sudo apt install nodejs\n' >&2
    printf '    Fedora/RHEL:   sudo dnf install nodejs\n' >&2
    printf '    Or via nvm:    https://github.com/nvm-sh/nvm\n' >&2
    ok=0
  fi

  # git (required to clone the repo)
  if ! command -v git >/dev/null 2>&1; then
    printf '\033[31m✗ git not found.\033[0m\n' >&2
    printf '  Install it:\n' >&2
    printf '    macOS:         xcode-select --install\n' >&2
    printf '    Debian/Ubuntu: sudo apt install git\n' >&2
    ok=0
  fi

  if [ "$ok" -eq 0 ]; then
    printf '\n\033[31mInstall the missing runtime(s) above, then re-run this one-liner.\033[0m\n' >&2
    exit 1
  fi
}

preflight_check

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
