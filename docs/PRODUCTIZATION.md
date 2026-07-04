# Productization — Business Model Memo

**To:** JD · **Re:** AI Fluency Trainer business model · **Date:** 2026-07-03
**Bottom line up front:** Open the capture layer, publish the methodology, seal the calibration, sell the dashboard depth to individuals as pocket money, and make the university course the actual business. The recruiter profile is never a SKU — it's the growth loop.

---

## 1. The Recommendation

**The model is buyer-based open core with a free viral credential surface** — GitLab's packaging rule ([A standard pricing model for open core](https://www.opencoreventures.com/blog/a-standard-pricing-model-for-open-core), verified against GitLab's live handbook) fused with WakaTime's mechanics ([wakatime.com/pricing](https://wakatime.com/pricing)) and Strava's profile law ([Strava statistics](https://www.businessofapps.com/data/strava-statistics/)).

**The decision, stated as a decision:**

| Layer | Status | Price |
|---|---|---|
| Claude Code capture plugin + local scoring | **Open source (MIT)** | Free forever |
| 7-dimension rubric + reference scorer | **Published** (paper + MIT repo) | Free forever |
| Production weights, calibration, anti-gaming | **Closed, server-side** | n/a (this is the moat) |
| Public gamified profile page | **Free forever, never paywalled** | $0 |
| Web dashboard (basic, 30-day history) | Free tier | $0 |
| **Fluency Pro** (unlimited history, deep coaching, trends, exports) | Closed SaaS | **$12/mo, $96/yr** |
| **Fluency Coach desktop/TUI app** | Free client; Pro features unlock with the same subscription | included in Pro |
| **Course edition** (professor tools + cohort dashboard + verified badge) | Closed | **$39/student/semester** |
| Team/Enterprise (org rollups, benchmarking, SSO) | Closed, later | ~$25/seat/mo, sold not self-served |

**Why this and not the alternatives:**

- **Pure OSS + donations is disproven in this exact niche.** Every Claude Code telemetry tool today is free and unmonetized; ccusage's maintainer is publicly asking for sponsorships to survive ([ccusage issue #123](https://github.com/ryoppippi/ccusage/issues/123)). Textualize — the most-adopted TUI stack in Python — shut down in May 2025 having found no business model for terminal software ([The future of Textualize](https://textual.textualize.io/blog/2025/05/07/the-future-of-textualize/)). Stars are not revenue.
- **Charging for the app/terminal itself is disproven.** Warp took three waves of backlash and now effectively sells metered AI credits ([HN](https://news.ycombinator.com/item?id=45772558)); Fig never monetized and died inside Amazon ([TechCrunch](https://techcrunch.com/2023/08/29/amazon-fig-command-line-terminal-generative-ai/)).
- **Individual freemium alone tops out as a lifestyle business.** WakaTime — the direct structural twin — is at ~$660K estimated revenue with 6 people after 12 years (Latka estimate, not first-party: [getlatka.com/companies/wakatime.com](https://getlatka.com/companies/wakatime.com)), with real free-to-paid conversion around ~1% (derived from the founder's own numbers: 1,100 payers on 100K users at $10K MRR, [HN thread](https://news.ycombinator.com/item?id=15593589)).
- **The proven solo-founder revenue models are (a) OSS client + closed hosted service** (Plausible: ~$3.1M ARR, ~8 people, bootstrapped — [plausible.io/blog/open-source-saas](https://plausible.io/blog/open-source-saas); Postiz: solo founder, $14.2K MRR in ~1 year, self-reported — [Indie Hackers](https://www.indiehackers.com/post/i-did-it-my-open-source-company-now-makes-14-2k-monthly-as-a-single-developer-f2fec088a4)) **and (b) institution-pays education/org tiers**, where a single mid-size deal (DX median: $51.5K ARR — [Vendr](https://www.vendr.com/marketplace/dx)) exceeds a year of plausible prosumer revenue.
- **You have something WakaTime never had: an institutional channel with a validation asset.** The BYU advisory relationship + validation study is the zyBooks/Packback playbook, and both of those worked (zyBooks: professor-founded, tested in his own course, $56M Wiley exit — [UCR news](https://news.ucr.edu/articles/2019/07/30/publishing-company-wiley-acquires-zybooks); Packback: 10-institution efficacy study as its flagship sales asset — [Packback white paper](https://packback.co/news/white-paper-reveals-findings-from-study-on-packbacks-efficacy-across-10-institutions/)). The timing is unusually good: Purdue's AI Working Competency graduation requirement and SUNY's 64-campus AI-literacy mandate both land fall 2026, and current university spend goes to LLM *access*, not measurement — the assessment slot is empty ([OSU AI Fluency](https://oaa.osu.edu/ai-fluency)).

**So: individual Pro is the credibility layer and the pocket money. The course/education tier is the business. The public profile is the marketing department.** Solo founder, no funding pressure, near-zero marginal cost — this composition needs no sales team for stage one and exactly one warm intro (which you already have) for stage two.

---

## 2. What's Free vs Open vs Paid — Component by Component

**Capture plugin → MIT open source, non-negotiable.** Three independent reasons: (1) Claude Code plugins are distributed as git-sourced repos — the code is readable by every installer anyway; closing it is not actually possible ([plugin marketplaces docs](https://code.claude.com/docs/en/plugin-marketplaces)). (2) The trust climate is hostile to telemetry: "Claude Code is steganographically marking requests" hit #1 on HN with 2,428 points *three days ago* ([HN](https://news.ycombinator.com/item?id=48734373)), and the trojaned Nx Console extension (May 2026) primed marketplace paranoia. A telemetry plugin from an unknown solo publisher is radioactive unless fully inspectable. (3) sniffly proved that open + local-only produces *zero* privacy backlash for exactly this tool category ([HN](https://news.ycombinator.com/item?id=45081711)). Follow the Go-telemetry settlement: score locally by default, upload only aggregate dimension scores on explicit opt-in, keep a human-readable payload log ([golang discussion #58409](https://github.com/golang/go/discussions/58409)).

**Scoring engine → split it.** Publish the 7-dimension rubric and an MIT reference scorer — this is the Duolingo half-life-regression move: paper + reference repo bought academic credibility while the production model stayed closed ([duolingo/halflife-regression](https://github.com/duolingo/halflife-regression)). It's also *required* — the BYU validation study can't be citable against a black box.

**Production scoring weights, calibration data, anti-gaming detection → closed, server-side, forever.** This is the moat, and there's a principled public justification: FICO keeps exact weights secret explicitly because open weights → short-term gaming → the score's consumers lose confidence ([myFICO forums](https://ficoforums.myfico.com/t5/SmorgasBoard/Why-are-the-FICO-score-algorithms-secret/td-p/6331120)); when Twitter open-sourced its ranking algorithm, researchers documented a manipulation vector within three days ([Cyberscoop](https://cyberscoop.com/twitter-algorithm-cve-bots-elon-musk/)). For a recruiter-checkable score, **credibility IS the product**. "Transparent dimensions, sealed calibration" is the defensible line, and you can say it out loud.

**Coach TUI / desktop app → free client, closed source (or FSL if you want source-available goodwill — but never call FSL "open source"; GitButler got flamed for exactly that mislabel [TechCrunch](https://techcrunch.com/2024/09/22/some-startups-are-going-fair-source-to-avoid-the-pitfalls-of-open-source-licensing/)).** Nobody has ever successfully charged for a terminal app itself (Warp, Fig, Textualize). The XP/levels game layer is free — Duolingo's lesson: gamification is the *retention engine*, never the paywall ([Duolingo stats](https://sqmagazine.co.uk/duolingo-statistics/)). Coach depth (personalized drills, session-level coaching, long-horizon trends) unlocks with the Pro subscription.

**Dashboard → closed SaaS, freemium on history/depth.** WakaTime's exact trick, running successfully for a decade: capture everything free, "your coding activity is kept safe even on the Free plan," pay to see more of it ([wakatime.com/pricing](https://wakatime.com/pricing)). No one objects to a closed hosted dashboard behind open plugins.

**Public profile / share page → free forever, promised in writing.** Strava's profile is free because it *is* the acquisition loop (~$500M ARR with the shareable surface never paywalled — [Sacra](https://sacra.com/c/strava/)); every recruiter or classmate who views a profile is a funnel event. And one hard guardrail from the Insomnia 8.0 debacle: **never degrade the free local mode to push signups** — Kong did, and permanently exported its mindshare to Bruno ([Kong/insomnia #6577](https://github.com/Kong/insomnia/issues/6577)). The dashboard must be purely additive.

---

## 3. Who Pays, In Order

**1) Individual devs — first, small, and deliberately underweighted.** They validate willingness-to-pay and generate testimonials. Anchors: their existing stack is Claude Pro/Max $20–200/mo, Copilot Pro $10, Cursor Pro $20 — a $12/mo coach is a rounding error. But plan on WakaTime math, not SaaS-median math: ~1–3% free-to-paid (WakaTime's actual ~1.1%, derived; ChartMogul's 3–5% = "good" self-serve — [ChartMogul](https://chartmogul.com/reports/saas-conversion-report/)). 10,000 free users ≈ $1–3K MRR. That's gas money, not a business. Honesty flag: the "price-inelastic $5–15" claim in the research overreached — the founder only tested $5→$9; treat $12 as safe, $15+ as untested.

**2) Universities — the real first revenue, via the professor channel.** The adoption mechanic is textbook-model, professor-led, no procurement: instructor assigns the tool, students pay $25–90/semester (Packback $25–49, Top Hat $35, Codio $48, zyBooks $69–90 — all primary-source verified). Your advisor already runs this playbook — BYU MBA courses run on MyEducator, professor-assigned student-pays courseware ([myeducator.com](https://www.myeducator.com/)). First course ≈ 50–80 students × $39–49 = **$2–4K/semester** — validation revenue. First *institutional* deal: department/teaching-center license at **$5K–25K/yr** (~$10–15/student/semester with a minimum, mirroring Iowa's Top Hat site rate of ~$10 — [UIowa](https://teach.its.uiowa.edu/news/2024/03/lower-price-top-hat-classroom-pro-fall-2024)), sold on the efficacy white paper into the Purdue/SUNY-mandate wave.

**3) Employers/engineering orgs — later, and it's the big one.** The engineering-intelligence category proves companies pay $19–59/dev/mo with $30K+ minimums, sales-led (DX median deal $51.5K ARR — [Vendr](https://www.vendr.com/marketplace/dx); Jellyfish ~$30K minimum, per-seat figures disputed across sources — [CodePulse](https://codepulsehq.com/guides/jellyfish-pricing-review)). "How fluently is my team actually using the AI tooling I'm paying $200/seat for" is a budget-line question managers will have in 2027. Don't build for this yet; the cohort dashboard you build for courses IS the team dashboard.

**The revenue line to IGNORE early: recruiters.** See §5. Also ignore GitHub Sponsors/donations — verified maintainer income is $800–4K/mo at best, and the higher circulating figures ($45K/mo claims) could not be verified against any primary source.

---

## 4. Pricing Table

| Tier | Price | What's in it | Anchor |
|---|---|---|---|
| **Free** | $0 forever | Open-source plugin, full local capture + scoring, Coach app with XP/levels/streaks, public verified profile, dashboard with **30-day history**, weekly coaching digest | sniffly/ccusage norm (free is table stakes in Claude Code telemetry); Strava/Duolingo free game+profile |
| **Fluency Pro** | **$12/mo · $96/yr** (annual ≈ 33% off) | Unlimited history, deep per-dimension coaching, trend analytics, goals, data export, profile customization (badges, embeds), priority scoring | WakaTime Premium $14, Raycast Pro $8–10, Grammarly Pro $12 annual, Strava $11.99 — the proven prosumer band. Users already pay $100–200/mo for Claude itself |
| **Course Edition** | **$39/student/semester** (student-pays, professor-assigned) | Everything in Pro for the term + instructor cohort dashboard, assignments/benchmarks, **verified course-completion credential** on the profile | Packback $25–49, Top Hat $35, Codio $48 — dead center of the courseware band, below zyBooks |
| **Department/Site license** | **$10–15/student/semester, $5K min/yr** | Course Edition across sections + admin analytics | Top Hat site rate ≈ ⅓ of retail (Iowa $10 comp) |
| **Team/Enterprise** (2027) | **~$25/seat/mo**, annual, sold | Org rollups, cohort benchmarking, SSO/SCIM, admin — manager/exec features per GitLab's buyer rule | WakaTime Team $21–24; LinearB $19; DX/Jellyfish for the ceiling |

Pricing notes: don't launch under $9 (WakaTime's founder saw no conversion gain at lower prices — just less revenue). Offer annual from day one (Grammarly's 2.5× monthly-vs-annual spread shows how hard the category pushes annual lock-in). No metered credits ever — Warp's credit churn is the cautionary tale.

---

## 5. The Credential Question

**Decision: the verified behavior profile is a free viral surface, permanently. Neither candidates nor recruiters ever pay for it.** The credential *issuance* is monetized once — through the course.

The evidence is unusually one-sided here:

- **Recruiter-pays is a graveyard.** Triplebyte had *excellent* assessments and still died (Karat absorbed it, 2023): candidate acquisition ran on non-scaling ad spend, "a step function better at assessments" lost to LinkedIn's network effect, and senior candidates refused unsponsored 2-hour assessments ([Why Triplebyte failed](https://www.otherbranch.com/shared/blog/why-triplebyte-failed)). Hired.com died in the same window. The structural lesson for you: a recruiter-facing score must **ride an existing usage flow** — and yours does. The score is a byproduct of work people are already doing in Claude Code, which is precisely the trap Triplebyte couldn't escape (their free Screen funnel attracted the wrong candidates because taking it was *extra work*).
- **Candidate-pays-for-a-credential fails without a brand gate.** AWS/CompTIA can charge $100–439/exam only because employers already require those certs — years of demand-building you don't have. Candidate-pays works for *prep* (LeetCode $35/mo — revenue estimates vary wildly, $34–90M, all secondary), which is why the paid thing is the **Coach** (get better), never the **profile** (prove it).
- **The industry norm confirms it:** HackerRank and CodeSignal both give candidates certifications free and monetize employers only ([HackerRank skills verification](https://www.hackerrank.com/skills-verification); [CodeSignal certified assessments](https://codesignal.com/certified-assessments/)).
- **And the strongest validation for your specific design:** LinkedIn killed Skill Assessments (2023, badges stripped 2024) because hirers said evidence of *applied skills in real work context* beats test badges, plus fraud ([LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a1690529)). Behavior telemetry from real work is exactly the thing that killed the quiz badge. You're on the right side of that shift.

**Honesty flag:** the recruiter-behavior stats ("60–80% glance at GitHub," "83% trust GitHub over resumes") are vendor-published marketing numbers, contradicted by Dice's 31% figure — low confidence, all directions. But every direction of that uncertainty still says the same thing: recruiters *skim* third-party profiles for free and pay for none of them. The profile's job is to make candidates want a good score (driving Coach subscriptions and course enrollment) and to put your brand in front of every viewer.

The one paid credential motion that does work: **issuer-pays** (Credly charges the issuer $2–5/badge — [Credly pricing](https://info.credly.com/pricing)). That's your Course Edition: BYU's brand backs the badge, the course fee covers issuance, and the validation study is what makes the badge worth backing.

---

## 6. Distribution

**Anthropic marketplace = free distribution, not a billing surface, and not load-bearing.** There are no payment rails, no revenue share, no install fees; the official directory takes third-party submissions via form and leaves licensing to you ([claude-plugins-official](https://github.com/anthropics/claude-plugins-official)). The accepted norm — identical to VS Code, where native monetization has been an open issue since 2020 ([vscode #111800](https://github.com/microsoft/vscode/issues/111800)) — is free plugin + publisher-side subscription. Structural warning: GitHub deprecated the entire Copilot Extensions category in Nov 2025 in favor of MCP ([GitHub changelog](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/)). So: **keep identity, billing, and the data relationship on your own domain**, and keep the capture layer thin enough to re-target (plugin hooks today; OTEL or MCP tomorrow if Anthropic reshapes the channel).

**OSS-as-distribution is the marketing engine — and it requires marketing work, not just a repo.** Sentry's framing is the operating principle: "Open source isn't a business model — it's a distribution model" (Chad Whitacre, [TechCrunch](https://techcrunch.com/2024/09/22/some-startups-are-going-fair-source-to-avoid-the-pitfalls-of-open-source-licensing/)). Postiz's solo-founder playbook is the tactical checklist: directory listings, repeated public launches, one killer niche integration, "marketing as much as coding or more." Your launch surfaces: HN (Show HN — the sniffly reception proves this community *wants* open+local Claude Code analytics), the claude-plugins directory, awesome-claude-code lists, and the profile share loop itself.

**The professor/MBA channel is your first B2B deal, structured in three semesters:**
1. **Fall 2026 — free instrumented pilot** in the advisor's MBA AI course. Deliverable is *data*: the validation study cohort. This is zyBooks' genesis story (Vahid tested in his own intro course first) and Packback's white-paper motion.
2. **Winter 2027 — student-pays adoption** at $39/student/semester via bookstore/inclusive-access billing (no procurement needed — the textbook model). ~$2–4K/course. Publish the validation study + rubric paper the same term.
3. **2027 — department/teaching-center license**, $5K–25K/yr, sold on the white paper to schools staring down the Purdue/SUNY-style AI-competency mandates. Expect 3–12 month cycles and the bottom of the $10K–500K band first. **Do not lead campus-wide** — the CSU/OpenAI comp anchors campus deals at ~$25/user/*year*, which only pencils at system scale ([EdSource](https://edsource.org/2026/cal-state-renews-controversial-system-wide-contract-with-openai/758919)).

---

## 7. Risks & Tripwires

**R1 — Anthropic ships first-party fluency scoring.** Claude Code already has native OTEL metrics; a first-party "usage insights" feature is entirely plausible and would commoditize the capture layer. *Tripwire:* any Anthropic announcement of usage analytics/insights dashboards, or new telemetry APIs in Claude Code release notes. *Response:* your moats are the things Anthropic won't build — the academically validated behavior rubric, the cross-tool score (retarget capture to Cursor/Copilot/Codex via the thin-capture-layer design), and the credential/education channel. Accelerate the study publication; Anthropic shipping raw stats would actually validate the category while leaving the "validated, comparable, credentialed" layer to you.

**R2 — Fork or clone of the open plugin.** *Assessment: low.* Successful protest forks needed hyperscaler+foundation backing (Valkey, OpenTofu); solo-scale forks die (Insomnium: archived within 11 months). The real threat is an independent competitor with better positioning (the Bruno pattern, 45K stars). *Tripwire:* a local-first competitor crossing ~2K GitHub stars or a viral Show HN in your category. *Response:* the two moats a fork can't take are the hosted verified-profile network and the closed calibration/validation data — invest there, not in plugin feature races. Do NOT reach for FSL on the plugin; it would forfeit the trust dividend that is the whole point of opening it.

**R3 — Score gaming once weights leak or get reverse-engineered.** A gamed score kills the recruiter-facing credibility that everything downstream depends on. *Tripwire:* GitHub repos or gists that script telemetry to farm dimensions; sudden statistical anomalies in score distributions; a profile going viral for being obviously farmed. *Response:* FICO posture — publish dimensions, seal weights; server-side anomaly detection on opt-in uploads; versioned scoring so you can re-score history when you patch an exploit; "verified" tier of the profile requires server-side scoring, local-only scores are labeled self-reported.

**R4 — Price-anchoring mistakes.** Two specific ones: (a) launching the individual tier cheap "to grow" — WakaTime's founder proved lower prices bought no conversion, just less revenue; (b) letting a university negotiate course-level pricing against the CSU campus-wide anchor (~$25/user/yr). *Tripwire:* (a) the urge to ship a $5 tier; (b) any institutional conversation that opens with "what would this cost for all 30,000 students." *Response:* hold $12/$39; for campus-wide asks, quote a separate system-scale SKU later, never discount the course SKU.

**R5 — Privacy backlash despite open source.** One bad default ends the product in this climate (2,428-point HN thread, three days old). *Tripwire:* any HN/Reddit thread characterizing the plugin as surveillance; any payload found uploading more than aggregate scores. *Response:* Go-telemetry settlement as *architecture*, not policy — local-first default, explicit opt-in upload, human-readable payload log, third-party audit invitation pinned in the README. And per Insomnia: the free local mode is never degraded, ever.

---

## 8. 90-Day Sequencing

**Days 0–30 — Open the distribution layer. Charge for nothing.**
- MIT-license and publish the capture plugin; submit to the Anthropic directory + community lists. Local-first default, opt-in sync, payload log.
- Publish the 7-dimension rubric + MIT reference scorer (the citable artifact for the study).
- Ship the free profile pages with share loops (embed badges, OG cards).
- Show HN launch. Success metric: installs + zero privacy pushback (the sniffly bar).

**Days 30–60 — Lock the BYU pilot. Still charge for nothing.**
- Finalize the fall-2026 free instrumented pilot + validation study protocol with the advisor (IRB, cohort design). This deadline outranks everything — miss the semester start, lose six months.
- Instrument activation: time-to-first-score under 5 minutes, week-1 coaching engagement (the strongest conversion levers per [ChartMogul](https://chartmogul.com/reports/saas-conversion-report/), directionally).

**Days 60–90 — Turn on the first paid thing: Fluency Pro at $12/mo / $96/yr.**
- Gate: unlimited history + deep coaching + trends + export. The WakaTime gate, at the WakaTime-to-Grammarly price point.
- Expect ~1–3% conversion and treat it as validation, not income. The Course Edition SKU gets built *during* the pilot semester and priced at $39 for Winter 2027 — that's the first real revenue event, just outside this window.

**Free-forever promises, published on the pricing page on day one** (these are the Insomnia-proofing and the Strava loop, and they're what makes the paid tiers trusted):
1. The capture plugin stays open source.
2. Local capture, local scoring, and the Coach's XP/game layer stay free.
3. Your public profile stays free and never goes behind a paywall — yours or a recruiter's.
4. Your data is always exportable, and the free local mode will never be degraded to sell the dashboard.

**What you're NOT doing in 90 days:** recruiter monetization (graveyard — §5), enterprise sales (no leverage until the study publishes), campus-wide deals (wrong anchor), sponsorware/donations (not a model), and any metered-credit pricing (Warp's mistake).

---

*Evidence caveats carried through this memo: WakaTime's ~1% conversion is derived from founder-published numbers, not stated by him, and its $660K revenue is a Latka estimate; price inelasticity is only proven for $5→$9; Postiz MRR is self-reported; LeetCode revenue estimates span $34–90M; recruiter-behavior percentages are vendor marketing stats (Dice's 31% contradicts them); Cursor Ultra/$200 and top-tier Copilot pricing are third-party-reported, directional only. None of these caveats changes the decision — they change the forecast: plan the individual tier at WakaTime numbers, and the business case survives because the business is the education channel.*