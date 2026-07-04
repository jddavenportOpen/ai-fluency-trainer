"use strict";
/* coach-core regression guard (PRD-07 M1). Run: node coach-core/test.js */
const assert = require("node:assert");
const c = require("./index.js");

// --- activity math (level/XP/title) ---
assert.equal(c.levelFor(0), 0);
assert.equal(c.levelFor(100), 1);
assert.equal(c.levelFor(7592), 8); // matches the live TUI parity check
assert.equal(c.titleFor(8), "Virtuoso");
assert.equal(c.titleFor(3), "Collaborator");
assert.equal(c.xpForLevel(3), 900);

// --- fluency rating: quality, provisional gate, volume-independence ---
const hi = Array.from({ length: 20 }, () => ({ verification: 90, plan_first: 85, context_setting: 80 }));
const lo = Array.from({ length: 20 }, () => ({ verification: 20, plan_first: 25, context_setting: 30 }));
assert.ok(c.fluencyRating(hi).score > c.fluencyRating(lo).score, "quality discrimination");
assert.ok(c.fluencyRating(hi).established, "20 turns established");
assert.equal(c.fluencyRating(hi.slice(0, 10)).established, false, "10 turns provisional");
// grinding more turns of the same quality must NOT raise the score
const many = Array.from({ length: 60 }, () => ({ verification: 70 }));
const few = Array.from({ length: 20 }, () => ({ verification: 70 }));
assert.equal(c.fluencyRating(many).score, c.fluencyRating(few).score, "volume-independent");
// verification (weight 1.6) must outrank scope_discipline (weight 0.8)
const vHeavy = Array.from({ length: 15 }, () => ({ verification: 80, scope_discipline: 40 }));
const sHeavy = Array.from({ length: 15 }, () => ({ verification: 40, scope_discipline: 80 }));
assert.ok(c.fluencyRating(vHeavy).score > c.fluencyRating(sHeavy).score, "weighted toward verification");

// --- profile() from raw events ---
const events = [
  { event: "session_start", data: {} },
  { event: "turn_score", data: { xp: 40, dims: { verification: 80, plan_first: 70 } } },
  { event: "turn_score", data: { xp: 55, dims: { verification: 60, plan_first: 90 } } },
  { event: "garbage" },
];
const p = c.profile(events);
assert.equal(p.xp, 95);
assert.equal(p.turns, 2);
assert.equal(p.sessions, 1);
assert.ok(p.rating > 0 && p.rating <= 100);
assert.ok(p.weakest && p.strongest, "dims summarized");

console.log("coach-core: all assertions pass ✓");
