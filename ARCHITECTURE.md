# AI Fluency Trainer — How It Works

*Accurate as of 2026-07-04 (post-launch, post-Fable-review). Working name; naming/GTM deferred.*

Measures — and trains — how well you actually use AI, from your real Claude Code usage. The
thesis and evidence live in `docs/RESEARCH.md`; the business model in `docs/PRODUCTIZATION.md`.

## The whole system in one picture

```
Claude Code session (yours)
   │  hooks fire on: SessionStart · UserPromptSubmit · PostToolUse · Stop · SessionEnd
   │                 PostToolUseFailure · PermissionRequest · PreCompact · PostCompact
   ▼
plugin/hooks/capture.py  ──►  ~/.ai-fluency/events.jsonl   (append-only local log; fail-open, <100ms)
   │                              │
   │  on Stop, for INTERACTIVE    │
   │  human sessions only,        ▼
   │  spawns (detached) ───►  scorer/  score_turn.py → engine.py + rubric.py (+ optional judge.py)
   │                              │   7 behavior dims (0–100), XP, tip, highlight → turn_score event
   │                              ▼
   │                       ~/.ai-fluency/events.jsonl  (turn_score appended)
   │                              │
   ├── coach/fluency.js ──────────┤  live TUI: per-turn cards, XP, level-ups   (paid layer)
   ├── coach/statusline.sh ───────┤  ⚡ Lv 3 Collaborator · 1,240 XP · ▓▓▓░░    (Claude Code status bar)
   ├── desktop/ (Electron) ───────┤  same feed as a macOS sidebar app          (paid layer)
   │                              │
   └── plugin/scripts/sync.py ────┘  AGGREGATE-ONLY upload (opt-in tips) ─► web/api/ingest
                                                                              │
                                                        Supabase (prod) / SQLite (local dev)
                                                                              │
                                          ┌───────────────────────────────────┤
                                          ▼                                   ▼
                                    /dashboard (your data,             /u/[handle] (public
                                     session-auth gated)                recruiter profile)
```

Two products, one spine (capture → score → surface):
- **Free plugin** (`plugin/` + `scorer/`) — captures usage, scores it **on-device**, syncs only
  aggregate scores. This is what would be open-sourced.
- **Paid "Learn Claude Code" wrapper** (`coach/` + `desktop/`) — real-time coaching, XP/levels,
  and the recruiter-facing profile page. The web app (`web/`) hosts the dashboard + profiles.

---

## 1. Capture — `plugin/`

A Claude Code plugin (`.claude-plugin/plugin.json`, `hooks/hooks.json`). One script,
`hooks/capture.py`, handles every hook event and appends one normalized JSON line to
`~/.ai-fluency/events.jsonl` (override dir with `AI_FLUENCY_DIR`). It is **fail-open**: any error
exits 0 silently so telemetry can never slow or break a session.

Hooks captured: `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`, plus
`PostToolUseFailure`, `PermissionRequest`, `PreCompact`, `PostCompact`.

**Interactive-vs-agent filtering (important on a machine that runs agents).** Only *human*
interactive sessions should be scored — not `claude -p`, SDK runs, fleet agents, or workflow
subagents. `capture.py` classifies each session by the transcript's `entrypoint` field
(`cli` = interactive human; `sdk-cli`/`sdk-py`/… = headless; missing = unknown → treated as
non-interactive so it can never inflate). The kind is cached per session under
`$AI_FLUENCY_DIR/state/`. On `Stop`, the scorer is spawned **only for interactive sessions**
(override: `score_all_sessions` in config).

**Raw prompt text never leaves the machine.** The `prompt` event stores the text locally for the
coach, but `sync.py` never uploads it (see §4).

## 2. Scoring — `scorer/`

Runs detached after each turn (`score_turn.py --session SID --transcript PATH`), or in batch
(`--batch PATH [--dry-run] [--judge]`) for tests/backfill. Pure Python stdlib, fail-open (errors
→ `$AI_FLUENCY_DIR/scorer.log`, exit 0). Incremental mode is idempotent (a per-session state file
+ lock dedupes already-scored turns).

**Turn model.** `engine.py` parses the transcript JSONL into turns (a user prompt + everything
until the next). It skips: `isMeta`/sidechain records; interrupted/incomplete turns (so one Esc
never stalls later scoring); and **agent bootstrap first-turns** (a machine-injected
"You are the X agent…" prompt is not human input and would otherwise inflate the profile).

**The 7 dimensions** (grounded in `docs/RESEARCH.md §4`; weights reflect the evidence that
verification/diagnosis matter most):

| dim key | measures | weight |
|---|---|---|
| `verification` | tests/builds/runs after AI edits; evidence before accept | 1.6 |
| `diagnose_vs_retry` | failure follow-ups add error text/hypothesis vs "try again" | 1.4 |
| `context_setting` | files/constraints/goals in prompts vs bare one-liners | 1.0 |
| `plan_first` | explore/plan (or plan mode) before the first mutating edit | 1.0 |
| `iteration_discipline` | scrutinizes/refines output vs blind accept or abandon | 1.0 |
| `understanding_seeking` | genuine why/explain/tradeoff engagement vs ritual | 0.8 |
| `scope_discipline` | one coherent task per ask vs kitchen-sink prompts | 0.8 |

**Design rules honored (from the research):** (1) **fit-to-task, not elevation** — a dimension
that doesn't apply to a turn is *omitted* from that turn's scores (not faked as a neutral value),
so radar/averages/XP aren't diluted; (2) nothing scores speed, volume, or acceptance rate; (3)
composite over single-metric.

**Optional LLM judge** (`judge.py`, OFF by default; `config.judge:true` or `AI_FLUENCY_JUDGE=1`).
Grades the three judgment-heavy dims (understanding_seeking, diagnose_vs_retry, context_setting)
via a local `claude -p` call, blended 50/50 with the heuristic. Runs with `--safe-mode` (no
plugins/hooks/CLAUDE.md/MCP) so it can't recurse into the capture hook; hard timeout; daily
budget cap; fail-open (judge failure → heuristics stand). Defeats the padding/ritual-"why" gaming
the heuristics are vulnerable to. Model is Haiku by default (`config.judge_model` to override).

**Output per turn** → a `turn_score` event: `{turn, dims:{…}, xp, tip, highlight}`. XP = 10–50
from the weighted composite. `tip`/`highlight` interpolate observed specifics (file names, the
verify command) and are therefore **local-only unless the user opts in** to syncing them.

## 3. Coach surfaces — `coach/` and `desktop/`

Zero-dependency. All read the same `events.jsonl`.
- `coach/fluency.js` — live TUI (default), `--replay <file>` (demo), `--summary`. Coaching cards
  on each `turn_score`: per-dim bars, +XP, ✓ highlight, → tip; level-up banners.
- `coach/statusline.sh` — one-line status for the Claude Code status bar (`⚡ Lv 3 …`), fast awk
  path, wired via `install.sh --statusline`.
- `desktop/` — Electron macOS app ("Fluency Coach"), same feed as a sidebar window + a Stats tab.
  Renders with `textContent` + a CSP (no XSS from attacker-writable tips). `npm run dist` →
  `desktop/dist/mac-arm64/Fluency Coach.app`.

**Levels (the game/retention layer):** total XP → level = largest N with XP ≥ 100·N²; titles
Novice → Apprentice → Operator → Collaborator → Director → Architect → Conductor → Virtuoso.

## 4. Sync — `plugin/scripts/sync.py`

Aggregate-only by design. Uploads only derived events (`turn_score`, session boundaries) and
**only from interactive sessions** (`sync_all_sessions` to override). Strips `text` and
`transcript_path` always. **Tips/highlights are stripped by default** (they embed prompt/command
fragments) and only sync with explicit `config.sync_tips:true`. State-tracked + idempotent
(`--dry-run`, `--full`). Config at `~/.ai-fluency/config.json`: `{url, token, handle, scorer,
sync_tips?, judge?, …}`.

## 5. Web — `web/` (Next.js 15 App Router)

Backend switch in `lib/db.ts`: **Supabase Postgres** when `SUPABASE_URL` is set (prod; tables
`aif_*`, RLS on, service-role key server-side only, reads paginated past the 1000-row cap),
**SQLite** otherwise (local dev, unchanged). `lib/stats.ts` is the single source for level math,
`DIM_WEIGHTS`, and the fluency rating.

- **`POST /api/ingest`** — Bearer device-token auth resolves the token → its owning user; writes
  only under that user_id. **The server never trusts client XP:** dims are clamped 0–100 and XP is
  **recomputed server-side** from `DIM_WEIGHTS` (this is also the sealed-weights seam — the client
  may be open-sourced, the server weights are not). `ts` must parse; `sid`/event length-capped;
  batch capped at 1000. Returns `{received, stored, skipped}`.
- **`/dashboard`** — session-auth gated (redirects to `/login`); your data only. Radar, XP trend,
  and a "where to improve" panel (weakest 3 dims → their recent tips, or generic per-dim advice
  when tips weren't synced).
- **`/u/[handle]`** — public recruiter profile. Headline is a **Fluency Rating** (0–100 + band
  Emerging→Expert): the *volume-independent* mean weighted-quality of recent turns, provisional
  until 15 turns. Level/XP are demoted to an "activity" stat (they grow with volume, so they're
  not the credential). No tips/prompt text is ever rendered here.
- **Auth** (`lib/auth.ts`, `lib/session.ts`): signup/login/logout, scrypt hashing (per-user salt,
  constant-time compare, decoy hash to defeat user-enumeration timing), opaque session tokens
  (only the SHA-256 hash stored), httpOnly+Secure cookies, server-side expiry.

Prod: `https://ai-fluency-web-two.vercel.app` (Vercel project `ai-fluency-web`).

## 6. Install & bundling

`install.sh` (`--statusline`, `--uninstall`): runs `plugin/bundle.sh` (stages the scorer's
runtime modules into `plugin/scorer/`, gitignored/generated, so a **marketplace-only user with no
repo checkout still scores**), registers the marketplace + installs the plugin, writes a default
`config.json`. `_find_scorer()` probes: env var → config → plugin-bundled path → repo-relative →
`~/code` checkout.

## Event schema (v1) — `~/.ai-fluency/events.jsonl`

One JSON object per line: `{"v":1,"ts":"…Z","sid":"…","event":"…","data":{…}}`.
Event types: `session_start` `{source,cwd_hash,transcript_path,kind}`, `session_kind` `{kind}`,
`prompt` `{text,chars,words}` (text local-only), `tool_use` `{tool,ok,input_keys}`,
`tool_failure` `{tool,error_type}`, `permission` `{tool,decision}`, `compact` `{phase,trigger}`,
`turn_end` `{transcript_path}`, `turn_score`
`{turn,dims:{snake_case:0-100},xp:10-50,tip,highlight,judged?}`, `session_end` `{reason}`.
Dimension keys are **data-driven** end-to-end — every consumer renders whatever keys appear.

## Tests

- `scorer/test_discrimination.py` — the acceptance bar: a good-user fixture must beat a bad-user
  fixture by ≥20 weighted points (currently 52.9) and on ≥6/7 dims. Also idempotency + robustness.
- `scorer/test_judge.py` — judge off = bit-identical; blend math; anti-recursion; budget cap;
  a live smoke call; the gaming fixture gets knocked down.
- `fixtures/make_fixtures.py` — synthetic transcripts in the real Claude Code JSONL shape.

## Where the docs live

`docs/` in this repo mirrors the design docs (also kept in `~/clawd/projects/ai-fluency-trainer/`
as the working copies): `RESEARCH.md` (the evidence), `PRD.md`, `PRODUCTIZATION.md` (business
model), `WORKPLAN.md` (status + backlog), `KEITH_PILOT_PROPOSAL.md`.
