import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Radar from "@/components/Radar";
import { getUserByHandle, turnScoresFor, sessionCountFor } from "@/lib/db";
import {
  dimAverages,
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
  const user = getUserByHandle(handle);
  if (!user) return { title: "Profile not found — AI Fluency Trainer" };
  const lvl = levelProgress(totalXP(turnScoresFor(user.id)));
  const title = `${user.handle} · Level ${lvl.level} ${lvl.title} — AI Fluency Trainer`;
  const description = `Verified AI-collaboration fluency profile for @${user.handle}: level, dimension radar, and usage stats.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharePage({ params }: Params) {
  const { handle } = await params;
  const user = getUserByHandle(handle);
  if (!user) notFound();

  const scores = turnScoresFor(user.id);
  const xp = totalXP(scores);
  const lvl = levelProgress(xp);
  const avgs = dimAverages(scores);
  const strongest = strongestDims(scores, 3);
  const sessions = sessionCountFor(user.id);

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          AI Fluency <span className="dot">■</span> Trainer
        </div>
        <span className="verified">✓ verified usage data</span>
      </div>

      <div className="share-hero">
        <div className="level-badge">
          <span className="lv">LEVEL</span>
          <span className="num">{lvl.level}</span>
        </div>
        <h1>{lvl.title}</h1>
        <div className="handle">
          <b>@{user.handle}</b> · {xp.toLocaleString()} XP earned collaborating with AI
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="v">{sessions}</div>
          <div className="k">Sessions</div>
        </div>
        <div className="stat">
          <div className="v">{scores.length}</div>
          <div className="k">Turns scored</div>
        </div>
        <div className="stat">
          <div className="v">{xp.toLocaleString()}</div>
          <div className="k">Total XP</div>
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
        <p className="sub">Average score per dimension across all verified sessions (0–100).</p>
        <Radar dims={avgs} size={420} />
      </div>

      <div className="footer-note">
        Scores are computed from real Claude Code session telemetry — behavior over time, not
        self-reported. · AI Fluency Trainer
      </div>
    </div>
  );
}
