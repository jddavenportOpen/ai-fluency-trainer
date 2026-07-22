/**
 * Per-user diagnostic: top strengths and bottom growth areas with coaching copy
 * grounded in rubric.py signals (context_setting, plan_first, verification,
 * diagnose_vs_retry, understanding_seeking, scope_discipline, iteration_discipline).
 *
 * Selection: sort dim averages desc for strengths, asc for growth areas.
 * MIN_TURNS_FOR_DIAGNOSTIC = 6 (same as onboarding gate in the profile page)
 * so we only surface coaching when there is enough signal.
 */

export const MIN_TURNS_FOR_DIAGNOSTIC = 6;

export interface DiagnosticDim {
  key: string;
  label: string;
  avg: number;
  /** Percentile vs cohort, 0-100. Null when cohort data not available. */
  percentile: number | null;
  coaching: string;
  /** Short description of what "good" looks like — used in the strength frame. */
  strengthFrame: string;
}

export interface Diagnostic {
  strengths: DiagnosticDim[];
  growthAreas: DiagnosticDim[];
}

/** Human label for each dimension key (mirrors rubric.py "name" field). */
export const DIM_LABELS: Record<string, string> = {
  context_setting: "Context Setting",
  plan_first: "Plan Before Build",
  verification: "Verification",
  diagnose_vs_retry: "Diagnose vs Blind Retry",
  understanding_seeking: "Understanding Seeking",
  scope_discipline: "Scope Discipline",
  iteration_discipline: "Iteration & Scrutiny",
};

/**
 * Coaching copy grounded in rubric.py tip templates and research IDs.
 * Each entry has:
 *   coaching  — what to DO differently (growth frame, quoted from DIM_ADVICE / tip patterns)
 *   strengthFrame — what the high score signals (from rubric.py "highlights" patterns)
 */
const DIM_COACHING: Record<string, { coaching: string; strengthFrame: string }> = {
  context_setting: {
    coaching:
      "Open every prompt like a brief to a new teammate: state the exact files (app/auth.py-style paths), the goal, and one constraint sentence (\"must use the existing X\", \"don't touch Y\"). Precise is better than long.",
    strengthFrame:
      "You anchor tasks to real files and explicit constraints — Claude doesn't have to guess your codebase.",
  },
  plan_first: {
    coaching:
      "Before the first edit, ask for a plan and review it. Try: \"read X and Y, then give me a plan — don't code yet.\" Cold-start delegation (straight to edits) is where quality erodes fastest.",
    strengthFrame:
      "You make Claude plan and explore before touching code — the highest-leverage habit in the rubric.",
  },
  verification: {
    coaching:
      "End every mutating turn with evidence: a test run, a build, or a curl. Unverified AI output is the number one skill-eroding behavior. Make \"run the tests\" part of every prompt that changes files.",
    strengthFrame:
      "You close the edit-run-prove loop every turn — demanding evidence instead of trusting the diff.",
  },
  diagnose_vs_retry: {
    coaching:
      "When something fails, paste the actual error text and add a hypothesis before retrying. \"Still broken\" teaches the model nothing. Give Claude something to reason from: what failed, where, and what you suspect.",
    strengthFrame:
      "You turn failures into diagnoses — error details, observations, and a hypothesis instead of a blind retry.",
  },
  understanding_seeking: {
    coaching:
      "Once in a while, interrogate a decision that matters: \"why this approach over X?\" or \"walk me through the tradeoff.\" Genuine curiosity about design decisions is how AI use builds skill instead of replacing it.",
    strengthFrame:
      "You delegate the typing, not the thinking — asking for reasoning, not just results.",
  },
  scope_discipline: {
    coaching:
      "One coherent task per prompt. Kitchen-sink asks (\"also do X and Y and deploy it\") produce monolithic unreviewable changes. Sequence tasks so you can verify each piece before the next.",
    strengthFrame:
      "Tight, single-task prompts — every change is reviewable and verifiable before the next starts.",
  },
  iteration_discipline: {
    coaching:
      "Read the diff and push back on one thing before accepting. Even \"what edge cases does this miss?\" beats a bare ok. The turn after a big edit is where experts scrutinize — make it a habit.",
    strengthFrame:
      "You engage with output — refine it, challenge it, or name an edge case — instead of rubber-stamping.",
  },
};

const FALLBACK_COACHING: { coaching: string; strengthFrame: string } = {
  coaching: "Check the coach app for in-context, turn-specific guidance on this dimension.",
  strengthFrame: "Consistently strong on this dimension across your scored sessions.",
};

/**
 * Map from leaderboard dim column names to the canonical dim key used in
 * dims_json / DIM_LABELS. The leaderboard shortens "diagnose_vs_retry" to
 * "diagnose" and "understanding_seeking" to "understanding" etc.
 */
const LEADERBOARD_COL_TO_KEY: Record<string, string> = {
  dim_context_setting: "context_setting",
  dim_plan_first: "plan_first",
  dim_verification: "verification",
  dim_diagnose: "diagnose_vs_retry",
  dim_understanding: "understanding_seeking",
  dim_scope: "scope_discipline",
  dim_iteration: "iteration_discipline",
};

/**
 * Derive cohort percentile stats per dim from leaderboard rows.
 * Only uses rows for established users with non-null dim values.
 * Returns a map from dim key -> { mean, p25, p75 } or empty if too few peers.
 */
export function cohortStatsFromLeaderboard(
  rows: Array<Record<string, unknown>>,
  selfUserId: number
): Record<string, { mean: number; p25: number; p75: number }> {
  const peers = rows.filter((r) => r.user_id !== selfUserId && r.established);
  if (peers.length < 3) return {};

  const result: Record<string, { mean: number; p25: number; p75: number }> = {};

  for (const [col, key] of Object.entries(LEADERBOARD_COL_TO_KEY)) {
    const vals = peers
      .map((r) => r[col])
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => a - b);

    if (vals.length < 3) continue;
    const mean = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const p25 = vals[Math.floor(vals.length * 0.25)];
    const p75 = vals[Math.floor(vals.length * 0.75)];
    result[key] = { mean, p25, p75 };
  }

  return result;
}

/**
 * Build a per-user diagnostic from their dimension averages.
 *
 * @param avgs       Result of dimAverages(scores) — keys are dim keys, values 0-100.
 * @param cohortAvgs Optional: cohort stats per dim from cohortStatsFromLeaderboard().
 *                   Pass null to skip percentile computation.
 * @param topN       How many dims to surface in each group (default: 3).
 */
export function buildDiagnostic(
  avgs: Record<string, number>,
  cohortAvgs: Record<string, { mean: number; p25: number; p75: number }> | null,
  topN = 3
): Diagnostic {
  const entries = Object.entries(avgs);
  if (entries.length === 0) return { strengths: [], growthAreas: [] };

  const sorted = [...entries].sort((a, b) => b[1] - a[1]);

  function toDiagnosticDim([key, avg]: [string, number]): DiagnosticDim {
    const copy = DIM_COACHING[key] ?? FALLBACK_COACHING;
    let percentile: number | null = null;
    if (cohortAvgs && cohortAvgs[key]) {
      const { p25, p75 } = cohortAvgs[key];
      // Linear interpolation: p25 -> 25th, p75 -> 75th. Clamped 1-99.
      if (avg <= p25) {
        percentile = Math.round(Math.max(1, (avg / p25) * 25));
      } else if (avg >= p75) {
        percentile = Math.round(Math.min(99, 75 + ((avg - p75) / (100 - p75)) * 24));
      } else {
        percentile = Math.round(25 + ((avg - p25) / (p75 - p25)) * 50);
      }
    }
    return {
      key,
      label: DIM_LABELS[key] ?? key,
      avg,
      percentile,
      coaching: copy.coaching,
      strengthFrame: copy.strengthFrame,
    };
  }

  const strengths = sorted.slice(0, topN).map(toDiagnosticDim);
  const growthAreas = [...sorted].reverse().slice(0, topN).map(toDiagnosticDim);

  return { strengths, growthAreas };
}
