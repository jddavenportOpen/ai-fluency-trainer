#!/usr/bin/env python3
"""Unit test for the fit-to-task (L4 "calibrated delegation") carve-out.

A short, deterministic, single-target mechanical edit ("rename `getUser` to
`fetchUser` in auth.py") must NOT be scored low on context_setting / plan_first —
those dims are NOT APPLICABLE and are omitted. A vague under-specified prompt
("fix the bug") must still be scored (and scored low) on them.

Exit 0 = pass, 1 = fail. Stdlib only.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine  # noqa: E402

FAILURES = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def mk_turn(index, prompt, edit_files=(), also_tools=()):
    tools = [{"name": "Edit", "input": {"file_path": f}, "ok": True} for f in edit_files]
    tools += list(also_tools)
    return {
        "index": index, "uuid": f"t{index}", "prompt": prompt, "tools": tools,
        "n_records": 1, "complete": True, "sid": "s", "next_prompt": None,
        "permission_mode": "", "bootstrap": False,
    }


# ---- 1. is_calibrated_oracle: positives (should be True) ----
POS = [
    ("rename `getUser` to `fetchUser` in auth.py", ["auth.py"]),
    ("bump the version to 1.2.0 in package.json", ["package.json"]),
    ("change the timeout constant to 30 in `config.ts`", ["config.ts"]),
    ("uncomment the DEBUG line in settings.py", ["settings.py"]),
    ("sort the imports in utils.py", ["utils.py"]),
]
# ---- 2. negatives (should be False: vague, multi-scope, question, or no edit) ----
NEG = [
    ("fix the bug", ["app.py"]),                       # not mechanical + no target
    ("make it faster", ["app.py"]),                    # vague
    ("add auth to the app", ["app.py"]),               # 'add'+no concrete target
    ("rename getUser to fetchUser and also update the tests and deploy it", ["a.py"]),  # multi-scope
    ("should I rename `getUser` to `fetchUser`?", ["auth.py"]),  # a question, not a directive
    ("rename `getUser` to `fetchUser` in auth.py", []),          # no edit made -> not an oracle edit
    ("rename `getUser` across auth.py and models.py", ["auth.py", "models.py"]),  # multi-file
]

print("== 1. is_calibrated_oracle positives ==")
for prompt, files in POS:
    check(f"POS: {prompt[:48]}", engine.is_calibrated_oracle(mk_turn(2, prompt, files)))

print("\n== 2. is_calibrated_oracle negatives ==")
for prompt, files in NEG:
    check(f"NEG: {prompt[:48]}", not engine.is_calibrated_oracle(mk_turn(2, prompt, files)))

print("\n== 3. score_session omits context/plan for the calibrated oracle ==")
# A session: turn 1 sets context; turn 2 is a calibrated one-liner edit.
turns = [
    mk_turn(1, "Let's work on the auth module in auth.py; here is the goal and the constraint that we keep the existing session cookie.", []),
    mk_turn(2, "rename `getUser` to `fetchUser` in auth.py", ["auth.py"]),
]
res = engine.score_session(turns)
oracle = next(r for r in res if r["turn"] == 2)
check("oracle turn omits context_setting", "context_setting" not in oracle["dims"],
      f"dims={list(oracle['dims'])}")
check("oracle turn omits plan_first", "plan_first" not in oracle["dims"],
      f"dims={list(oracle['dims'])}")
check("oracle turn still scores verification (it mutated)", "verification" in oracle["dims"])

print("\n== 4. a VAGUE one-liner edit is still scored (and low) on plan_first ==")
turns2 = [mk_turn(1, "fix the bug", ["app.py"])]
res2 = engine.score_session(turns2)
vague = res2[0]
check("vague turn keeps plan_first", "plan_first" in vague["dims"],
      f"dims={list(vague['dims'])}")
check("vague turn plan_first is low (<=45)", vague["dims"].get("plan_first", 100) <= 45,
      f"plan_first={vague['dims'].get('plan_first')}")

print(f"\n{'ALL CHECKS PASSED' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}")
sys.exit(0 if not FAILURES else 1)
