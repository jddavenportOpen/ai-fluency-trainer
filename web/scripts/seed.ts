/**
 * Seed the local SQLite db with a demo user ("jd" / token "dev-token-jd") and
 * realistic fixture-shaped data: 4 synthesized coaching sessions with 18
 * turn_score events (varied dims), plus the repo fixture event logs
 * (fixtures/out/*.events.jsonl) if present.
 *
 * Run from web/:  npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { getDb, upsertUser, ingestEvents, type IngestEvent } from "../lib/db.ts";

const HANDLE = "jd";
const TOKEN = "dev-token-jd";

// Dimension keys are data-driven by contract; this is just what the demo data uses.
const DIMS = [
  "context_setting",
  "verification",
  "delegation_quality",
  "iteration_discipline",
  "scope_discipline",
  "plan_before_build",
] as const;

const TIPS: Record<(typeof DIMS)[number], string[]> = {
  context_setting: [
    "Name the exact files and constraints up front — the agent read 4 wrong files before finding auth.py.",
    "Paste the error text instead of describing it; verbatim beats paraphrase.",
  ],
  verification: [
    "You accepted the diff without running tests — ask for a test run before moving on.",
    "Ask the agent to prove the fix with a repro command, not just claim it.",
  ],
  delegation_quality: [
    "Split 'build the dashboard' into scoped turns — one component per ask lands cleaner.",
    "State the acceptance criteria in the prompt so the agent can self-check.",
  ],
  iteration_discipline: [
    "'It doesn't work' triggers blind retries — describe WHAT failed and where.",
    "After two failed attempts, stop and ask for a diagnosis before retry #3.",
  ],
  scope_discipline: [
    "The agent refactored 3 unrelated files — add 'surgical changes only' to the ask.",
    "Pin the blast radius: name the files the agent may touch.",
  ],
  plan_before_build: [
    "Ask for a short plan and review it before any code is written on multi-file work.",
    "A 30-second plan review caught a schema mismatch last time — keep doing it.",
  ],
};

const HIGHLIGHTS: Record<(typeof DIMS)[number], string[]> = {
  context_setting: ["Named the exact files and constraints before asking for code."],
  verification: ["Ran the test suite before accepting the change.", "Asked for a repro command and checked the output."],
  delegation_quality: ["Scoped the ask to one component with clear acceptance criteria."],
  iteration_discipline: ["Reported the exact failing assertion instead of 'try again'."],
  scope_discipline: ["Pinned the blast radius to two files — the diff stayed surgical."],
  plan_before_build: ["Requested a plan first and caught an API mismatch in review."],
};

/** Deterministic pseudo-random so the seed is stable run-to-run. */
let rngState = 42;
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}

function iso(base: Date, minutesOffset: number): string {
  return new Date(base.getTime() + minutesOffset * 60_000).toISOString();
}

function buildSession(
  sid: string,
  day: Date,
  turnCount: number,
  skillBias: number // 0..1 — higher = better scores (trend improves across sessions)
): IngestEvent[] {
  const evs: IngestEvent[] = [];
  let m = 0;
  evs.push({
    v: 1, ts: iso(day, m), sid, event: "session_start",
    data: { source: "startup", cwd_hash: "seedhash", transcript_path: `/tmp/${sid}.jsonl` },
  });
  for (let turn = 1; turn <= turnCount; turn++) {
    m += 2;
    const words = 8 + Math.floor(rand() * 60);
    evs.push({
      v: 1, ts: iso(day, m), sid, event: "prompt",
      data: { text: "[seeded]", chars: words * 6, words },
    });
    const tools = 1 + Math.floor(rand() * 4);
    for (let t = 0; t < tools; t++) {
      m += 1;
      evs.push({
        v: 1, ts: iso(day, m), sid, event: "tool_use",
        data: { tool: ["Read", "Edit", "Bash", "Write", "Grep"][Math.floor(rand() * 5)], ok: rand() > 0.1, input_keys: ["file_path"] },
      });
    }
    m += 1;
    evs.push({ v: 1, ts: iso(day, m), sid, event: "turn_end", data: { transcript_path: `/tmp/${sid}.jsonl` } });

    // turn_score — each turn scores a subset of dims with varied values
    const dims: Record<string, number> = {};
    for (const d of DIMS) {
      if (rand() < 0.8) {
        const base = 30 + skillBias * 45;
        const spread = (rand() - 0.5) * 40;
        // give each dim a personality so the radar isn't a circle
        const personality =
          d === "verification" ? -18 : d === "iteration_discipline" ? -10 :
          d === "context_setting" ? 12 : d === "plan_before_build" ? -4 : 5;
        dims[d] = Math.max(5, Math.min(98, Math.round(base + spread + personality)));
      }
    }
    const scored = Object.keys(dims) as (typeof DIMS)[number][];
    const worst = scored.sort((a, b) => dims[a] - dims[b])[0];
    const best = scored.sort((a, b) => dims[b] - dims[a])[0];
    const xp = 10 + Math.floor((Object.values(dims).reduce((s, v) => s + v, 0) / Math.max(1, scored.length) / 100) * 40);
    m += 1;
    evs.push({
      v: 1, ts: iso(day, m), sid, event: "turn_score",
      data: {
        turn, dims, xp,
        tip: TIPS[worst][Math.floor(rand() * TIPS[worst].length)],
        highlight: HIGHLIGHTS[best][Math.floor(rand() * HIGHLIGHTS[best].length)],
      },
    });
  }
  m += 2;
  evs.push({ v: 1, ts: iso(day, m), sid, event: "session_end", data: { reason: "exit" } });
  return evs;
}

function loadFixtureEvents(): IngestEvent[] {
  const dir = path.resolve(process.cwd(), "..", "fixtures", "out");
  if (!fs.existsSync(dir)) return [];
  const out: IngestEvent[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".events.jsonl"))) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { out.push(JSON.parse(trimmed)); } catch { /* skip bad line */ }
    }
  }
  return out;
}

// ---- main ----
const db = getDb();
const user = upsertUser(HANDLE, TOKEN);

// idempotent: wipe this user's data before reseeding
db.prepare("DELETE FROM events WHERE user_id = ?").run(user.id);
db.prepare("DELETE FROM turn_scores WHERE user_id = ?").run(user.id);
db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run("2026-05-14T16:20:00.000Z", user.id);

const sessions: IngestEvent[] = [
  ...buildSession("seed-s1", new Date("2026-06-20T14:05:00Z"), 4, 0.25),
  ...buildSession("seed-s2", new Date("2026-06-24T09:30:00Z"), 5, 0.45),
  ...buildSession("seed-s3", new Date("2026-06-28T19:10:00Z"), 4, 0.65),
  ...buildSession("seed-s4", new Date("2026-07-02T10:45:00Z"), 5, 0.85),
];
const fixtures = loadFixtureEvents();

const stored = ingestEvents(user.id, [...fixtures, ...sessions]);
const scoreCount = (db.prepare("SELECT COUNT(*) AS n FROM turn_scores WHERE user_id = ?").get(user.id) as { n: number }).n;
const xpTotal = (db.prepare("SELECT COALESCE(SUM(xp),0) AS x FROM turn_scores WHERE user_id = ?").get(user.id) as { x: number }).x;

console.log(`Seeded user "${HANDLE}" (device token: ${TOKEN})`);
console.log(`  events stored:      ${stored} (${fixtures.length} from fixtures/out)`);
console.log(`  turn_score rows:    ${scoreCount}`);
console.log(`  total XP:           ${xpTotal}`);
