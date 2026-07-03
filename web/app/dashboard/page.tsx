import Link from "next/link";
import { redirect } from "next/navigation";
import Radar from "@/components/Radar";
import XPBars from "@/components/XPBars";
import LogoutButton from "@/components/LogoutButton";
import { turnScoresFor, sessionCountFor } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  adviceFor,
  dimAverages,
  levelProgress,
  prettifyDim,
  totalXP,
  weakestDims,
  xpBySession,
  fmtDate,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  // Real session auth: only the logged-in user's own data is ever loaded here.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const HANDLE = user.handle;
  const scores = await turnScoresFor(user.id);
  const xp = totalXP(scores);
  const lvl = levelProgress(xp);
  const avgs = dimAverages(scores);
  const weakest = weakestDims(scores, 3);
  const sessions = xpBySession(scores);
  const sessionCount = await sessionCountFor(user.id);
  const feed = [...scores].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 10);

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          AI Fluency <span className="dot">■</span> Trainer
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16 }}>
          <Link href={`/u/${HANDLE}`}>Public profile →</Link>
          <LogoutButton />
        </div>
      </div>

      {/* Level header */}
      <div className="hero">
        <div className="level-badge">
          <span className="lv">LV</span>
          <span className="num">{lvl.level}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="title">{lvl.title}</p>
          <p className="xp">
            <b>{xp.toLocaleString()}</b> XP total · {sessionCount} sessions ·{" "}
            {scores.length} turns scored
          </p>
          <div className="bar">
            <div style={{ width: `${lvl.pct.toFixed(1)}%` }} />
          </div>
          <div className="bar-note">
            {(lvl.nextLevelXP - xp).toLocaleString()} XP to level {lvl.level + 1} (
            {lvl.nextLevelXP.toLocaleString()} XP)
          </div>
        </div>
      </div>

      <div className="grid2">
        {/* Radar */}
        <div className="card">
          <h2>Fluency Radar</h2>
          <p className="sub">Per-dimension averages across all scored turns (0–100).</p>
          <Radar dims={avgs} />
        </div>

        {/* Where to improve */}
        <div className="card">
          <h2>Where to Improve</h2>
          <p className="sub">Your 3 weakest dimensions, with the coaching that flagged them.</p>
          {weakest.length === 0 && (
            <div style={{ color: "var(--faint)", fontSize: 13 }}>No data yet.</div>
          )}
          {weakest.map((w) => (
            <div className="improve-item" key={w.key}>
              <div className="improve-head">
                <span className="name">{prettifyDim(w.key)}</span>
                <span className="score-pill">avg {w.avg}</span>
              </div>
              <ul>
                {w.tips.length === 0 && <li>{adviceFor(w.key)}</li>}
                {w.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* XP trend */}
        <div className="card">
          <h2>XP per Session</h2>
          <p className="sub">Chronological — is each session earning more than the last?</p>
          <XPBars sessions={sessions} />
        </div>

        {/* Coaching feed */}
        <div className="card">
          <h2>Recent Coaching</h2>
          <p className="sub">Last {feed.length} scored turns — tip and highlight per turn.</p>
          {feed.map((s) => (
            <div className="feed-item" key={s.id}>
              <span className="when">{fmtDate(s.ts)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {s.highlight && (
                  <p>
                    <span style={{ color: "var(--good)" }}>▲</span> {s.highlight}
                  </p>
                )}
                {s.tip && (
                  <p>
                    <span style={{ color: "var(--warn)" }}>➜</span> {s.tip}
                  </p>
                )}
              </div>
              <span className="xp-chip">+{s.xp}</span>
            </div>
          ))}
          {feed.length === 0 && (
            <div style={{ color: "var(--faint)", fontSize: 13 }}>No coaching yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
