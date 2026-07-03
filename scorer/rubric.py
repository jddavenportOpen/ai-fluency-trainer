#!/usr/bin/env python3
"""Behavior rubric for the AI Fluency scorer — dimensions as data.

Each dimension maps to a numbered row of the evidence-backed rubric in
RESEARCH.md §4 ("research_id"). Design rules honored (§4/§7):
  * NEVER score raw speed or acceptance rate as skill.
  * Composite scoring; verification/diagnosis weighted over throughput.
  * Fit-to-task, not elevation: dims that don't apply to a turn score a
    neutral 60, they are not penalized.
  * All scoring is local; tips are behavioral prescriptions, not grades.

Tip templates use str.format-style placeholders filled from the per-turn
feature context computed in engine.py. Missing keys render as "?" (fail-open).
"""

NEUTRAL = 60          # score for "dimension not applicable this turn"
XP_MIN, XP_SPAN = 10, 40   # xp = round(10 + 40 * weighted_avg/100) -> 10..50

DIMENSIONS = [
    {
        "key": "context_setting",
        "name": "Context Setting",
        "research_id": 6,
        "weight": 1.0,
        "tips": [
            "Your prompt was {words} words with {files} file reference(s) and {constraints} constraint(s) — name the exact files (app/auth.py-style paths) and state what must be reused or must not change.",
            "\"{opener}...\" is a bare imperative into a codebase Claude has to guess about. Add the goal, the files involved, and one constraint sentence (\"must use the existing X\", \"don't touch Y\").",
            "Give Claude the same brief you'd give a new teammate: which files, which constraints, what done looks like. This turn had {files} file reference(s) and {constraints} constraint marker(s).",
        ],
        "highlights": [
            "Strong context: {words} words, {files} file reference(s), {constraints} explicit constraint(s) — Claude didn't have to guess your codebase.",
            "You anchored the task to real files and explicit constraints — that's the shape of expert prompts.",
        ],
    },
    {
        "key": "plan_first",
        "name": "Plan Before Build",
        "research_id": 1,
        "weight": 1.0,
        "tips": [
            "Code got written before any plan or exploration this session. Next time open with \"read X and Y, then give me a plan — don't code yet\" and review the approach first.",
            "This was a cold-start \"do it\" delegation: the first mutating edit landed with no prior read/plan step. Ask for a short plan before the first Write/Edit.",
            "You skipped the planning beat. Experts front-load ~70% of their decisions into planning — request a plan and approve it before implementation.",
        ],
        "highlights": [
            "You made Claude plan and explore before touching code — the highest-leverage habit in the rubric.",
            "Plan-first sequencing: reads/plan came before the first mutating edit. Keep opening sessions this way.",
        ],
    },
    {
        "key": "verification",
        "name": "Verification",
        "research_id": 2,
        "weight": 1.6,
        "tips": [
            "You shipped {edits} edit(s) without running anything — end the turn with a test run or ask Claude to prove it works before you accept it.",
            "{edits} file mutation(s), zero test/build/run commands this turn. Demand evidence: \"run the tests\" or \"start it and curl the endpoint\".",
            "Nothing verified this change ({edits} edit(s) to {mut_files}). Unverified AI output is the #1 skill-eroding behavior — make a test run part of every mutating turn.",
        ],
        "highlights": [
            "Every mutation was verified in-turn ({verify_cmd}) — you demanded evidence instead of trusting the diff.",
            "Edit → run → prove loop closed this turn. That verification habit is the one that grows with expertise.",
        ],
    },
    {
        "key": "diagnose_vs_retry",
        "name": "Diagnose vs Blind Retry",
        "research_id": 5,
        "weight": 1.4,
        "tips": [
            "\"{opener}...\" is a blind retry — it adds no new information. Paste the actual error text or logs, or state a hypothesis (\"I think it's the session cookie\").",
            "After a failure, your prompt was {words} words and ~{sim}% identical to the last one. Diagnose instead: what exactly failed, where, and what do you suspect?",
            "You reported \"broken\" without evidence. Copy the error output, name the file, or describe what you observed — give Claude something to reason from.",
        ],
        "highlights": [
            "You turned a failure into a diagnosis — error details, observations, and a hypothesis instead of \"try again\".",
            "Textbook failure handling: you added new information (what broke, when, and why you think so) rather than re-rolling the dice.",
        ],
    },
    {
        "key": "understanding_seeking",
        "name": "Understanding Seeking",
        "research_id": 7,
        "weight": 0.8,
        "tips": [
            "{total_turns} turns and no \"why\"/\"explain\"/\"walk me through\" yet — pure delegation erodes your own skill. Once in a while, make Claude teach you the tradeoff behind a choice.",
            "You haven't interrogated any output this session. Try \"why did you do it this way — what's the tradeoff?\" on the next non-trivial change.",
            "All do-it-for-me so far ({und_turns}/{total_turns} understanding turns). Occasionally ask Claude to critique its own solution or explain the design.",
        ],
        "highlights": [
            "You asked for the reasoning, not just the result (\"why / walk me through the tradeoff\") — that's how AI use builds skill instead of replacing it.",
            "Healthy understanding ratio ({und_turns}/{total_turns} turns) — you delegate the typing, not the thinking.",
        ],
    },
    {
        "key": "scope_discipline",
        "name": "Scope Discipline",
        "research_id": 10,
        "weight": 0.8,
        "tips": [
            "This prompt bundled {verbs} distinct deliverables ({verb_list}) — kitchen-sink turns produce monolithic unreviewable changes. Split them: one coherent task per prompt.",
            "\"also do X and Y and deploy it\" in one breath: {verbs} tasks, {mut_count} file(s) touched. Sequence them so you can verify each piece before the next.",
            "Big-batch delegation detected. Small batches are where AI benefit concentrates — carve this into single-task prompts you can review one at a time.",
        ],
        "highlights": [
            "One coherent task, cleanly scoped — small batches keep every change reviewable and verifiable.",
            "Tight scope this turn: a single deliverable with its test, not a kitchen sink.",
        ],
    },
    {
        "key": "iteration_discipline",
        "name": "Iteration & Scrutiny",
        "research_id": 4,   # composite of #4 (iteration) + #9 (critical challenge)
        "weight": 1.0,
        "tips": [
            "\"{opener}\" accepted the output with zero scrutiny. Read the diff and push back on one thing — even \"what edge cases does this miss?\" beats a bare ok.",
            "You accepted the previous change without engaging with it. Ask for alternatives, question a choice, or point at something it might have missed.",
            "Bare acceptance after a large change. The turn after a big edit is where experts scrutinize — request a self-critique or a second look at edge cases.",
        ],
        "highlights": [
            "You caught something the AI missed and fed it back with specifics — the strongest engagement signal there is.",
            "You engaged with the output — refined it, challenged it, or built on it — instead of rubber-stamping.",
        ],
    },
]

# Shown when no applicable dimension is genuinely weak (nothing to fix this turn)
GENERAL_TIPS = [
    "No gap this turn — keep the loop tight: context in, plan approved, change verified.",
    "Solid turn. Next lever: make Claude prove each change with a test run before you accept it.",
    "Nothing to fix here — consider asking for a self-critique on the next big change to stress-test it.",
]

DIM_BY_KEY = {d["key"]: d for d in DIMENSIONS}
TOTAL_WEIGHT = sum(d["weight"] for d in DIMENSIONS)


class _SafeDict(dict):
    def __missing__(self, key):
        return "?"


def fill(template, ctx):
    """Format a tip/highlight template; never raise."""
    try:
        return template.format_map(_SafeDict(ctx or {}))
    except Exception:
        return template


def pick_template(dim_key, kind, turn_index, ctx):
    """Deterministically pick + fill a template ('tips'|'highlights')."""
    dim = DIM_BY_KEY.get(dim_key)
    if not dim:
        return ""
    templates = dim.get(kind) or [""]
    return fill(templates[turn_index % len(templates)], ctx)


def weighted_average(dims):
    """Weighted average of a {key: 0-100} dict using rubric weights."""
    num = den = 0.0
    for key, score in dims.items():
        w = DIM_BY_KEY.get(key, {}).get("weight", 1.0)
        num += w * score
        den += w
    return (num / den) if den else 0.0


def xp_for(dims):
    """XP per turn: 10..50, driven by the weighted composite (never by speed/volume)."""
    return int(round(XP_MIN + XP_SPAN * weighted_average(dims) / 100.0))
