# AI Fluency Trainer — Architecture (MVP)

Two products, one spine:

1. **Free plugin** (`plugin/`) — a Claude Code plugin that captures usage telemetry via hooks,
   scores it locally, and syncs anonymized scores to a web dashboard ("how well do you use AI +
   where to improve").
2. **Paid wrapper — "Learn Claude Code"** (`coach/`) — a terminal app that runs alongside/around
   Claude Code and gives **real-time coaching feedback + XP/levels** as you work. Gamified;
   profile page is recruiter-shareable.

Both consume the same event stream and the same scoring engine.

```
Claude Code session
   │  hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
   ▼
plugin/hooks/capture  ──►  ~/.ai-fluency/events.jsonl   (append-only local event log)
                                 │
                                 ▼
                        scorer/  (dimension rubric: heuristics + optional LLM judge
                                  reading the turn transcript slice)
                                 │
        ┌────────────────────────┼──────────────────────────┐
        ▼                        ▼                          ▼
  coach/ TUI (live tail:    web/ dashboard (Next.js +   Stop-hook feedback
  per-turn feedback, XP,    SQLite: radar chart, level, (one-line tip + XP delta
  streaks, level-ups)       badges, trends, share page)  surfaced in terminal)
```

## Components

### plugin/ — Claude Code plugin (free tier)
- `.claude-plugin/plugin.json` manifest; bundles `hooks/hooks.json`.
- Hook events captured (all write one JSON line to `~/.ai-fluency/events.jsonl`):
  - `SessionStart` / `SessionEnd` — session boundaries, model, cwd (hashed).
  - `UserPromptSubmit` — prompt text length, prompt itself stored **locally only**; sync layer
    sends derived features, never raw text (privacy default).
  - `PostToolUse` — tool name, success/failure. This is how we see test runs, edits, reads.
  - `Stop` — turn boundary; triggers the incremental scorer for the completed turn
    (reads `transcript_path`, scores just the new slice), appends a `turn_score` event,
    and emits a one-line coaching tip.
- Capture must be **fail-open and fast** (<100ms; scoring runs async/detached) — never slow the session.

### scorer/ — scoring engine (shared)
- Input: transcript JSONL slice (Claude Code transcripts) + event log.
- Output: per-turn `turn_score` events + rolling per-dimension scores (0–100).
- Dimensions come from RESEARCH.md rubric (research in flight). Working set (subject to research):
  delegation quality, context-setting, verification behavior, iteration vs blind-accept,
  diagnosis vs blind-retry, plan-before-build, scope discipline, learning signals
  (asks "why", reads the diff), independence (not offloading judgment).
- Two layers: cheap deterministic heuristics (always on) + LLM judge (`claude -p --model haiku`)
  for the judgment-heavy dimensions, budget-capped.
- **Gaming resistance**: score from *behavior over time*, judge sees raw transcript, dimensions
  cross-check each other. Document known gaming vectors.

### coach/ — Learn Claude Code wrapper (paid tier)
- CLI: `fluency` — launches/attaches to a Claude Code session and renders a live side-channel:
  tails `events.jsonl`, prints per-turn coaching (what you did well / one thing to do better),
  XP gains, level-ups, streaks. Node + Ink (or plain ANSI) TUI.
- Also ships a `statusLine` command: `Lv 7 · 2,340 XP · Verifier ▲` in the Claude Code status bar.

### web/ — dashboard + profile (free tier target, also gamification home)
- Next.js + SQLite (better-sqlite3) for MVP, local `pnpm dev`.
- `POST /api/ingest` — receives batched score events (device token auth).
- `/dashboard` — radar chart of dimensions, trend lines, top-3 "where to improve" with concrete
  behavioral prescriptions, session history.
- `/u/[handle]` — public share page: level, dimension radar, badges, verified-usage stats
  (the recruiter view).

## Event schema (v1)
One JSON object per line, `~/.ai-fluency/events.jsonl`:
```json
{"v":1,"ts":"2026-07-03T10:00:00Z","sid":"<session_id>","event":"turn_score",
 "data":{"turn":12,"dims":{"verification":72,"context":85},"xp":35,"tip":"You accepted the diff without running tests — ask for a test run first."}}
```
Event types: `session_start`, `session_end`, `prompt`, `tool_use`, `turn_score`, `sync`.

## MVP acceptance (what "fully works" means)
1. Install plugin into Claude Code → run a real session → events captured, turns scored.
2. `fluency` TUI shows live per-turn feedback + XP while you work.
3. `web` dashboard renders real scores from the session, with improvement guidance.
4. Share page renders a level + radar a recruiter could read.
5. End-to-end demo path documented in README; synthetic-transcript test fixture for CI.
