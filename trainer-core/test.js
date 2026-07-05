"use strict";
/* trainer-core regression guard (PRD-03). Run: node trainer-core/test.js */
const assert = require("node:assert");
const t = require("./index.js");

// --- curriculum ---
assert.equal(t.availableLessons().length, 9, "9 launch lessons");
assert.equal(t.lessonForDim("verification").lesson_id, "L6");
assert.equal(t.lessonForDim("plan_first").lesson_id, "L5");

// --- focusDim: the weakest APPLICABLE (teachable) dim ---
const hist = [
  { event: "turn_score", data: { xp: 40, dims: { verification: 90, context_setting: 30 } } },
  { event: "turn_score", data: { xp: 40, dims: { verification: 85, context_setting: 35 } } },
];
const f = t.focusDim(hist);
assert.equal(f.dim, "context_setting", "weakest dim is the focus");
assert.ok(f.drill_line && f.lesson_id === "L1");
// a dim that never scored is never a focus (fit-to-task)
assert.ok(t.focusDim([{ event: "turn_score", data: { dims: { verification: 20 } } }]).dim === "verification");

// --- intervention brain: plan gate (L5) ---
let d = t.evaluate([], { hook: "PreToolUse", tool: "Edit" });
assert.equal(d.length, 1);
assert.equal(d[0].rule, "plan_gate");
assert.equal(d[0].decision.type, "block_tool");
// does NOT gate if the user explored first
d = t.evaluate([{ event: "tool_use", data: { tool: "Read" } }], { hook: "PreToolUse", tool: "Edit" });
assert.equal(d.filter((x) => x.rule === "plan_gate").length, 0, "prior read = no gate");
// does NOT gate a non-mutating tool
assert.equal(t.evaluate([], { hook: "PreToolUse", tool: "Bash" }).length, 0);

// --- verify nudge (L6) ---
d = t.evaluate([{ event: "tool_use", data: { tool: "Edit" } }], { hook: "Stop" });
assert.ok(d.some((x) => x.rule === "verify_nudge" && x.decision.type === "add_context"), "edit + no verify = nudge");
// verified after the edit -> no nudge
d = t.evaluate(
  [{ event: "tool_use", data: { tool: "Edit" } }, { event: "tool_use", data: { tool: "Bash", command: "pytest -q" } }],
  { hook: "Stop" }
);
assert.equal(d.filter((x) => x.rule === "verify_nudge").length, 0, "verified = no nudge");

// --- read-the-diff flag (L7) ---
const sixEdits = Array.from({ length: 6 }, () => ({ event: "tool_use", data: { tool: "Edit" } }));
d = t.evaluate(sixEdits, { hook: "Stop" });
assert.ok(d.some((x) => x.rule === "read_diff" && x.decision.type === "notify_user"), "6 blind accepts = flag");
// a read resets the streak
const withRead = [...sixEdits.slice(0, 3), { event: "tool_use", data: { tool: "Read" } }, ...sixEdits.slice(0, 2)];
assert.equal(t.evaluate(withRead, { hook: "Stop" }).filter((x) => x.rule === "read_diff").length, 0, "a read resets the streak");

// --- retro shape ---
const r = t.retro(hist);
assert.ok(r.focus_dim === "context_setting" && r.lesson_id === "L1");

console.log("trainer-core: all assertions pass ✓");
