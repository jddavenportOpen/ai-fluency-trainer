import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Radar from "@/components/Radar";
import ShareRow from "@/components/ShareRow";
import { focusDim } from "@/lib/trainer";
import { getUserByHandle, turnScoresFor, sessionCountFor } from "@/lib/db";
import {
  dimAverages,
  fluencyRating,
  fmtDateLong,
  levelProgress,
  prettifyDim,
  strongestDims,
  totalXP,
} from "@/lib/stats";

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
