# Clawdacademy

I wanted to know if I was getting better at working with Claude or just faster. So I built this. It's a Claude Code plugin that scores 7 habits from your own sessions, names your weakest one, and coaches you on it while you work. It runs locally, and sync is opt-in.

Install it with one line (details below), do one real task in Claude Code, and your rating shows in the statusline. The hosted dashboard is at [clawdacademy.app](https://clawdacademy.app).

One product, three names you'll see: Clawdacademy is the product, this repo is `ai-fluency-trainer`, and the Claude Code plugin is called `ai-fluency`.

Moved here from my private working repo in July 2026. Most of this code was written by Claude Code agents I run. I pick what gets built, set the tests it has to pass, and check it by using it.

## What the plugin captures, and what leaves your machine

The plugin uses Claude Code hooks to watch your sessions. Here is everything it records and everything it sends.

### What the plugin captures (stays local by default)

The capture hook (`plugin/hooks/capture.py`) appends structured events to `~/.ai-fluency/events.jsonl`:

| Event | What is recorded locally |
|---|---|
| `session_start` | Session ID, SHA-256 of the working directory path (10 hex chars, not the path itself), session kind |
| `prompt` | Raw prompt text (word and character count plus full text, **local only, never synced**) |
| `tool_use` | Tool name, success/failure, list of input key names (not values) |
| `tool_failure` | Tool name, error type (first 80 chars) |
| `turn_end` | Session ID, transcript path (local path, never synced) |
| `turn_score` | 7 dimension scores + XP (numbers only, produced by the on-device scorer) |
| `session_end` | Session ID, reason |
| `permission` | Tool name, decision |
| `compact` | Phase (pre/post), trigger |

**All scoring runs on-device.** The scorer (`scorer/score_turn.py`) reads your local transcript and writes numeric scores to `events.jsonl` without sending anything anywhere.

### What leaves your machine (opt-in, token-gated)

Sync (`plugin/scripts/sync.py`) is **opt-in and requires a token** in `~/.ai-fluency/config.json`. Nothing syncs until you set `"token"`. With a token, the sync layer uploads only:

| Field synced | Value |
|---|---|
| `turn_score` events | 7 dimension scores, XP, session ID, timestamp |
| `session_start` events | Session ID, timestamp, session kind |
| `session_end` events | Session ID, timestamp, reason |

**What is NEVER synced, under any config:**
- Raw prompt text (`text` field), stripped by `STRIP_KEYS` in `sync.py` before the payload is built
- Transcript paths, also in `STRIP_KEYS`
- Headless sessions (`claude -p` runs and other non-interactive agents), excluded by default
- In-flow coaching tips (these can quote bits of your prompt), local-only unless you set `"sync_tips": true`

The strip is enforced client-side in `plugin/scripts/sync.py` (`STRIP_KEYS = {"transcript_path", "text"}`) and server-side on receipt.

### How to verify and disable

- **Audit the exact payload before anything leaves:** `python3 plugin/scripts/sync.py --dry-run`
- **Disable upload entirely:** add `"no_upload": true` to `~/.ai-fluency/config.json`, or just omit the `"token"` field
- **Read the full path in code:** `plugin/hooks/capture.py` (what is captured locally), `plugin/scripts/sync.py` (what is sent)

The whole pipeline is MIT-licensed, so you can read every line that touches your data. Live coaching is off by default. Until you turn it on, the coaching hook only records what it would have said.

## Install (one line)

```bash
bash -c "$(curl -fsSL https://clawdacademy.app/install.sh)"
```

Installs Claude Code (if missing) and the plugin, and sets up your profile. Then do one real task in
Claude Code. Your Fluency Rating shows in the statusline and at **clawdacademy.app/u/&lt;you&gt;**.

- **Prefer to claim a handle first?** Go to **[clawdacademy.app/start](https://clawdacademy.app/start)**
  (no email, no password) and it hands you the same one-liner with your token baked in.
- **Already inside Claude Code?** `/ai-fluency:clawdacademy setup` (plugin commands need the `ai-fluency:` prefix)
- **Uninstall:** `./install.sh --uninstall` (your local data stays in `~/.ai-fluency`).

## What it measures

Seven behaviors, scored from your real sessions:

`context_setting` · `plan_first` · `verification` (weight 1.6) · `diagnose_vs_retry` (1.4) ·
`understanding_seeking` · `scope_discipline` · `iteration_discipline`

A habit that doesn't apply to a turn is marked not applicable and never counts against you. A short,
well-aimed one-line prompt isn't scored as weak. Nothing scores speed, volume or acceptance rate, and
all scoring is local. The headline **Fluency Rating** is the weighted average quality of your recent
turns, so doing more turns can't raise it. Only working better can. It's a profile of your own
behavior. Nobody has audited it, and I haven't validated it against outside outcomes yet.

## Layout

| Dir | What |
|---|---|
| `plugin/` | Claude Code plugin: capture hooks (they fail open, so a crash never blocks your session), the in-flow coaching hook, and aggregate-only sync |
| `scorer/` | 7-dimension heuristic engine (stdlib-only, idempotent, fail-open) + tests |
| `coach-core/` | shared measurement engine (level/XP + Fluency Rating), UI-free, zero-dep |
| `trainer-core/` | shared teaching engine: 9-lesson curriculum + daily focus-dim + the 3 forcing-function rules |
| `coach/` | zero-dep TUI: live / `--replay` / `--summary` + statusline |
| `harness/` | mode-B "configure from inside Claude Code" (`setup.js`) |
| `desktop/` | Electron app (Mac; the standalone reflective surface) |
| `web/` | Next.js + Supabase: `/start`, `/api/ingest`, `/api/provision`, `/leaderboard`, `/u/[handle]` |

## Tests

```bash
python3 scorer/test_discrimination.py        # a good user must beat a bad user by a wide margin
python3 scorer/test_calibrated_oracle.py     # fit-to-task: calibrated one-liners aren't scored "weak"
node    trainer-core/test.js                 # curriculum + focus-dim + intervention rules
```

MIT licensed. How it works: `ARCHITECTURE.md`. Getting started: `docs/HOW-TO-USE.md`.
