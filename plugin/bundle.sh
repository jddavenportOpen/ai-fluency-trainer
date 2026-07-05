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

# Stage the shared engines so the Node intervention hook's require('../coach-core'
# | '../trainer-core') resolves on a marketplace install (the bundled path).
# coach-core MEASURES, trainer-core TEACHES; both are gitignored/generated here,
# source of truth is /coach-core and /trainer-core.
for eng in coach-core trainer-core; do
  ED="$HERE/$eng"
  rm -rf "$ED"; mkdir -p "$ED"
  cp "$HERE/../$eng/index.js" "$ED/index.js"
  [ -f "$HERE/../$eng/package.json" ] && cp "$HERE/../$eng/package.json" "$ED/package.json"
  echo "bundled $eng -> $ED"
done
