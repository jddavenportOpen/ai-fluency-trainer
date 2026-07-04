# AI Fluency Trainer — Research Report

**Date:** 2026-07-03
**Basis:** 6-angle research sweep (Keith academic record, Keith public materials, local/relationship context, cognition literature, behavior rubric, landscape & feasibility) + adversarial verification of 10 load-bearing claims (8 confirmed, 1 partially-true, 1 confirmed-negative).

---

## 1. Executive Summary

**The thesis, as pitched:** "~70% of people get dumber using AI, ~30% get better, and the difference is a set of trainable behaviors — so build a Claude Code telemetry plugin that scores those behaviors (free, recruiter-checkable) plus a paid coaching product."

**The honest verdict: the *mechanism* survives contact with evidence; the *number* does not.**

### What did NOT survive

- **The "70% / 30%" split is unverifiable — treat it as REFUTED for public use.** Exhaustive searching (aimodes.ai, Google Scholar, SSRN, ResearchGate, LinkedIn, news) found no such statistic from Mark Keith or anyone else, and adversarial verification independently reproduced the negative result. It does not appear to exist as a published finding. If JD heard it from Keith on 2026-07-02, it is unpublished data or an informal paraphrase — **and the local record contains zero verbatim capture of that meeting** (the Plaud transcript never synced; see §2). Do not cite 70/30 anywhere until Keith supplies a source. The closest public numbers: Anthropic found **~47%** of student Claude conversations are "Direct" (minimal-engagement delegation) [Anthropic Education Report](https://www.anthropic.com/news/anthropic-education-report-how-university-students-use-claude); Microsoft/CMU found **~40%** of GenAI-assisted work tasks involved no self-reported critical thinking [CHI 2025](https://dl.acm.org/doi/abs/10.1145/3706598.3713778). The honest phrase is "**roughly half** of real-world AI use is passive/delegative," not "most people" and not 70%.
- **"Gets dumber" overstates causality for most of the evidence base.** The flagship harm studies are correlational and/or self-report (Gerlich, Lee et al.); the strongest media-cited study (MIT "Your Brain on ChatGPT") is a small-n preprint. And Keith's own framework — verified directly — *explicitly disclaims* the hierarchy reading: his rubric-theory page states "the three tiers are not a hierarchy" and "'More Agency' is not 'better'" ([aimodes.ai/research/rubric-theory](https://aimodes.ai/research/rubric-theory)).

### What DID survive — and is actually stronger than the original framing

1. **Passive AI use measurably erodes skill, and the harm is causally demonstrated in the best studies.** A PNAS RCT (~1,000 students) found unrestricted ChatGPT access made students **17% worse on unassisted exams** — while a guardrailed tutor version boosted practice **+127% with zero exam harm** ([PNAS](https://www.pnas.org/doi/10.1073/pnas.2422633122)). Same tool, different usage behavior, opposite outcome. That single study is the thesis in miniature.
2. **The differentiating behaviors are identified, trainable, and telemetry-visible.** Verification of outputs, plan-before-delegate, think-first sequencing, diagnostic iteration, and calibrated task selection separate helped from harmed users across a dozen independent studies (§3, §4) — and Anthropic's own Claude Code research already measures expert-vs-novice differences from logs ([Anthropic](https://www.anthropic.com/research/claude-code-expertise)).
3. **People cannot self-assess AI effectiveness — the strongest argument for external scoring.** METR's RCT: experienced devs were **19% slower** with AI while believing they were ~20% faster — a ~39-point perception-reality gap ([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)).
4. **The whitespace is real.** No product combines behavior-derived telemetry → individual skill score → in-terminal coaching → recruiter-facing credential (§5).
5. **Mark Keith is a far bigger asset than expected — and a partial overlap.** He already ships a live conversation-scoring product (aimodes.ai) and distributes Claude Code plugin bundles (both verified). His rubric can be the scoring engine; JD's always-on telemetry is the instrument Keith's own validation plan needs.

**Defensible thesis statement for the PRD:** *Roughly half of real-world AI use is passive delegation. Passive use measurably erodes critical thinking and skill acquisition — causally, in RCTs — while structured, verifying, agentic use improves outcomes. The difference is a specific set of observable behaviors; users cannot self-assess which side they're on; and no product today measures or trains those behaviors from real usage. We will.*

---

## 2. Mark Keith: Who He Is, His Research, What We Can Build On

### CONFIRMED — identity and record

- **Associate Professor of Information Systems, BYU Marriott** (PhD Arizona State 2009; previously Alabama and West Texas A&M). ~2,640 citations, h-index 23. His *published* record is information privacy, information disclosure measured via actual behavior (his most-cited paper, 545 citations, re-examines privacy with actual behavior rather than self-report), technology-mediated learning (Twitch instruction, team video-gaming RCTs), and passphrase usability — **not** generative AI [Google Scholar](https://scholar.google.com/citations?user=oo9iLzcAAAAJ&hl=en), [BYU Marriott directory](https://marriott.byu.edu/directory/details?id=29237).
- **Peer-reviewed AI-education work:** HICSS 2022/2024 chatbot-tutor studies (N=136 intro-programming students): chatbot tutoring raised learner confidence, effect stronger for women, closing a gender confidence gap that exists despite no performance gap [BYU ScholarsArchive](https://scholarsarchive.byu.edu/facpub/9344/).
- **Productization credibility:** taught ML/analytics at five universities, 6 textbooks (3 AI books in progress), MyEducator courseware co-creator, runs side apps [aimodes.ai](https://aimodes.ai/).

### CONFIRMED — his live AI product, aimodes.ai (adversarially verified against the live site)

- **The AI Engagement Modes framework:** 8 modes across 3 tiers of intellectual agency — **Passivity** ("You ask, AI answers. Your brain offloads."): Oracle, Production Assistant; **Partnership** ("You and AI think together. Your brain co-reasons."): Tutor, Collaborative Problem-Solver; **Agency** ("You drive. AI sharpens your thinking."): Verification Agent, Creative Expander, Critical Challenger, Problem Setter [aimodes.ai](https://aimodes.ai/). Users paste any AI conversation (ChatGPT/Claude/Gemini) and get mode distribution, peer benchmarks, an archetype (Delegator/Partner/Challenger/Explorer/Specialist/Learner), an engagement score, and a growth plan. Free tier: 50 analyses/month through December 2026. **All verified verbatim against the live site.**
- **He already ships Claude Code plugins** — verified verbatim: "Plugin files are Claude Code toolkit bundles — drop into your Claude Code plugins directory to install the skills" (learn-with-ai-toolkit.plugin, faculty-research-toolkit.plugin, plus student/faculty guides). Note: these install mode-aware prompting *skills*, not telemetry — the overlap with JD's plugin is channel and audience, not function. Still a coordination item for the advisory relationship.
- **Theoretically serious methodology** — verified: Bloom's revised taxonomy for task decomposition, cognitive-load weighting (Sweller), 3-tier expertise calibration with the expertise-reversal effect (Kalyuga 2003 — Oracle weighted 1.4x for beginners vs 0.3x for experts; Problem Setter 0.3x vs 1.8x), dual-process theory (Evans & Stanovich 2013), and a continuous-revision pipeline (0.6 theoretical + 0.4 empirical top-quartile, human-reviewed, n≥50 per cell) with "20+ peer-reviewed citations" claimed [rubric theory page](https://aimodes.ai/research/rubric-theory).
- **His core prescription — critical for product design:** "The real skill isn't reaching the highest mode. It's knowing which mode fits which situation and switching deliberately." The rubric scores **fit-to-task, not elevation** — Oracle is *correct* for factual lookup; novices need Tutor scaffolding while heavy Tutor/Oracle use actively harms experts; the only mode that grows with expertise on every task is Verification [rubric theory](https://aimodes.ai/research/rubric-theory), [David Wood LinkedIn share](https://www.linkedin.com/posts/davidawood_this-is-an-very-important-and-well-thought-activity-7442420173816516608-aS4h). **Our scoring model must not be a simple "penalize passivity" ladder.**
- **His pedagogy is our coaching mechanic:** 7-step chapter loop, rubric-based feedback on real student AI transcripts, and a "perception-vs-behavior gap" exercise comparing what students *thought* they did against transcript evidence — literally telemetry-vs-self-report coaching [pedagogy page](https://aimodes.ai/research/pedagogy).

### CONFIRMED but weak — his empirical base (do not launder this)

- One real result: **Wave 1 survey, N=331** (students only, self-report, Jan–Mar 2026): the 8-factor structure **holds at exploratory factor analysis** (verification downgraded "confirmed the structure" — no confirmatory factor analysis yet). Oracle correlates negatively with the four Agency-tier modes (r = −0.16 to −0.35); Agency modes inter-correlate r = 0.58–0.70 [rubric theory](https://aimodes.ai/research/rubric-theory). **Verification flagged (partially-true):** the page explicitly says the tiers are not a hierarchy and the data do not establish any target distribution as optimal — connecting this to a "worse/better" split is our gloss, which the source's own caveats cut against.
- **By its own admission, largely unvalidated** (verified verbatim): rubrics v0.1 have "no empirical weighting from student data"; the Haiku 4.5 classifier's κ≥0.80 calibration set (200 messages) "does not yet exist" as of 2026-04-22; validation Stages A–D (Stage A target: r > 0.40 between rubric scores and artifact grades) are planned, not done. Publications page: "No publications found." Blog: "No posts yet." No SSRN paper exists.
- **His public "gets worse" evidence** is a citation of Gerlich 2025 (see §3) plus his framing: "people who use AI ONLY in this [passive] way end up with declining analytical skills" — verified verbatim in the Wood LinkedIn share, but note (a) the Gerlich citation was not visible by name in the retrievable post text, and (b) Gerlich is correlational, so Keith's "end up with declining" is a causal gloss on correlational data.

### Could NOT find / gaps

- **The "70% / 30%" statistic — NOT FOUND ANYWHERE** (independently verified negative). The only percentage on aimodes.ai is a homepage *demo* of one analyzed conversation (Passivity 55% / Partnership 25% / Agency 20%) — not a population statistic. The only BYU study with 70/30 numbers is an unrelated Wheatley Institute AI-companion study — a plausible source of number confusion.
- **No verbatim record of the 2026-07-02 JD–Keith meeting exists locally.** PlaudSync's newest recording is 2026-06-29; the meeting where the 70/30 idea and product concepts were presumably discussed has no transcript on disk. Everything attributed to Keith's *ideas for this product* currently rests on JD's memory. **Recovery actions: trigger a Plaud sync; pull the 2026-04-17 LinkedIn message body; ask Keith directly.**
- No AI-focused talks, YouTube lectures, or podcasts by Keith; his public AI voice is LinkedIn + aimodes.ai, amplified by colleagues (David Wood: "very important... influential work"; Jim Brau: Wood and Keith are "leading the way with AI at BYU Marriott").

### Relationship context (from local data, high confidence)

Keith's IS classes started JD's AI journey (JD's own words). Keith was funneling students to the AI Foundry by April 2026, met JD 2026-07-02 (786 TNRB), and was named to the AI Foundry founding advisory board that evening (terms/fee TBD; $5K/yr comps). Keith is launching a **new first-year MBA AI course** and JD is approved to help/TA it — the highest-bandwidth channel into his pedagogy. His board seat is already cited in external outreach before terms are set.

**Build-on strategy:** map telemetry signals onto (or license) Keith's 8-mode taxonomy rather than inventing a parallel one; position JD's plugin as the at-scale validation instrument his Stages A–D need (IRB questions apply); resolve the plugin-channel overlap explicitly in the advisory agreement.

---

## 3. The Science: AI's Cognitive Effects

### Evidence of harm (strongest → weakest)

| Study | Design | Key numbers | Caveats |
|---|---|---|---|
| [Bastani et al., PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122) | **RCT**, ~1,000 high-school math students | Unrestricted ChatGPT: practice +48% but **−17% on unassisted exam**. Guardrailed "GPT Tutor" (hints, no answers): practice +127%, **no exam harm** | Cleanest causal evidence; harm is fully preventable by changing *how* AI is used |
| [METR RCT, 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) | RCT, 16 expert OSS devs, 246 tasks | AI allowed = **19% slower**; devs forecast +24% and believed +20% after the fact | Small n, expert devs on familiar 1.1M-LOC repos, early-2025 tools; METR re-running |
| [Budzyń et al., Lancet Gastro Hep 2025](https://www.thelancet.com/journals/langas/article/PIIS2468-1253(25)00133-5/abstract) | Observational, 19 endoscopists, 1,443 procedures | After ~3 months of AI assistance, **unassisted** adenoma detection fell 28.4% → 22.4% (~20% relative decline) | First real-world professional deskilling result; not clinician-randomized |
| [Lee et al., CHI 2025](https://dl.acm.org/doi/abs/10.1145/3706598.3713778) (Microsoft/CMU) | Survey, 319 knowledge workers, 936 real tasks | No critical thinking in ~40% of GenAI tasks; confidence-in-AI predicts **less** critical thinking (β=−0.69); self-confidence (β=+0.26) and confidence-evaluating-AI (β=+0.31) predict **more**; reduced effort at every Bloom's level | Self-report, not behavioral |
| [Kosmyna et al. "Your Brain on ChatGPT," 2025](https://arxiv.org/abs/2506.08872) (MIT Media Lab) | EEG, n=54 (n=18 in crossover) | Neural connectivity scaled down with external support; ~83% of LLM users couldn't quote their own just-written essay (vs ~11%); LLM-to-Brain group stayed under-engaged after tool removal ("cognitive debt"). **But**: Brain-to-LLM (think first, then AI) preserved engagement | **Preprint, small n, essay task only; media badly over-claimed it — cite cautiously** |
| [Gerlich 2025, Societies](https://www.mdpi.com/2075-4698/15/1/6) | Cross-sectional, n=666 + 50 interviews | Significant negative correlation between frequent AI use and critical thinking (reported r = −0.68 in coverage), mediated by cognitive offloading; worst in ages 17–25; education protective | **Correlational (reverse causation plausible), self-selected sample, has a published Correction (Sept 2025, table duplication; conclusions unaffected) — cite carefully** |
| [Fan et al., BJET 2025 "metacognitive laziness"](https://bera-journals.onlinelibrary.wiley.com/doi/epdf/10.1111/bjet.13544) | Lab experiment | ChatGPT group: best essay scores, **no** knowledge gain/transfer advantage; monitoring/evaluation offloaded to AI | Short-term lab task |

### Counter-evidence (equally real — it sharpens rather than kills the thesis)

- **AI lifts low performers most (in output terms):** [Noy & Zhang, Science 2023](https://www.science.org/doi/10.1126/science.adh2586) (453 professionals, RCT): −40% time, +18% quality, lowest-skilled gained most. [Dell'Acqua et al./BCG](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4573321) (758 consultants): +12.2% tasks, +25.1% speed, ~+40% quality; bottom-half +43% vs top +17% — **but** on a task outside AI's "jagged frontier," AI users were 19pp *less* likely to be correct. [Tutor CoPilot, Stanford](https://arxiv.org/abs/2410.03017): +4pp mastery overall, +9pp for the weakest tutors' students, at $20/tutor/year.
- **Well-designed AI improves learning outright:** [Kestin et al., Harvard RCT](https://www.nature.com/articles/s41598-025-97652-6): a pedagogically-engineered physics tutor produced **>2x the learning gains** of an expert active-learning classroom. A [2026 meta-analysis of 35 experiments](https://www.nature.com/articles/s41599-026-07019-z) (4,193 participants): overall g=0.670, critical thinking g=1.008, problem-solving g=0.933; only 3/35 studies negative, harms clustering around *unguided over-reliance*. ⚠️ **The earlier widely-cited meta-analysis (Wang & Fan, g=0.867) was RETRACTED — cite the 2026 one.**
- **Experienced users get better, not lazier:** [Anthropic Economic Index "Learning curves" (Mar 2026)](https://www.anthropic.com/research/economic-index-march-2026-report): high-tenure Claude users delegate *less*, iterate more, succeed ~10% more (4pp after controls). Caveat: observational, survivorship effects. This directly supports "AI fluency is a learnable skill that compounds."

### The honest synthesis

The divide is not "AI good vs bad" but **engagement mode**. Harm appears when AI *substitutes* for the user's cognition (PNAS −17%; cognitive debt; metacognitive laziness; Lancet deskilling). Benefit appears when AI *scaffolds* or is critically supervised (GPT Tutor; Kestin 2x; Tutor CoPilot; Lee: evaluation-confidence predicts critical thinking). Measured passive-use fractions are **~40–50%**, not 70% and not "most." Low performers often gain most in short-run output even while learning less — so "dumber vs smarter" is task-horizon-dependent. **Evidentiary core for marketing: the RCTs (PNAS, Harvard, Tutor CoPilot, METR). Handle with care: Kosmyna (preprint), Gerlich (correlational + correction), the retracted meta-analysis.**

---

## 4. The Behavior Rubric

This is the scoring model's foundation. Every dimension has ≥2 independent evidence sources and is computable from Claude Code hooks/transcripts (§6). Key design constraint from the evidence: **weight verification/diagnosis behaviors over throughput** — the easiest-to-move metrics (acceptance rate, velocity) track *perception*, not reality ([CACM/Ziegler](https://cacm.acm.org/research/measuring-github-copilots-impact-on-productivity/), [METR](https://arxiv.org/abs/2507.09089)).

| # | Dimension | Good behavior | Bad behavior | Measurable from Claude Code telemetry | Evidence |
|---|---|---|---|---|---|
| 1 | **Plan-first ratio** | Plan/spec/explore turns before first code-mutating action; plan mode usage | Cold-start "do it" delegation | Plan-mode events; UserPromptSubmit sequence vs first Edit/Write PreToolUse | [Anthropic best practices](https://code.claude.com/docs/en/best-practices); [Anthropic expertise study](https://www.anthropic.com/research/claude-code-expertise) (humans make ~70% of planning vs ~20% of execution decisions); [CHI 2025](https://dl.acm.org/doi/abs/10.1145/3706598.3713778) goal-setting |
| 2 | **Verification rate** | Tests/builds/runs after AI edits; demands evidence before accepting | Ships unverified output | Bash tool calls matching test/build/lint patterns after Edit events, before commit | [Willison](https://simonwillison.net/2025/Mar/11/using-llms-for-code/) ("cannot outsource testing"); [CUPS/CHI 2024](https://arxiv.org/abs/2210.14306) (verification = 22.4% of session time); [DORA 2025](https://dora.dev/dora-report-2025/); [CHI 2025](https://dl.acm.org/doi/abs/10.1145/3706598.3713778) |
| 3 | **Blind-accept rate** (inverse) | Reads diffs; follow-up scrutiny | Accepts large diffs with no read-time, no test, no follow-up | Time between PostToolUse (Edit) and next user action; diff size vs inspection signals; permission accept latency | [CUPS](https://arxiv.org/abs/2210.14306) (deferred verification costs 5x: 15.2s vs 3.25s); [Buçinca CSCW 2021](https://arxiv.org/abs/2102.09692); [Osmani](https://addyo.substack.com/p/the-70-problem-hard-truths-about) |
| 4 | **Iteration vs abandonment** | Refines after imperfect output; recovers troubled sessions | Abandons or restarts on first failure | Session end_reason; turn depth after failures; SessionEnd patterns | [Anthropic expertise](https://www.anthropic.com/research/claude-code-expertise) (abandonment 19% novice vs 5–7% expert; recovery 4% vs 15%) |
| 5 | **Diagnose vs blind-retry** | Next prompt after failure adds error text, logs, hypothesis | Near-duplicate retry of the failed prompt | Edit-distance + content diff of consecutive prompts after PostToolUseFailure | [Why Johnny Can't Prompt, CHI 2023](https://dl.acm.org/doi/full/10.1145/3544548.3581388); [Ronacher](https://lucumr.pocoo.org/2025/6/12/agentic-coding/) |
| 6 | **Context provisioning** | Files/examples/constraints in prompt; CLAUDE.md exists and is fresh | Bare one-line prompts into a large codebase | UserPromptSubmit length/structure; file references; CLAUDE.md presence/mtime | [Willison](https://simonwillison.net/2025/Mar/11/using-llms-for-code/) (context management = the craft); [METR](https://arxiv.org/abs/2507.09089) (missing implicit context = slowdown factor); Anthropic (expert prompts → ~12 actions/3,200 words vs 5/600) |
| 7 | **Understanding-seeking ratio** | Explain/why/teach/critique requests | Pure "do it for me" delegation | Prompt-intent classification (maps to Keith's Oracle vs Agency tiers) | [Keith's modes](https://aimodes.ai/research/rubric-theory); [Anthropic Education](https://www.anthropic.com/news/anthropic-education-report-how-university-students-use-claude) (~47% Direct); [Gerlich](https://www.mdpi.com/2075-4698/15/1/6) |
| 8 | **Think-first sequencing** | Supplies own attempt/hypothesis/draft before invoking AI | Cold-start delegation of the thinking itself | First-prompt content classification (contains user's attempt vs pure request) | [MIT Brain-to-LLM crossover](https://arxiv.org/abs/2506.08872); [Buçinca](https://arxiv.org/abs/2102.09692) |
| 9 | **Critical-challenge behaviors** | Asks for alternatives/tradeoffs; requests critique of AI's own output; second-opinion reviews | Accepts first answer as final | Prompt classification (options-first queries, critique requests); subagent cross-review events | Keith's Critical Challenger mode; [Ronacher](https://lucumr.pocoo.org/2025/6/12/agentic-coding/) (LLM-reviews-LLM); [Willison](https://simonwillison.net/2025/Mar/11/using-llms-for-code/) |
| 10 | **Batch size / decomposition** | Small diffs, frequent commits, task splitting | Monolithic 1,000-line accepted changes | Diff size per accepted Edit; commit cadence (Bash git events); TaskCreated granularity | [DORA 2025](https://dora.dev/dora-report-2025/) (small batches amplify AI benefit); [Anthropic best practices](https://code.claude.com/docs/en/best-practices) |
| 11 | **Calibrated delegation** | High AI autonomy on breadth/boilerplate/unfamiliar; low on depth/high-familiarity; knows when NOT to use AI | Uniform delegation regardless of task type | Task-type classification × autonomy level (permission_mode, subagent use) over time | [Grounded Copilot, OOPSLA 2023](https://arxiv.org/abs/2206.15000) (acceleration vs exploration modes); [METR](https://arxiv.org/abs/2507.09089) (familiarity = slowdown factor); Keith's fit-to-task + expertise-reversal principle |
| 12 | **Feedback-loop instrumentation** | Gives the agent runnable verification tools (tests, lint, logs) inside its loop | Agent works blind, human is the only checker | Test/lint/build executions *within* agent tool loops; monitor configuration | [Ronacher](https://lucumr.pocoo.org/2025/6/12/agentic-coding/) ("the better the feedback loop, the better the results"); [DORA](https://dora.dev/dora-report-2025/); Anthropic "show evidence" |
| 13 | **Post-AI curation** | Refactors/edits AI output; duplication trend flat or falling | Never touches generated code; duplication rising | User-authored edit rate on AI-generated files; duplication metrics over sessions | [GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research) (8x duplicated blocks; refactoring collapsed <10%); [Osmani's 70% problem](https://addyo.substack.com/p/the-70-problem-hard-truths-about) |
| **M** | **Calibration (meta-metric)** | Self-assessed benefit tracks measured outcomes | Believes +20% while measuring −19% | Periodic in-terminal self-assessment prompts vs measured dimensions | [METR perception gap](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [CACM](https://cacm.acm.org/research/measuring-github-copilots-impact-on-productivity/) (acceptance rate = satisfaction, not skill) |

**Two rubric-design rules from the evidence:** (1) Score **fit-to-task, not elevation** — per Keith's expertise-reversal weighting, penalizing all "Oracle" use is wrong; the score must condition on task type and user expertise. (2) **Never surface raw acceptance rate or velocity as the score** — juniors accept more than seniors, and acceptance predicts perceived (not actual) productivity.

**The honest validation gap (unverified, and our opportunity):** no published study ties CLI-agent telemetry features to longitudinal skill growth. CUPS and Anthropic prove measurement feasibility; Keith proves conversation-level classification is productizable; the composite "AI fluency score → real outcomes" link is **unvalidated novel research** — exactly what the Keith advisory relationship should produce (validate against his instruments and student outcomes; publishable; feeds the recruiter-credibility story).

---

## 5. Landscape & Whitespace

**No existing product combines real usage telemetry → individual skill score → in-terminal coaching → recruiter-verifiable credential.** The market splits into four non-overlapping clusters:

| Cluster | Players | What they do | What they don't |
|---|---|---|---|
| **Org-admin adoption analytics** | [Claude Code team analytics](https://code.claude.com/docs/en/analytics) (accept rate, PR attribution, top-10 leaderboard, Teams/Enterprise only); [GitHub Copilot metrics](https://github.blog/changelog/2026-05-29-copilot-usage-metrics-api-adds-cohorts-for-ai-adoption/) (GA Feb 2026; per-user 28-day "AI adoption phase" cohorts — the closest thing to an individual maturity score); [DX](https://getdx.com/research/measuring-ai-code-assistants-and-agents/), Faros, [Jellyfish](https://jellyfish.co/library/claude-code-monitoring/), Exceeds AI | Adoption/ROI for engineering leadership | No individual-facing score, no quality/behavior basis, no coaching, no portable credential |
| **Individual cost/token trackers** | [ccusage](https://ccusage.com/), [sniffly](https://github.com/chiphuyen/sniffly) (~1.2k stars), [claude-code-templates](https://github.com/davila7/claude-code-templates) | Parse local JSONL for cost/usage/errors — proving both demand and the capture approach | No skill scoring, no coaching, no credential |
| **AI-fluency training** | [Section/ProfAI](https://www.sectionai.com/blog/benchmarking-sections-ai-proficiency) (Credly badge), [Anthropic Academy](https://anthropic.skilljar.com/) (free Claude Code courses, LinkedIn certificates), Coursera | Credential course **completion** via quizzes/exercises | Nothing verified from real work behavior |
| **Skill credentialing** | [Workera](https://www.workera.ai/platform/ai-agent/hiring) (proctored hiring assessments), [Pluralsight Skill IQ](https://www.pluralsight.com/product/skills-assessment), [WakaTime](https://wakatime.com/) (public coding-time profiles/leaderboards, now marketing "AI coding analytics"), LeetCode/Codewars | Recruiters already accept gamified/verified dev signal — the cultural template exists | All test-based or raw-activity-based; none behavior-derived from AI usage |

Plus: Keith's [aimodes.ai](https://aimodes.ai/) (single pasted-conversation scoring — the closest philosophical neighbor, and an advisor, not a competitor) and quiz-based SEO plays (aifluencyplan.com, aisa.to) that validate "test my AI skills" search demand while posing no threat.

**Biggest strategic threats:** (1) **Anthropic extending downward** — they already have team analytics + Academy + a leaderboard + their own expertise research; an individual-facing score is one product decision away. (2) **GitHub reframing adoption cohorts as skill.** Speed and the recruiter-facing credential (which neither has incentive to build) are the moats.

---

## 6. Technical Feasibility

**Verdict: strongly feasible today, hooks-first.** All claims below verified against live docs and firsthand inspection of local transcript files.

### Capture surfaces

- **Hooks (~30 lifecycle events)** deliver the full behavioral stream on stdin as JSON: SessionStart/End (with end_reason), UserPromptSubmit (**full prompt text**), Pre/PostToolUse (tool name + input + output, incl. bash commands and file edits), PostToolUseFailure (error_type), Stop, SubagentStart/Stop, PreCompact/PostCompact (tokens_before/after — context-hygiene signal), PermissionRequest/Denied (accept/reject behavior), TaskCreated/Completed. Every hook receives session_id, **transcript_path**, cwd, permission_mode, effort [Hooks reference](https://code.claude.com/docs/en/hooks).
- **Transcript JSONL** (verified firsthand at `~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl`): typed records with cwd, gitBranch, timestamp, promptId, parentUuid (conversation DAG), isSidechain (subagent use), model, stop_reason, and full per-message token/cache economics. This is the same stable surface ccusage/sniffly already parse — full retrospective scoring is possible from transcript_path alone.
- **OpenTelemetry** (opt-in via `CLAUDE_CODE_ENABLE_TELEMETRY=1`): 8 metrics + 22+ events (tool_decision accept/reject, tool_result with duration/error, api_request cost, etc.). Content redacted by default. **Requires env vars a plugin cannot set** → this is the enterprise tier's path, not the free plugin's [Monitoring docs](https://code.claude.com/docs/en/monitoring-usage).

### Coaching surfaces (the paid product's mechanism)

- **Hooks can actively intervene, not just observe:** `systemMessage` (warn the user), `additionalContext` (inject guidance into Claude's context), `decision:block` with reason; UserPromptSubmit can block-and-feedback; Stop can force continuation; exit code 2 turns stderr into user-facing feedback. This enables Buçinca-style **cognitive forcing functions** ("you accepted 6 edits without reading a diff — review this one") — which no competitor does in-terminal. Timeouts (~30s UserPromptSubmit) mean coaching logic must be fast/local.
- **Statusline:** a shell script invoked frequently with rich JSON (cost, lines added/removed, context %, rate limits, session_id) — ideal for a persistent XP/level/score display. **Caveat:** a plugin's settings.json can only set `subagentStatusLine`; the *main* statusline must be written into the user's `~/.claude/settings.json` (the installer/paid app does this) [Statusline docs](https://code.claude.com/docs/en/statusline).

### Packaging & distribution

Plugins bundle hooks, skills, agents, MCP servers, background monitors, and bin/ executables; distribution via Anthropic's community marketplace (automated safety review, SHA-pinned) or `--plugin-dir`/`--plugin-url`. Anthropic treats plugins as a durable surface (OTel even emits plugin_installed events) [Plugin docs](https://code.claude.com/docs/en/plugins).

### The binding architecture constraint

Hook payloads contain **raw prompts, bash commands, code diffs, file paths** — proprietary material. The viable pattern (matching Anthropic's redact-by-default OTel posture and sniffly's local-only positioning, which was its HN selling point): **compute behavioral features and the score locally; upload only aggregate metrics/scores; content capture strictly opt-in.** This also matters for marketplace approval.

---

## 7. Product Implications & Risks

### Implications

1. **The free plugin's headline is the METR perception gap:** "You think AI makes you 20% faster. Developers in an RCT were 19% slower. What's your real number?" Self-assessment is demonstrably invalid; only measurement answers it.
2. **Use Keith's taxonomy as the scoring vocabulary** (with license/co-authorship formalized). His fit-to-task principle means the score is contextual, not a ladder — which is also the honest science.
3. **The paid app's mechanism has direct experimental support:** cognitive forcing functions reduce overreliance where passive explanations don't ([Buçinca](https://arxiv.org/abs/2102.09692)); guardrails flipped PNAS's −17% harm to zero; metacognitive scaffolding is where meta-analytic benefits concentrate.
4. **The validation study is a product feature:** telemetry → Keith's rubric → student/dev outcomes is publishable novel research, and "professor-validated score" is the credential's credibility engine. Do NOT claim "peer-reviewed backing from Keith" today — none exists yet (his publications page literally says "No publications found").
5. **Marketing language that survives scrutiny:** "roughly half of AI use is passive delegation, and passive use erodes skill" — not "70% get dumber," not "AI makes you dumb." Cite the RCTs; avoid leaning on Kosmyna (preprint, media-inflated), Gerlich (correlational, corrected), or the retracted meta-analysis.

### Risks

- **Goodhart/gaming (the top design risk for a recruiter-facing score).** Any surfaced metric will be optimized: users can run meaningless tests, pad prompts with boilerplate context, or ritually ask "why?" to farm understanding-seeking points. Mitigations: score composites not single metrics; weight hard-to-fake outcome-linked behaviors (test runs that actually pass/fail meaningfully, diagnostic content in retries); keep exact weights unpublished/rotating; anchor the recruiter credential in longitudinal consistency across real projects, not a snapshot. The evidence itself warns us: the easiest-to-move metrics (acceptance rate, velocity) are precisely the ones that track perception rather than reality.
- **Recruiter-credential validity.** Until the score is validated against outcomes, a recruiter-facing number is a *claim*, not a measurement — and Pluralsight itself warns against using Skill IQ for screening. Ship the credential as "verified behavior profile" before "fluency score"; upgrade language as validation lands.
- **Privacy = existential.** Exfiltrating prompts/code kills developer trust and possibly marketplace approval. Local-first scoring, aggregate-only upload, content opt-in, and a public data policy mirroring Anthropic's own OTel defaults. Enterprise mode via OTel (org-controlled) is a separate, consent-clean tier.
- **Platform dependency.** Hooks/transcript JSONL are documented and third-party-parsed but Anthropic-controlled; Anthropic's own analytics stack is the nearest big-company threat. Mitigate with speed, the individual/recruiter surface they won't build, and multi-CLI expansion (ccusage already went multi-agent-CLI).
- **The Keith relationship is warm but unpapered.** Advisory terms/fee are TBD, his name is already in external outreach, his plugins overlap our channel, and IRB questions apply if plugin telemetry feeds his research. Formalize: advisory agreement, taxonomy license/co-development, data-sharing/IRB plan.
- **Provenance of the founding idea is unrecorded.** The 2026-07-02 meeting — source of "70/30" and possibly other product concepts — has no transcript. Recover the Plaud recording and confirm attributions with Keith before any public claim references his ideas.

### Flagged claims (do not launder)

| Claim | Status |
|---|---|
| "70% get worse / 30% get better" | **NOT FOUND / unverifiable** — independently verified negative; do not cite publicly until Keith supplies a source |
| Keith's N=331 survey "confirms" the 8-factor structure | **Overstated** — holds at *exploratory* factor analysis only, students-only self-report; and Keith's own page rejects the "higher tier = better" reading |
| aimodes.ai homepage "Passivity 55%" figure | Demo of one conversation, **not** a population statistic |
| "AI makes most people dumber" | **Overstates** — measured passive fractions are ~40–50%; core evidence correlational/self-report; low performers often gain in output |
| Kosmyna "Your Brain on ChatGPT" | Preprint, n=54, essay task; widely media-inflated — cite cautiously |
| Gerlich 2025 | Correlational; published Correction (Sept 2025); Keith's "declining skills" is a causal gloss on it |
| Wang & Fan meta-analysis (g=0.867) | **RETRACTED** — cite the 2026 35-study meta-analysis (g=0.670) instead |
| "Peer-reviewed backing from Keith" for AI-training | **Does not exist yet** — publications page empty, no SSRN paper; treat as unpublished expertise |
| Composite AI-fluency score → real outcomes | **Unvalidated by anyone** — this is our research opportunity, not a citable fact |