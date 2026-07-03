#!/bin/bash
# statusline.sh — Claude Code statusLine command for the AI Fluency Trainer.
# Reads (and ignores) the statusLine stdin JSON, then prints one line:
#   ⚡ Lv 3 Collaborator · 1,240 XP · ▓▓▓░░ to Lv 4
# Fast path: single awk pass over the events file, no node startup.

cat > /dev/null 2>&1 || true   # drain stdin JSON from Claude Code

DIR="${AI_FLUENCY_DIR:-$HOME/.ai-fluency}"
FILE="$DIR/events.jsonl"

if [ ! -r "$FILE" ]; then
  printf '⚡ Lv 0 Novice · 0 XP · ░░░░░ to Lv 1\n'
  exit 0
fi

awk '
  # Only count structurally complete lines: a truncated append (the realistic
  # malformed-JSONL case) never ends in "}", and fluency.js skips it too —
  # the two tools must agree on the same file.
  /"event":[[:space:]]*"turn_score"/ && /\}[[:space:]]*$/ {
    if (match($0, /"xp":[[:space:]]*-?[0-9]+/)) {
      s = substr($0, RSTART, RLENGTH)
      gsub(/[^0-9-]/, "", s)
      total += s + 0
    }
  }
  END {
    if (total < 0) total = 0
    lv = int(sqrt(total / 100))
    titles[0]="Novice"; titles[1]="Apprentice"; titles[2]="Operator"
    titles[3]="Collaborator"; titles[4]="Director"; titles[5]="Architect"
    titles[6]="Conductor"
    t = (lv >= 7) ? "Virtuoso" : titles[lv]
    cur = 100 * lv * lv
    nxt = 100 * (lv + 1) * (lv + 1)
    frac = (total - cur) / (nxt - cur)
    f = int(frac * 5 + 0.5); if (f > 5) f = 5; if (f < 0) f = 0
    bar = ""
    for (i = 0; i < 5; i++) bar = bar ((i < f) ? "▓" : "░")
    # comma-format total
    x = sprintf("%d", total); o = ""; n = length(x)
    while (n > 3) { o = "," substr(x, n-2, 3) o; x = substr(x, 1, n-3); n -= 3 }
    o = x o
    printf "⚡ Lv %d %s · %s XP · %s to Lv %d\n", lv, t, o, bar, lv + 1
  }
' "$FILE"
