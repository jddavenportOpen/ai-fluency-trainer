import Link from "next/link";

export default function Home() {
  return (
    <div className="landing">
      <div className="brand">
        AI Fluency <span className="dot">■</span> Trainer
      </div>
      <h1>How well do you use AI — and where to improve.</h1>
      <p>
        The free dashboard for the AI Fluency Trainer plugin: per-dimension scores from your real
        Claude Code sessions, XP and levels, coaching tips, and a recruiter-shareable profile.
      </p>
      <div className="links">
        <Link className="btn primary" href="/dashboard">
          Open dashboard
        </Link>
        <Link className="btn" href="/u/jd">
          Example profile
        </Link>
      </div>
    </div>
  );
}
