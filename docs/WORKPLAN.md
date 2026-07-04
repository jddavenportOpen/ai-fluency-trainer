# AI Fluency Trainer — WORKPLAN

**Updated:** 2026-07-03 · Code: `~/code/ai-fluency-trainer` (git) · State: `~/clawd/projects/ai-fluency-trainer/`
Rule: update this file as work ships (continuous-shipping).

## Phase 0 — Research & design ✅ DONE 2026-07-03
- [x] Deep research (6 angles, adversarial verification) → `research/RESEARCH.md`
- [x] ARCHITECTURE.md — event schema, component contracts, level math
- [x] PRD.md
- [x] Fixtures from real transcript format (good-user vs bad-user discrimination pair)

## Phase 1 — MVP build ✅ DONE 2026-07-03 (all adversarially verified by independent agents)
- [x] `plugin/` capture hooks (5 events → events.jsonl, fail-open, smoke-tested)
- [x] `coach/` TUI: live / --replay / --summary + statusline.sh (level math brute-forced 0..300k, 0 mismatches; truncated-line bug found by verifier → fixed)
- [x] `web/` Next.js + SQLite: /api/ingest (Bearer auth, fail-open per event), /dashboard (SVG radar, weakest-3 + tips, XP trends, coaching feed), /u/[handle] recruiter page (verifier recomputed all numbers from raw SQLite — exact match)
- [x] `scorer/` 7-dim heuristic engine + discrimination test (workflow build + adversarial verify; 4 verifier findings fixed: mid-session stall, verify-regex gaming, NA sentinel, Q&A punishment)

## Phase 2 — Integration & E2E ✅ DONE 2026-07-03
- [x] `plugin/scripts/sync.py` — aggregate-only push (raw prompt text + transcript paths stripped, state-tracked, --dry-run)
- [x] `install.sh` — marketplace add + plugin install + config; --statusline opt-in (never clobbers existing), --uninstall
- [x] Live E2E VERIFIED: real `claude -p` session → hooks captured → scorer graded turn (verification 95 for real test run, plan_first 15 for cold-start — both correct) → coach/statusline rendered → synced → in dashboard DB + /u/jd
- [x] README with 10-min demo path
- [x] Pushed to private GitHub JDDavenport/ai-fluency-trainer

## Phase 2.5 — LAUNCH DAY ✅ DONE 2026-07-03 (JD directive: two products live today)
- [x] Desktop app "Fluency Coach" (Electron, packaged .app, screenshot-verified UI, adversarially verified; truncation re-seed bug fixed)
- [x] Hosted dashboard LIVE: https://ai-fluency-web-two.vercel.app (Vercel + Supabase aif_ tables w/ RLS in shared spine project — verifier audited spine untouched; /dashboard key-gated, /u/jd public, prod token rotated; ingest silent-drop fixed → received/stored/skipped)
- [x] JD's machine wired to prod (config → live URL + token), real scores synced (132 events), verifier test rows purged
- ⚠️ FINDING: user-scope plugin captures ALL sessions incl. fleet/workflow agents → score inflation (Level 4 from agent turns). Interactive-session filtering is now a Phase 3 MUST.

## Phase 3 — Hardening ✅ CORE DONE 2026-07-03 (both adversarially verified)
- [x] Interactive-vs-agent session filtering — discriminator = transcript `entrypoint` field (cli vs sdk-*; 28k-transcript sweep confirmed); capture tags kind, scorer/sync gate on it, unknown never inflates; prod wiped of agent data + reseeded (Level 4 → honest). Verifier: PASS, 7/7 checks
- [x] LLM judge layer — scorer/judge.py, haiku via --safe-mode (anti-recursion PROVEN), 50/50 blend on 3 intent dims, 200/day budget, fail-open; bit-identical when off; DEFEATS the gaming fixture (padded ctx 92→60, ritual-why 90→56). ~$0.005-0.015/call, worst case ~$3/day. Verifier: CONFIRMED, 6/6
- [x] PostToolUseFailure/PermissionRequest/PreCompact/PostCompact capture (verified present in CLI 2.1.179)
- [ ] Semantic refinement: TUI-launched daemon panes (cockpit/bridge) count as interactive — long orchestrator sessions can earn XP without JD typing; needs a stricter human-signal later
- [ ] Sync offset edge: non-empty upload while a sid is still unknown permanently skips its earlier events (under-count only, never inflates) — acceptable, revisit
- [ ] Anti-gaming pass 2: outcome-linked verification (parse test results), anomaly flags, weight rotation
- [ ] Dims 8–13 + calibration meta-metric (personal METR gap)
- [x] Multi-user web auth DONE + deployed 2026-07-03 — signup/login/logout, scrypt+opaque server-side sessions, per-user device tokens + data isolation, /dashboard session-gated, /u/[handle] any user. Security review SECURE, functional PASS. Ingest batch capped at 1000. jd temp pw AIF-hDOD-I2E2CM3 (rotate — no change-pw flow yet)
- [ ] Cognitive forcing functions (paid tier): intervention hooks with systemMessage/additionalContext

## Phase 3.5 — Fable 5 review round 1 (2026-07-03)
- [x] Product-alignment lens PASSED overall ("remarkably faithful to the research"); 2 HIGH + 4 MEDIUM findings
- [x] FIXED HIGH-1 privacy: tips (which embed prompt fragments/bash text) local-only by default, sync_tips opt-in; server strips text/transcript_path + caps tip 300ch/data 4KB — verified live
- [x] FIXED HIGH-2 credential forgery: server ignores client XP, clamps dims, recomputes XP from server-side weight table (= sealed-weights seam); /u/ copy now honest ("self-instrumented profile", no "verified/not self-reported") — forged xp:9999 stored as 12, verified live
- [x] FIXED cwd_hash (salted hash()→sha256) + plan_first now detects real plan-mode (permissionMode) + dashboard generic per-dim advice fallback + installed plugin cache re-synced
- [x] FIXED MEDIUM: NA dims now OMITTED from emitted scores (not faked as 60) — radar/averages/XP no longer diluted; discrimination sharpened 38.5→52.9; all consumers data-driven so absence is honest; tests + table printer made dim-count-agnostic
- [ ] MEDIUM open (design calls, not bugs): Level≈turn-volume tension (consider per-session diminishing returns); server ingest event-type allowlist (LOW — server already strips text/transcript_path + caps size)
- [x] Full 5-lens review COMPLETE (wf_8842daf9-966). E2E verdict: whole chain works, no breakage. Verifier REFUTED all 4 round-1 fixes (confirming they hold at HEAD). 10 new confirmed findings — 7 FIXED this round:
  - [x] HIGH: agent bootstrap prompts ("You are the X agent…") no longer scored as human turn 1 (fleet-session profile inflation)
  - [x] HIGH: seed used non-canonical dims (delegation_quality/plan_before_build) — /u/jd demo now uses the real 7; prod reseeded
  - [x] MED: is_verify_command "make sure" false-positive; context_setting "?" floor; plan_first ExitPlanMode; ingest ts/sid validation; Supabase 1000-row pagination; coach truncation re-seed
- [x] FIXED (design call approved): recruiter headline is now a volume-INDEPENDENT Fluency Rating (0-100 + band) = mean weighted-quality of recent turns; Level/XP demoted to 'activity'. Grinder-beats-ace inversion gone (was Lv8 vs Lv2 → now Emerging-31 vs Expert-85). DIM_WEIGHTS consolidated into stats.ts (single source). Deployed.
- [x] FIXED: plugin now self-contained — plugin/bundle.sh stages scorer into plugin/scorer (gitignored/generated), install.sh runs it, _find_scorer probes bundled path first. Marketplace-only users score. Cache ships scorer/.
- [ ] LOW backlog: judge dedup outside SessionLock (concurrent double-Stop double-spends budget); degenerate 1-dim radar; upsertUser race; UTF-8 split across poll boundary → U+FFFD in live feed; statusline awk parsing fragility; net-negative XP display divergence

## Phase 4 — Keith & validation
- [ ] Recover 2026-07-02 meeting record (Plaud sync); confirm "70/30" source with Keith directly
- [ ] Advisory agreement: taxonomy license/co-dev, data-sharing/IRB, plugin-channel overlap resolution
- [ ] Map dims ↔ his 8 modes formally; pilot in his new first-year MBA AI course (JD approved to TA)
- [ ] Validation study design: telemetry → his instruments → outcomes (publishable; upgrades credential language)

## Phase 5 — Productization (not started; naming/marketing/GTM deferred per JD)
- [ ] Marketplace submission (needs public data policy)
- [ ] Payments/licensing for coach tier
- [ ] Recruiter-side features (verification links, org search)
- [ ] Multi-CLI capture (Copilot CLI, Codex, Gemini CLI) — ccusage precedent
