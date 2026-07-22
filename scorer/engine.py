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
# Tools that inspect a file/target after the fact (read the diff, cat the output).
INSPECT_TOOLS = {"Read", "Grep", "Glob", "LS"}
# Bash commands that inspect/diagnose rather than verify (read a file, print a
# diff, tail a log, inspect state). First-token matched, same discipline as
# is_verify_command — never natural language inside the command string.
_INSPECT_HEAD = {
    "cat", "less", "head", "tail", "grep", "rg", "diff", "git", "ls", "find",
    "sed", "awk", "jq", "wc", "stat", "env", "printenv", "echo",
}
# git subcommands that count as inspection (git alone is too broad).
_GIT_INSPECT = {"diff", "status", "log", "show", "blame"}


def _file_path_of(tool):
    inp = tool.get("input") or {}
    return str(inp.get("file_path") or inp.get("path") or inp.get("notebook_path") or "")


def is_inspect_command(cmd):
    """True if the FIRST shell segment inspects/diagnoses state (cat/grep/git diff/
    tail a log). Same tokenizing discipline as is_verify_command."""
    for seg in _SEGMENT_SPLIT_RE.split(cmd or ""):
        toks = [t for t in seg.strip().split() if not _ENV_ASSIGN_RE.match(t)]
        if not toks:
            continue
        head = toks[0].rsplit("/", 1)[-1]
        if head == "git":
            return len(toks) > 1 and toks[1] in _GIT_INSPECT
        if head in _INSPECT_HEAD:
            return True
    return False

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
    "flake8", "mypy", "eslint", "gcc", "clang", "curl", "node",
    "python", "python3", "ruby",
}
_VERIFY_HEAD2 = {  # first token -> allowed second tokens
    "npm": {"test", "run"}, "yarn": {"test", "build"}, "pnpm": {"test", "build"},
    "cargo": {"test", "build", "run", "check"}, "go": {"test", "build", "vet"},
    "bun": {"test", "run"}, "deno": {"test", "run"}, "npx": None,
    "mvn": {"test", "verify", "package"}, "dotnet": {"test", "build"},
}
# `make` is both a build tool and an English verb ("make sure it works"), so it
# needs a target/flag, never an English word, as its argument to count.
_MAKE_STOPWORDS = {"sure", "certain", "it", "that", "this", "them", "a", "the", "your", "me"}
_SEGMENT_SPLIT_RE = re.compile(r"&&|\|\||[;|\n]")
_ENV_ASSIGN_RE = re.compile(r"^\w+=\S*$")


def is_verify_command(cmd):
    for seg in _SEGMENT_SPLIT_RE.split(cmd or ""):
        toks = [t for t in seg.strip().split() if not _ENV_ASSIGN_RE.match(t)]
        if not toks:
            continue
        head = toks[0].rsplit("/", 1)[-1]
        if head == "make":
            # bare `make`, or `make <target/-flag>` — but not `make sure ...`
            nxt = toks[1] if len(toks) > 1 else ""
            if not nxt or (nxt not in _MAKE_STOPWORDS):
                return True
            continue
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


# A machine-injected agent bootstrap ("You are the X agent…", a fleet/workflow
# system prompt delivered as the first user turn). These are NOT things the
# human typed, so scoring them inflates the profile with the harness's words.
# Only ever applied to a session's FIRST turn.
_BOOTSTRAP_RE = re.compile(
    r"^\s*(?:you are (?:the |now |an? )?[\w'-]+ (?:agent|assistant|subagent)\b"
    r"|you are (?:now )?(?:working on|shipping|responsible for)\b"
    r"|<system-reminder>|you are a (?:research|coding|workflow) subagent\b"
    r"|your task is to\b.{0,80}\bagent\b)",
    re.I,
)


def _is_agent_bootstrap(text):
    """True if this first-turn prompt looks machine-injected, not human-typed."""
    t = (text or "").strip()
    if not t:
        return False
    # very long single-block instructions with an agent-identity opener
    return bool(_BOOTSTRAP_RE.search(t)) or (len(t) > 1500 and t.lower().startswith("you are"))


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
            prompt = _prompt_text(rec)
            # The first turn of an agent/fleet session is a machine-injected
            # bootstrap prompt, not human input — mark it so scoring skips it
            # (it would otherwise score high context_setting on the harness's
            # own words and inflate the profile).
            is_bootstrap = len(turns) == 0 and _is_agent_bootstrap(prompt)
            current = {
                "index": len(turns) + 1,
                "uuid": rec.get("uuid") or rec.get("promptId") or f"turn-{len(turns) + 1}",
                "prompt": prompt,
                "tools": [],
                "n_records": 0,
                "complete": False,
                "sid": rec.get("sessionId", ""),
                "next_prompt": None,
                "permission_mode": rec.get("permissionMode", ""),
                "bootstrap": is_bootstrap,
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


# A "calibrated oracle" turn: a short, deterministic, self-contained instruction a
# competent user issues ON PURPOSE (rename X to Y, bump a version, set a flag) — the
# L4 "calibrated delegation" case in the curriculum. You do NOT brief or plan a
# mechanical one-liner, so context_setting and plan_first DON'T APPLY (they become
# NA, not a penalty). Guarded tightly: it must (1) open with a mechanical verb,
# (2) name a concrete target (a file path, a code literal, a version, or a
# camel/snake/dotted symbol), (3) actually make a SMALL single-file edit, and
# (4) not be a multi-scope ask or a question. So "fix the bug" / "make it faster" /
# "add auth to the app" never qualify — they have no concrete target.
MECHANICAL_VERBS = {
    "rename", "bump", "set", "change", "replace", "increment", "decrement",
    "format", "sort", "alphabetize", "capitalize", "lowercase", "uppercase",
    "comment", "uncomment", "prefix", "suffix", "append", "prepend", "inline",
    "rename", "swap", "reorder", "indent", "unindent", "wrap", "unwrap",
}
_LITERAL_RE = re.compile(r"`[^`]+`|\"[^\"]+\"|'[^']+'|\bv?\d+\.\d+")
_SYMBOL_RE = re.compile(r"\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[a-z]+_[a-z0-9_]+\b|\b\w+\.\w{1,4}\b")


def is_calibrated_oracle(turn):
    """True for a short, deterministic, single-target mechanical edit (L4). For
    these, briefing/planning are not-applicable, not weak — see score_session."""
    p = (turn.get("prompt") or "").strip()
    words = p.split()
    if not (0 < len(words) <= 14):
        return False
    if ALSO_RE.search(p) or "?" in p:
        return False
    if _first_word(p) not in MECHANICAL_VERBS:
        return False
    has_target = bool(PATH_RE.search(p) or _LITERAL_RE.search(p) or _SYMBOL_RE.search(p))
    if not has_target:
        return False
    mut = [t for t in turn["tools"] if t["name"] in MUTATING_TOOLS]
    if not mut or len(mut) > 2:
        return False
    mut_files = {str((t["input"] or {}).get("file_path", "")) for t in mut}
    return len(mut_files) == 1


def score_context_setting(turn, ctx, state=None):
    """Context is AMBIENT, not re-typed every turn. PRIMARY signals now include
    context the user actually PROVIDED to the model — @file / path references,
    a loaded CLAUDE.md / project context, files the turn reads to ground the
    work — plus context accumulated earlier in the session. A power user with a
    loaded CLAUDE.md and @file refs does not have to re-paste the codebase each
    turn to score well; keyword-only ceremony is not enough on its own."""
    p = turn["prompt"]
    words = len(p.split())
    files = len(PATH_RE.findall(p)) + len(BACKTICK_RE.findall(p))
    constraints = len(CONSTRAINT_RE.findall(p))
    score = min(words, 60) / 60.0 * 40 + min(files, 3) * 12 + min(constraints, 4) * 8

    # --- behavioral / ambient context signals ---
    at_refs = p.count("@")               # @file / @dir references the user attached
    reads_this_turn = sum(1 for t in turn["tools"] if t["name"] in INSPECT_TOOLS)
    claude_md = state.get("claude_md_loaded") if state else False
    prior_files = state.get("ctx_files_seen", 0) if state else 0
    # @file attachments are provided context: credit like file refs.
    score += min(at_refs, 3) * 10
    # The turn grounds itself by reading real project files (ambient context the
    # user is steering the model to load) — a behavioral, harder-to-fake signal,
    # weighted above prose word-count so a grounded terse turn beats ceremony.
    score += min(reads_this_turn, 3) * 9
    # A loaded CLAUDE.md / project context is standing context for the whole
    # session: a session-wide credit (not per-turn re-paste required).
    if claude_md:
        score += 16
    # Established session context: files already surfaced earlier this session
    # mean a terse follow-up is still well-grounded — don't demand a re-brief.
    if turn["index"] > 1 and prior_files >= 1:
        score += min(prior_files, 5) * 6

    if turn["index"] > 1 and words >= 15:
        score += 20   # in-session context accumulates; substantive follow-ups need less restating
    bare_imperative = _first_word(p) in IMPERATIVE_OPENERS and words < 8
    # A bare imperative is only "into the dark" when there's NO ambient context
    # to lean on. If the session has established context (CLAUDE.md, files
    # already read, @refs), a terse directive is calibrated delegation, not a
    # blind one — soften the cap rather than slam it to 15.
    if bare_imperative:
        has_ambient = claude_md or prior_files >= 1 or at_refs or reads_this_turn
        score = min(score, 55 if has_ambient else 15)
    if words < 4 and not (state and (claude_md or prior_files >= 1)):
        score = min(score, 10)
    # Fit-to-task: a conceptual question with no mutation requested doesn't
    # need file paths and constraints — don't punish pure Q&A for brevity.
    # But require real substance: a bare "?" / "ok?" is not a conceptual
    # question and must still fall through to the brevity floors.
    is_question = (("?" in p and words >= 4) or bool(UNDERSTANDING_RE.search(p)))
    turn_mutates = any(t["name"] in MUTATING_TOOLS for t in turn["tools"])
    if is_question and not turn_mutates and not bare_imperative and words >= 4:
        score = max(score, 55)
    ctx.update(words=words, files=files, constraints=constraints,
               opener=" ".join(p.split()[:4]), bare_imperative=bare_imperative)
    return _clamp(score)


def score_plan_first(turn, ctx, state):
    p = turn["prompt"]
    # Plan-mode usage is the platform-native version of the behavior this
    # dimension measures (research row #1) — a stronger signal than keywords.
    # Detect it two ways: permissionMode on the turn, or an ExitPlanMode tool
    # call (the assistant leaving plan mode = the user planned first).
    used_plan_mode = (turn.get("permission_mode") == "plan"
                      or any(t["name"] == "ExitPlanMode" for t in turn["tools"]))
    plan_lang = bool(PLAN_LANG_RE.search(p)) or used_plan_mode
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
    """PRIMARY = real verification BEHAVIOR in the turn's tool sequence (ran
    tests/build/lint, inspected the diff/file AFTER a mutation, re-ran after a
    failure and it passed). Keyword/manual-verify claims are a MINOR secondary
    signal. A power user who verifies by running tests + reading the diff scores
    high even with a terse prompt and no "verify this" narration."""
    tools = turn["tools"]
    tool_names = [t["name"] for t in tools]
    mut_idx = [i for i, n in enumerate(tool_names) if n in MUTATING_TOOLS]

    # Behavioral signals available whether or not the turn mutated.
    ran_test = ""          # a real test/build/lint/run command anywhere in turn
    ran_test_ok = False    # ...and it succeeded (green after change)
    for t in tools:
        if t["name"] == "Bash":
            cmd = str((t.get("input") or {}).get("command", ""))
            if is_verify_command(cmd):
                ran_test = cmd
                ran_test_ok = ran_test_ok or bool(t.get("ok"))

    if not mut_idx:
        # Nothing was mutated this turn. If the user still RAN the code / tests
        # (verifying existing behavior, reproducing a bug), that is genuine
        # verification behavior — credit it. Pure exploration stays NA.
        if ran_test:
            ctx.update(edits=0, mut_files="-", verify_cmd=ran_test[:60])
            return 88 if ran_test_ok else 78
        return NA   # fit-to-task: nothing to verify

    edits = len(mut_idx)
    first_mut = mut_idx[0]
    mut_files_set = {_file_path_of(tools[i]) for i in mut_idx}
    mut_basenames = {p.rsplit("/", 1)[-1] for p in mut_files_set if p}
    mut_files = ", ".join(sorted(mut_basenames)[:4])

    # Did a verify command run AFTER the first mutation? (test the new code)
    verify_cmd = ""
    verify_ok = False
    for i, t in enumerate(tools):
        if t["name"] == "Bash" and i >= first_mut:
            cmd = str((t.get("input") or {}).get("command", ""))
            if is_verify_command(cmd):
                verify_cmd = cmd
                verify_ok = bool(t.get("ok"))
                break

    # Did the user INSPECT a mutated file after editing it? (read the diff / the
    # written file, git diff, cat it) — the "read the diff" habit, tool-observed.
    inspected_diff = False
    for i, t in enumerate(tools):
        if i <= first_mut:
            continue
        if t["name"] in INSPECT_TOOLS:
            fp = _file_path_of(t)
            if not fp or fp in mut_files_set or not mut_files_set:
                inspected_diff = True
                break
        if t["name"] == "Bash":
            if is_inspect_command(str((t.get("input") or {}).get("command", ""))):
                inspected_diff = True
                break

    ctx.update(edits=edits, mut_files=mut_files, verify_cmd=verify_cmd[:60])

    # --- primary behavioral score ---
    if verify_cmd:
        return 95 if verify_ok else 82   # ran it green vs ran it and it errored
    if inspected_diff:
        return 80    # read the diff / inspected the mutated file after editing
    # secondary: keyword claim of verification in the follow-up prompt. This is
    # an UNBACKED claim (no tool evidence in the turn), so it is a minor signal,
    # not a pass: capped well below tool-observed verification so ritual
    # "I verified it" narration can't reach the score of actually running it.
    nxt = turn.get("next_prompt") or ""
    if MANUAL_VERIFY_RE.search(nxt):
        return 45      # user *says* they verified by hand; no tool evidence
    if FAILURE_LANG_RE.search(nxt):
        return 40      # user did run it — but only because it broke on them
    return 15


def score_diagnose_vs_retry(turn, ctx, state):
    """After a failure, did the user DIAGNOSE (inspect the error, run a
    diagnostic, change approach) or blindly RETRY the same failing thing?
    PRIMARY signal is now the tool sequence: reading the failing file / error,
    running a git-diff or grep or a fresh diagnostic command, changing the
    command that failed — all observed from tools, not narration. Keyword
    hypothesis/error-evidence in the prompt is a secondary bonus."""
    p = turn["prompt"]
    failure_ctx = state["prev_tool_error"] or bool(FAILURE_LANG_RE.search(p))
    sim = _token_similarity(p, state["prev_prompt"])
    ctx.update(sim=int(sim * 100), words=len(p.split()), opener=" ".join(p.split()[:4]))
    if not failure_ctx:
        return NA
    words = len(p.split())

    # --- behavioral diagnosis signals (this turn's tools) ---
    tools = turn["tools"]
    tool_names = [t["name"] for t in tools]
    inspected = any(n in INSPECT_TOOLS for n in tool_names)
    for t in tools:
        if t["name"] == "Bash" and is_inspect_command(str((t.get("input") or {}).get("command", ""))):
            inspected = True
            break
    # blind retry = re-issued the SAME command that failed last turn, with no
    # inspection first. Compare this turn's bash commands to the prior failed set.
    prev_failed = state.get("prev_failed_cmds") or set()
    this_cmds = {str((t.get("input") or {}).get("command", "")).strip()
                 for t in tools if t["name"] == "Bash"}
    repeated_failing_cmd = bool(prev_failed & this_cmds)
    changed_approach = bool(this_cmds - prev_failed) or any(
        n in MUTATING_TOOLS for n in tool_names)
    ctx.update(inspected=inspected)

    # A prompt-level bare retry with no inspecting tools is still a blind retry.
    if (BARE_RETRY_RE.match(p) or (words < 6 and not ERROR_EVIDENCE_RE.search(p))) and not inspected:
        ctx["bare_retry"] = True
        return 8 if sim > 0.3 or words <= 4 else 15

    score = 15
    # primary: tool-observed diagnosis
    if inspected:
        score += 30   # read the error / diffed / grepped before acting again
    # A different command counts as changing approach; but a BARE mutation with
    # no inspection first (blindly re-editing the file that just failed) is a
    # retry dressed up, not a diagnosis — don't credit it.
    if inspected and changed_approach and not repeated_failing_cmd:
        score += 15
    if repeated_failing_cmd and not inspected:
        score -= 20   # re-ran the exact failing command with no diagnosis
    # secondary: prompt-level reasoning signals (ceremony-farmable, so kept
    # SMALL — capped in aggregate below so words+keywords alone can't pass).
    kw = 0
    if words >= 12:
        kw += 8
    if words >= 25:
        kw += 4
    if HYPOTHESIS_RE.search(p):
        kw += 8
    if ERROR_EVIDENCE_RE.search(p) or PATH_RE.search(p):
        kw += 8
    if MANUAL_VERIFY_RE.search(p):
        kw += 8
    # Without any tool-observed diagnosis, prompt keywords alone are capped so a
    # verbose "I verified it fails, let me fix this" (pure narration) can't
    # reach the score of a user who actually inspected before acting.
    if not inspected:
        kw = min(kw, 20)
    score += kw
    if sim > 0.5 and not inspected:
        score -= 15   # near-duplicate of the failed prompt, no new diagnosis
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
        # ambient-context tracking (behavioral context_setting signals)
        "claude_md_loaded": False,   # a CLAUDE.md / project-context file was read
        "ctx_files_seen": 0,         # distinct project files surfaced so far
        "seen_files": set(),
        "prev_failed_cmds": set(),   # bash commands that errored last turn
    }


_CLAUDE_MD_RE = re.compile(r"claude\.md$|\.claude/|(?:^|/)agents?\.md$", re.I)


def _update_ambient_context(turn, state):
    """Roll session-wide context signals forward from this turn's tool use +
    prompt: a loaded CLAUDE.md, and the set of distinct project files the model
    has been pointed at (read or attached). These make later terse turns
    legitimately well-grounded."""
    for t in turn["tools"]:
        if t["name"] in INSPECT_TOOLS:
            fp = _file_path_of(t)
            if fp:
                if _CLAUDE_MD_RE.search(fp):
                    state["claude_md_loaded"] = True
                state["seen_files"].add(fp)
    # path / @file references in the prompt also establish standing context
    for m in PATH_RE.findall(turn["prompt"] or ""):
        state["seen_files"].add(m)
        if _CLAUDE_MD_RE.search(m):
            state["claude_md_loaded"] = True
    state["ctx_files_seen"] = len(state["seen_files"])


def _tip_index(dim_key, turn, ctx):
    """Template index for the tip — avoid templates whose wording doesn't fit
    the observed features (e.g. the 'bare imperative' context tip)."""
    i = turn["index"]
    if dim_key == "context_setting" and not ctx.get("bare_imperative"):
        return [0, 2][i % 2]   # skip template 1 ("...is a bare imperative")
    if dim_key == "diagnose_vs_retry" and not ctx.get("bare_retry"):
        return [1, 2][i % 2]   # skip template 0 ("...is a blind retry")
    return i


# The 3 judgment-heavy dims an optional LLM judge may refine (see judge.py).
JUDGE_DIMS = ("understanding_seeking", "diagnose_vs_retry", "context_setting")


def _apply_judge(judge, turn, dims):
    """Blend judge scores 50/50 into the applicable judge dims. NA dims are
    never judged. Fail-open: any judge error leaves heuristics untouched.
    Returns True if at least one dim was blended."""
    applicable = {k: dims[k] for k in JUDGE_DIMS if dims[k] is not NA}
    if not applicable:
        return False
    try:
        j = judge(turn, applicable)
    except Exception:
        return False
    if not isinstance(j, dict):
        return False
    blended = False
    for k, h in applicable.items():
        v = j.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        dims[k] = _clamp((h + max(0, min(100, v))) / 2.0)
        blended = True
    return blended


def score_session(turns, only_complete=True, judge=None):
    """Score all turns in order (session-rolling state). Returns list of dicts:
    {turn, uuid, prompt, dims, weighted, xp, tip, highlight, judged}.

    `judge`: optional callable(turn, heuristic_dims) -> {dim: 0-100} | None.
    When it returns scores, they are blended 50/50 with the heuristic for the
    judge dims (rounded to int). NA dims stay NA. Fail-open throughout."""
    state = new_session_state()
    results = []
    for turn in turns:
        if only_complete and not turn.get("complete"):
            # Skip, don't stop: a mid-session interrupted prompt (user hit Esc,
            # zero records followed) must never stall later turns. The skipped
            # turn just doesn't feed rolling state; a dangling FINAL prompt is
            # the same skip and gets scored on the next Stop once records follow.
            continue
        if turn.get("bootstrap"):
            # Machine-injected agent bootstrap (not human input): never scored.
            # It still rolls state forward so the next (human) turn sees it.
            state["prev_prompt"] = turn["prompt"]
            state["prev_tool_error"] = any(not t["ok"] for t in turn["tools"])
            _update_ambient_context(turn, state)
            continue
        ctx = {}
        dims = {
            "context_setting": score_context_setting(turn, ctx, state),
            "plan_first": score_plan_first(turn, ctx, state),
            "verification": score_verification(turn, ctx),
            "diagnose_vs_retry": score_diagnose_vs_retry(turn, ctx, state),
            "understanding_seeking": score_understanding_seeking(turn, ctx, state),
            "scope_discipline": score_scope_discipline(turn, ctx),
            "iteration_discipline": score_iteration_discipline(turn, ctx, state),
        }
        # Fit-to-task (L4): for a calibrated mechanical one-liner, briefing and
        # planning DON'T APPLY — mark them NA so a senior isn't scolded for correct
        # oracle-style delegation. Computed AFTER plan_first so session state (mutated
        # / explored) still rolls forward normally; only the emitted dim is nulled.
        if is_calibrated_oracle(turn):
            dims["context_setting"] = NA
            dims["plan_first"] = NA
        judged = False
        if judge is not None:
            turn["prev_prompt"] = state["prev_prompt"]   # judge sees the prior prompt
            judged = _apply_judge(judge, turn, dims)
        # NA means "dimension not applicable this turn". NA dims are OMITTED
        # from the emitted event entirely (every consumer renders dims
        # data-driven, so absence is the honest encoding): they no longer
        # pollute radar/averages/XP as fake-neutral 60s, and a computed 60
        # stays distinguishable because it's present. Tip = weakest applicable
        # dim (only if genuinely weak); highlight = strongest applicable dim
        # (only if genuinely strong).
        dims = {k: v for k, v in dims.items() if v is not NA}
        if dims:
            weakest = min(dims, key=lambda k: (dims[k], k))
            strongest = max(dims, key=lambda k: (dims[k], k))
            if dims[weakest] >= 70:
                tip = rubric.GENERAL_TIPS[turn["index"] % len(rubric.GENERAL_TIPS)]
            else:
                tip = rubric.pick_template(weakest, "tips", _tip_index(weakest, turn, ctx), ctx)
            highlight = (rubric.pick_template(strongest, "highlights", turn["index"], ctx)
                         if dims[strongest] >= 70 else "")
        else:
            tip, highlight = rubric.GENERAL_TIPS[turn["index"] % len(rubric.GENERAL_TIPS)], ""
        results.append({
            "turn": turn["index"],
            "uuid": turn["uuid"],
            "prompt": turn["prompt"][:80],
            "dims": dims,
            "weighted": round(rubric.weighted_average(dims), 1) if dims else 0.0,
            "xp": rubric.xp_for(dims),
            "tip": tip,
            "highlight": highlight,
            "judged": judged,
        })
        # roll state forward
        state["prev_prompt"] = turn["prompt"]
        state["prev_tool_error"] = any(not t["ok"] for t in turn["tools"])
        state["prev_failed_cmds"] = {
            str((t.get("input") or {}).get("command", "")).strip()
            for t in turn["tools"] if t["name"] == "Bash" and not t["ok"]
        }
        _update_ambient_context(turn, state)
    return results
