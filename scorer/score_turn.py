#!/usr/bin/env python3
"""score_turn — CLI entrypoint for the AI Fluency scoring engine.

Incremental mode (what the Stop hook calls, detached):
    score_turn.py --session SID --transcript PATH
  Scores all COMPLETED turns not yet scored for SID, appends turn_score events
  to $AI_FLUENCY_DIR/events.jsonl. Idempotent via $AI_FLUENCY_DIR/state/SID.json
  (atomic replace + lock + re-read, safe under concurrent double-invocation).

Batch mode (tests / backfill):
    score_turn.py --batch PATH [--sid-override X] [--dry-run]
  Scores an entire transcript fresh, prints the per-turn table + a machine-
  readable SUMMARY line, and appends events unless --dry-run.

Fail-open: any exception logs to $AI_FLUENCY_DIR/scorer.log and exits 0.
Stdlib only.
"""
import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine   # noqa: E402
import judge as judge_mod   # noqa: E402
import rubric   # noqa: E402


def active_judge():
    """The judge callable when enabled (config 'judge': true or
    AI_FLUENCY_JUDGE=1), else None. Fail-open: never raises."""
    try:
        if judge_mod.is_enabled():
            return judge_mod.judge_turn
    except Exception:
        pass
    return None


def fluency_dir():
    return os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))


def log(msg):
    try:
        d = fluency_dir()
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "scorer.log"), "a") as f:
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            f.write(f"{ts} {msg}\n")
    except Exception:
        pass


def now_ts():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def append_events(sid, results):
    d = fluency_dir()
    os.makedirs(d, exist_ok=True)
    lines = []
    for r in results:
        data = {"turn": r["turn"], "dims": r["dims"], "xp": r["xp"],
                "tip": r["tip"], "highlight": r["highlight"]}
        if r.get("judged"):
            data["judged"] = True
        lines.append(json.dumps({
            "v": 1, "ts": now_ts(), "sid": sid, "event": "turn_score",
            "data": data,
        }, ensure_ascii=False))
    if lines:
        with open(os.path.join(d, "events.jsonl"), "a") as f:
            f.write("\n".join(lines) + "\n")


# ------------------------------------------------------------ state / lock ----
def _state_path(sid):
    safe = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in sid) or "unknown"
    return os.path.join(fluency_dir(), "state", f"{safe}.json")


def load_state(sid):
    try:
        with open(_state_path(sid)) as f:
            st = json.load(f)
        if isinstance(st, dict) and isinstance(st.get("scored"), list):
            return st
    except Exception:
        pass
    return {"scored": []}


def save_state_atomic(sid, scored_ids):
    path = _state_path(sid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump({"scored": sorted(scored_ids), "updated": now_ts()}, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class SessionLock:
    """Best-effort exclusive lock (O_CREAT|O_EXCL). Stale locks (>30s) are broken;
    on timeout we proceed anyway (fail-open) — the state re-read still suppresses
    most duplicates."""

    def __init__(self, sid, timeout=5.0):
        self.path = _state_path(sid) + ".lock"
        self.timeout = timeout
        self.acquired = False

    def __enter__(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                self.acquired = True
                return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(self.path) > 30:
                        os.unlink(self.path)   # stale lock from a dead scorer
                        continue
                except OSError:
                    pass
                time.sleep(0.1)
        return self   # proceed unlocked, fail-open

    def __exit__(self, *exc):
        if self.acquired:
            try:
                os.unlink(self.path)
            except OSError:
                pass
        return False


# ------------------------------------------------------------ session kind ----
def session_kind(sid, transcript):
    """"interactive" | "headless" | "unknown". Checks the capture hook's cache
    first, else peeks the transcript's entrypoint field ("cli" = interactive
    human session; sdk-cli/sdk-py/... = headless agent or one-shot)."""
    safe = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in sid) or "unknown"
    try:
        with open(os.path.join(fluency_dir(), "state", f"kind-{safe}.json")) as f:
            k = json.load(f).get("kind")
        if k in ("interactive", "headless"):
            return k
    except Exception:
        pass
    try:
        with open(transcript) as f:
            for i, line in enumerate(f):
                if i > 100:
                    break
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ep = rec.get("entrypoint")
                if ep:
                    return "interactive" if ep == "cli" else "headless"
    except Exception:
        pass
    return "unknown"


def score_all_configured():
    try:
        with open(os.path.join(fluency_dir(), "config.json")) as f:
            return bool(json.load(f).get("score_all_sessions"))
    except Exception:
        return False


# ------------------------------------------------------------------ modes ----
def run_incremental(sid, transcript):
    turns = engine.parse_transcript(transcript)
    # Incremental re-scores the whole session on every Stop (rolling state
    # needs the full history) and dedups emitted events by uuid. The judge is
    # the expensive part, so never re-judge a turn that was already scored.
    judge = active_judge()
    if judge is not None:
        already = set(load_state(sid)["scored"])
        base = judge

        def judge(turn, heuristic_dims):
            if turn.get("uuid") in already:
                return None
            return base(turn, heuristic_dims)
    results = engine.score_session(turns, judge=judge)
    if not results:
        log(f"incremental sid={sid}: no complete turns in {transcript}")
        return
    with SessionLock(sid):
        state = load_state(sid)             # re-read under lock: dup suppression
        scored = set(state["scored"])
        new = [r for r in results if r["uuid"] not in scored]
        if not new:
            return
        append_events(sid, new)
        scored.update(r["uuid"] for r in new)
        save_state_atomic(sid, scored)
    log(f"incremental sid={sid}: scored {len(new)} new turn(s) "
        f"({[r['turn'] for r in new]}) from {transcript}")


def print_table(sid, results):
    keys = [d["key"] for d in rubric.DIMENSIONS]
    short = {"context_setting": "ctx", "plan_first": "plan", "verification": "verif",
             "diagnose_vs_retry": "diag", "understanding_seeking": "under",
             "scope_discipline": "scope", "iteration_discipline": "iter"}
    print(f"\n=== {sid} ===")
    header = f"{'turn':>4} " + " ".join(f"{short[k]:>5}" for k in keys) + f" {'wavg':>6} {'xp':>3}  prompt"
    print(header)
    print("-" * len(header))
    for r in results:
        row = f"{r['turn']:>4} " + " ".join(f"{r['dims'][k]:>5}" for k in keys)
        mark = "[J] " if r.get("judged") else ""
        print(f"{row} {r['weighted']:>6.1f} {r['xp']:>3}  {mark}{r['prompt'][:48]}")
    if results:
        avg = {k: round(sum(r["dims"][k] for r in results) / len(results), 1) for k in keys}
        wavg = round(sum(r["weighted"] for r in results) / len(results), 2)
        row = f"{'avg':>4} " + " ".join(f"{avg[k]:>5.0f}" for k in keys)
        print(f"{row} {wavg:>6.1f}")
        for r in results:
            print(f"  turn {r['turn']} tip: {r['tip']}")
            print(f"  turn {r['turn']} highlight: {r['highlight']}")
        print("SUMMARY " + json.dumps({"sid": sid, "turns": len(results),
                                       "avg_dims": avg, "weighted_avg": wavg}))


def run_batch(path, sid_override=None, dry_run=False, use_judge=False):
    if use_judge:
        # --judge overrides the config/env gate for this process only
        os.environ["AI_FLUENCY_JUDGE"] = "1"
    turns = engine.parse_transcript(path)
    sid = sid_override or (turns[0]["sid"] if turns else "batch-unknown")
    results = engine.score_session(turns, judge=active_judge())
    print_table(sid, results)
    if not dry_run and results:
        append_events(sid, results)
        log(f"batch sid={sid}: appended {len(results)} turn_score events from {path}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="AI Fluency turn scorer")
    ap.add_argument("--session", help="session id (incremental mode)")
    ap.add_argument("--transcript", help="transcript path (incremental mode)")
    ap.add_argument("--batch", help="transcript path (batch mode)")
    ap.add_argument("--sid-override", help="override sid in batch mode")
    ap.add_argument("--dry-run", action="store_true", help="batch: print only, no events")
    ap.add_argument("--force", action="store_true",
                    help="incremental: score even non-interactive sessions")
    ap.add_argument("--judge", action="store_true",
                    help="batch: blend LLM-judge scores into the judge dims")
    args = ap.parse_args(argv)

    if args.batch:
        run_batch(args.batch, args.sid_override, args.dry_run, use_judge=args.judge)
    elif args.session and args.transcript:
        # Only interactive human sessions are scored by default: agents, fleet
        # workers and claude -p one-shots must never inflate the fluency score.
        if not args.force and not score_all_configured():
            kind = session_kind(args.session, args.transcript)
            if kind != "interactive":
                log(f"skip sid={args.session}: kind={kind} (non-interactive; "
                    f"use --force or score_all_sessions to override)")
                return
        run_incremental(args.session, args.transcript)
    else:
        ap.print_usage()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        log("FATAL " + traceback.format_exc().replace("\n", " | "))
        sys.exit(0)
