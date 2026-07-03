#!/usr/bin/env python3
"""AI Fluency scoring engine: transcript parsing, turn extraction, features, scores.

Input : Claude Code transcript JSONL (same shape as ~/.claude/projects/*/*.jsonl,
        mirrored by fixtures/make_fixtures.py).
Output: per-turn dimension scores (0-100 ints), XP, tip, highlight.

All heuristics are deterministic and local. Fit-to-task rule: a dimension that
does not apply to a turn scores NEUTRAL (60), never a penalty.
"""
import json
import re

try:
    import rubric
except ImportError:  # allow package-style import
    from . import rubric  # type: ignore

NEUTRAL = rubric.NEUTRAL
NA = None   # 'dimension not applicable this turn' — distinct from a COMPUTED 60

MUTATING_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
EXPLORE_TOOLS = {"Read", "Glob", "Grep", "LS", "WebFetch", "WebSearch", "Task", "TodoWrite"}

# ---------------------------------------------------------------- regexes ----
PATH_RE = re.compile(
    r"(?:^|[\s\"'(`])((?:~?/)?[\w.\-]+/[\w./\-]+|[\w\-]+\.(?:py|js|jsx|ts|tsx|html|css|scss|md|json|jsonl|sh|go|rs|java|rb|c|cpp|h|hpp|yml|yaml|toml|sql|txt|ipynb))"
)
BACKTICK_RE = re.compile(r"`[^`]+`")
CONSTRAINT_RE = re.compile(
    r"\bmust\b|\buse the existing\b|\bexisting\b|\bdon'?t\b|\bdo not\b|\bmatch(?:ing)?\b"
    r"|\bconstraints?\b|\bno [A-Za-z]+\b|\bonly\b|\bwithout\b|\bkeep\b|\bavoid\b|\binstead of\b",
    re.I,
)
IMPERATIVE_OPENERS = {
    "make", "fix", "do", "write", "create", "build", "add", "change", "update",
    "delete", "remove", "just", "go", "run", "give", "generate", "redo",
}
PLAN_LANG_RE = re.compile(
    r"\bplan first\b|\bgive me a (?:short )?plan\b|\ba plan\b|\bbefore (?:writing|you write|coding|you code)\b"
    r"|\bdon'?t (?:write |any )?code yet\b|\bno code yet\b|\bplan\b.{0,40}\breview\b"
    r"|\breview the approach\b|\bapproach first\b|\bplan mode\b|\bspec (?:out|first)\b",
    re.I,
)
# Verification commands are matched against the FIRST TOKEN of each shell
# segment (split on && ; || | and newlines, env-var assignments stripped) —
# never against natural language inside the command string, or an
# `echo done and make sure it is fine` would score as a test run.
_VERIFY_HEAD = {
    "pytest", "tsc", "rspec", "jest", "vitest", "gradle", "phpunit", "ruff",
    "flake8", "mypy", "eslint", "gcc", "clang", "curl", "make", "node",
    "python", "python3", "ruby",
}
_VERIFY_HEAD2 = {  # first token -> allowed second tokens
    "npm": {"test", "run"}, "yarn": {"test", "build"}, "pnpm": {"test", "build"},
    "cargo": {"test", "build", "run", "check"}, "go": {"test", "build", "vet"},
    "bun": {"test", "run"}, "deno": {"test", "run"}, "npx": None,
    "mvn": {"test", "verify", "package"}, "dotnet": {"test", "build"},
}
_SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||[;|\n]")
_ENV_ASSIGN_RE = re.compile(r"^\w+=\S*$")


def is_verify_command(cmd):
    for seg in _SEGMENT_SPLIT_RE.split(cmd or ""):
        toks = [t for t in seg.strip().split() if not _ENV_ASSIGN_RE.match(t)]
        if not toks:
            continue
        head = toks[0].rsplit("/", 1)[-1]
        if head in _VERIFY_HEAD:
            return True
        if head in _VERIFY_HEAD2:
            allowed = _VERIFY_HEAD2[head]
            if allowed is None or (len(toks) > 1 and toks[1] in allowed):
                return True
    return False

MANUAL_VERIFY_RE = re.compile(
    r"\bi ran\b|\bi tested\b|\bi tried\b|\btests? pass(?:es|ed)?\b|\bit works\b|\bworks now\b"
    r"|\bverified\b|\bconfirmed\b|\bchecked it\b|\blooks correct when i\b",
    re.I,
)
FAILURE_LANG_RE = re.compile(
    r"\bdoesn'?t work\b|\bdont work\b|\bnot working\b|\bbroken\b|\bbreaks\b|\berror\b|\bfails?\b"
    r"|\bfailing\b|\bbug\b|\bcrash(?:es|ed)?\b|\bregression\b|\bloops?\b(?=.{0,60}\b(?:when|forever|infinite)\b)"
    r"|\bwrong\b|\bstill (?:broken|failing|not)\b|\bfix (?:it|this|that)\b|\brisk\b|\bvulnerab",
    re.I,
)
BARE_RETRY_RE = re.compile(
    r"^\s*(?:it\s+)?(?:still\s+)?(?:doesn'?t work|dont work|not working|broken|try again|same (?:error|thing)|nope|no luck)"
    r"(?:[\s,.!]*(?:try again|still|again|please))*[\s.!?]*$",
    re.I,
)
HYPOTHESIS_RE = re.compile(
    r"\bbecause\b|\bi think\b|\bthe (?:issue|problem|cause) is\b|\bseems like\b|\blikely\b"
    r"|\bmy (?:guess|hypothesis)\b|\bthat'?s an?\b|\bwhen\b|\bsuspect\b|\bprobably\b",
    re.I,
)
ERROR_EVIDENCE_RE = re.compile(
    r"traceback|exception|stack ?trace|stderr|exit code|status \d{3}|line \d+|\bE:\s|Error:|['\"][^'\"]{2,}['\"]|`[^`]+`",
    re.I,
)
UNDERSTANDING_RE = re.compile(
    r"\bwhy\b|\bhow (?:does|do|did|would|is)\b|\bexplain\b|\bwalk me through\b|\btrade-?offs?\b"
    r"|\bteach\b|\bwhat'?s the (?:difference|tradeoff|reason)\b|\bcritique\b|\bunderstand\b"
    r"|\bwhat are the (?:alternatives|options|downsides)\b|\bpros and cons\b",
    re.I,
)
BARE_ACCEPT_RE = re.compile(
    r"^\s*(?:ok(?:ay)?|k+|sounds good|looks good|lgtm|thanks?(?: you)?|sure|yes|yep|yeah|cool|great|nice|perfect|done|fine|good)[\s.!]*$",
    re.I,
)
CRITIQUE_RE = re.compile(
    r"\bbut\b|\bhowever\b|\binstead\b|\bactually\b|\brather\b|\bwhat about\b|\bedge cases?\b"
    r"|\balternatives?\b|\bmissed\b|\bwrong\b|\bshould(?:n'?t)? (?:it|this|we)\b|\btighten\b|\brefine\b",
    re.I,
)
FOUND_BUG_RE = re.compile(
    r"\bbug\b|\brisk\b|\bvulnerab|\bsecurity\b|\bedge case\b|\bloops?\b|\bleak\b|\bmissed\b"
    r"|\bbreaks when\b|\bopen[- ]redirect\b|\binjection\b|\brace\b|\boverflow\b",
    re.I,
)
SCOPE_VERBS = {
    "make", "write", "fix", "add", "create", "build", "do", "deploy", "implement",
    "refactor", "update", "delete", "install", "setup", "configure", "migrate",
    "design", "ship", "publish", "release", "wire", "integrate",
}
ALSO_RE = re.compile(r"\balso\b|\band then\b|\bas well as\b|\bplus\b|\bwhile you'?re at it\b|\bon top of that\b", re.I)
AND_CHAIN_RE = re.compile(r"\band (?:the )?\w+", re.I)


# ------------------------------------------------------------ turn parsing ----
def _is_turn_start(rec):
    """A turn starts at a user record: not sidechain/meta, content is a string
    or a list containing a text block and NO tool_result blocks."""
    if rec.get("type") != "user" or rec.get("isSidechain") is True or rec.get("isMeta"):
        return False
    msg = rec.get("message")
    if not isinstance(msg, dict):
        return False
    content = msg.get("content")
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        has_text = any(isinstance(b, dict) and b.get("type") == "text" for b in content)
        has_tool_result = any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
        return has_text and not has_tool_result
    return False


def _prompt_text(rec):
    content = rec.get("message", {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content
                         if isinstance(b, dict) and b.get("type") == "text")
    return ""


def parse_transcript(path):
    """Parse transcript JSONL into a list of turn dicts. Malformed lines skipped.

    Turn dict: {index, uuid, prompt, tools:[{name,input,ok}], n_records,
                complete, sid, next_prompt}
    """
    records = []
    try:
        with open(path, "r", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if isinstance(rec, dict):
                    records.append(rec)
    except OSError:
        return []

    turns = []
    current = None
    results_by_id = {}   # tool_use_id -> is_error

    # first pass: collect tool_result error flags (they live on user records)
    for rec in records:
        msg = rec.get("message")
        if rec.get("type") == "user" and isinstance(msg, dict) and isinstance(msg.get("content"), list):
            for b in msg["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    results_by_id[b.get("tool_use_id")] = bool(b.get("is_error"))

    for rec in records:
        if rec.get("isMeta"):
            continue
        if _is_turn_start(rec):
            current = {
                "index": len(turns) + 1,
                "uuid": rec.get("uuid") or rec.get("promptId") or f"turn-{len(turns) + 1}",
                "prompt": _prompt_text(rec),
                "tools": [],
                "n_records": 0,
                "complete": False,
                "sid": rec.get("sessionId", ""),
                "next_prompt": None,
            }
            turns.append(current)
            continue
        if current is None:
            continue
        if rec.get("isSidechain") is True:
            continue
        current["n_records"] += 1
        current["complete"] = True
        msg = rec.get("message")
        if rec.get("type") == "assistant" and isinstance(msg, dict) and isinstance(msg.get("content"), list):
            for b in msg["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    tid = b.get("id")
                    current["tools"].append({
                        "name": b.get("name", ""),
                        "input": b.get("input") or {},
                        "ok": not results_by_id.get(tid, False),
                    })

    for i in range(len(turns) - 1):
        turns[i]["next_prompt"] = turns[i + 1]["prompt"]
    return turns


# ------------------------------------------------------------ dim scorers ----
def _clamp(x):
    if x is None:            # NA passes through untouched
        return None
    return max(0, min(100, int(round(x))))


def _token_similarity(a, b):
    ta = set(re.findall(r"[a-z']+", (a or "").lower()))
    tb = set(re.findall(r"[a-z']+", (b or "").lower()))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _first_word(prompt):
    words = re.findall(r"[A-Za-z']+", prompt.lower())
    if not words:
        return ""
    return words[1] if words[0] in ("please", "just", "now", "can", "hey") and len(words) > 1 else words[0]


def score_context_setting(turn, ctx):
    p = turn["prompt"]
    words = len(p.split())
    files = len(PATH_RE.findall(p)) + len(BACKTICK_RE.findall(p))
    constraints = len(CONSTRAINT_RE.findall(p))
    score = min(words, 60) / 60.0 * 40 + min(files, 3) * 12 + min(constraints, 4) * 8
    if turn["index"] > 1 and words >= 15:
        score += 20   # in-session context accumulates; substantive follow-ups need less restating
    bare_imperative = _first_word(p) in IMPERATIVE_OPENERS and words < 8
    if bare_imperative:
        score = min(score, 15)   # bare imperative into a codebase
    if words < 4:
        score = min(score, 10)
    # Fit-to-task: a conceptual question with no mutation requested doesn't
    # need file paths and constraints — don't punish pure Q&A for brevity.
    is_question = "?" in p or bool(UNDERSTANDING_RE.search(p))
    turn_mutates = any(t["name"] in MUTATING_TOOLS for t in turn["tools"])
    if is_question and not turn_mutates and not bare_imperative:
        score = max(score, 55)
    ctx.update(words=words, files=files, constraints=constraints,
               opener=" ".join(p.split()[:4]), bare_imperative=bare_imperative)
    return _clamp(score)


def score_plan_first(turn, ctx, state):
    p = turn["prompt"]
    plan_lang = bool(PLAN_LANG_RE.search(p))
    tool_names = [t["name"] for t in turn["tools"]]
    mut_idx = next((i for i, n in enumerate(tool_names) if n in MUTATING_TOOLS), None)
    turn_mutates = mut_idx is not None

    if not state["session_mutated"]:
        # pre-mutation phase of the session: this is where the habit shows
        if plan_lang:
            score = 95
            state["plan_requested"] = True
        elif turn_mutates:
            explored_first = state["explored"] or any(n in EXPLORE_TOOLS for n in tool_names[:mut_idx])
            score = 85 if state["plan_requested"] else (45 if explored_first else 15)
        elif any(n in EXPLORE_TOOLS for n in tool_names):
            score = 75
        else:
            score = NA
        if any(n in EXPLORE_TOOLS for n in tool_names):
            state["explored"] = True
        if turn_mutates:
            state["session_mutated"] = True
            state["plan_established"] = state["plan_requested"] or state["explored"]
    else:
        # later turns: session trait dominates, decayed; plan language still credited
        score = 80 if state["plan_established"] else 35
        if plan_lang:
            score = max(score, 90)
    ctx.update(plan_lang=plan_lang)
    return _clamp(score)


def score_verification(turn, ctx):
    tool_names = [t["name"] for t in turn["tools"]]
    mut_idx = [i for i, n in enumerate(tool_names) if n in MUTATING_TOOLS]
    if not mut_idx:
        return NA   # fit-to-task: nothing to verify
    edits = len(mut_idx)
    mut_files = ", ".join(sorted({
        str((turn["tools"][i]["input"] or {}).get("file_path", "?")).rsplit("/", 1)[-1]
        for i in mut_idx})[:4])
    verify_cmd = ""
    for i, t in enumerate(turn["tools"]):
        if t["name"] == "Bash" and i >= mut_idx[0]:
            cmd = str((t["input"] or {}).get("command", ""))
            if is_verify_command(cmd):
                verify_cmd = cmd
                break
    ctx.update(edits=edits, mut_files=mut_files, verify_cmd=verify_cmd[:60])
    if verify_cmd:
        return 95
    nxt = turn.get("next_prompt") or ""
    if MANUAL_VERIFY_RE.search(nxt):
        return 75      # user verified by hand and said so
    if FAILURE_LANG_RE.search(nxt):
        return 40      # user did run it — but only because it broke on them
    return 15


def score_diagnose_vs_retry(turn, ctx, state):
    p = turn["prompt"]
    failure_ctx = state["prev_tool_error"] or bool(FAILURE_LANG_RE.search(p))
    sim = _token_similarity(p, state["prev_prompt"])
    ctx.update(sim=int(sim * 100), words=len(p.split()), opener=" ".join(p.split()[:4]))
    if not failure_ctx:
        return NA
    words = len(p.split())
    if BARE_RETRY_RE.match(p) or (words < 6 and not ERROR_EVIDENCE_RE.search(p)):
        ctx["bare_retry"] = True
        return 8 if sim > 0.3 or words <= 4 else 15
    score = 15
    if words >= 12:
        score += 20
    if words >= 25:
        score += 10
    if HYPOTHESIS_RE.search(p):
        score += 20
    if ERROR_EVIDENCE_RE.search(p) or PATH_RE.search(p):
        score += 15
    if MANUAL_VERIFY_RE.search(p):
        score += 20   # "I ran it and observed X" = real diagnostic input
    if sim > 0.5:
        score -= 15   # near-duplicate of the failed prompt
    return _clamp(score)


def score_understanding_seeking(turn, ctx, state):
    p = turn["prompt"]
    is_und = bool(UNDERSTANDING_RE.search(p)) and not BARE_RETRY_RE.match(p)
    state["total_turns"] += 1
    if is_und:
        state["und_turns"] += 1
    total, und = state["total_turns"], state["und_turns"]
    ratio = und / total
    ctx.update(total_turns=total, und_turns=und, ratio=int(ratio * 100))
    if is_und:
        return 90
    if total <= 2:
        return NA           # too early to demand it (fit-to-task)
    if ratio >= 0.45:
        return 72                # plenty already; no need this turn
    if ratio >= 0.15:
        return 78                # healthy band ~15-40%
    # gentle curve below the band, floor at 30
    return _clamp(max(30, 60 - (0.15 - ratio) * 220))


def score_scope_discipline(turn, ctx):
    p = turn["prompt"].lower()
    words = set(re.findall(r"[a-z]+", p))
    verbs = sorted(words & SCOPE_VERBS)
    also = len(ALSO_RE.findall(p))
    chain = len(AND_CHAIN_RE.findall(p))
    mut_files = {str((t["input"] or {}).get("file_path", "")) for t in turn["tools"]
                 if t["name"] in MUTATING_TOOLS}
    score = 90
    score -= 25 * also
    if len(verbs) > 2:
        score -= 20 * (len(verbs) - 2)
    if chain >= 2:
        score -= 15
    if len(mut_files) >= 4:
        score -= 10
    if len(mut_files) >= 6:
        score -= 15
    ctx.update(verbs=len(verbs), verb_list=", ".join(verbs) or "-", mut_count=len(mut_files))
    return _clamp(max(score, 5))


def score_iteration_discipline(turn, ctx, state):
    p = turn["prompt"]
    ctx.update(opener=" ".join(p.split()[:4]))
    if turn["index"] == 1:
        return NA             # nothing to engage with yet
    if BARE_ACCEPT_RE.match(p):
        return 15                  # bare acceptance, zero substance
    words = len(p.split())
    if FAILURE_LANG_RE.search(p) and words < 6:
        return 25                  # low-substance failure grunt
    substantive = words >= 8
    if substantive and FOUND_BUG_RE.search(p) and (MANUAL_VERIFY_RE.search(p) or HYPOTHESIS_RE.search(p)):
        return 100                 # user caught something the AI missed, with specifics
    if substantive and (CRITIQUE_RE.search(p) or UNDERSTANDING_RE.search(p)):
        return 85                  # scrutiny / refinement / alternatives
    if substantive:
        return 50
    return 40


# ------------------------------------------------------------- session run ----
def new_session_state():
    return {
        "session_mutated": False, "plan_requested": False, "explored": False,
        "plan_established": False, "prev_prompt": "", "prev_tool_error": False,
        "total_turns": 0, "und_turns": 0,
    }


def _tip_index(dim_key, turn, ctx):
    """Template index for the tip — avoid templates whose wording doesn't fit
    the observed features (e.g. the 'bare imperative' context tip)."""
    i = turn["index"]
    if dim_key == "context_setting" and not ctx.get("bare_imperative"):
        return [0, 2][i % 2]   # skip template 1 ("...is a bare imperative")
    if dim_key == "diagnose_vs_retry" and not ctx.get("bare_retry"):
        return [1, 2][i % 2]   # skip template 0 ("...is a blind retry")
    return i


def score_session(turns, only_complete=True):
    """Score all turns in order (session-rolling state). Returns list of dicts:
    {turn, uuid, prompt, dims, weighted, xp, tip, highlight}."""
    state = new_session_state()
    results = []
    for turn in turns:
        if only_complete and not turn.get("complete"):
            # Skip, don't stop: a mid-session interrupted prompt (user hit Esc,
            # zero records followed) must never stall later turns. The skipped
            # turn just doesn't feed rolling state; a dangling FINAL prompt is
            # the same skip and gets scored on the next Stop once records follow.
            continue
        ctx = {}
        dims = {
            "context_setting": score_context_setting(turn, ctx),
            "plan_first": score_plan_first(turn, ctx, state),
            "verification": score_verification(turn, ctx),
            "diagnose_vs_retry": score_diagnose_vs_retry(turn, ctx, state),
            "understanding_seeking": score_understanding_seeking(turn, ctx, state),
            "scope_discipline": score_scope_discipline(turn, ctx),
            "iteration_discipline": score_iteration_discipline(turn, ctx, state),
        }
        # NA means "dimension not applicable this turn" — never coach or
        # praise on it (a COMPUTED 60 stays applicable). Tip = weakest
        # applicable dim (only if genuinely weak); highlight = strongest
        # applicable dim (only if genuinely strong). NA emits as NEUTRAL.
        applicable = [k for k in dims if dims[k] is not NA] or list(dims)
        dims = {k: (NEUTRAL if v is NA else v) for k, v in dims.items()}
        weakest = min(applicable, key=lambda k: (dims[k], k))
        strongest = max(applicable, key=lambda k: (dims[k], k))
        if dims[weakest] >= 70:
            tip = rubric.GENERAL_TIPS[turn["index"] % len(rubric.GENERAL_TIPS)]
        else:
            tip = rubric.pick_template(weakest, "tips", _tip_index(weakest, turn, ctx), ctx)
        highlight = (rubric.pick_template(strongest, "highlights", turn["index"], ctx)
                     if dims[strongest] >= 70 else "")
        results.append({
            "turn": turn["index"],
            "uuid": turn["uuid"],
            "prompt": turn["prompt"][:80],
            "dims": dims,
            "weighted": round(rubric.weighted_average(dims), 1),
            "xp": rubric.xp_for(dims),
            "tip": tip,
            "highlight": highlight,
        })
        # roll state forward
        state["prev_prompt"] = turn["prompt"]
        state["prev_tool_error"] = any(not t["ok"] for t in turn["tools"])
    return results
