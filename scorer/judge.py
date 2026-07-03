#!/usr/bin/env python3
"""LLM judge for the AI Fluency scorer — quality layer over the keyword heuristics.

Heuristics are gameable (ritual "why?" farms understanding_seeking; boilerplate
padding farms context_setting; restated symptoms pass diagnose_vs_retry). A small
LLM judge reads the actual turn text and scores the QUALITY of the behavior for
exactly three judgment-heavy dimensions:

    understanding_seeking, diagnose_vs_retry, context_setting

Design rules:
  * OFF by default. Enabled via config.json {"judge": true} or AI_FLUENCY_JUDGE=1.
    AI_FLUENCY_JUDGE=0 force-disables (overrides config).
  * FAIL-OPEN everywhere: any error, timeout, parse failure, or budget exhaustion
    returns None and the deterministic heuristics stand unchanged.
  * Anti-recursion: the judge shells out to the local `claude` CLI. This machine
    has the ai-fluency plugin installed, so a naive nested call would fire the
    capture hooks and write events about the judge itself (a loop). We run the
    CLI with --safe-mode (plugins/hooks/CLAUDE.md/MCP disabled; auth still works),
    --tools "" (no tool use), --no-session-persistence (no transcript on disk),
    cwd=/tmp and CLAUDE* env vars stripped. Verified: produces zero new events
    in $AI_FLUENCY_DIR.
  * Budget cap: max judge calls per day (default 200, config "judge_daily_budget"),
    tracked in $AI_FLUENCY_DIR/state/judge_budget.json. Over budget -> None.

Stdlib only.
"""
import json
import os
import shutil
import subprocess
from datetime import date

JUDGE_DIMS = ("understanding_seeking", "diagnose_vs_retry", "context_setting")
MODEL = "claude-haiku-4-5-20251001"
SUBPROCESS_TIMEOUT = 25          # hard wall-clock cap per judge call (seconds)
DEFAULT_DAILY_BUDGET = 200
_MAX_PROMPT_CHARS = 2000         # per transcript field embedded in the judge prompt

# Filled by the last successful call — lets callers report latency/cost.
last_call_meta = {}


def fluency_dir():
    return os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))


def _config():
    try:
        with open(os.path.join(fluency_dir(), "config.json")) as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {}
    except Exception:
        return {}


def is_enabled():
    """Judge is OFF by default. Env var wins over config in both directions."""
    env = os.environ.get("AI_FLUENCY_JUDGE", "").strip().lower()
    if env in ("1", "true", "yes", "on"):
        return True
    if env in ("0", "false", "no", "off"):
        return False
    return _config().get("judge") is True


# ------------------------------------------------------------------ budget ----
def _budget_path():
    return os.path.join(fluency_dir(), "state", "judge_budget.json")


def _daily_budget():
    try:
        b = int(_config().get("judge_daily_budget", DEFAULT_DAILY_BUDGET))
        return b if b > 0 else DEFAULT_DAILY_BUDGET
    except Exception:
        return DEFAULT_DAILY_BUDGET


def _consume_budget():
    """Reserve one judge call for today. False if the daily cap is spent.
    Best-effort (no lock): a rare lost increment under concurrency only means
    the cap is approximate, never that a session is degraded."""
    today = date.today().isoformat()
    path = _budget_path()
    st = {}
    try:
        with open(path) as f:
            st = json.load(f)
        if not isinstance(st, dict):
            st = {}
    except Exception:
        st = {}
    count = st.get("count", 0) if st.get("date") == today else 0
    if not isinstance(count, int) or count < 0:
        count = 0
    if count >= _daily_budget():
        return False
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.tmp.{os.getpid()}"
        with open(tmp, "w") as f:
            json.dump({"date": today, "count": count + 1}, f)
        os.replace(tmp, path)
    except Exception:
        pass          # fail-open: accounting failure must not block the call
    return True


# ------------------------------------------------------------------ prompt ----
def _clip(text, limit=_MAX_PROMPT_CHARS):
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit] + " …[truncated]"


def _tool_summary(turn):
    parts = []
    for t in (turn.get("tools") or [])[:20]:
        name = t.get("name", "?")
        inp = t.get("input") or {}
        detail = ""
        if name == "Bash":
            detail = str(inp.get("command", ""))[:80]
        else:
            detail = str(inp.get("file_path", ""))[:80]
        status = "ok" if t.get("ok", True) else "ERROR"
        parts.append(f"{name}({detail}) {status}" if detail else f"{name} {status}")
    return "; ".join(parts) or "(none)"


def build_prompt(turn):
    return f"""You are grading ONE turn of a developer's session with an AI coding assistant, for an AI-fluency coach. Score each dimension 0-100. Be skeptical: this scoring is known to be gamed by ritual phrases and boilerplate padding — judge substance, not keywords.

Dimensions:
- understanding_seeking: Is any why/explain/teach-me engagement GENUINE curiosity about a specific decision, tradeoff, or mechanism in this work? A ritual "why?" or generic "explain" tacked on to farm points scores low (<=30). No understanding-seeking at all also scores low. Specific, anchored interrogation of the AI's choices scores high.
- diagnose_vs_retry: If this turn follows up on a failure, does it add real diagnostic value — a concrete hypothesis, pasted error text/logs, a specific observation of what broke and when? Restated symptoms, "still broken", or verbose padding with no new information scores low. If there is no failure being followed up, score 60.
- context_setting: Would a brand-new teammate know what to do from this prompt ALONE — goal, the specific files involved, explicit constraints, what done looks like? Length and boilerplate do NOT count; vague verbosity scores low. Short but precise can score high.

TURN DATA
Previous user prompt: {_clip(turn.get("prev_prompt", "")) or "(none — first turn)"}
This turn's user prompt: {_clip(turn.get("prompt", ""))}
Tools the assistant used this turn: {_tool_summary(turn)}

Decide quickly — do not write analysis before the answer. Respond with ONLY this JSON object and nothing else:
{{"understanding_seeking": <int 0-100>, "diagnose_vs_retry": <int 0-100>, "context_setting": <int 0-100>, "reason": "<one short sentence>"}}"""


# ----------------------------------------------------------------- parsing ----
def _extract_json_block(text):
    """Return the first balanced {...} block in text parsed as JSON, else None."""
    if not isinstance(text, str):
        return None
    start = text.find("{")
    while start != -1:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(text)):
            c = text[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[start:i + 1])
                        if isinstance(obj, dict):
                            return obj
                    except Exception:
                        break
        start = text.find("{", start + 1)
    return None


def _clean_scores(obj):
    """Validate/coerce the judge JSON to {dim: int 0-100}; None if unusable."""
    if not isinstance(obj, dict):
        return None
    out = {}
    for k in JUDGE_DIMS:
        v = obj.get(k)
        try:
            v = int(round(float(v)))
        except (TypeError, ValueError):
            return None
        out[k] = max(0, min(100, v))
    out["reason"] = str(obj.get("reason", ""))[:300]
    return out


# ---------------------------------------------------------------- CLI call ----
def _judge_env():
    """Environment for the claude subprocess: strip every CLAUDE* var so the
    nested CLI can't inherit hook/session/entrypoint state from this process."""
    return {k: v for k, v in os.environ.items() if not k.startswith("CLAUDE")}


def _call_claude(prompt):
    """One claude -p call. Returns the wrapper dict from --output-format json,
    or None on any failure."""
    claude = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
    if not claude or not os.path.exists(claude):
        return None
    cmd = [
        claude, "-p", prompt,
        "--model", MODEL,
        "--output-format", "json",
        "--safe-mode",                 # no plugins/hooks/CLAUDE.md/MCP -> no recursion
        "--tools", "",                 # judge needs zero tools
        "--no-session-persistence",    # leave no transcript behind
        # Damps haiku's deliberation (unconstrained runs hit ~1200-2100 output
        # tokens / 17-23s wall). Observed with it: ~4-21s. Calls that still
        # exceed the 25s cap time out and fail open (heuristics stand).
        "--append-system-prompt",
        "You are acting as a strict grading function. Do NOT deliberate at "
        "length: decide fast and output ONLY the requested JSON object, "
        "no prose, no markdown fences.",
    ]
    try:
        proc = subprocess.run(
            cmd, cwd="/tmp", env=_judge_env(),
            capture_output=True, text=True, timeout=SUBPROCESS_TIMEOUT,
        )
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    try:
        wrapper = json.loads(proc.stdout)
    except Exception:
        return None
    return wrapper if isinstance(wrapper, dict) else None


# -------------------------------------------------------------------- API ----
def judge_turn(turn, heuristic_dims=None):
    """Judge one turn. Returns {dim_key: int 0-100} for the 3 judged dims
    (plus a 'reason' string the caller may ignore), or None (heuristics stand).

    `turn` is an engine.parse_transcript turn dict; engine injects
    turn["prev_prompt"] before calling. `heuristic_dims` is the subset of
    judge dims applicable this turn (informational; the blend decision lives
    in engine.score_session)."""
    global last_call_meta
    try:
        if not is_enabled():
            return None
        if not (turn.get("prompt") or "").strip():
            return None
        if not _consume_budget():
            return None
        wrapper = _call_claude(build_prompt(turn))
        if wrapper is None or wrapper.get("is_error"):
            return None
        scores = _clean_scores(_extract_json_block(wrapper.get("result", "")))
        if scores is None:
            return None
        last_call_meta = {
            "duration_ms": wrapper.get("duration_ms"),
            "duration_api_ms": wrapper.get("duration_api_ms"),
            "total_cost_usd": wrapper.get("total_cost_usd"),
            "usage": wrapper.get("usage"),
            "model": MODEL,
        }
        return scores
    except Exception:
        return None       # fail-open, always


if __name__ == "__main__":
    # Manual smoke: judge a fake turn from the command line.
    fake = {"prompt": " ".join(os.sys.argv[1:]) or "why did you use a decorator here — what's the tradeoff vs middleware?",
            "prev_prompt": "", "tools": []}
    os.environ.setdefault("AI_FLUENCY_JUDGE", "1")
    print(json.dumps(judge_turn(fake), indent=2))
    print(json.dumps(last_call_meta, indent=2))
