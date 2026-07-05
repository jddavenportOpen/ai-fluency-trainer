"use strict";
/**
 * @clawdacademy/trainer-core (PRD-03) - the TEACHING engine, the missing half.
 *
 * coach-core MEASURES; trainer-core TEACHES. UI-free, zero-dep, shared by the
 * plugin hooks (mode B, in-flow enforcement), the coach TUI, and the desktop app
 * (mode A, reflective surfaces). It owns three things:
 *   1. CURRICULUM  - the 9-lesson manifest, dim-keyed (data, not code).
 *   2. focusDim()  - pick the user's weakest recent applicable dim = today's one thing.
 *   3. evaluate()  - the intervention BRAIN: which of the 3 forcing-function rules
 *      would fire, given the current session + hook context. Returns ABSTRACT
 *      decisions (block_tool / add_context / notify_user); the plugin's hook shim
 *      maps those to the CLI's hook JSON. This module never touches Claude Code
 *      directly, never blocks by itself - it only DECIDES.
 *   4. retro()     - the evening 60s digest: did today's focus dim move?
 *
 * Binding rules from the evidence (do not violate):
 *   - Fit-to-task, not elevation: a dim that did not apply is never "weak".
 *   - Observe-only is the safe default; LIVE is the caller's explicit choice.
 *   - Mechanism is open here; the personalized TIMING intelligence is the sealed
 *     paid tier and is NOT in this file (basic static thresholds only).
 */
const core = require("../coach-core");

/* ---------- the curriculum (data; dim-keyed; renders data-driven) ---------- */
// available:false gates lessons whose signal dim is not live yet (dims 8-13 / PRD-06).
const CURRICULUM = [
  // Module A - Context Engineering (front of every project; highest leverage)
  {
    lesson_id: "L1", dim: "context_setting", module: "Context Engineering", signal_dim: "context_setting", available: true,
    title: "Set the stage",
    concept_card: "Open a prompt like a brief to a new teammate: the goal, the exact files, and one constraint sentence. The model is not psychic; it fills silence with guesses. Precise-but-short beats long-and-vague every time.",
    drill: "Take your next bare one-liner and rewrite it with (1) the goal, (2) the file(s), (3) one constraint. Watch your Context Setting score on that turn.",
  },
  {
    lesson_id: "L2", dim: "scope_discipline", module: "Context Engineering", signal_dim: "scope_discipline", available: true,
    title: "One task per ask",
    concept_card: "A kitchen-sink prompt (\"do X and Y and also deploy\") produces a kitchen-sink mess you cannot review. One coherent task per ask keeps the diff small enough to actually check.",
    drill: "Next time you have a 3-goal prompt, split it into a sequence and send the first only.",
  },
  {
    lesson_id: "L4", dim: null, module: "Context Engineering", signal_dim: "scope_discipline", available: true, framing: true,
    title: "Calibrated delegation",
    concept_card: "More agency is NOT always better. For a well-understood one-liner, passive \"Oracle\" use is correct - typing it yourself is faster and you already know the answer. Fluency is knowing WHEN to delegate, not delegating maximally. This is the lesson that says: it is fine to just use the tool sometimes.",
    drill: "Before your next delegation, ask: do I already know this cold? If yes, do it yourself and move on. Calibration, not maximal engagement.",
  },
  // Module B - Plan & Verify (the discipline that flipped PNAS -17% to zero)
  {
    lesson_id: "L5", dim: "plan_first", module: "Plan & Verify", signal_dim: "plan_first", available: true,
    title: "Explore before you mutate",
    concept_card: "Cold-start delegation is where quality dies. Read or plan before the first editing action - even one exploration turn. The plan-gate exists because unplanned edits are the single strongest predictor of rework.",
    drill: "Before your next first edit on a fresh task, ask for a one-line plan (or use plan mode). Then let it build.",
  },
  {
    lesson_id: "L6", dim: "verification", module: "Plan & Verify", signal_dim: "verification", available: true,
    title: "Prove it works",
    concept_card: "Unverified AI output is the #1 skill-eroding behavior. End every mutating turn with evidence: a test run, a build, a curl - something that would FAIL if the change were wrong. Accepting on faith is how you get passively dumber. This is the highest-weighted dimension for a reason.",
    drill: "After your next AI edit, run something real before you accept it. No green, no accept.",
  },
  {
    lesson_id: "L7", dim: "iteration_discipline", module: "Plan & Verify", signal_dim: "iteration_discipline", available: true,
    title: "Read the diff",
    concept_card: "Six edits accepted blind is six chances for drift you now own. Read the diff, push back on one thing, or name an edge case. A bare \"ok\" is a missed rep and a future bug.",
    drill: "On your next batch of edits, actually read one diff and comment on a single line before accepting.",
  },
  // Module C - Debug & Iterate (what separates a driver from a passenger)
  {
    lesson_id: "L8", dim: "diagnose_vs_retry", module: "Debug & Iterate", signal_dim: "diagnose_vs_retry", available: true,
    title: "Diagnose, don't retry",
    concept_card: "\"Still broken, try again\" teaches the model nothing and teaches you nothing. A real failure follow-up carries the actual error text plus a hypothesis. Diagnosis is the muscle that atrophies fastest when you let AI thrash.",
    drill: "On your next failure, paste the real error and add one sentence: \"I think it is X because Y.\" Then ask.",
  },
  {
    lesson_id: "L9", dim: "iteration_discipline", module: "Debug & Iterate", signal_dim: "iteration_discipline", available: true,
    title: "Refine, don't blind-accept-or-abandon",
    concept_card: "Two failure modes look opposite but are the same passivity: taking the output whole, or bailing to do it yourself in frustration. Fluency is steering - scrutinize, keep the good part, redirect the rest.",
    drill: "Next time you want to accept-all or start over, instead name the one thing to change and ask for just that.",
  },
  // Module D - Understand & Own (so you get smarter, not dependent - the mission)
  {
    lesson_id: "L11", dim: "understanding_seeking", module: "Understand & Own", signal_dim: "understanding_seeking", available: true,
    title: "Seek understanding",
    concept_card: "The whole point: come out smarter, not more dependent. Once in a while, interrogate a decision that matters - \"why this approach over X?\" Genuine curiosity about tradeoffs (not a ritual \"why?\") is what compounds into judgment. Pure delegation is how you rent skill you never own.",
    drill: "On your next meaningful decision, ask the model to defend it against one alternative. Engage the answer.",
  },
];

const LESSON_BY_DIM = (() => {
  const m = {};
  for (const l of CURRICULUM) if (l.available && l.dim && !m[l.dim]) m[l.dim] = l;
  return m;
})();

function availableLessons() {
  return CURRICULUM.filter((l) => l.available);
}
function lessonForDim(dim) {
  return LESSON_BY_DIM[dim] || null;
}

/* ---------- today's focus dimension (the weakest recent APPLICABLE dim) ---------- */
// fit-to-task: a dim only counts where it was actually scored (coach-core omits NA
// dims), so a dim that did not apply is never "weak" and never a focus.
function focusDim(events, { window = 30 } = {}) {
  const turns = core.turnDimsList(events).slice(-window);
  if (!turns.length) return null;
  const sum = {};
  const cnt = {};
  for (const t of turns) {
    for (const [k, v] of Object.entries(t)) {
      if (!lessonForDim(k)) continue; // only dims we can actually teach
      sum[k] = (sum[k] || 0) + v;
      cnt[k] = (cnt[k] || 0) + 1;
    }
  }
  let worst = null;
  for (const k of Object.keys(sum)) {
    const avg = sum[k] / cnt[k];
    if (!worst || avg < worst.avg) worst = { dim: k, avg: Math.round(avg), n: cnt[k] };
  }
  if (!worst) return null;
  const lesson = lessonForDim(worst.dim);
  return {
    dim: worst.dim,
    avg: worst.avg,
    lesson_id: lesson.lesson_id,
    title: lesson.title,
    drill_line: lesson.drill,
    reason: `weakest recent dimension (${worst.avg}/100 over ${worst.n} turns)`,
  };
}

/* ---------- the intervention brain (the 3 forcing-function rules) ---------- */
// Returns ABSTRACT decisions. The plugin hook shim maps decision.type ->
// block_tool / add_context / notify_user -> the CLI's hook JSON. Static
// thresholds only (the open mechanism); personalized timing is the sealed tier.
const READ_TOOLS = new Set(["Read", "Grep", "Glob", "LS", "NotebookRead"]);
const MUTATE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const VERIFY_RE = /\b(test|pytest|jest|vitest|npm (run )?(test|build)|yarn (test|build)|make|cargo (test|build|check)|go test|curl|node .*\.test|build)\b/i;

function isVerifyBash(ev) {
  if (ev.event !== "tool_use") return false;
  const d = ev.data || {};
  const tool = d.tool || "";
  if (tool === "Bash") {
    const cmd = String(d.command || d.cmd || d.input || "");
    return VERIFY_RE.test(cmd);
  }
  return /test|build/i.test(tool);
}

/**
 * Evaluate the 3 rules for the CURRENT session.
 *  sessionEvents: this session's events (chronological).
 *  ctx: { hook: 'PreToolUse'|'Stop'|'PostToolUse'|..., tool?: 'Edit'|..., mode: 'observe'|'live' }
 * Returns the would-fire decisions (0..n). The caller (hook) applies rate-limit +
 * dismissal + observe/live: in observe mode it logs and injects nothing.
 */
function evaluate(sessionEvents, ctx = {}) {
  const evs = sessionEvents || [];
  const out = [];
  const tool = ctx.tool || "";

  // Rule 1 - plan gate (L5): first mutating edit of the session with zero prior
  // exploration -> block, ask for a one-line plan. Once per session.
  if (ctx.hook === "PreToolUse" && MUTATE_TOOLS.has(tool)) {
    let priorReads = 0;
    let priorMutations = 0;
    for (const ev of evs) {
      if (ev.event !== "tool_use") continue;
      const t = (ev.data && ev.data.tool) || "";
      if (READ_TOOLS.has(t)) priorReads++;
      if (MUTATE_TOOLS.has(t)) priorMutations++;
    }
    if (priorReads === 0 && priorMutations === 0) {
      out.push({
        rule: "plan_gate", lesson_id: "L5", dim: "plan_first",
        decision: { type: "block_tool", reason: "One line first: what's the plan? Explore or outline before the first edit - unplanned edits are the top predictor of rework." },
      });
    }
  }

  // Rule 2 - verify nudge (L6): at a turn boundary (Stop), an edit was made with
  // no verification since -> inject context to run it.
  if (ctx.hook === "Stop" || ctx.hook === "PostToolUse") {
    let lastMutateIdx = -1;
    let lastVerifyIdx = -1;
    evs.forEach((ev, i) => {
      const t = ev.event === "tool_use" ? (ev.data && ev.data.tool) || "" : "";
      if (MUTATE_TOOLS.has(t)) lastMutateIdx = i;
      if (isVerifyBash(ev)) lastVerifyIdx = i;
    });
    if (lastMutateIdx >= 0 && lastVerifyIdx < lastMutateIdx) {
      out.push({
        rule: "verify_nudge", lesson_id: "L6", dim: "verification",
        decision: { type: "add_context", reason: "You edited but haven't verified. Run the test/build/curl before accepting - unverified AI output is the #1 skill-eroding habit." },
      });
    }
  }

  // Rule 3 - read-the-diff flag (L7): N consecutive accepts with no diff read.
  if (ctx.hook === "PostToolUse" || ctx.hook === "Stop") {
    let streak = 0;
    for (const ev of evs) {
      if (ev.event !== "tool_use") continue;
      const t = (ev.data && ev.data.tool) || "";
      if (MUTATE_TOOLS.has(t)) streak++;
      else if (READ_TOOLS.has(t)) streak = 0;
    }
    if (streak >= 6) {
      out.push({
        rule: "read_diff", lesson_id: "L7", dim: "iteration_discipline",
        decision: { type: "notify_user", reason: `You've accepted ${streak} edits without reading a diff. Review one before the next - blind accepts are how drift becomes your bug.` },
      });
    }
  }

  return out;
}

/* ---------- evening retro: did today's focus dim move? ---------- */
function retro(events, { focusDimKey } = {}) {
  const turns = core.turnDimsList(events);
  const focus = focusDimKey || (focusDim(events) || {}).dim;
  if (!focus) return { focus_dim: null, note: "No scored turns yet - do one real task to get your first read." };
  const val = (arr) => {
    let s = 0, n = 0;
    for (const t of arr) if (Number.isFinite(t[focus])) { s += t[focus]; n++; }
    return n ? Math.round(s / n) : null;
  };
  const today = val(turns.slice(-10)); // proxy: most recent ~session
  const seven = val(turns.slice(-70));
  const delta = today !== null && seven !== null ? today - seven : null;
  const lesson = lessonForDim(focus);
  return {
    focus_dim: focus,
    lesson_id: lesson ? lesson.lesson_id : null,
    today, sevenday: seven, delta,
    moved: delta !== null && delta > 0,
    tomorrow_line: lesson ? lesson.drill : null,
  };
}

module.exports = {
  CURRICULUM, availableLessons, lessonForDim,
  focusDim, evaluate, retro,
  READ_TOOLS, MUTATE_TOOLS,
};

// CLI: node index.js focus|lessons|retro [eventsFile]
if (require.main === module) {
  const sub = process.argv[2] || "focus";
  const file = process.argv[3];
  const events = core.readEvents(file);
  if (sub === "focus") console.log(JSON.stringify(focusDim(events), null, 2));
  else if (sub === "retro") console.log(JSON.stringify(retro(events), null, 2));
  else if (sub === "lessons") console.log(JSON.stringify(availableLessons().map((l) => ({ id: l.lesson_id, dim: l.dim, title: l.title })), null, 2));
  else { console.error("usage: node index.js focus|lessons|retro [eventsFile]"); process.exit(2); }
}
