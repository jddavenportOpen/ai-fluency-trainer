#!/bin/bash
# AI Fluency Trainer — local install.
#   ./install.sh                 install plugin (marketplace add + plugin install) + default config
#   ./install.sh --statusline    also wire coach/statusline.sh as the Claude Code statusLine
#                                (skipped with a warning if you already have one; --force-statusline to replace, with backup)
#   ./install.sh --uninstall     remove plugin + marketplace registration (leaves ~/.ai-fluency data)
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
FLUENCY_DIR="${AI_FLUENCY_DIR:-$HOME/.ai-fluency}"
SETTINGS="$HOME/.claude/settings.json"

# ── Runtime preflight ──────────────────────────────────────────────────────────
# The plugin hooks require python3 (scoring) and node (intervention/coaching).
# Without them the hooks exit silently and the user sees a blank profile forever.
# Check here, loudly, before we install anything.
preflight_check() {
  local ok=1

  # python3 (>=3.8 required by the scorer)
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

  # node (required by the intervention/coaching hook)
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

  # git (required for repo operations + provisioning)
  if ! command -v git >/dev/null 2>&1; then
    printf '\033[31m✗ git not found.\033[0m\n' >&2
    printf '  Install it:\n' >&2
    printf '    macOS:         xcode-select --install\n' >&2
    printf '    Debian/Ubuntu: sudo apt install git\n' >&2
    ok=0
  fi

  if [ "$ok" -eq 0 ]; then
    printf '\n\033[31mInstall the missing runtime(s) above, then re-run ./install.sh\033[0m\n' >&2
    exit 1
  fi
}

preflight_check

if [[ "${1:-}" == "--uninstall" ]]; then
  claude plugin uninstall ai-fluency 2>/dev/null || true
  claude plugin marketplace remove ai-fluency 2>/dev/null || true
  echo "Uninstalled plugin + marketplace. Data left at $FLUENCY_DIR (delete manually if wanted)."
  exit 0
fi

# 0) Bundle the scorer into the plugin so the install is self-contained
#    (scoring no longer depends on a repo checkout being present).
bash "$REPO/plugin/bundle.sh"

# 1) Plugin: register this repo as a marketplace, install the plugin (both idempotent)
claude plugin marketplace add "$REPO" 2>/dev/null || claude plugin marketplace update ai-fluency
claude plugin install ai-fluency@ai-fluency 2>/dev/null || echo "(plugin already installed)"

# 2) Provision THIS user's own handle + sync token from clawdacademy.app.
#    Score-first (no email/password): every install gets a distinct identity, so
#    there is never a shared token and your scores are yours.
API="${CLAWDACADEMY_API:-https://clawdacademy.app}"
mkdir -p "$FLUENCY_DIR"
if [[ ! -f "$FLUENCY_DIR/config.json" ]]; then
  HANDLE="${CLAWDACADEMY_HANDLE:-}"
  TOKEN="${CLAWDACADEMY_TOKEN:-}"
  if [[ -n "$TOKEN" && -n "$HANDLE" ]]; then
    # Already claimed on the web (clawdacademy.app/start) — use the handed-off
    # token as-is; do NOT re-provision (that would 409 on the taken handle).
    echo "Using your pre-claimed handle @$HANDLE."
  else
    if [[ -z "$HANDLE" ]]; then
      read -rp "Pick a handle for your public profile (3-30, a-z 0-9 -): " HANDLE
    fi
    RESP="$(curl -fsS -X POST "$API/api/provision" -H 'Content-Type: application/json' \
            -d "{\"handle\":\"$HANDLE\"}" 2>/dev/null || true)"
    TOKEN="$(printf '%s' "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("device_token",""))' 2>/dev/null || true)"
    if [[ -z "$TOKEN" ]]; then
      echo "Could not provision '@$HANDLE' (taken or invalid). Response: $RESP"
      echo "Re-run with another handle:  CLAWDACADEMY_HANDLE=yourname ./install.sh"
      exit 1
    fi
  fi
  cat > "$FLUENCY_DIR/config.json" <<EOF
{"url": "$API", "token": "$TOKEN", "handle": "$HANDLE",
 "scorer": "$REPO/scorer/score_turn.py"}
EOF
  echo "Configured @$HANDLE -> your profile: $API/u/$HANDLE"
fi

# 3) Optional statusline wiring — never clobber silently
if [[ "${1:-}" == "--statusline" || "${1:-}" == "--force-statusline" ]]; then
  python3 - "$1" <<PYEOF
import json, shutil, sys
mode = sys.argv[1]
p = "$SETTINGS"
s = json.load(open(p))
if "statusLine" in s and mode != "--force-statusline":
    print("statusLine already configured — kept. Use --force-statusline to replace (a .bak is made),")
    print("or append this to your existing script:  bash $REPO/coach/statusline.sh")
else:
    shutil.copy(p, p + ".ai-fluency.bak")
    s["statusLine"] = {"type": "command", "command": "bash $REPO/coach/statusline.sh"}
    json.dump(s, open(p, "w"), indent=2)
    print("statusLine set (backup at settings.json.ai-fluency.bak)")
PYEOF
fi

echo
echo "Installed. Next:"
echo "  1. Restart Claude Code (plugins load at session start) and just work normally"
echo "  2. Live coaching:  node $REPO/coach/fluency.js       (or the statusline)"
echo "  3. Your one thing: node $REPO/trainer-core/index.js focus"
echo "  4. Sync + profile: python3 $REPO/plugin/scripts/sync.py"
echo "                     then open  ${API:-https://clawdacademy.app}/u/${HANDLE:-<your-handle>}"
