# Fall 2026 Pilot + Validation Study — Proposal for Mark Keith

**From:** JD Davenport · **To:** Prof. Mark Keith (BYU Marriott, IS) · **Date:** 2026-07-03
**Re:** Instrumenting your new first-year MBA AI course with behavior telemetry — and turning it into the validation study your AI Engagement Modes framework needs.

---

## The one-paragraph version

I've built a working tool that captures how students *actually* use AI while they work (not self-report), scores it against measurable behavior dimensions, and gives real-time coaching. It maps directly onto your AI Engagement Modes framework. I want to run it — free — in your Fall 2026 MBA AI course, instrument the cohort, and produce the empirical dataset that moves your rubric from v0.1 (exploratory factor analysis on N=331 self-report) to a validated instrument with a publishable paper. You get the validation study and co-authorship; students get real-time mode coaching; the AI Foundry gets a credentialing product with your research as its backbone. This is the same play zyBooks and Packback ran — professor tests in their own course first, the efficacy study becomes the asset.

---

## Why this is a fit for *your* work specifically

Your research thesis — since your most-cited paper — has been **measuring actual behavior instead of self-report**. Your AI Engagement Modes rubric is theoretically serious (Bloom, Sweller cognitive load, Kalyuga expertise-reversal weighting, dual-process theory) but by your own documentation it's unvalidated: rubrics v0.1 have "no empirical weighting from student data," the κ≥0.80 classifier calibration set "does not yet exist," and Stages A–D are planned, not done. aimodes.ai scores a *pasted conversation* — a snapshot the student chooses to submit.

**What I built is the always-on instrument for the same framework.** It sits inside the student's actual coding/AI environment (Claude Code today; the capture layer is retargetable to other tools) and records real behavior continuously — no self-report, no selection bias in what gets submitted. That's the missing measurement layer between your theory and your Stage A validation target (r > 0.40 between rubric scores and artifact grades).

Concretely, my scoring already honors your core design principles:
- **Fit-to-task, not elevation.** I don't penalize "Oracle" use — a dimension that doesn't apply to a turn scores neutral, never a penalty. Novice-appropriate scaffolding isn't marked down. This came straight from your "the skill isn't reaching the highest mode, it's knowing which mode fits" prescription.
- **Verification-weighted.** The dimensions that carry the most weight are verification and diagnosis — the behaviors your own analysis flags as the ones that grow with expertise on every task.
- **Perception-vs-behavior is built in.** You already run a classroom exercise comparing what students *thought* they did against transcript evidence. My tool produces that gap automatically and continuously — and there's hard evidence it matters (METR's RCT: developers believed they were 20% faster with AI while measuring 19% *slower*). That gap is the coaching hook.

## What exists today (not a pitch deck — working software)

- A capture plugin that records usage behavior locally, privacy-first (raw prompts never leave the machine; only aggregate scores sync, on opt-in).
- A scoring engine over 7 evidence-backed behavior dimensions (context-setting, plan-first, verification, diagnose-vs-retry, understanding-seeking, scope discipline, iteration discipline), with an optional LLM judge for the harder-to-measure ones — adversarially tested against gaming (padded prompts and ritual "why?" farming both get caught).
- A live coaching layer (real-time feedback + gamified levels) and a web dashboard with a per-student profile.
- All of it built and privately deployed. I can demo it end-to-end whenever you have 20 minutes.

## The pilot (Fall 2026, your course)

**Structure — three semesters, escalating:**

1. **Fall 2026 — free instrumented pilot.** Students opt in (IRB-clean consent). The tool runs alongside their normal AI coursework. Deliverable is *data*: a real behavioral dataset tied to your rubric and to course artifacts/grades. Zero cost to students or the department.
2. **Winter 2027 — student-pays adoption** (textbook model, professor-assigned, no procurement) once validated — this is where it becomes self-sustaining, priced in the normal courseware band.
3. **2027 — department/teaching-center scale** on the strength of the published study, as universities scramble for AI-competency assessment (the mandates are landing — this is a rare open procurement slot).

**What I need from you:** the course as the pilot site, your rubric as the scoring vocabulary (license or co-develop — your call), and co-design of the study protocol. What I bring: all the engineering, the instrument, the infrastructure, and the build cost.

## The validation study (this is the real prize)

A study nobody has published: **does real usage telemetry predict skill growth?** No published work ties CLI/agent behavior telemetry to longitudinal learning outcomes. We'd design it to hit your Stage A target and beyond:
- Behavior telemetry (my instrument) → your 8-mode classification → course artifact grades + a pre/post skills measure.
- Your existing HICSS chatbot-tutor methodology and N=331 survey give us a running start on design and IRB framing.
- Output: a peer-reviewed paper (you as senior/co-author — this fills the "No publications found" gap on your aimodes research page with a real citation), a validated rubric weighting, and the credibility backbone for the AI Foundry credential.

## Open items we should settle (I'd rather name these than paper over them)

1. **IRB.** Plugin telemetry feeding research needs human-subjects review. I want us designing the consent + data-handling plan together from the start, not retrofitting it.
2. **Taxonomy license / co-development.** I'm mapping onto your 8 modes deliberately rather than inventing a rival vocabulary. Let's formalize how — license, co-authorship, or joint IP through the Foundry.
3. **Channel overlap.** You already distribute Claude Code plugin bundles (mode-aware prompting *skills*); mine is *telemetry*. They're complementary — yours teaches the modes, mine measures them — but we're in the same channel and audience, so let's coordinate positioning rather than collide.
4. **Advisory terms.** Your Foundry board seat is set in principle; this pilot is a concrete first workstream under it. Worth tying the two together explicitly.

## What I'm asking for right now

Twenty minutes to demo the working tool, and an in-principle yes to instrumenting the Fall course. Everything else (IRB, protocol, license) we design together over the summer — but the semester start is the hard deadline. If we're not instrumented by the first week of Fall, the validation study slips a full year.

---

*Two honesty notes I owe you, since your whole research identity is about not laundering claims: (1) I could not find a published source for the "70/30" figure from our first conversation — I've kept it out of everything until you can point me to it or we generate our own number from the pilot. (2) The strongest cognitive-effect evidence (the PNAS RCT: −17% on unassisted exams with unrestricted AI, zero harm with guardrails) is exactly the "how you use it, not whether" story your framework tells — which is why I want your rubric as the backbone, not a competing one.*
