/**
 * Web-side trainer surface (PRD-03) - gives the trainer a FACE on the profile.
 * Mirrors trainer-core's curriculum + focus-dim (the web is a separate runtime,
 * same pattern as stats.ts mirroring coach-core). Turns "here is your score" into
 * "here is your weakest habit and the one lesson + drill that fixes it."
 */
import { parseDims, prettifyDim } from "@/lib/stats";
import type { TurnScoreRow } from "@/lib/db";

export interface Lesson {
  lesson_id: string;
  dim: string;
  module: string;
  title: string;
  concept_card: string;
  drill: string;
}

export const CURRICULUM: Lesson[] = [
  { lesson_id: "L1", dim: "context_setting", module: "Context Engineering", title: "Set the stage",
    concept_card: "Open a prompt like a brief to a new teammate: the goal, the exact files, and one constraint sentence. The model fills silence with guesses. Precise-but-short beats long-and-vague.",
    drill: "Rewrite your next bare one-liner with (1) the goal, (2) the file(s), (3) one constraint. Watch the Context Setting score on that turn." },
  { lesson_id: "L2", dim: "scope_discipline", module: "Context Engineering", title: "One task per ask",
    concept_card: "A kitchen-sink prompt produces a kitchen-sink mess you cannot review. One coherent task per ask keeps the diff small enough to actually check.",
    drill: "Next 3-goal prompt: split it into a sequence and send the first only." },
  { lesson_id: "L5", dim: "plan_first", module: "Plan & Verify", title: "Explore before you mutate",
    concept_card: "Cold-start delegation is where quality dies. Read or plan before the first edit - even one exploration turn. Unplanned edits are the strongest predictor of rework.",
    drill: "Before your next first edit on a task, ask for a one-line plan (or use plan mode)." },
  { lesson_id: "L6", dim: "verification", module: "Plan & Verify", title: "Prove it works",
    concept_card: "Unverified AI output is the #1 skill-eroding behavior. End every mutating turn with evidence: a test, a build, a curl - something that would FAIL if the change were wrong. The highest-weighted dimension.",
    drill: "After your next AI edit, run something real before you accept it. No green, no accept." },
  { lesson_id: "L7", dim: "iteration_discipline", module: "Plan & Verify", title: "Read the diff",
    concept_card: "Six edits accepted blind is six chances for drift you now own. Read the diff, push back on one thing, or name an edge case. A bare 'ok' is a missed rep.",
    drill: "On your next batch, read one diff and comment on a single line before accepting." },
  { lesson_id: "L8", dim: "diagnose_vs_retry", module: "Debug & Iterate", title: "Diagnose, don't retry",
    concept_card: "'Still broken, try again' teaches nothing. A real failure follow-up carries the actual error plus a hypothesis. Diagnosis is the muscle that atrophies fastest.",
    drill: "On your next failure, paste the real error and add: 'I think it's X because Y.'" },
  { lesson_id: "L9", dim: "iteration_discipline", module: "Debug & Iterate", title: "Refine, don't blind-accept",
    concept_card: "Taking output whole and bailing to do it yourself are the same passivity. Fluency is steering: scrutinize, keep the good part, redirect the rest.",
    drill: "Next time you want to accept-all or start over, name the one thing to change and ask for just that." },
  { lesson_id: "L11", dim: "understanding_seeking", module: "Understand & Own", title: "Seek understanding",
    concept_card: "The whole point: come out smarter, not more dependent. Interrogate a decision that matters - 'why this over X?' Genuine curiosity about tradeoffs compounds into judgment. Pure delegation rents skill you never own.",
    drill: "On your next meaningful decision, ask the model to defend it against one alternative. Engage the answer." },
];

const BY_DIM: Record<string, Lesson> = Object.fromEntries(CURRICULUM.map((l) => [l.dim, l]));

export function lessonForDim(dim: string): Lesson | null {
  return BY_DIM[dim] ?? null;
}

/** Today's one thing: the weakest recent APPLICABLE (teachable) dim + its lesson.
 * Fit-to-task: a dim only counts where it was actually scored, so a dim that did
 * not apply is never "weak". */
export function focusDim(
  scores: TurnScoreRow[],
  window = 30
): { dim: string; label: string; avg: number; lesson: Lesson } | null {
  const recent = scores.slice(-window);
  const sum: Record<string, number> = {};
  const cnt: Record<string, number> = {};
  for (const s of recent) {
    for (const [k, v] of Object.entries(parseDims(s))) {
      if (!BY_DIM[k]) continue;
      sum[k] = (sum[k] || 0) + v;
      cnt[k] = (cnt[k] || 0) + 1;
    }
  }
  let worst: { dim: string; avg: number } | null = null;
  for (const k of Object.keys(sum)) {
    const avg = sum[k] / cnt[k];
    if (!worst || avg < worst.avg) worst = { dim: k, avg: Math.round(avg) };
  }
  if (!worst) return null;
  return { dim: worst.dim, label: prettifyDim(worst.dim), avg: worst.avg, lesson: BY_DIM[worst.dim] };
}
