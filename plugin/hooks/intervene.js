#!/usr/bin/env node
"use strict";
/*
 * Clawdacademy intervention hook (PRD-03) - the coaching baked INTO Claude Code's
 * harness. Claude Code calls this at decision points (PreToolUse / PostToolUse /
 * UserPromptSubmit); it asks trainer-core what to do and either just LOGS it
 * (observe) or emits the CLI hook JSON to act (live).
 *
 * Non-negotiable safety (a nag gets uninstalled and trains nobody):
 *   - OBSERVE-ONLY by default: log a would-fire `intervention` event, inject nothing.
 *   - LIVE only when config.coach_mode === "live" (the app / `coach me harder`).
 *   - Interactive human sessions only (reuse capture.py's kind cache; agents/headless never get coached).
 *   - Once per session per rule; per-rule + global dismissal honored.
 *   - Fail-open: ANY error exits 0 with no decision. The session is never degraded.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const DIR = process.env.CLAWDACADEMY_DIR || process.env.AI_FLUENCY_DIR || path.join(os.homedir(), ".ai-fluency");
const STATE = path.join(DIR, "state");

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function writeJson(p, o) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); } catch {} }
function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function out(obj) { try { process.stdout.write(JSON.stringify(obj)); } catch {} }

// Resolve the shared engines in dev checkout OR bundled beside the plugin.
function engine(name) {
  for (const c of [
    path.join(__dirname, "..", "..", name),   // dev: repo/plugin/hooks -> repo/<name>
    path.join(__dirname, "..", name),         // bundled: plugin/<name>
    path.join(__dirname, name),
    path.join(os.homedir(), "code/ai-fluency-trainer", name),
  ]) { try { return require(path.join(c, "index.js")); } catch {} }
  return null;
}

function emit(sid, event, data) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(path.join(DIR, "events.jsonl"),
      JSON.stringify({ v: 1, ts: nowIso(), sid, event, data }) + "\n");
  } catch {}
}

// Interactive-only: reuse the kind capture.py already cached per sid.
function isInteractive(sid) {
  const safe = (String(sid).replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown");
  const k = readJson(path.join(STATE, `kind-${safe}.json`));
  const cfg = readJson(path.join(DIR, "config.json")) || {};
  if (cfg.coach_all_sessions) return true;
  return k && k.kind === "interactive";
}

// Map a decision from trainer-core onto the current CLI's hook-output schema.
// This is the ONE version-pinned shim (fail-open on anything unexpected).
function shim(hook, decision) {
  if (decision.type === "block_tool" && hook === "PreToolUse") {
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: decision.reason } };
  }
  if (hook === "Stop") {
    // Stop's documented control is decision:block (force Claude to continue with
    // the reason) - the right lever for "don't finish until you verify".
    return { decision: "block", reason: `[Clawdacademy coach] ${decision.reason}` };
  }
  // UserPromptSubmit / PostToolUse -> a system reminder the model reads (and relays).
  return { hookSpecificOutput: { hookEventName: hook, additionalContext: `[Clawdacademy coach] ${decision.reason}` } };
}

function main() {
  let p = {};
  try { p = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(0); }
  const hook = p.hook_event_name || "";
  const sid = p.session_id || "unknown";
  const tool = p.tool_name || "";

  const trainer = engine("trainer-core");
  const core = engine("coach-core");
  if (!trainer || !core) process.exit(0);
  if (!isInteractive(sid)) process.exit(0);

  const cfg = readJson(path.join(DIR, "config.json")) || {};
  const mode = cfg.coach_mode === "live" ? "live" : "observe"; // safe default

  const events = core.readEvents(path.join(DIR, "events.jsonl")).filter((e) => e.sid === sid);

  // Morning focus-dim reminder: once/day on the first prompt.
  if (hook === "UserPromptSubmit") {
    const dailyP = path.join(STATE, `daily-${today()}.json`);
    const daily = readJson(dailyP) || {};
    const f = trainer.focusDim(events);
    if (f && !daily.focus_dim) {
      emit(sid, "focus_dim", { dim: f.dim, lesson_id: f.lesson_id, reason: f.reason, drill_line: f.drill_line, date: today() });
      daily.focus_dim = f.dim; writeJson(dailyP, daily);
      if (mode === "live") out(shim(hook, { type: "add_context", reason: `Today's one thing: ${f.title}. ${f.drill_line}` }));
    }
    process.exit(0);
  }

  // The 3 forcing-function rules.
  const decisions = trainer.evaluate(events, { hook, tool });
  const rlP = path.join(STATE, `trainer-rl-${(String(sid).replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown")}.json`);
  const st = readJson(rlP) || { fired: {}, dismissed: {} };
  const globalDismiss = (readJson(path.join(DIR, "config.json")) || {}).coach_off;
  for (const d of decisions) {
    if (globalDismiss || st.dismissed[d.rule] || st.fired[d.rule]) continue; // once/session + dismissible
    const fired = mode === "live";
    emit(sid, "intervention", { rule: d.rule, dim: d.dim, lesson_id: d.lesson_id, mode, fired });
    if (fired) {
      st.fired[d.rule] = nowIso();
      writeJson(rlP, st);
      out(shim(hook, d.decision)); // one decision per hook invocation
      process.exit(0);
    }
  }
  process.exit(0);
}

try { main(); } catch { process.exit(0); }
