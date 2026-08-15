/**
 * Dynamic teaching prompts (PRD-04, the "profile teaches you" moat).
 *
 * A diagnostic tells you WHERE you're weak. This turns each gap into a
 * ready-to-paste prompt that makes Claude Code actively COACH the user on that
 * exact behavior, using their real work as the training ground. The prompt is
 * personalized per individual: their weakest dim, their current score, and their
 * top strength (so the coaching is motivating, not just corrective).
 *
 * These are meta-prompts. Each one instructs Claude to run a short, hands-on
 * lesson grounded in the SAME rubric signal the scorer measures — so practicing
 * the prompt provably moves the dimension it targets. No fluff, no lecture: set
 * up a rule for the session, hold the user to it on real tasks, show before/after.
 */

export interface TeachContext {
  /** Human label of the weak dim, e.g. "Verification". */
  label: string;
  /** Their current 0-100 average on that dim. */
  avg: number;
  /** Their strongest dim label, used to anchor the coaching ("you're strong at X"). */
  topStrengthLabel?: string | null;
}

/**
 * Per-dim teaching-prompt bodies. Written in the user's voice (first person),
 * because the user pastes them verbatim into Claude Code. Each body encodes:
 *   1. the rule/forcing-function for the session (what the rubric actually rewards)
 *   2. how Claude should hold the user to it turn-by-turn
 *   3. a concrete drill on the user's own work
 *   4. a before/after so the user SEES the shift
 */
const DIM_PROMPT: Record<string, (c: TeachContext) => string> = {
  context_setting: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Context Setting (I score ${c.avg}/100 on it): I tend to fire off bare, under-specified prompts and let you guess my codebase.

For the next 3 real tasks I bring you, do NOT start working until I've given you: (1) the goal in one sentence, (2) the exact file(s) or paths involved, and (3) one constraint ("use the existing X", "don't touch Y"). If I skip any of the three, stop and ask me for the missing piece instead of guessing — every time, even if you could infer it.

After each task, show me a two-line "before/after": the bare prompt I would have sent vs. the briefed version, so I feel the difference. Keep me honest the whole session.`,

  plan_first: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Planning Before Building (I score ${c.avg}/100): I jump straight to "just do it" and skip exploration, which is where rework comes from.

Rule for this session: for any task that touches more than one file, refuse to edit until you have (1) read the relevant code and (2) given me a short numbered plan that I explicitly approve. If I say "just build it," push back once and ask me to approve a plan first.

Run this on a real task I have right now. At the end, tell me honestly whether planning first would have changed the outcome, and give me one sentence I can reuse to trigger plan-first next time.`,

  verification: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Verification (I score ${c.avg}/100), and it's the highest-weighted behavior: I accept AI edits without proving they work, which is the #1 skill-eroding pattern.

Rule for this session: after every change you make to my code, end the turn with real evidence it works — run the test, run the build, run a curl, read the diff back to me — something that would FAIL if the change were wrong. Never tell me "done" without proof. If there's no test to run, say so and help me write the smallest one that would catch a regression.

Do this on a real change I need right now. At the end, give me a one-line "no green, no accept" rule tailored to my stack that I can keep using.`,

  diagnose_vs_retry: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Diagnosing vs. Blind Retrying (I score ${c.avg}/100): when something breaks I tend to say "still broken, try again," which teaches you nothing and atrophies the debugging muscle fastest.

Rule for this session: when we hit a failure, do NOT let me blind-retry. Make me paste the actual error text and state a hypothesis ("I think it's X because Y") before you attempt a fix. Then walk me through reading the real signal — the stack trace, the failing line, the diff between expected and actual.

Use a real bug or error I'm hitting now. At the end, show me the difference between the "try again" version and the diagnosed version, and give me a reusable failure-triage checklist.`,

  understanding_seeking: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Understanding Seeking (I score ${c.avg}/100): I delegate the thinking, not just the typing, so I come out more dependent instead of smarter.

Rule for this session: on every meaningful decision we make, don't just hand me the answer — make me interrogate it. When you propose an approach, also give me the strongest alternative and defend your choice against it, then ask me which I'd pick and why. Push me to ask "why this over X?" at least once per task.

Run this on a real design decision I'm facing now. At the end, name one thing I now understand that I would have just copy-pasted before, and give me a habit to keep learning instead of just shipping.`,

  scope_discipline: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Scope Discipline (I score ${c.avg}/100): I send kitchen-sink prompts ("also do X and Y and deploy it") that produce big unreviewable changes.

Rule for this session: when I hand you a multi-part ask, do NOT do it all at once. Break it into an ordered sequence of single, reviewable tasks, show me the sequence, and do only the first — then stop so I can verify before we move on. If I try to pile on mid-task, hold the line and add it to the queue instead.

Use a real chunky task I have now. At the end, show me the monolithic-diff version vs. the sequenced version and give me a one-line rule for spotting an over-scoped ask before I send it.`,

  iteration_discipline: (c) =>
    `You're my AI-fluency coach for this session. My weakest habit is Iteration & Scrutiny (I score ${c.avg}/100): I rubber-stamp output with a bare "ok" instead of steering it, which is how drift I now own creeps in.

Rule for this session: after every substantive edit, don't let me accept blind. Walk me through the diff, then require me to do ONE of: name an edge case it misses, push back on one line, or ask you to change one specific thing. A bare "looks good" doesn't count as a review this session.

Run this on real edits I'm making now. At the end, point out one thing I would have accepted that deserved a second look, and give me a 10-second diff-review ritual I can keep.`,
};

const FALLBACK_PROMPT = (c: TeachContext) =>
  `You're my AI-fluency coach for this session. Help me improve at ${c.label} (I currently score ${c.avg}/100). Set a clear rule for this session that targets that behavior, hold me to it on a real task, and show me a before/after so I can feel the change.`;

/**
 * Build the full copy-paste teaching prompt for a weak dimension.
 * Appends a short strength anchor when we know the user's top dim, so the
 * coaching lands as "level up your weak spot" rather than "you're bad at this."
 */
export function buildTeachingPrompt(dimKey: string, ctx: TeachContext): string {
  const body = (DIM_PROMPT[dimKey] ?? FALLBACK_PROMPT)(ctx);
  if (ctx.topStrengthLabel) {
    return `${body}\n\n(For context: I'm already strong at ${ctx.topStrengthLabel}, so meet me at that level — this is about closing my weakest gap, not starting from zero.)`;
  }
  return body;
}
