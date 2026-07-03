#!/usr/bin/env python3
"""ai-fluency capture hook — one entrypoint for every hook event.

Reads the hook payload from stdin, appends a normalized event line to
~/.ai-fluency/events.jsonl, and on Stop kicks the incremental scorer in a
detached process. Fail-open by design: any error exits 0 silently so the
user's session is never degraded by telemetry.
"""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

FLUENCY_DIR = os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))
EVENTS = os.path.join(FLUENCY_DIR, "events.jsonl")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def load_config():
    try:
        with open(os.path.join(FLUENCY_DIR, "config.json")) as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {}
    except Exception:
        return {}


# --------------------------------------------------------------- session kind ----
# Only INTERACTIVE human sessions should be scored/synced by default. Empirical
# discriminator (verified against real transcripts under ~/.claude/projects/):
# every user/assistant record carries an "entrypoint" field — "cli" for a human
# interactive session, "sdk-cli"/"sdk-py"/... for headless runs (claude -p,
# Agent SDK, fleet agents, workflow subagents). The hook process env
# CLAUDE_CODE_ENTRYPOINT is NOT trustworthy for "cli" (children inherit it),
# so env is only used as a *negative* signal (sdk-* => headless).
# Safe default: UNKNOWN kind is treated as non-interactive downstream.

def _kind_cache_path(sid):
    safe = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in sid) or "unknown"
    return os.path.join(FLUENCY_DIR, "state", f"kind-{safe}.json")


def _peek_transcript_kind(transcript):
    """Read the first records of the transcript looking for the entrypoint field."""
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


def detect_kind(sid, transcript):
    """Return ('interactive'|'headless'|'unknown', resolved_now: bool).

    Cached per sid in $AI_FLUENCY_DIR/state/kind-<sid>.json so we don't re-read
    transcripts on every hook event. resolved_now=True means the kind just went
    from unrecorded/unknown to a known value (caller may emit a session_kind
    event so the sync layer sees the resolution)."""
    path = _kind_cache_path(sid)
    cached = None
    try:
        with open(path) as f:
            cached = json.load(f).get("kind")
    except Exception:
        pass
    if cached in ("interactive", "headless"):
        return cached, False

    kind = _peek_transcript_kind(transcript)
    if kind == "unknown":
        env_ep = os.environ.get("CLAUDE_CODE_ENTRYPOINT", "")
        if env_ep and env_ep != "cli":
            kind = "headless"  # sdk-* env is a reliable headless signal
        # env "cli" proves nothing (inherited by child/agent processes) -> unknown

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump({"kind": kind, "updated": now()}, f)
    except Exception:
        pass
    return kind, kind in ("interactive", "headless")


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

    kind, resolved_now = detect_kind(sid, transcript)
    # If the kind resolved after session_start already shipped (fresh interactive
    # sessions have no transcript records yet at SessionStart), record the
    # resolution so sync can classify the sid.
    if resolved_now and hook != "SessionStart":
        emit(sid, "session_kind", {"kind": kind})

    if hook == "SessionStart":
        emit(sid, "session_start", {
            "source": payload.get("source", ""),
            # sha256 (not hash()): stable across processes, so the same project
            # maps to the same pseudonym without revealing the path.
            "cwd_hash": hashlib.sha256(payload.get("cwd", "").encode()).hexdigest()[:10],
            "transcript_path": transcript,
            "kind": kind,
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
        # Only score interactive human sessions by default — headless/unknown
        # (claude -p, SDK, fleet/workflow agents) must never inflate the score.
        if kind == "interactive" or load_config().get("score_all_sessions"):
            scorer = _find_scorer()
            if scorer:
                subprocess.Popen(
                    [sys.executable, scorer, "--session", sid, "--transcript", transcript],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
    elif hook == "SessionEnd":
        emit(sid, "session_end", {"reason": payload.get("reason", "")})
    elif hook == "PostToolUseFailure":
        err = payload.get("error", "")
        if not isinstance(err, str):
            err = str(err)
        emit(sid, "tool_failure", {
            "tool": payload.get("tool_name", ""),
            "error_type": (payload.get("error_type") or err.split(":")[0].strip()[:80]),
        })
    elif hook == "PermissionRequest":
        emit(sid, "permission", {
            "tool": payload.get("tool_name", ""),
            "decision": str(payload.get("permission_decision")
                            or payload.get("decision") or "requested"),
        })
    elif hook == "PreCompact":
        emit(sid, "compact", {"phase": "pre", "trigger": payload.get("trigger", "")})
    elif hook == "PostCompact":
        emit(sid, "compact", {"phase": "post", "trigger": payload.get("trigger", "")})
    else:
        # Future-proof: unknown hook events are logged by name only.
        if hook:
            emit(sid, "hook", {"name": hook})

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
