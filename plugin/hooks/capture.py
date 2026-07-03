#!/usr/bin/env python3
"""ai-fluency capture hook — one entrypoint for every hook event.

Reads the hook payload from stdin, appends a normalized event line to
~/.ai-fluency/events.jsonl, and on Stop kicks the incremental scorer in a
detached process. Fail-open by design: any error exits 0 silently so the
user's session is never degraded by telemetry.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

FLUENCY_DIR = os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))
EVENTS = os.path.join(FLUENCY_DIR, "events.jsonl")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def emit(sid, event, data):
    os.makedirs(FLUENCY_DIR, exist_ok=True)
    line = json.dumps({"v": 1, "ts": now(), "sid": sid, "event": event, "data": data},
                      ensure_ascii=False)
    with open(EVENTS, "a") as f:
        f.write(line + "\n")


def _find_scorer():
    """Marketplace installs copy plugin files away from the repo, so the
    repo-relative path can break. Resolution order: explicit env var, sync
    config, repo-relative (checkout / --plugin-dir), well-known checkout."""
    candidates = [os.environ.get("AI_FLUENCY_SCORER", "")]
    cfg = os.path.join(FLUENCY_DIR, "config.json")
    try:
        with open(cfg) as f:
            candidates.append(json.load(f).get("scorer", ""))
    except Exception:
        pass
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.normpath(os.path.join(here, "..", "..", "scorer", "score_turn.py")))
    candidates.append(os.path.expanduser("~/code/ai-fluency-trainer/scorer/score_turn.py"))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def main():
    payload = json.load(sys.stdin)
    hook = payload.get("hook_event_name", "")
    sid = payload.get("session_id", "unknown")
    transcript = payload.get("transcript_path", "")

    if hook == "SessionStart":
        emit(sid, "session_start", {
            "source": payload.get("source", ""),
            "cwd_hash": str(abs(hash(payload.get("cwd", ""))) % 10**10),
            "transcript_path": transcript,
        })
    elif hook == "UserPromptSubmit":
        prompt = payload.get("prompt", "")
        emit(sid, "prompt", {
            # raw prompt stays local-only; sync layer ships derived features
            "text": prompt,
            "chars": len(prompt),
            "words": len(prompt.split()),
        })
    elif hook == "PostToolUse":
        resp = payload.get("tool_response", {})
        ok = True
        if isinstance(resp, dict):
            ok = not (resp.get("is_error") or resp.get("isError") or False)
        emit(sid, "tool_use", {
            "tool": payload.get("tool_name", ""),
            "ok": ok,
            "input_keys": sorted(list(payload.get("tool_input", {}) or {})),
        })
    elif hook == "Stop":
        emit(sid, "turn_end", {"transcript_path": transcript})
        scorer = _find_scorer()
        if scorer:
            subprocess.Popen(
                [sys.executable, scorer, "--session", sid, "--transcript", transcript],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
    elif hook == "SessionEnd":
        emit(sid, "session_end", {"reason": payload.get("reason", "")})

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
