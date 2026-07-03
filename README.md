# AI Fluency Trainer (working name)

Measures — and trains — how well you actually use AI, from your real Claude Code usage.

Two products, one spine:
- **Free plugin**: hooks capture usage locally → 7 research-backed behavior dimensions scored on-device → aggregate scores sync to a dashboard ("where you're fooling yourself, and how to improve").
- **Paid "Learn Claude Code" wrapper**: real-time in-terminal coaching + XP/levels/statusline, with a recruiter-shareable profile page.

Why it should exist (see `~/clawd/projects/ai-fluency-trainer/research/RESEARCH.md`): ~40–50% of real AI use is passive delegation; passive use causally erodes skill (PNAS RCT: −17% on unassisted exams; guardrailed use: +127% practice, zero harm); and people **cannot self-assess** — METR's RCT found devs 19% slower while believing +20% faster. Scoring rubric grounded in that evidence; taxonomy aligns with Mark Keith's (BYU) aimodes.ai engagement modes.

## Launched (2026-07-03)

- **Hosted dashboard (prod):** https://ai-fluency-web-two.vercel.app — `/u/jd` public recruiter page; `/dashboard` key-gated (key in `~/.ai-fluency` notes / Vercel env `DASHBOARD_KEY`); ingest token rotated to prod value (in `~/.ai-fluency/config.json`). Supabase backend (`aif_*` tables, RLS on), SQLite still used automatically for local dev.
- **Desktop app:** `desktop/dist/mac-arm64/Fluency Coach.app` — live coaching sidebar (Electron). Rebuild: `cd desktop && npm install && npm run dist`. Demo: `npm run replay`.

## 10-minute demo

```bash
# 1. Install the plugin (marketplace add + install + default config)
./install.sh

# 2. Use Claude Code normally (new sessions capture to ~/.ai-fluency/events.jsonl)
cd ~/some-project && claude
#    …or fake a great session instantly:
node coach/fluency.js --replay coach/demo.events.jsonl

# 3. Live coaching sidebar (run in a second pane while you work)
node coach/fluency.js

# 4. Your stats in the terminal
node coach/fluency.js --summary
echo '{}' | coach/statusline.sh          # or wire it: ./install.sh --statusline

# 5. Dashboard + recruiter share page
cd web && npm install && npm run seed && npm run dev    # http://localhost:3000
python3 plugin/scripts/sync.py                          # push your real scores
open http://localhost:3000/dashboard                    # radar, weakest dims, coaching feed
open http://localhost:3000/u/jd                         # the recruiter view
```

Uninstall: `./install.sh --uninstall` (data stays in `~/.ai-fluency`).

## Layout

| Dir | What | Status |
|---|---|---|
| `plugin/` | Claude Code plugin: capture hooks (5 events, fail-open) + aggregate-only sync | E2E-verified live |
| `scorer/` | 7-dimension heuristic engine (stdlib-only, idempotent, fail-open) + discrimination test | adversarially verified |
| `coach/` | zero-dep TUI: live / `--replay` / `--summary` + `statusline.sh` | adversarially verified |
| `web/` | Next.js + SQLite: `/api/ingest`, `/dashboard`, `/u/[handle]` | adversarially verified |
| `fixtures/` | synthetic transcripts in real Claude Code JSONL shape (good-user vs bad-user) | — |

## Scoring dimensions (research §4; keys are data-driven end-to-end)

`context_setting` · `plan_first` · `verification` (weight 1.6) · `diagnose_vs_retry` (1.4) · `understanding_seeking` · `scope_discipline` · `iteration_discipline`

Design rules honored: fit-to-task (non-applicable dims score neutral, never penalized); nothing scores speed, volume, or acceptance rate; all scoring local — raw prompts never leave the machine.

## Tests

```bash
python3 scorer/test_discrimination.py     # good-user must beat bad-user (currently 75.6 vs 36.8)
python3 fixtures/make_fixtures.py         # regenerate fixtures
```

Docs: `ARCHITECTURE.md` (contracts) · PRD + workplan + research: `~/clawd/projects/ai-fluency-trainer/`
