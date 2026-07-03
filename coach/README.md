# coach/ — Learn Claude Code (paid wrapper)

Real-time terminal coaching sidebar for Claude Code, gamified. Tails the shared event log
(`~/.ai-fluency/events.jsonl`, override dir with `AI_FLUENCY_DIR`) and renders per-turn
coaching cards, XP gains, and level-ups. Zero npm dependencies (Node >= 18, plain ANSI).

## Commands

```sh
# Live sidebar — run in a split pane next to your Claude Code session
node coach/fluency.js

# Replay any events.jsonl at ~5 events/sec (demo / test mode), then exit
node coach/fluency.js --replay coach/demo.events.jsonl

# Aggregate report: level, total XP, per-dimension averages, best/worst dimension
node coach/fluency.js --summary

node coach/fluency.js --help
```

`fluency.js` is executable, so `./coach/fluency.js` works too.

## Status line

Add to Claude Code `settings.json`:

```json
{ "statusLine": { "type": "command", "command": "/absolute/path/to/coach/statusline.sh" } }
```

Prints one fast line (single awk pass, no node startup):

```
⚡ Lv 3 Collaborator · 1,240 XP · ▓▓▓░░ to Lv 4
```

## Behavior notes

- **Levels**: level = largest N with `totalXP >= 100*N*N` (0 Novice, 1 Apprentice, 2 Operator,
  3 Collaborator, 4 Director, 5 Architect, 6 Conductor, 7+ Virtuoso).
- **Dimensions are data-driven**: whatever snake_case keys appear in `turn_score.data.dims`
  are rendered (prettified to Title Case) — no hardcoded rubric.
- **Live mode** seeds cumulative XP from history already in the file, then follows new events
  (500ms poll; handles file-not-yet-existing and truncation/rotation).
- **Fail-open**: empty/missing files and malformed lines are handled silently.
- `demo.events.jsonl` is a synthetic fixture (2 sessions, 6 scored turns, crosses the
  Lv 1 and Lv 2 boundaries, includes one malformed line) for `--replay` demos.
