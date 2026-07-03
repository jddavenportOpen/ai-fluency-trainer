#!/usr/bin/env python3
"""Tests for the LLM judge layer (judge.py + engine blending + score_turn wiring).

  a) Judge DISABLED => nothing changes: engine output identical with/without the
     judge plumbing, batch stdout bit-identical, and test_discrimination.py
     still passes.
  b) FAKE judge (no API): 50/50 blend math, `judged` flag, event tagging,
     NA preservation, fail-open on a raising judge, budget cap, JSON extraction.
  c) LIVE smoke: one real `claude -p` haiku call on the good-user fixture
     turn 3 ("walk me through the tradeoff") — prints scores + reason +
     latency/cost, asserts valid ints and NO event recursion (both the real
     ~/.ai-fluency/events.jsonl and the sandbox events file stay untouched).

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
GOOD_T = os.path.join(FIXTURES, "out", "good-user.transcript.jsonl")
SCORE = os.path.join(HERE, "score_turn.py")
DISCRIM = os.path.join(HERE, "test_discrimination.py")
PY = sys.executable
REAL_EVENTS = os.path.expanduser("~/.ai-fluency/events.jsonl")

sys.path.insert(0, HERE)
import engine        # noqa: E402
import judge as judge_mod   # noqa: E402
import score_turn    # noqa: E402

FAILURES = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def line_count(path):
    try:
        with open(path) as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def ensure_fixtures():
    if not os.path.exists(GOOD_T):
        subprocess.run([PY, os.path.join(FIXTURES, "make_fixtures.py")],
                       capture_output=True, text=True)


def clean_env(tmp):
    env = {k: v for k, v in os.environ.items() if k != "AI_FLUENCY_JUDGE"}
    env["AI_FLUENCY_DIR"] = tmp
    return env


# ------------------------------------------------------------------ a) off ----
def test_disabled(tmp):
    print("\n== a) judge disabled => bit-identical behavior ==")
    env_unset = clean_env(tmp)
    env_zero = dict(env_unset, AI_FLUENCY_JUDGE="0")

    # is_enabled false with no env/config
    old = os.environ.pop("AI_FLUENCY_JUDGE", None)
    old_dir = os.environ.get("AI_FLUENCY_DIR")
    os.environ["AI_FLUENCY_DIR"] = tmp
    try:
        check("is_enabled() is False by default", judge_mod.is_enabled() is False)
        turns = engine.parse_transcript(GOOD_T)
        base = engine.score_session(engine.parse_transcript(GOOD_T))
        with_none = engine.score_session(turns, judge=None)
        check("score_session(judge=None) identical to score_session()",
              base == with_none)
        check("no turn tagged judged when judge is off",
              all(r["judged"] is False for r in base))
    finally:
        if old is not None:
            os.environ["AI_FLUENCY_JUDGE"] = old
        if old_dir is None:
            os.environ.pop("AI_FLUENCY_DIR", None)
        else:
            os.environ["AI_FLUENCY_DIR"] = old_dir

    # batch stdout bit-identical: env-unset vs explicitly disabled
    out1 = subprocess.run([PY, SCORE, "--batch", GOOD_T, "--dry-run"],
                          capture_output=True, text=True, env=env_unset)
    out2 = subprocess.run([PY, SCORE, "--batch", GOOD_T, "--dry-run"],
                          capture_output=True, text=True, env=env_zero)
    check("batch --dry-run stdout bit-identical (unset vs AI_FLUENCY_JUDGE=0)",
          out1.returncode == 0 and out1.stdout == out2.stdout)
    check("no [J] judged marker in disabled batch output",
          "[J]" not in out1.stdout)

    # full discrimination suite still passes
    r = subprocess.run([PY, DISCRIM], capture_output=True, text=True, env=env_unset)
    check("test_discrimination.py passes with judge code in place",
          r.returncode == 0, (r.stdout.splitlines() or [""])[-1])


# ----------------------------------------------------------------- b) fake ----
def test_fake_judge(tmp):
    print("\n== b) fake judge: blend math, NA preservation, tagging, fail-open ==")
    turns = engine.parse_transcript(GOOD_T)
    baseline = engine.score_session(engine.parse_transcript(GOOD_T))

    FAKE = {"understanding_seeking": 100, "diagnose_vs_retry": 0,
            "context_setting": 50, "reason": "fake"}
    calls = []   # (turn_index, heuristic_dims passed to the judge)

    def fake_judge(turn, heuristic_dims):
        calls.append((turn["index"], dict(heuristic_dims)))
        return dict(FAKE)

    judged = engine.score_session(engine.parse_transcript(GOOD_T), judge=fake_judge)
    check("same number of results", len(judged) == len(baseline))
    check("judge called once per complete turn", len(calls) == len(baseline))

    by_turn = {i: h for i, h in calls}
    blend_ok = na_ok = flag_ok = other_ok = True
    for b, j in zip(baseline, judged):
        heur = by_turn.get(b["turn"], {})
        for k in engine.JUDGE_DIMS:
            if k in heur:   # applicable -> must be exact 50/50 blend, int-rounded
                expect = int(round((heur[k] + FAKE[k]) / 2.0))
                if j["dims"][k] != expect:
                    blend_ok = False
                    print(f"    turn {b['turn']} {k}: got {j['dims'][k]} expected {expect}")
            else:           # NA -> never judged, emits NEUTRAL like the baseline
                if j["dims"][k] != b["dims"][k] or j["dims"][k] != engine.NEUTRAL:
                    na_ok = False
        for k in b["dims"]:
            if k not in engine.JUDGE_DIMS and j["dims"][k] != b["dims"][k]:
                other_ok = False
        if j["judged"] is not bool(heur):
            flag_ok = False
    check("50/50 blend math exact on all applicable judge dims", blend_ok)
    check("NA judge dims never blended (stay NEUTRAL, identical to baseline)", na_ok)
    check("non-judge dims untouched by the judge", other_ok)
    check("judged flag set exactly when >=1 dim blended", flag_ok)
    check("judge only ever receives applicable judge dims",
          all(set(h) <= set(engine.JUDGE_DIMS) and all(v is not None for v in h.values())
              for _, h in calls))
    # fixture sanity: turn 1 has understanding_seeking NA (total_turns <= 2)
    check("fixture exercises the NA path",
          any(set(engine.JUDGE_DIMS) - set(h) for _, h in calls))

    # event tagging: judged results carry "judged": true in turn_score data
    old_dir = os.environ.get("AI_FLUENCY_DIR")
    os.environ["AI_FLUENCY_DIR"] = tmp
    try:
        score_turn.append_events("judge-tag-test", judged)
        with open(os.path.join(tmp, "events.jsonl")) as f:
            evs = [json.loads(l) for l in f if l.strip()]
        tagged = [e for e in evs if e["sid"] == "judge-tag-test"]
        check("turn_score events tagged judged:true when blended",
              len(tagged) == len(judged) and bool(tagged) and all(
                  (e["data"].get("judged") is True) == r["judged"]
                  for e, r in zip(tagged, judged)))
        # and a non-judged result set stays untagged
        score_turn.append_events("judge-untag-test", baseline)
        with open(os.path.join(tmp, "events.jsonl")) as f:
            evs = [json.loads(l) for l in f if l.strip()]
        untagged = [e for e in evs if e["sid"] == "judge-untag-test"]
        check("unjudged turn_score events carry no judged key",
              untagged and all("judged" not in e["data"] for e in untagged))
    finally:
        if old_dir is None:
            os.environ.pop("AI_FLUENCY_DIR", None)
        else:
            os.environ["AI_FLUENCY_DIR"] = old_dir

    # fail-open: a raising judge leaves heuristics untouched
    def bomb(turn, dims):
        raise RuntimeError("judge exploded")
    boomed = engine.score_session(engine.parse_transcript(GOOD_T), judge=bomb)
    check("raising judge => results identical to baseline, judged stays False",
          boomed == baseline)

    # garbage judge output ignored
    def garbage(turn, dims):
        return {"understanding_seeking": "high", "nonsense": 1}
    garbaged = engine.score_session(engine.parse_transcript(GOOD_T), judge=garbage)
    check("non-numeric judge scores ignored (heuristics stand)",
          garbaged == baseline)

    # budget cap: over-budget => judge_turn returns None without calling the CLI
    old_dir = os.environ.get("AI_FLUENCY_DIR")
    old_j = os.environ.get("AI_FLUENCY_JUDGE")
    os.environ["AI_FLUENCY_DIR"] = tmp
    os.environ["AI_FLUENCY_JUDGE"] = "1"
    orig_call = judge_mod._call_claude
    cli_calls = []
    judge_mod._call_claude = lambda p: cli_calls.append(1) or None
    try:
        os.makedirs(os.path.join(tmp, "state"), exist_ok=True)
        from datetime import date
        with open(os.path.join(tmp, "state", "judge_budget.json"), "w") as f:
            json.dump({"date": date.today().isoformat(),
                       "count": judge_mod.DEFAULT_DAILY_BUDGET}, f)
        res = judge_mod.judge_turn({"prompt": "why?", "tools": []}, {})
        check("over daily budget => None, CLI never invoked",
              res is None and not cli_calls)
    finally:
        judge_mod._call_claude = orig_call
        if old_dir is None:
            os.environ.pop("AI_FLUENCY_DIR", None)
        else:
            os.environ["AI_FLUENCY_DIR"] = old_dir
        if old_j is None:
            os.environ.pop("AI_FLUENCY_JUDGE", None)
        else:
            os.environ["AI_FLUENCY_JUDGE"] = old_j

    # defensive JSON extraction
    blob = 'Sure! Here is the score:\n```json\n{"understanding_seeking": 88, ' \
           '"diagnose_vs_retry": 60, "context_setting": 41.7, "reason": "ok {braces} inside"}\n``` done'
    got = judge_mod._clean_scores(judge_mod._extract_json_block(blob))
    check("extracts first {...} from prose/fenced output, coerces floats",
          got is not None and got["understanding_seeking"] == 88
          and got["context_setting"] == 42)
    check("unparseable text => None",
          judge_mod._extract_json_block("no json here at all") is None)


# ----------------------------------------------------------------- c) live ----
def test_live_smoke(tmp):
    print("\n== c) LIVE smoke: real haiku judge call on good-user turn 3 ==")
    # own sandbox: test (b) deliberately exhausted the shared sandbox's budget
    tmp = os.path.join(tmp, "live")
    os.makedirs(tmp, exist_ok=True)
    turns = engine.parse_transcript(GOOD_T)
    turn = turns[2]   # turn 3: "…why did you wrap the route… Walk me through the tradeoff."
    turn["prev_prompt"] = turns[1]["prompt"]
    print(f"  prompt under judgment: {turn['prompt'][:100]}...")

    # Recursion detection, two layers:
    #   1. AUTHORITATIVE: the judge subprocess inherits AI_FLUENCY_DIR=<sandbox>,
    #      so if the capture hooks fired inside it, events land in the sandbox
    #      events.jsonl. It must stay empty.
    #   2. Real ~/.ai-fluency/events.jsonl: other live sessions on this machine
    #      write there concurrently (raw line counts are racy), so instead
    #      assert no NEW line carries the judge prompt's unique marker text —
    #      UserPromptSubmit capture would have recorded the raw judge prompt.
    real_before = line_count(REAL_EVENTS)
    sandbox_events = os.path.join(tmp, "events.jsonl")
    sandbox_before = line_count(sandbox_events)
    MARKER = "grading ONE turn"   # unique to judge.build_prompt()

    old_dir = os.environ.get("AI_FLUENCY_DIR")
    old_j = os.environ.get("AI_FLUENCY_JUDGE")
    os.environ["AI_FLUENCY_DIR"] = tmp     # budget bookkeeping goes to the sandbox
    os.environ["AI_FLUENCY_JUDGE"] = "1"
    try:
        scores = judge_mod.judge_turn(
            turn, {"understanding_seeking": 90, "context_setting": 80})
    finally:
        if old_dir is None:
            os.environ.pop("AI_FLUENCY_DIR", None)
        else:
            os.environ["AI_FLUENCY_DIR"] = old_dir
        if old_j is None:
            os.environ.pop("AI_FLUENCY_JUDGE", None)
        else:
            os.environ["AI_FLUENCY_JUDGE"] = old_j

    check("live judge returned a result", scores is not None,
          "" if scores else "None — CLI missing/timeout/parse failure?")
    if scores:
        print(f"  judge scores : " + json.dumps(
            {k: scores[k] for k in judge_mod.JUDGE_DIMS}))
        print(f"  judge reason : {scores.get('reason', '')}")
        meta = judge_mod.last_call_meta
        print(f"  latency      : total={meta.get('duration_ms')}ms "
              f"api={meta.get('duration_api_ms')}ms")
        print(f"  cost         : ${meta.get('total_cost_usd')}")
        print(f"  usage        : {json.dumps(meta.get('usage'))}")
        check("all 3 dims present as ints 0-100",
              all(isinstance(scores.get(k), int) and 0 <= scores[k] <= 100
                  for k in judge_mod.JUDGE_DIMS))
        check("genuine tradeoff question scores understanding_seeking >= 60",
              scores["understanding_seeking"] >= 60,
              f"got {scores['understanding_seeking']}")

    sandbox_after = line_count(sandbox_events)
    check("NO recursion into sandbox events.jsonl (authoritative)",
          sandbox_after == sandbox_before, f"{sandbox_before} -> {sandbox_after}")
    real_after = line_count(REAL_EVENTS)
    new_real = []
    try:
        with open(REAL_EVENTS) as f:
            new_real = f.readlines()[real_before:]
    except OSError:
        pass
    check("no judge-prompt marker in new real events "
          f"(real file {real_before} -> {real_after}; concurrent sessions may write)",
          not any(MARKER in l for l in new_real))


def main():
    ensure_fixtures()
    tmp = tempfile.mkdtemp(prefix="ai-fluency-judge-test-")
    try:
        test_disabled(tmp)
        test_fake_judge(tmp)
        if os.environ.get("AI_FLUENCY_SKIP_LIVE") == "1":
            print("\n== c) LIVE smoke skipped (AI_FLUENCY_SKIP_LIVE=1) ==")
        else:
            test_live_smoke(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{'ALL CHECKS PASSED' if not FAILURES else 'FAILED: ' + ', '.join(FAILURES)}")
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
