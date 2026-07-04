import type { TurnScoreRow } from "./db.ts";

export const LEVEL_TITLES = [
  "Novice",       // 0
  "Apprentice",   // 1
  "Operator",     // 2
  "Collaborator", // 3
  "Director",     // 4
  "Architect",    // 5
  "Conductor",    // 6
];
export const MAX_TITLE = "Virtuoso"; // 7+

export function levelTitle(level: number): string {
  return level >= 7 ? MAX_TITLE : LEVEL_TITLES[level] ?? MAX_TITLE;
}

/* The ONE canonical scoring weight table (mirrors scorer/rubric.py). db.ts
 * imports these — do not redeclare weights anywhere else. */
export const DIM_WEIGHTS: Record<string, number> = {
  verification: 1.6,
  diagnose_vs_retry: 1.4,
  context_setting: 1.0,
  plan_first: 1.0,
  iteration_discipline: 1.0,
  understanding_seeking: 0.8,
  scope_discipline: 0.8,
};
export const DEFAULT_WEIGHT = 1.0;

/** Weighted quality of a single turn's dims (0-100). Volume-independent. */
export function turnQuality(dims: Record<string, number>): number | null {
  const keys = Object.keys(dims);
  if (keys.length === 0) return null;
  let sum = 0;
  let wsum = 0;
  for (const k of keys) {
    const w = DIM_WEIGHTS[k] ?? DEFAULT_WEIGHT;
    sum += dims[k] * w;
    wsum += w;
  }
  return wsum ? sum / wsum : null;
}

/* The recruiter-facing headline: a QUALITY rating that does not grow with turn
 * count. It is the mean weighted-quality of the most recent N scored turns, so
 * grinding more turns can't inflate it — only scoring better can. Provisional
 * until enough turns exist to be meaningful. */
export const RATING_WINDOW = 50;
export const RATING_MIN_TURNS = 15;
const RATING_BANDS: { min: number; band: string }[] = [
  { min: 85, band: "Expert" },
  { min: 72, band: "Advanced" },
  { min: 58, band: "Proficient" },
  { min: 42, band: "Developing" },
  { min: 0, band: "Emerging" },
];

export function fluencyRating(scores: TurnScoreRow[]): {
  score: number; // 0-100 quality
  band: string;
  established: boolean; // false => "provisional", too few turns
  sampled: number; // turns that fed the rating
} {
  const recent = scores.slice(-RATING_WINDOW);
  const qualities: number[] = [];
  for (const s of recent) {
    const q = turnQuality(parseDims(s));
    if (q !== null) qualities.push(q);
  }
  if (qualities.length === 0) {
    return { score: 0, band: "Emerging", established: false, sampled: 0 };
  }
  const score = Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length);
  const band = RATING_BANDS.find((b) => score >= b.min)!.band;
  return { score, band, established: qualities.length >= RATING_MIN_TURNS, sampled: qualities.length };
}

/** Level = largest N with totalXP >= 100*N*N (level 0 start). */
export function levelForXP(totalXP: number): number {
  if (totalXP <= 0) return 0;
  return Math.floor(Math.sqrt(totalXP / 100));
}

export function levelProgress(totalXP: number): {
  level: number;
  title: string;
  nextLevelXP: number;
  currentLevelXP: number;
  pct: number; // 0..100 progress toward next level
} {
  const level = levelForXP(totalXP);
  const currentLevelXP = 100 * level * level;
  const nextLevelXP = 100 * (level + 1) * (level + 1);
  const pct = Math.max(
    0,
    Math.min(100, ((totalXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100)
  );
  return { level, title: levelTitle(level), nextLevelXP, currentLevelXP, pct };
}

export function totalXP(scores: TurnScoreRow[]): number {
  return scores.reduce((sum, s) => sum + (s.xp || 0), 0);
}

export function parseDims(row: TurnScoreRow): Record<string, number> {
  try {
    const dims = JSON.parse(row.dims_json);
    if (dims && typeof dims === "object") {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(dims)) {
        const n = Number(v);
        if (Number.isFinite(n)) out[k] = n;
      }
      return out;
    }
  } catch {
    /* fail-open */
  }
  return {};
}

/** Per-dimension averages across all scored turns. Keys are data-driven. */
export function dimAverages(scores: TurnScoreRow[]): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const row of scores) {
    for (const [k, v] of Object.entries(parseDims(row))) {
      (sums[k] ??= { total: 0, n: 0 }).total += v;
      sums[k].n++;
    }
  }
  const out: Record<string, number> = {};
  for (const [k, { total, n }] of Object.entries(sums)) out[k] = Math.round(total / n);
  return out;
}

export function prettifyDim(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export interface WeakDim {
  key: string;
  avg: number;
  tips: string[]; // most recent tips from low-scoring turns on this dim
}

/* Tips are local-only by default (they can embed prompt fragments; syncing
 * them requires explicit opt-in), so the improvement panel needs behavioral
 * prescriptions derived from the dim alone. Unknown dims get the generic line. */
const DIM_ADVICE: Record<string, string> = {
  context_setting:
    "Open prompts like a brief to a new teammate: the goal, the exact files, and one constraint sentence. Short but precise beats long and vague.",
  plan_first:
    "Before the first edit, ask for a plan or use plan mode — review the approach, then let it build. Cold-start delegation is where quality dies.",
  verification:
    "End every mutating turn with evidence: a test run, a build, or a curl. Unverified AI output is the #1 skill-eroding behavior.",
  diagnose_vs_retry:
    "When something fails, paste the actual error text and add a hypothesis before retrying. \"Still broken\" teaches the model nothing.",
  understanding_seeking:
    "Once in a while, interrogate a decision that matters: \"why this approach over X?\" Genuine curiosity about tradeoffs — not a ritual \"why?\".",
  scope_discipline:
    "One coherent task per ask. Kitchen-sink prompts (\"also do X and Y and deploy it\") produce unreviewable batches.",
  iteration_discipline:
    "Engage with the output: read the diff, push back on one thing, or name an edge case. A bare \"ok\" is a missed rep.",
};
const GENERIC_ADVICE =
  "Look at your recent low-scoring turns on this dimension in the coach app for specific, in-context guidance.";

export function adviceFor(dimKey: string): string {
  return DIM_ADVICE[dimKey] ?? GENERIC_ADVICE;
}

/** The `count` weakest dimensions, each with its most recent relevant tips. */
export function weakestDims(scores: TurnScoreRow[], count = 3): WeakDim[] {
  const avgs = dimAverages(scores);
  const weakest = Object.entries(avgs)
    .sort((a, b) => a[1] - b[1])
    .slice(0, count);
  return weakest.map(([key, avg]) => {
    // Recent turns where this dim was scored, worst-leaning first by recency.
    const relevant = scores
      .filter((s) => key in parseDims(s) && s.tip)
      .sort((a, b) => {
        const da = parseDims(a)[key];
        const db = parseDims(b)[key];
        // prefer turns where this dim scored at-or-below its average, then newest
        const aLow = da <= avg ? 0 : 1;
        const bLow = db <= avg ? 0 : 1;
        if (aLow !== bLow) return aLow - bLow;
        return b.ts.localeCompare(a.ts);
      });
    const tips: string[] = [];
    for (const r of relevant) {
      if (r.tip && !tips.includes(r.tip)) tips.push(r.tip);
      if (tips.length >= 2) break;
    }
    return { key, avg, tips };
  });
}

export function strongestDims(
  scores: TurnScoreRow[],
  count = 3
): { key: string; avg: number }[] {
  return Object.entries(dimAverages(scores))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, avg]) => ({ key, avg }));
}

export interface SessionXP {
  sid: string;
  xp: number;
  turns: number;
  firstTs: string;
}

/** XP totals grouped by session, in chronological order. */
export function xpBySession(scores: TurnScoreRow[]): SessionXP[] {
  const map = new Map<string, SessionXP>();
  for (const s of scores) {
    const cur = map.get(s.sid);
    if (cur) {
      cur.xp += s.xp;
      cur.turns++;
      if (s.ts < cur.firstTs) cur.firstTs = s.ts;
    } else {
      map.set(s.sid, { sid: s.sid, xp: s.xp, turns: 1, firstTs: s.ts });
    }
  }
  return [...map.values()].sort((a, b) => a.firstTs.localeCompare(b.firstTs));
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
