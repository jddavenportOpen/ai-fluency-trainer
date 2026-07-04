"use strict";
/**
 * @clawdacademy/coach-core - the ONE UI-free coaching engine (PRD-07 M1, the hinge).
 *
 * Both delivery modes are thin adapters over this single core: the harness-native
 * surfaces (coach TUI, statusline) and the standalone Electron app all read the
 * same on-device events.jsonl and compute the same XP/level (activity) + the
 * volume-independent Fluency Rating (quality). Weights mirror web/lib/stats.ts and
 * scorer/rubric.py - one canonical table, three runtimes.
 *
 * Contract: zero-dep, never renders, never touches the network, never mutates the
 * log. Pure functions in, computed profile out.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

/* ---- gamification (ACTIVITY - level/XP, demoted below the Rating everywhere) ---- */
const TITLES = ["Novice", "Apprentice", "Operator", "Collaborator", "Director", "Architect", "Conductor"];
const MAX_TITLE = "Virtuoso";
const titleFor = (lv) => (lv >= 7 ? MAX_TITLE : TITLES[lv] ?? MAX_TITLE);
// Level = largest N with totalXP >= 100*N*N.
const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100));
const xpForLevel = (lv) => 100 * lv * lv;

/* ---- fluency rating (QUALITY - the headline; canonical weights, mirrors stats.ts) ---- */
const DIM_WEIGHTS = {
  verification: 1.6,
  diagnose_vs_retry: 1.4,
  context_setting: 1.0,
  plan_first: 1.0,
  iteration_discipline: 1.0,
  understanding_seeking: 0.8,
  scope_discipline: 0.8,
};
const DEFAULT_WEIGHT = 1.0;
const RATING_WINDOW = 50; // mean quality of the most recent N scored turns
const RATING_MIN_TURNS = 15; // below this the Rating is "provisional"
const RATING_BANDS = [
  { min: 85, band: "Expert" },
  { min: 72, band: "Advanced" },
  { min: 58, band: "Proficient" },
  { min: 42, band: "Developing" },
  { min: 0, band: "Emerging" },
];

/** Weighted quality of one turn's dims (0-100). Volume-independent. */
function turnQuality(dims) {
  const keys = Object.keys(dims || {});
  if (!keys.length) return null;
  let sum = 0;
  let w = 0;
  for (const k of keys) {
    const wt = DIM_WEIGHTS[k] ?? DEFAULT_WEIGHT;
    sum += dims[k] * wt;
    w += wt;
  }
  return w ? sum / w : null;
}

/** Mean weighted-quality of the recent window. Grinding more turns can't inflate it. */
function fluencyRating(turnDims) {
  const recent = turnDims.slice(-RATING_WINDOW);
  const q = [];
  for (const d of recent) {
    const v = turnQuality(d);
    if (v !== null) q.push(v);
  }
  if (!q.length) return { score: 0, band: "Emerging", established: false, sampled: 0 };
  const score = Math.round(q.reduce((a, b) => a + b, 0) / q.length);
  const band = RATING_BANDS.find((b) => score >= b.min).band;
  return { score, band, established: q.length >= RATING_MIN_TURNS, sampled: q.length };
}

/* ---- events IO (the shared on-device log; the reuse seam) ---- */
/** Rebrand-forward dir resolution: CLAWDACADEMY_DIR, then legacy AI_FLUENCY_DIR,
 *  then ~/.ai-fluency. The events path stays stable so the shipped plugin keeps working. */
function coachDir() {
  return (
    process.env.CLAWDACADEMY_DIR ||
    process.env.AI_FLUENCY_DIR ||
    path.join(os.homedir(), ".ai-fluency")
  );
}
function eventsFile() {
  return path.join(coachDir(), "events.jsonl");
}
function parseLine(line) {
  const t = String(line).trim();
  if (!t) return null;
  try {
    const ev = JSON.parse(t);
    return ev && typeof ev === "object" && typeof ev.event === "string" ? ev : null;
  } catch {
    return null; // fail-open: skip malformed lines
  }
}
function readEvents(file) {
  let raw;
  try {
    raw = fs.readFileSync(file || eventsFile(), "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").map(parseLine).filter(Boolean);
}

/* ---- derived ---- */
/** Per-turn dims objects (numeric-clean), in order - the input to fluencyRating. */
function turnDimsList(events) {
  const out = [];
  for (const ev of events) {
    if (ev.event !== "turn_score") continue;
    const d = ev.data || {};
    const dims = d.dims && typeof d.dims === "object" ? d.dims : {};
    const clean = {};
    for (const [k, v] of Object.entries(dims)) {
      const n = Number(v);
      if (Number.isFinite(n)) clean[k] = n;
    }
    out.push(clean);
  }
  return out;
}
function aggregate(events) {
  const agg = { xp: 0, sessions: 0, turns: 0, dimSum: {}, dimCount: {} };
  for (const ev of events) {
    if (ev.event === "session_start") agg.sessions++;
    if (ev.event === "turn_score") {
      const d = ev.data || {};
      agg.xp += Number(d.xp) || 0;
      agg.turns++;
      const dims = d.dims && typeof d.dims === "object" ? d.dims : {};
      for (const [k, v] of Object.entries(dims)) {
        const val = Number(v);
        if (!Number.isFinite(val)) continue;
        agg.dimSum[k] = (agg.dimSum[k] || 0) + val;
        agg.dimCount[k] = (agg.dimCount[k] || 0) + 1;
      }
    }
  }
  return agg;
}
function dimAverages(agg) {
  const out = {};
  for (const k of Object.keys(agg.dimSum)) out[k] = Math.round(agg.dimSum[k] / agg.dimCount[k]);
  return out;
}
function prettify(k) {
  return String(k)
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The single call both front-ends use: the full computed profile from events. */
function profile(events) {
  const agg = aggregate(events);
  const rating = fluencyRating(turnDimsList(events));
  const avgs = dimAverages(agg);
  const sorted = Object.entries(avgs).sort((a, b) => b[1] - a[1]);
  const level = levelFor(agg.xp);
  return {
    // quality (headline)
    rating: rating.score,
    band: rating.band,
    established: rating.established,
    sampled: rating.sampled,
    // activity
    xp: agg.xp,
    level,
    title: titleFor(level),
    // usage
    sessions: agg.sessions,
    turns: agg.turns,
    // dimensions
    dims: avgs,
    strongest: sorted[0] ? { key: sorted[0][0], avg: sorted[0][1] } : null,
    weakest: sorted.length ? { key: sorted[sorted.length - 1][0], avg: sorted[sorted.length - 1][1] } : null,
  };
}

module.exports = {
  TITLES, MAX_TITLE, titleFor, levelFor, xpForLevel,
  DIM_WEIGHTS, DEFAULT_WEIGHT, RATING_WINDOW, RATING_MIN_TURNS, RATING_BANDS,
  turnQuality, fluencyRating,
  coachDir, eventsFile, parseLine, readEvents,
  turnDimsList, aggregate, dimAverages, prettify, profile,
};

// CLI: node index.js profile [eventsFile]  -> prints the computed profile as JSON
if (require.main === module) {
  const sub = process.argv[2] || "profile";
  if (sub === "profile") {
    console.log(JSON.stringify(profile(readEvents(process.argv[3])), null, 2));
  } else {
    console.error("usage: node index.js profile [eventsFile]");
    process.exit(2);
  }
}
