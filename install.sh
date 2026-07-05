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
  cat > "$FLUENCY_DIR/config.json" <<EOF
{"url": "$API", "token": "$TOKEN", "handle": "$HANDLE",
 "scorer": "$REPO/scorer/score_turn.py"}
EOF
  echo "Provisioned @$HANDLE -> your profile: $API/u/$HANDLE"
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
