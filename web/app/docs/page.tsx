import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs — Clawdacademy",
  description:
    "How to install and use Clawdacademy: the AI Fluency Trainer. Install commands, the seven behaviors, your score, the leaderboard, and data privacy.",
  openGraph: {
    title: "Clawdacademy Docs",
    description:
      "Get up and running with Clawdacademy in two minutes. Install the plugin, work normally, and see exactly how your AI habits score.",
    type: "article",
  },
};

const BEHAVIORS: [string, string][] = [
  ["Context Setting", "giving Claude what it needs to succeed"],
  ["Plan First", "making it plan before it builds"],
  ["Verification", "checking the work (running tests, reading the diff)"],
  ["Diagnose vs Retry", "inspecting a failure instead of blindly re-running"],
  ["Understanding Seeking", "learning, not just accepting"],
  ["Scope Discipline", "one clear deliverable, not a kitchen sink"],
  ["Iteration Discipline", "scrutinizing and refining"],
];

const TROUBLESHOOTING: [string, string][] = [
  [
    "No score showing up?",
    "Confirm python3 and node are installed. The plugin needs both. On a fresh machine that is the usual cause.",
  ],
  [
    "Rating says \"provisional\"?",
    "It firms up after about 15 scored turns.",
  ],
  [
    "Statusline missing?",
    "Restart Claude Code once after installing.",
  ],
  [
    "Wrong handle or want to reset?",
    "Re-run the installer, or claim a handle at clawdacademy.app/start.",
  ],
];

export default function Docs() {
  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Clawd<span className="dot">■</span>academy
        </Link>
        <span className="verified" style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
          <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Leaderboard</Link>
          <Link href="/how-it-works" style={{ color: "inherit", textDecoration: "none" }}>How it works</Link>
          <Link href="/start" style={{ color: "inherit", textDecoration: "none" }}>Get your Rating</Link>
        </span>
      </div>

      <div className="hero" style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 8px" }}>
        <h1 style={{ marginBottom: 10 }}>How to use Clawdacademy</h1>
        <p style={{ color: "#c9d3df", fontSize: 17 }}>
          A free Claude Code plugin that scores how well you actually use AI, from your real coding
          sessions, and shows you exactly where to improve.
        </p>
      </div>

      {/* Install */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>1. Install (about 2 minutes)</h2>
        <p>
          Prerequisites: <code>python3</code> (3.8+) and <code>node</code>. The installer checks
          for both and tells you clearly if either is missing, it will not silently do nothing.
        </p>
        <p>In Claude Code:</p>
        <pre style={{
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "14px 18px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          color: "#c9d3df",
          overflowX: "auto",
          margin: "10px 0",
        }}>
          {`/plugin marketplace add jddavenportOpen/ai-fluency-trainer\n/plugin install ai-fluency@ai-fluency`}
        </pre>
        <p>Or one line in your terminal:</p>
        <pre style={{
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "14px 18px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          color: "#c9d3df",
          overflowX: "auto",
          margin: "10px 0",
        }}>
          {`curl -fsSL https://clawdacademy.app/install.sh | bash`}
        </pre>
        <p style={{ marginBottom: 0, color: "#9fb0c3", fontSize: 14 }}>
          This installs the plugin, wires up the capture hooks, and claims you a handle.
        </p>
      </div>

      {/* Just work */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>2. Just work</h2>
        <p>
          Use Claude Code the way you normally do. The plugin runs quietly in the background and
          scores each turn on the seven behaviors that separate people who get smarter with AI from
          people who get passively dumber:
        </p>
        <div style={{ display: "grid", gap: 8, marginTop: 12, marginBottom: 12 }}>
          {BEHAVIORS.map(([name, desc]) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 10, alignItems: "baseline" }}>
              <b>{name}</b>
              <span style={{ color: "#9fb0c3", fontSize: 14 }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ marginBottom: 0, color: "#9fb0c3", fontSize: 14 }}>
          A statusline shows your live Fluency Rating, and a coach nudges you when you are about to
          do something that would lower it. Scoring is on your real behavior, not on whether you
          typed the magic words. Running the test counts as verification even if you never say
          &quot;verify.&quot;
        </p>
      </div>

      {/* See your score */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>3. See your score</h2>
        <p>
          Your public profile lives at{" "}
          <code>https://clawdacademy.app/u/&lt;your-handle&gt;</code>:
        </p>
        <ul style={{ color: "#c9d3df", lineHeight: 1.8, marginBottom: 0 }}>
          <li>
            Your <b>Fluency Rating</b> (0-100 plus a band). It is volume-independent, so you cannot
            grind your way up. The only way the number moves is getting better.
          </li>
          <li>A <b>seven-dimension radar</b> of how you work.</li>
          <li>
            Your <b>strengths</b>, and, when you are logged into your own profile, specific coaching
            on <b>where you need work</b>.
          </li>
        </ul>
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>4. The leaderboard</h2>
        <p style={{ marginBottom: 0 }}>
          <Link href="/leaderboard">clawdacademy.app/leaderboard</Link> ranks everyone by quality and
          is sortable and filterable. See where you stand and who is climbing.
        </p>
      </div>

      {/* Privacy */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto", borderColor: "rgba(52,211,153,0.35)" }}>
        <h2>5. Your data stays yours</h2>
        <p style={{ marginBottom: 0 }}>
          Local-first by design. Your prompts and your code never leave your machine. Only aggregate
          numeric scores sync, and only if you opt in (a token in your config). Turn syncing off any
          time and the local coach still works.
        </p>
      </div>

      {/* Troubleshooting */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>Troubleshooting</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {TROUBLESHOOTING.map(([problem, fix]) => (
            <div key={problem}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{problem}</p>
              <p style={{ margin: 0, color: "#9fb0c3", fontSize: 14 }}>{fix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Short version */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto", background: "rgba(255,255,255,0.02)" }}>
        <h2>The short version</h2>
        <p style={{ marginBottom: 0, color: "#c9d3df" }}>
          Install it, work normally, check your profile. It tells you the truth about how you use AI
          and coaches you toward the habits that make you smarter with it.
        </p>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", margin: "36px auto 0", maxWidth: 820 }}>
        <div className="links" style={{ justifyContent: "center" }}>
          <Link className="btn primary" href="/start">Get your Rating</Link>
          <Link className="btn" href="/how-it-works">How it works →</Link>
        </div>
        <p className="sub" style={{ marginTop: 14, fontSize: 13 }}>
          MIT licensed · local-first · public source repo at launch
        </p>
      </div>
    </div>
  );
}
