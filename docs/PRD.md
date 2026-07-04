# AI Fluency Trainer — PRD

**Date:** 2026-07-03 · **Owner:** JD Davenport · **Status:** MVP in build
**Basis:** `research/RESEARCH.md` (6-angle deep research, 10 load-bearing claims adversarially verified)
**Explicitly out of scope per JD:** naming, marketing copy, go-to-market. Working name is a placeholder.

---

## 1. Problem & thesis

**The thesis that survives the evidence** (the "70% dumber / 30% better" framing did NOT survive — see §9):

> Roughly **half** of real-world AI use is passive delegation (~47% of student Claude conversations are minimal-engagement "Direct" use — Anthropic; ~40% of GenAI work tasks involve no critical thinking — Microsoft/CMU). Passive use **causally** erodes skill: an RCT of ~1,000 students found unrestricted ChatGPT made them **17% worse on unassisted exams**, while a guardrailed tutor version boosted practice **+127% with zero exam harm** (PNAS 2025). Same tool, different behavior, opposite outcome.
>
> The differentiating behaviors are **identified, observable, and trainable** — and users **cannot self-assess** which side they're on (METR RCT: devs believed +20% faster while measuring **19% slower**, a ~39-point perception gap).
>
> **No product measures or trains these behaviors from real usage.** We will.

Mark Keith (BYU Marriott, AI Foundry advisory board) is the academic anchor: his live product aimodes.ai scores pasted AI conversations against an 8-mode / 3-tier engagement framework (Passivity → Partnership → Agency). Our telemetry plugin is the always-on, real-work version of his instrument — and the at-scale validation vehicle his framework needs (his rubric is v0.1, self-admittedly unvalidated; his Stages A–D validation plan requires exactly the data we capture).

## 2. Products

One spine (capture → score → coach → display), two products:

### P1 — Free analytics plugin ("the instrument")
A Claude Code plugin. Hooks capture usage events locally; the scoring engine computes behavior-dimension scores **on-device**; only aggregate scores/metrics sync to the website. The site shows: your fluency profile (radar across dimensions), where you rank, your 3 weakest behaviors with concrete prescriptions, and trends.

**Headline mechanic (from research):** the METR perception gap. "You think AI makes you faster. Measured devs were 19% slower while believing +20%. What's your real number?" Self-assessment is invalid; only measurement answers it.

### P2 — Paid "Learn Claude Code" app ("the trainer")
A terminal-native coaching layer over Claude Code:
- **Live coach TUI** — real-time per-turn feedback next to your session: what you did well, one thing to do better, XP earned, level-ups.
- **Statusline** — persistent `⚡ Lv 3 Collaborator · 1,240 XP · ▓▓▓░░ to Lv 4` inside Claude Code.
- **(Post-MVP) Cognitive forcing functions** — hooks can *intervene*, not just observe (`systemMessage`, `additionalContext`, block-with-reason): "you accepted 6 edits without reading a diff — review this one." Direct experimental support: forcing functions reduce over-reliance where passive explanations don't (Buçinca CSCW 2021); guardrails flipped PNAS's −17% harm to zero. No competitor does this in-terminal.
- **Gamification** — XP per scored turn, levels (Novice → Apprentice → Operator → Collaborator → Director → Architect → Conductor → Virtuoso), skill badges, streaks.
- **Recruiter-facing public profile** — `/u/<handle>`: level, dimension radar, verified usage stats. Positioned as a **"verified behavior profile"**, NOT a validated score, until the validation study lands (see §7).

## 3. Users

| User | Product | Job to be done |
|---|---|---|
| Individual dev / student using Claude Code | P1 free | "Am I actually using AI well? Where am I fooling myself?" |
| Dev leveling up for the job market | P2 paid | "Train me to be measurably good at AI-assisted work, and give me proof" |
| Recruiter / hiring manager | P2 profile page | "Is this candidate's 'good with AI' claim real?" |
| (Later) Universities / Keith's MBA course | cohort tier | "Teach and grade AI fluency from real behavior, not quizzes" |
| (Later) Eng orgs | enterprise via OTel | "Raise team AI fluency; see it in the data" (consent-clean, org-controlled) |

## 4. Scoring model

Grounded in `RESEARCH.md §4` — 13 evidence-backed dimensions, each measurable from Claude Code telemetry. **MVP ships 7:**

| Dim (key) | Measures | Research # |
|---|---|---|
| `context_setting` | files/constraints/goals in prompts vs bare one-liners | #6 |
| `plan_first` | explore/plan before first mutating edit | #1 |
| `verification` | tests/builds/runs after AI edits; evidence before accept | #2 |
| `diagnose_vs_retry` | failure follow-ups add error text/hypothesis vs "try again" | #5 |
| `understanding_seeking` | why/explain/tradeoff engagement vs pure delegation | #7 |
| `scope_discipline` | one coherent task per ask vs kitchen-sink prompts | #10 |
| `iteration_discipline` | scrutinizes/refines output vs blind accept or abandonment | #4/#9 |

Post-MVP: `think_first` (#8), `critical_challenge` (#9), `batch_size` (#10 via diffs), `calibrated_delegation` (#11), `feedback_loop_instrumentation` (#12), `post_ai_curation` (#13 via git), and the **calibration meta-metric** (#M: periodic self-assessment vs measured — the METR-gap personalized).

**Design rules (binding, from evidence):**
1. **Fit-to-task, not elevation** — passive "Oracle" use is *correct* for some tasks/expertise levels (Keith's expertise-reversal weighting). Neutral scores when a dimension doesn't apply; never a universal "more agency = better" ladder.
2. **Never surface raw acceptance rate or velocity as skill** — they track perceived, not actual, productivity (CACM/Ziegler, METR).
3. Composite scores; weight verification/diagnosis over throughput-adjacent signals.
4. Heuristics first (deterministic, fast, local); LLM judge (local `claude -p` haiku) as an opt-in refinement layer — never blocking, budget-capped.

**Mechanics:** per completed turn → dim scores 0–100 → XP = 10–50 weighted → tip (weakest dim, concrete + behavioral) + highlight (strongest). Level = largest N with XP ≥ 100·N². Dimension keys are data-driven end-to-end (scorer can add dims without touching TUI/web).

## 5. Privacy (existential, not a feature)

- **All scoring local.** Raw prompts/commands/diffs never leave the machine.
- Sync uploads **aggregate scores and derived features only**; content capture strictly opt-in. Mirrors Anthropic's own redact-by-default OTel posture; matches what made sniffly's local-only positioning land.
- Public data policy before any marketplace submission (plugins get automated safety review).
- Enterprise tier later uses OTel (org-controlled, consent-clean) — a separate consent surface, not the free plugin's path.

## 6. Anti-gaming (top design risk for a recruiter-facing number)

Every surfaced metric will be optimized (Goodhart). Mitigations, phased:
- MVP: composite scoring; verification pattern-matching requires *real* test/build commands; tips reference observed behavior (harder to farm blind).
- Post-MVP: weight outcome-linked signals (test runs that meaningfully pass/fail, diagnostic content quality via judge); unpublished/rotating exact weights; longitudinal consistency across projects as the credential's basis; anomaly flags (e.g. `echo ok` "tests", ritual "why?" farming — both identified by our own adversarial verification).
- Credential language: **"verified behavior profile"** → upgrade to "validated fluency score" only after §7.

## 7. The Keith relationship & validation study (product feature, not paperwork)

- **Map our dims onto (or license) Keith's 8-mode taxonomy** rather than inventing a rival vocabulary; `understanding_seeking`/`critical_challenge` already align with his Oracle→Agency tiers.
- **The validation study:** telemetry features → Keith's instruments → real outcomes (course grades, artifact quality). Publishable novel research (no published study ties CLI-agent telemetry to skill growth); it's also the credential's credibility engine. IRB applies if plugin data feeds his research.
- **Do NOT claim "peer-reviewed backing" today** — Keith's framework is self-admittedly v0.1/unvalidated; his aimodes publications page is empty.
- Formalize before public launch: advisory agreement (terms TBD as of 2026-07-02), taxonomy license/co-development, data-sharing/IRB plan, and resolution of the plugin-channel overlap (he already ships Claude Code plugin bundles — skills, not telemetry; complementary but same channel/audience).
- **Open item:** recover the 2026-07-02 meeting record (Plaud never synced; PlaudSync newest is 06-29). The "70/30" attribution and possibly other product ideas rest on JD's memory until then.

## 8. MVP scope (build target: "JD can test it, fully working")

| # | Piece | Definition of done |
|---|---|---|
| 1 | Capture plugin | Hooks → `~/.ai-fluency/events.jsonl`; fail-open; <100ms | 
| 2 | Scorer | 7 dims, heuristic, idempotent incremental scoring on Stop; discrimination test passes (good-user fixture ≫ bad-user) |
| 3 | Coach TUI | live feed + `--replay` + `--summary`; level-ups; statusline |
| 4 | Web | `/api/ingest` (token auth) · `/dashboard` (radar, weakest-3 + prescriptions, trends, coaching feed) · `/u/[handle]` recruiter page |
| 5 | Sync | local scores → web ingest, aggregate-only |
| 6 | Install + E2E | one-command install; real Claude Code session flows through the entire stack |

Cut from MVP deliberately: LLM judge, forcing functions, marketplace submission, auth/multi-user, hosting, OTel/enterprise, badges beyond level titles, calibration meta-metric.

## 9. Claims discipline (do not launder — from adversarial verification)

| Claim | Status |
|---|---|
| "70% get dumber / 30% better" | **Not found anywhere; unverifiable.** Do not use publicly until Keith supplies a source. Honest number: ~40–50% passive use. |
| "AI makes people dumber" | Overstated; harm is behavior-conditional and the strongest evidence (PNAS) shows it's fully preventable |
| Kosmyna MIT EEG study | Preprint, n=54; cite cautiously |
| Gerlich 2025 | Correlational + published correction |
| Wang & Fan meta-analysis | **RETRACTED** — cite the 2026 35-study meta-analysis (g=0.670) instead |
| Keith's framework "validated" | No — EFA on N=331 self-report only; his own page rejects the tier-hierarchy reading |

## 10. Success metrics (MVP phase)
- E2E works on JD's machine: real session → scored turns → live coaching → dashboard + share page with real data.
- Discrimination test: scorer separates good/bad fixture users by ≥20 points overall.
- Scoring adds zero perceptible latency to Claude Code (hook <100ms, scorer detached).
- JD uses it for a week and at least one tip changes his behavior (qualitative).

## 11. Biggest strategic risks
1. **Anthropic extends downward** (they have team analytics + Academy + leaderboard + the expertise research). Moats: speed, the individual/recruiter surface they won't build, multi-CLI expansion later.
2. **GitHub reframes Copilot adoption cohorts as skill.**
3. Platform dependency on hooks/transcript format (documented, third-party-parsed, but Anthropic-controlled).
4. Credential validity challenge (mitigated by §6/§7 language discipline + validation study).
