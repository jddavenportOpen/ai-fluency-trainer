# Clawdacademy

**Measure — and train — how well you actually work with AI, from your real Claude Code sessions.**

Most people are getting passively worse with AI and can't feel it. In a controlled study (METR),
developers believed AI made them ~20% faster; measured, they were **19% slower** — and couldn't tell.
Clawdacademy scores 7 judgment behaviors from your real sessions, names your single weakest habit,
and coaches you in-flow to fix it. Free, local-first, open source (MIT).

Live at **[clawdacademy.app](https://clawdacademy.app)**.

## Data disclosure — what the plugin captures and what leaves your machine

This plugin fires Claude Code hooks to observe your sessions. Here is the complete, accurate picture.

### What the plugin captures (stays local by default)

The capture hook (`plugin/hooks/capture.py`) appends structured events to `~/.ai-fluency/events.jsonl`:

| Event | What is recorded locally |
|---|---|
| `session_start` | Session ID, SHA-256 of the working directory path (10 hex chars, not the path itself), session kind |
| `prompt` | Raw prompt text (word/char count + full text — **local only, never synced**) |
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
- Raw prompt text (`text` field) — stripped by `STRIP_KEYS` in `sync.py` before the payload is built
- Transcript paths — also in `STRIP_KEYS`
- Headless / non-interactive sessions (fleet agents, `claude -p` runs) — excluded by default
- In-flow coaching tips (these can interpolate prompt fragments) — local-only unless you set `"sync_tips": true`

The strip is enforced client-side in `plugin/scripts/sync.py` (`STRIP_KEYS = {"transcript_path", "text"}`) and server-side on receipt.

### How to verify and disable

- **Audit the exact payload before anything leaves:** `python3 plugin/scripts/sync.py --dry-run`
- **Disable upload entirely:** add `"no_upload": true` to `~/.ai-fluency/config.json`, or just omit the `"token"` field
- **Read the full path in code:** `plugin/hooks/capture.py` (what is captured locally), `plugin/scripts/sync.py` (what is sent)

The whole pipeline is MIT-licensed and open. Nothing about what leaves your machine is hidden.

### Legacy section (kept for reference)

Your raw prompts and code **never leave your machine**. This is a telemetry plugin from a solo
publisher, so don't take that on faith — **audit it**, the whole path is open (MIT):

- **See exactly what would sync, before anything leaves:** `python3 plugin/scripts/sync.py --dry-run`
  prints the precise payload.
- **Only derived/aggregate events sync** (`turn_score`, `session_start`/`session_end`) — **never raw
  `prompt` text.** Your prompt text stays local by design (`plugin/scripts/sync.py`, `STRIP_KEYS`).
- **`text` and `transcript_path` are stripped twice** — client-side before sending
  (`plugin/scripts/sync.py`) *and* server-side on receipt (`web/lib/db.ts`, `SERVER_STRIP_KEYS`).
- **Everything is scored on-device** and written in plain JSONL you can read:
  `~/.ai-fluency/events.jsonl`.
- **Tips can quote your prompt, so they're local-only** unless you explicitly opt in
  (`sync_tips: true` in `~/.ai-fluency/config.json`).
- **In-flow interventions are OBSERVE-ONLY by default** — they log and inject nothing unless you opt
  into live coaching; even then they're rate-limited, dismissible, and fail-open.

Read the capture hooks (`plugin/hooks/`), the sync (`plugin/scripts/sync.py`), and the server ingest
(`web/lib/db.ts`) — nothing about what leaves your machine is hidden.

## Install (one line)

```bash
bash -c "$(curl -fsSL https://clawdacademy.app/install.sh)"
```

Installs Claude Code (if missing) + the plugin and wires your profile. Then do one real task in
Claude Code — your Fluency Rating shows in the statusline and at **clawdacademy.app/u/&lt;you&gt;**.

- **Prefer to claim a handle first?** Go to **[clawdacademy.app/start](https://clawdacademy.app/start)**
  (no email, no password) and it hands you the same one-liner with your token baked in.
- **Already inside Claude Code?** `/clawdacademy setup`
- **Uninstall:** `./install.sh --uninstall` (your local data stays in `~/.ai-fluency`).

## What it measures

Seven behaviors, scored from your real sessions (research-grounded; keys are data-driven end-to-end):

`context_setting` · `plan_first` · `verification` (weight 1.6) · `diagnose_vs_retry` (1.4) ·
`understanding_seeking` · `scope_discipline` · `iteration_discipline`

Design rules: **fit-to-task** (a dimension that doesn't apply to a turn is marked not-applicable, never
penalized — a calibrated one-liner is not "weak"); **nothing scores speed, volume, or acceptance rate**;
all scoring is local. The headline **Fluency Rating** is the mean weighted *quality* of your recent
turns — volume-independent, so grinding more turns can't inflate it, only working better can. It is a
**self-instrumented behavior profile, not an audited credential** (a validation study is in progress).

## Layout

| Dir | What |
|---|---|
| `plugin/` | Claude Code plugin: capture hooks (fail-open) + the in-flow intervention hook + aggregate-only sync |
| `scorer/` | 7-dimension heuristic engine (stdlib-only, idempotent, fail-open) + tests |
| `coach-core/` | shared measurement engine (level/XP + Fluency Rating), UI-free, zero-dep |
| `trainer-core/` | shared teaching engine: 9-lesson curriculum + daily focus-dim + the 3 forcing-function rules |
| `coach/` | zero-dep TUI: live / `--replay` / `--summary` + statusline |
| `harness/` | mode-B "configure from inside Claude Code" (`setup.js`) |
| `desktop/` | Electron app (Mac; the standalone reflective surface) |
| `web/` | Next.js + Supabase: `/start`, `/api/ingest`, `/api/provision`, `/leaderboard`, `/u/[handle]` |

## Tests

```bash
python3 scorer/test_discrimination.py        # good-user must beat bad-user by a wide margin
python3 scorer/test_calibrated_oracle.py     # fit-to-task: calibrated one-liners aren't scored "weak"
node    trainer-core/test.js                 # curriculum + focus-dim + intervention rules
```

MIT licensed. Docs: `ARCHITECTURE.md` (contracts).
