import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Radar from "@/components/Radar";
import ShareRow from "@/components/ShareRow";
import { focusDim, retroTrend } from "@/lib/trainer";
import { getUserByHandle, turnScoresFor, sessionCountFor, listUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  dimAverages,
  fluencyRating,
  fmtDateLong,
  levelProgress,
  prettifyDim,
  strongestDims,
  totalXP,
} from "@/lib/stats";

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
): Promise<{ pct: number; n: number } | null> {
  const users = await listUsers();
  if (users.length > 250) return null; // guard: skip the N+1 at real scale (materialize later)
  const peers: number[] = [];
  await Promise.all(
    users.map(async (u) => {
      if (u.id === selfId) return;
      const r = fluencyRating(await turnScoresFor(u.id));
      if (r.established) peers.push(r.score);
    })
  );
  if (peers.length < 3) return null;
  const below = peers.filter((s) => s < selfScore).length;
  return { pct: Math.round((below / peers.length) * 100), n: peers.length + 1 };
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
  const percentile = rating.established ? await ratingPercentile(user.id, rating.score) : null;
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;
  // A near-empty profile: guide the light user in instead of showing a bare radar.
  const onboarding = scores.length < 6;

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
          {rating.established
            ? ` · last ${rating.sampled} turns`
            : ` · ${rating.sampled}/${15} turns to establish`}
        </div>
        {rating.established && (
          <div
            className="attest"
            style={{ marginTop: 8, fontSize: 13, color: "#9fb0c3", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}
          >
            {percentile && (
              <span style={{ color: "#67e8f9" }}>
                {ordinal(percentile.pct)} percentile of {percentile.n} scored profiles
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
          <Link className="btn primary" href="/signup">
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
