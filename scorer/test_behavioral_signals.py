#!/usr/bin/env python3
"""Adversarial construct-validity test for the behavioral scoring upgrade.

The scorer used to read Verification / Context Setting / Diagnose-vs-Retry
largely from PROMPT TEXT (keyword ceremony). This test proves the upgrade
measures BEHAVIOR:

  Case A  REAL POWER USER   terse prompts, genuine tool verification (runs
                            tests, reads the diff, diagnoses failures) ->
                            Verification/Context/Diagnose must RISE vs old.
  Case B  CEREMONY FAKER    says all the right words ("let me verify", "here's
                            my full context") but does NO real tool
                            verification -> must NOT rise (ideally fall).

We compare the NEW engine against a faithful reconstruction of the OLD
(keyword-primary) scorers, monkeypatched over the same parse/session infra, so
the before/after is a true apples-to-apples on one module.

Exit 0 = pass. Stdlib only.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine  # noqa: E402

FAILURES = []
NA = engine.NA


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


# ------------------------------------------------------------ OLD scorers ----
# Faithful copies of the pre-upgrade keyword-primary implementations (verbatim
# from git history) so we can score the SAME turns both ways.
def _old_score_verification(turn, ctx):
    tool_names = [t["name"] for t in turn["tools"]]
    mut_idx = [i for i, n in enumerate(tool_names) if n in engine.MUTATING_TOOLS]
    if not mut_idx:
        return NA
    edits = len(mut_idx)
    verify_cmd = ""
    for i, t in enumerate(turn["tools"]):
        if t["name"] == "Bash" and i >= mut_idx[0]:
            cmd = str((t["input"] or {}).get("command", ""))
            if engine.is_verify_command(cmd):
                verify_cmd = cmd
                break
    ctx.update(edits=edits, mut_files="-", verify_cmd=verify_cmd[:60])
    if verify_cmd:
        return 95
    nxt = turn.get("next_prompt") or ""
    if engine.MANUAL_VERIFY_RE.search(nxt):
        return 75
    if engine.FAILURE_LANG_RE.search(nxt):
        return 40
    return 15


def _old_score_context_setting(turn, ctx, state=None):
    p = turn["prompt"]
    words = len(p.split())
    files = len(engine.PATH_RE.findall(p)) + len(engine.BACKTICK_RE.findall(p))
    constraints = len(engine.CONSTRAINT_RE.findall(p))
    score = min(words, 60) / 60.0 * 40 + min(files, 3) * 12 + min(constraints, 4) * 8
    if turn["index"] > 1 and words >= 15:
        score += 20
    bare_imperative = engine._first_word(p) in engine.IMPERATIVE_OPENERS and words < 8
    if bare_imperative:
        score = min(score, 15)
    if words < 4:
        score = min(score, 10)
    is_question = (("?" in p and words >= 4) or bool(engine.UNDERSTANDING_RE.search(p)))
    turn_mutates = any(t["name"] in engine.MUTATING_TOOLS for t in turn["tools"])
    if is_question and not turn_mutates and not bare_imperative and words >= 4:
        score = max(score, 55)
    ctx.update(words=words, files=files, constraints=constraints,
               opener=" ".join(p.split()[:4]), bare_imperative=bare_imperative)
    return engine._clamp(score)


def _old_score_diagnose_vs_retry(turn, ctx, state):
    p = turn["prompt"]
    failure_ctx = state["prev_tool_error"] or bool(engine.FAILURE_LANG_RE.search(p))
    sim = engine._token_similarity(p, state["prev_prompt"])
    ctx.update(sim=int(sim * 100), words=len(p.split()), opener=" ".join(p.split()[:4]))
    if not failure_ctx:
        return NA
    words = len(p.split())
    if engine.BARE_RETRY_RE.match(p) or (words < 6 and not engine.ERROR_EVIDENCE_RE.search(p)):
        ctx["bare_retry"] = True
        return 8 if sim > 0.3 or words <= 4 else 15
    score = 15
    if words >= 12:
        score += 20
    if words >= 25:
        score += 10
    if engine.HYPOTHESIS_RE.search(p):
        score += 20
    if engine.ERROR_EVIDENCE_RE.search(p) or engine.PATH_RE.search(p):
        score += 15
    if engine.MANUAL_VERIFY_RE.search(p):
        score += 20
    if sim > 0.5:
        score -= 15
    return engine._clamp(score)


NEW = (engine.score_verification, engine.score_context_setting,
       engine.score_diagnose_vs_retry)
OLD = (_old_score_verification, _old_score_context_setting,
       _old_score_diagnose_vs_retry)


def score_with(turns, which):
    engine.score_verification, engine.score_context_setting, \
        engine.score_diagnose_vs_retry = which
    try:
        return engine.score_session([dict(t) for t in turns])
    finally:
        engine.score_verification, engine.score_context_setting, \
            engine.score_diagnose_vs_retry = NEW


def avg_dim(results, key):
    vals = [r["dims"][key] for r in results if key in r["dims"]]
    return round(sum(vals) / len(vals), 1) if vals else None


# ----------------------------------------------------------------- turns ----
def mk_turn(index, prompt, tools):
    return {
        "index": index, "uuid": f"t{index}", "prompt": prompt, "tools": tools,
        "n_records": 1, "complete": True, "sid": "s", "next_prompt": None,
        "permission_mode": "", "bootstrap": False,
    }


def bash(cmd, ok=True):
    return {"name": "Bash", "input": {"command": cmd}, "ok": ok}


def edit(fp):
    return {"name": "Edit", "input": {"file_path": fp}, "ok": True}


def read(fp):
    return {"name": "Read", "input": {"file_path": fp}, "ok": True}


def link(turns):
    for i in range(len(turns) - 1):
        turns[i]["next_prompt"] = turns[i + 1]["prompt"]
    return turns


# === Case A: REAL POWER USER — terse prompts, real tool verification ===
# Reads CLAUDE.md, edits, RUNS TESTS, READS THE DIFF, diagnoses a failure by
# inspecting before re-running. Never narrates "let me verify / here is my
# context". Old keyword scorer should badly under-credit this.
power = link([
    mk_turn(1, "wire retat dosing into the tracker",
            [read("/proj/CLAUDE.md"), read("/proj/tracker.py"),
             edit("/proj/tracker.py"),
             bash("pytest tests/test_tracker.py -q", ok=True)]),
    mk_turn(2, "now the weekly rollup",
            [edit("/proj/rollup.py"),
             bash("pytest tests/test_rollup.py -q", ok=False),
             read("/proj/rollup.py"),                       # inspect the diff
             bash("git diff rollup.py")]),
    mk_turn(3, "fix that",                                  # terse, but diagnoses
            [read("/proj/rollup.py"), bash("grep -n KeyError rollup.py"),
             edit("/proj/rollup.py"),
             bash("pytest tests/test_rollup.py -q", ok=True)]),
    mk_turn(4, "add the CLI flag",
            [edit("/proj/cli.py"),
             read("/proj/cli.py"), bash("git diff cli.py")]),   # verify by reading the diff, NO test cmd
])

# === Case B: CEREMONY FAKER — all the words, none of the behavior ===
# Long "context" preambles, "let me verify", "I ran it and it passes" — but the
# tools are only Writes. No test run, no diff read, blind retry after failure.
faker = link([
    mk_turn(1, "Here is my full context: the tracker module, the rollup module, "
               "the CLI, and the constraint that we reuse the existing schema. "
               "Please verify everything works and make sure it is correct.",
            [edit("/proj/tracker.py")]),
    mk_turn(2, "Let me verify this carefully and confirm the tests pass. I want "
               "to make sure the weekly rollup is verified and correct.",
            [edit("/proj/rollup.py")]),               # NO test run, NO diff read
    mk_turn(3, "It doesn't work, the rollup is broken. I have verified it fails. "
               "Let me make sure we fix this and confirm it is correct now.",
            [edit("/proj/rollup.py")]),               # blind retry, no inspection
    mk_turn(4, "I ran it and it passes now, verified and confirmed working great.",
            [edit("/proj/cli.py")]),                  # claims verification, did none
])

DIMS = ("verification", "context_setting", "diagnose_vs_retry")

print("== Case A: REAL POWER USER (terse prompts + genuine tool verification) ==")
a_old = score_with(power, OLD)
a_new = score_with(power, NEW)
print(f"{'dimension':<22}{'OLD':>7}{'NEW':>7}{'delta':>8}")
# context_setting + diagnose_vs_retry must RISE meaningfully (they were nearly
# uncreditable under the keyword scorer). Verification was ALREADY tool-based
# for test-run turns, so its aggregate can't leap; the construct-validity gain
# there is the diff-read turn (turn 4: verify by reading the diff, NO test
# command) which the old scorer scored 15 and the new scores >=75 — asserted
# separately below. In aggregate verification must at least not DROP.
for d in ("context_setting", "diagnose_vs_retry"):
    o, n = avg_dim(a_old, d), avg_dim(a_new, d)
    print(f"{d:<22}{(o if o is not None else 0):>7}{(n if n is not None else 0):>7}"
          f"{((n or 0) - (o or 0)):>8.1f}")
    check(f"A: {d} RISES meaningfully (>=15)", (n or 0) - (o or 0) >= 15,
          f"{o} -> {n}")
vo, vn = avg_dim(a_old, "verification"), avg_dim(a_new, "verification")
print(f"{'verification':<22}{vo:>7}{vn:>7}{(vn - vo):>8.1f}")
check("A: verification does not drop", vn >= vo - 0.1, f"{vo} -> {vn}")
# the diff-read verification turn: old keyword scorer = 15, new behavioral >= 75
t4_old = next(r for r in a_old if r["turn"] == 4)["dims"].get("verification")
t4_new = next(r for r in a_new if r["turn"] == 4)["dims"].get("verification")
check("A: diff-read verify turn RISES (old<=20 -> new>=75)",
      (t4_old or 0) <= 20 and (t4_new or 0) >= 75, f"{t4_old} -> {t4_new}")

print("\n== Case B: CEREMONY FAKER (right words, zero real verification) ==")
b_old = score_with(faker, OLD)
b_new = score_with(faker, NEW)
print(f"{'dimension':<22}{'OLD':>7}{'NEW':>7}{'delta':>8}")
for d in DIMS:
    o, n = avg_dim(b_old, d), avg_dim(b_new, d)
    print(f"{d:<22}{(o if o is not None else 0):>7}{(n if n is not None else 0):>7}"
          f"{((n or 0) - (o or 0)):>8.1f}")
    check(f"B: {d} does NOT rise (new <= old)", (n or 0) <= (o or 0) + 0.1,
          f"{o} -> {n}")

print("\n== Cross-check: power user now beats faker on all 3 behavioral dims ==")
for d in DIMS:
    pa, fb = avg_dim(a_new, d), avg_dim(b_new, d)
    check(f"X: power > faker on {d}", (pa or 0) > (fb or 0), f"power={pa} faker={fb}")

print(f"\n{'ALL CHECKS PASSED' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}")
sys.exit(0 if not FAILURES else 1)
