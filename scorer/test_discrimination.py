#!/usr/bin/env python3
"""Acceptance test for the AI Fluency scorer.

1. Regenerates fixtures.
2. Batch-scores good-user + bad-user with --dry-run; prints per-dim averages
   side by side.
3. Asserts:
     - good overall weighted avg exceeds bad by >= 20 points
     - good >= bad on at least 6 of 7 dims
     - good STRICTLY beats bad on context_setting, verification, diagnose_vs_retry
4. Idempotency: incremental mode run twice (same transcript, temp
   AI_FLUENCY_DIR) produces turn_score events exactly once per turn.
5. Robustness: malformed + empty transcripts must exit 0 and not crash.

Exit 0 = pass, 1 = fail. Stdlib only.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIXTURES = os.path.join(ROOT, "fixtures")
SCORE = os.path.join(HERE, "score_turn.py")
PY = sys.executable

FAILURES = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def batch_summary(path, env=None):
    out = subprocess.run([PY, SCORE, "--batch", path, "--dry-run"],
                         capture_output=True, text=True, env=env)
    print(out.stdout)
    if out.returncode != 0:
        print(out.stderr)
        raise RuntimeError(f"batch scorer exited {out.returncode}")
    for line in out.stdout.splitlines():
        if line.startswith("SUMMARY "):
            return json.loads(line[len("SUMMARY "):])
    raise RuntimeError("no SUMMARY line in batch output")


def main():
    print("== 1. regenerate fixtures ==")
    r = subprocess.run([PY, os.path.join(FIXTURES, "make_fixtures.py")],
                       capture_output=True, text=True)
    print(r.stdout.strip())
    check("fixtures regenerated", r.returncode == 0, r.stderr.strip())

    good_t = os.path.join(FIXTURES, "out", "good-user.transcript.jsonl")
    bad_t = os.path.join(FIXTURES, "out", "bad-user.transcript.jsonl")

    print("\n== 2. batch score (dry-run) ==")
    good = batch_summary(good_t)
    bad = batch_summary(bad_t)

    print("== per-dim averages: good vs bad ==")
    print(f"{'dimension':<24}{'good':>7}{'bad':>7}{'delta':>8}")
    wins = strict = {}
    ge_count = 0
    strict_needed = {"context_setting", "verification", "diagnose_vs_retry"}
    strict_ok = True
    for k in good["avg_dims"]:
        g, b = good["avg_dims"][k], bad["avg_dims"][k]
        print(f"{k:<24}{g:>7.1f}{b:>7.1f}{g - b:>8.1f}")
        if g >= b:
            ge_count += 1
        if k in strict_needed and not g > b:
            strict_ok = False
    gw, bw = good["weighted_avg"], bad["weighted_avg"]
    print(f"{'WEIGHTED OVERALL':<24}{gw:>7.1f}{bw:>7.1f}{gw - bw:>8.1f}")

    print("\n== 3. assertions ==")
    check("good weighted avg exceeds bad by >= 20", gw - bw >= 20,
          f"delta={gw - bw:.1f}")
    check("good >= bad on at least 6 of 7 dims", ge_count >= 6, f"ge={ge_count}/7")
    check("good strictly beats bad on context_setting/verification/diagnose_vs_retry",
          strict_ok)

    print("\n== 4. idempotency (incremental mode, run twice) ==")
    tmp = tempfile.mkdtemp(prefix="ai-fluency-test-")
    try:
        env = dict(os.environ, AI_FLUENCY_DIR=tmp)
        tcopy = os.path.join(tmp, "copy.transcript.jsonl")
        shutil.copy(good_t, tcopy)
        for i in (1, 2):
            r = subprocess.run([PY, SCORE, "--session", "idem-test",
                                "--transcript", tcopy],
                               capture_output=True, text=True, env=env)
            check(f"incremental run {i} exits 0", r.returncode == 0, r.stderr.strip())
        events_path = os.path.join(tmp, "events.jsonl")
        events = []
        if os.path.exists(events_path):
            with open(events_path) as f:
                events = [json.loads(l) for l in f if l.strip()]
        scores = [e for e in events if e["event"] == "turn_score"]
        turns_seen = [e["data"]["turn"] for e in scores]
        n_turns = good["turns"]
        check("turn_score events exactly once per turn",
              sorted(turns_seen) == list(range(1, n_turns + 1)),
              f"turns_seen={sorted(turns_seen)} expected 1..{n_turns}")
        for e in scores:
            d = e["data"]
            shape_ok = (isinstance(d["turn"], int) and isinstance(d["xp"], int)
                        and isinstance(d["tip"], str) and isinstance(d["highlight"], str)
                        and all(isinstance(v, int) and 0 <= v <= 100 for v in d["dims"].values())
                        and 10 <= d["xp"] <= 50)
            if not shape_ok:
                check("event schema shape", False, json.dumps(d)[:120])
                break
        else:
            check("event schema shape (turn:int dims:0-100 xp:10-50 tip/highlight:str)", True)

        print("\n== 5. robustness (malformed + empty input) ==")
        mal = os.path.join(tmp, "malformed.jsonl")
        with open(mal, "w") as f:
            f.write('{"type": "user", "message": {"content": "hi"\nGARBAGE not json\n{"truncated": ')
        empty = os.path.join(tmp, "empty.jsonl")
        open(empty, "w").close()
        for name, path in [("malformed", mal), ("empty", empty),
                           ("nonexistent", os.path.join(tmp, "nope.jsonl"))]:
            r = subprocess.run([PY, SCORE, "--session", f"rob-{name}",
                                "--transcript", path],
                               capture_output=True, text=True, env=env)
            check(f"{name} transcript: incremental exits 0", r.returncode == 0,
                  r.stderr.strip()[:120])
            r = subprocess.run([PY, SCORE, "--batch", path, "--dry-run"],
                               capture_output=True, text=True, env=env)
            check(f"{name} transcript: batch exits 0", r.returncode == 0,
                  r.stderr.strip()[:120])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{'ALL CHECKS PASSED' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}")
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
