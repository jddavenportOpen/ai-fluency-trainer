# Clawdacademy

**Measure — and train — how well you actually work with AI, from your real Claude Code sessions.**

Most people are getting passively worse with AI and can't feel it. In a controlled study (METR),
developers believed AI made them ~20% faster; measured, they were **19% slower** — and couldn't tell.
Clawdacademy scores 7 judgment behaviors from your real sessions, names your single weakest habit,
and coaches you in-flow to fix it. Free, local-first, open source (MIT).

Live at **[clawdacademy.app](https://clawdacademy.app)**.

## 🔒 Privacy — local-first, aggregate-only, audit-invited (read this first)

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
