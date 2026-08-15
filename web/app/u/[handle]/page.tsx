import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Radar from "@/components/Radar";
import ShareRow from "@/components/ShareRow";
import { focusDim, retroTrend } from "@/lib/trainer";
import { getUserByHandle, turnScoresFor, sessionCountFor, listUsers, getLeaderboard, latestSnapshot } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { buildTeachingPrompt } from "@/lib/teach";
import CopyPrompt from "@/components/CopyPrompt";
import ReassessButton from "@/components/ReassessButton";
import {
  dayStreak,
  dimAverages,
  fluencyRating,
  fmtDateLong,
  levelProgress,
  prettifyDim,
  strongestDims,
  totalXP,
} from "@/lib/stats";
import {
  buildDiagnostic,
  cohortStatsFromLeaderboard,
  MIN_TURNS_FOR_DIAGNOSTIC,
  type DiagnosticDim,
} from "@/lib/diagnostic";

/** Percentile of this established rating among other established peers.
 * Honest signal for a recruiter (Priya): where does this sit in the population,
 * not just an absolute number. Null until there's a real peer set. */
/** Correct English ordinal: 1st, 2nd, 3rd, 33rd, 11th, 12th, 13th. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function ratingPercentile(
  selfId: number,
  selfScore: number
): Promise<{ pct: number; n: number; seeded: number } | null> {
  const users = await listUsers();
  if (users.length > 250) return null; // guard: skip the N+1 at real scale (materialize later)
  const peers: number[] = [];
  let seeded = 0;
  await Promise.all(
    users.map(async (u) => {
      if (u.id === selfId) return;
      const r = fluencyRating(await turnScoresFor(u.id));
      if (r.established) {
        peers.push(r.score);
        if (u.handle.startsWith("demo-")) seeded++;
      }
    })
  );
  if (peers.length < 3) return null;
  const below = peers.filter((s) => s < selfScore).length;
  // seeded includes only PEERS; +1 for self keeps the same total the user sees.
  return { pct: Math.round((below / peers.length) * 100), n: peers.length + 1, seeded };
}

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const user = await getUserByHandle(handle);
  if (!user) return { title: "Profile not found — Clawdacademy" };
  const rating = fluencyRating(await turnScoresFor(user.id));
  const title = `${user.handle} · ${rating.band} (${rating.score}) — Clawdacademy`;
  const description = `AI-collaboration fluency profile for @${user.handle}: quality rating, dimension radar, and usage stats.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }: Params) {
  const { handle } = await params;
  const user = await getUserByHandle(handle);
  if (!user) notFound();

  const scores = await turnScoresFor(user.id);
  const xp = totalXP(scores);
  const lvl = levelProgress(xp);
  const rating = fluencyRating(scores);
  const avgs = dimAverages(scores);
  const strongest = strongestDims(scores, 3);
  const sessions = await sessionCountFor(user.id);
  const weakestEntry = Object.entries(avgs).sort((a, b) => a[1] - b[1])[0];
  const weakest = weakestEntry ? prettifyDim(weakestEntry[0]) : null;
  const coaching = focusDim(scores);
  const trend = coaching ? retroTrend(scores, coaching.dim) : null;
  const streak = dayStreak(scores);
  const percentile = rating.established ? await ratingPercentile(user.id, rating.score) : null;
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;
  // A near-empty profile: guide the light user in instead of showing a bare radar.
  const onboarding = scores.length < 6;

  // Diagnostic: only meaningful once past the onboarding gate.
  const hasDiagnostic = scores.length >= MIN_TURNS_FOR_DIAGNOSTIC && Object.keys(avgs).length > 0;
  let diagnostic = null;
  if (hasDiagnostic) {
    // Reuse the already-materialized leaderboard (same guard as ratingPercentile: skip at scale).
    const lbRows = await getLeaderboard({ established_only: false, limit: 250 });
    const cohortStats = cohortStatsFromLeaderboard(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lbRows as unknown as Array<Record<string, unknown>>,
      user.id
    );
    diagnostic = buildDiagnostic(avgs, Object.keys(cohortStats).length > 0 ? cohortStats : null, 3);
  }

  // Top strength label anchors the coaching prompts ("meet me at that level").
  const topStrengthLabel = diagnostic?.strengths[0]?.label ?? null;

  // Reassessment: owner-only, cooldown-gated (mirrors /api/reassess: 20h).
  const REASSESS_COOLDOWN_MS = 20 * 60 * 60 * 1000;
  let reassess: { lastAt: string | null; eligible: boolean; retryInMs: number } | null = null;
  if (isOwner && rating.established) {
    const snap = await latestSnapshot(user.id);
    if (!snap) {
      reassess = { lastAt: null, eligible: true, retryInMs: 0 };
    } else {
      const age = Date.now() - new Date(snap.created_at).getTime();
      const eligible = age >= REASSESS_COOLDOWN_MS;
      reassess = {
        lastAt: snap.created_at,
        eligible,
        retryInMs: eligible ? 0 : REASSESS_COOLDOWN_MS - age,
      };
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          Clawd<span className="dot">■</span>academy
        </div>
        <span className="verified" style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
          <a href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Leaderboard</a>
          <span>✓ behavior profile · beta</span>
        </span>
      </div>

      <div className="share-hero">
        <div className="level-badge">
          <span className="lv">FLUENCY</span>
          <span className="num">{rating.score}</span>
        </div>
        <h1>
          {rating.band}
          {!rating.established && <span className="provisional"> · provisional</span>}
        </h1>
        <div className="handle">
          <b>@{user.handle}</b> · quality of AI-collaboration behavior, not volume
          {rating.established && ` · last ${rating.sampled} turns`}
        </div>
        {!rating.established && (
          <div style={{ maxWidth: 340, margin: "12px auto 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#9fb0c3", marginBottom: 5 }}>
              <span><b style={{ color: "#67e8f9" }}>{rating.sampled}</b> of 15 turns to an established Rating</span>
              <span>{Math.round((Math.min(rating.sampled, 15) / 15) * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: "#152029", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.round((Math.min(rating.sampled, 15) / 15) * 100)}%`,
                  background: "linear-gradient(90deg,#67e8f9,#5eead4)",
                  transition: "width .4s",
                }}
              />
            </div>
            <p style={{ marginTop: 7, marginBottom: 0, fontSize: 12.5, color: "#9fb0c3" }}>
              {rating.sampled === 0
                ? "Do one real task in Claude Code to score your first turn."
                : `${15 - rating.sampled} more scored turn${15 - rating.sampled === 1 ? "" : "s"} — keep working; each real task adds one.`}
            </p>
          </div>
        )}
        {rating.established && (
          <div
            className="attest"
            style={{ marginTop: 8, fontSize: 13, color: "#9fb0c3", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}
          >
            {percentile && (
              <span style={{ color: "#67e8f9" }}>
                {ordinal(percentile.pct)} percentile of {percentile.n} in the current beta cohort
                {percentile.seeded > 0 && (
                  <span style={{ color: "#8b98a9" }}> (incl. {percentile.seeded} seeded sample{percentile.seeded === 1 ? "" : "s"})</span>
                )}
              </span>
            )}
            <span>
              sampled from {rating.sampled} real turns across {sessions} session{sessions === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      <ShareRow
        handle={user.handle}
        band={rating.band}
        score={rating.score}
        weakestDim={weakest}
        established={rating.established}
      />

      <div className="stat-row">
        <div className="stat">
          <div className="v">Lv {lvl.level}</div>
          <div className="k">{lvl.title} · activity</div>
        </div>
        <div className="stat">
          <div className="v">{sessions}</div>
          <div className="k">Sessions</div>
        </div>
        <div className="stat">
          <div className="v">{scores.length}</div>
          <div className="k">Turns scored</div>
        </div>
        <div className="stat">
          <div className="v">{fmtDateLong(user.created_at)}</div>
          <div className="k">Member since</div>
        </div>
      </div>

      {strongest.length > 0 && (
        <div className="badges" style={{ marginBottom: 26 }}>
          {strongest.map((s) => (
            <span className="skill-badge" key={s.key}>
              {prettifyDim(s.key)} <span className="v">{s.avg}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── DIAGNOSTIC: strengths (owner + public) ── */}
      {diagnostic && diagnostic.strengths.length > 0 && (
        <div className="card" style={{ maxWidth: 560, margin: "0 auto 18px", borderLeft: "3px solid #34d399" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#34d399", textTransform: "uppercase", marginBottom: 12 }}>
            Your strengths
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {diagnostic.strengths.map((d: DiagnosticDim) => (
              <div key={d.key}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: "#e6edf3", fontSize: 14 }}>{d.label}</span>
                  <span style={{ fontSize: 13, color: "#34d399" }}>{d.avg}/100</span>
                  {d.percentile !== null && (
                    <span style={{ fontSize: 12, color: "#8b98a9" }}>· {d.percentile}th pct</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: "#9fb0c3", lineHeight: 1.55 }}>
                  {d.strengthFrame}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {onboarding && (
        <div
          className="card"
          style={{ maxWidth: 560, margin: "0 auto 18px", borderLeft: "3px solid #5eead4" }}
        >
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#5eead4", textTransform: "uppercase" }}>
            Getting your first read
          </div>
          <p style={{ color: "#c9d3df", lineHeight: 1.6, marginBottom: 8 }}>
            Your profile fills in as you work — no coding sprint required. Every real Claude Code
            turn is scored on-device. You don&apos;t need to do anything special:
          </p>
          <ol style={{ color: "#c9d3df", lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
            <li>Use Claude Code on anything real — a script, a fix, a question about your own repo.</li>
            <li>Ask for a plan before edits, and run something to check the result. That&apos;s the whole game.</li>
            <li>Come back after ~15 turns for an established Rating; the radar and coaching sharpen with every session.</li>
          </ol>
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2>Fluency Radar</h2>
        <p className="sub">Average score per dimension across all scored sessions (0–100).</p>
        <Radar dims={avgs} size={420} />
      </div>

      {/* ── DIAGNOSTIC: growth areas ── */}
      {diagnostic && diagnostic.growthAreas.length > 0 && (
        <div className="card" style={{ maxWidth: 560, margin: "18px auto 0", borderLeft: "3px solid #fbbf24" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#fbbf24", textTransform: "uppercase", marginBottom: 12 }}>
            {isOwner ? "Where to level up" : "Growth areas"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {diagnostic.growthAreas.map((d: DiagnosticDim) => (
              <div key={d.key}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: "#e6edf3", fontSize: 14 }}>{d.label}</span>
                  <span style={{ fontSize: 13, color: "#fbbf24" }}>{d.avg}/100</span>
                  {d.percentile !== null && (
                    <span style={{ fontSize: 12, color: "#8b98a9" }}>· {d.percentile}th pct</span>
                  )}
                </div>
                {isOwner ? (
                  /* Owner: full actionable coaching copy + a paste-in prompt that
                     makes Claude Code actively teach this exact gap. */
                  <>
                    <p style={{ margin: 0, fontSize: 13.5, color: "#c9d3df", lineHeight: 1.6 }}>
                      {d.coaching}
                    </p>
                    <CopyPrompt
                      label={d.label}
                      prompt={buildTeachingPrompt(d.key, {
                        label: d.label,
                        avg: d.avg,
                        topStrengthLabel,
                      })}
                    />
                  </>
                ) : (
                  /* Public: soft framing, no specific coaching text shown */
                  <p style={{ margin: 0, fontSize: 13.5, color: "#8b98a9", lineHeight: 1.55 }}>
                    Room to grow in this dimension — coaching details are shown to the profile owner.
                  </p>
                )}
              </div>
            ))}
          </div>
          {!isOwner && (
            <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "#5b6878", borderTop: "1px solid #1d2735", paddingTop: 10 }}>
              Sign up to see your own full diagnostic with specific coaching on each growth area.
            </p>
          )}
        </div>
      )}

      {/* ── REASSESS: re-fire the assessment after doing the coached work ── */}
      {reassess && (
        <div className="card" style={{ maxWidth: 560, margin: "18px auto 0", borderLeft: "3px solid #67e8f9" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#67e8f9", textTransform: "uppercase", marginBottom: 8 }}>
            Reassess
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "#c9d3df", lineHeight: 1.6 }}>
            Grab a coaching prompt above, run it on real work in Claude Code, then reassess to
            see the dimension move. Snapshots are spaced out so the history reflects real progress.
          </p>
          <ReassessButton
            lastAt={reassess.lastAt}
            eligible={reassess.eligible}
            retryInMs={reassess.retryInMs}
          />
        </div>
      )}

      {coaching && (
        <div className="card" style={{ maxWidth: 560, margin: "18px auto 0", borderLeft: "3px solid #67e8f9" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#67e8f9", textTransform: "uppercase" }}>
            Your one thing
          </div>
          <h2 style={{ margin: "6px 0 2px" }}>{coaching.lesson.title}</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            Weakest habit: <b>{coaching.label}</b> ({coaching.avg}/100) · {coaching.lesson.module}
          </p>
          <p style={{ color: "#c9d3df", lineHeight: 1.55 }}>{coaching.lesson.concept_card}</p>
          <div style={{ marginTop: 10, padding: "11px 13px", background: "#0f1620", borderRadius: 8 }}>
            <span style={{ color: "#67e8f9", fontWeight: 700 }}>Drill · </span>
            <span style={{ color: "#e6edf3" }}>{coaching.lesson.drill}</span>
          </div>
          {trend && (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13.5, color: trend.moved ? "#5eead4" : "#9fb0c3" }}>
              {trend.moved ? "↑ Moving: " : "→ Holding: "}
              <b>{coaching.label}</b> is {trend.recent} across your last turns vs {trend.prior} before
              {trend.moved ? ` — +${trend.delta}. Keep the rep.` : ". This is the one to push on."}
            </p>
          )}
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: "#8b98a9", borderTop: "1px solid #1a2530", paddingTop: 10 }}>
            The daily loop: check your one thing → do one rep → come back tomorrow.
            {streak >= 2 && (
              <> You&apos;re on a <b style={{ color: "#f5b971" }}>{streak}-day active streak</b>.</>
            )}
          </p>
        </div>
      )}

      {/* Get-your-own CTA — turns a viewed profile into a new user (the loop's close). */}
      {!isOwner && (
        <div
          className="card"
          style={{ maxWidth: 560, margin: "18px auto 0", textAlign: "center", border: "1px solid #1e3a4a", background: "#0c1520" }}
        >
          <div style={{ fontSize: 15, color: "#e6edf3", marginBottom: 12 }}>
            This is a real behavior profile from real Claude Code sessions. <b>Get yours in minutes.</b>
          </div>
          <Link className="btn primary" href="/start">
            Get your Rating →
          </Link>
        </div>
      )}

      <div className="footer-note">
        Behavior profile computed from Claude Code session telemetry, scored on-device and
        synced by the user. Server-verified scoring is coming; treat this as a
        self-instrumented profile, not an audited credential. · Clawdacademy
      </div>
    </div>
  );
}
