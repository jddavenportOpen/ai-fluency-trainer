#!/bin/bash
# Stage the scorer INTO the plugin so a marketplace install (which ships only
# files under plugin/) is self-contained — a user with no repo checkout still
# scores. Run before packaging/publishing, and by install.sh for local installs.
# plugin/scorer/ is generated (gitignored); the source of truth is /scorer.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../scorer"
DST="$HERE/scorer"
rm -rf "$DST"
mkdir -p "$DST"
# only the runtime modules the Stop hook needs — not tests/fixtures
for f in score_turn.py engine.py rubric.py judge.py; do
  cp "$SRC/$f" "$DST/$f"
done
echo "bundled scorer -> $DST ($(ls "$DST" | wc -l | tr -d ' ') files)"
