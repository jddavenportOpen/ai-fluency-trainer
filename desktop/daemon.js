"use strict";
/*
 * Clawdacademy background daemon (PRD-07 M2) - the headless coaching harness.
 *
 * A plain Node process (NOT a Chromium window - that is the whole point: it keeps
 * coaching alive when the app window is closed at near-zero RAM). It tails the
 * shared events.jsonl, maintains the live profile via coach-core, writes a status
 * snapshot other surfaces (tray, window, statusline) read, and emits nudge events
 * (level-up, rating change) a supervisor/tray can surface as notifications.
 *
 * Same engine as mode B - one core, two front-ends. Never mutates the log; never
 * touches the network (sync stays the opt-in aggregate-only sync.py path).
 */
const fs = require("node:fs");
const path = require("node:path");
const core = require("../coach-core");

const STATUS_FILE = path.join(core.coachDir(), "daemon-status.json");

function snapshot() {
  const p = core.profile(core.readEvents());
  const out = { ...p, updatedAt: new Date().toISOString(), pid: process.pid };
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(out, null, 2));
  } catch {
    /* fail-open: a snapshot write failure must never crash the harness */
  }
  return out;
}

/**
 * Poll the events file; on change, recompute + snapshot + emit nudges.
 * Returns the interval handle so a supervisor can clear it. Polling (not fs.watch)
 * because it is portable across Win/Mac and survives truncation/rotation.
 */
function watch({ onUpdate = () => {}, intervalMs = 1000 } = {}) {
  const file = core.eventsFile();
  let lastSize = -1;
  let lastRating = null;
  let lastLevel = null;

  const tick = () => {
    let size = -1;
    try { size = fs.statSync(file).size; } catch { size = -1; }
    if (size === lastSize) return;
    lastSize = size;

    const snap = snapshot();
    const nudges = [];
    if (lastLevel !== null && snap.level > lastLevel) {
      nudges.push({ type: "level_up", level: snap.level, title: snap.title });
    }
    if (lastRating !== null && snap.established && snap.rating !== lastRating) {
      nudges.push({ type: "rating_change", from: lastRating, to: snap.rating, band: snap.band, dir: snap.rating > lastRating ? "up" : "down" });
    }
    lastLevel = snap.level;
    lastRating = snap.rating;
    onUpdate(snap, nudges);
  };

  tick(); // seed immediately
  const h = setInterval(tick, intervalMs);
  if (h.unref) h.unref();
  return h;
}

module.exports = { snapshot, watch, STATUS_FILE };

// CLI: node daemon.js --once  (print snapshot + exit)  |  node daemon.js  (watch)
if (require.main === module) {
  if (process.argv.includes("--once")) {
    console.log(JSON.stringify(snapshot(), null, 2));
    process.exit(0);
  }
  process.stderr.write(`[clawdacademy-daemon] watching ${core.eventsFile()} (pid ${process.pid})\n`);
  const handle = watch({
    intervalMs: 1000,
    onUpdate: (snap, nudges) => {
      for (const n of nudges) process.stderr.write(`[daemon] ${n.type} ${JSON.stringify(n)}\n`);
    },
  });
  if (handle.ref) handle.ref(); // keep the process alive when run directly
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}
