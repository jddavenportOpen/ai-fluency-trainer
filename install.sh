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

# 1) Plugin: register this repo as a marketplace, install the plugin (both idempotent)
claude plugin marketplace add "$REPO" 2>/dev/null || claude plugin marketplace update ai-fluency
claude plugin install ai-fluency@ai-fluency 2>/dev/null || echo "(plugin already installed)"

# 2) Default config for sync (only if absent)
mkdir -p "$FLUENCY_DIR"
if [[ ! -f "$FLUENCY_DIR/config.json" ]]; then
  cat > "$FLUENCY_DIR/config.json" <<EOF
{"url": "http://localhost:3000", "token": "dev-token-jd", "handle": "jd",
 "scorer": "$REPO/scorer/score_turn.py"}
EOF
  echo "Wrote default sync config → $FLUENCY_DIR/config.json"
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
echo "  1. Restart Claude Code (plugins load at session start) and use it normally"
echo "  2. Live coaching:  node $REPO/coach/fluency.js"
echo "  3. Your stats:     node $REPO/coach/fluency.js --summary"
echo "  4. Dashboard:      cd $REPO/web && npm install && npm run seed && npm run dev"
echo "                     then: python3 $REPO/plugin/scripts/sync.py && open http://localhost:3000/dashboard"
