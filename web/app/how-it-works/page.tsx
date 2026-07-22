import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works — Clawdacademy",
  description:
    "How Clawdacademy measures and trains AI-collaboration skill from your real Claude Code sessions: the 7 behaviors, the Fluency Rating, and the local-first privacy model.",
  openGraph: {
    title: "How Clawdacademy works",
    description:
      "Measure — and train — how well you actually work with AI. The science, the 7 behaviors, the Fluency Rating, and the privacy model.",
    type: "article",
  },
};

const DIMS: [string, string, string][] = [
  ["Verification", "1.6", "Do you demand evidence — a test, build, or run — before accepting AI output? The single most skill-protective habit."],
  ["Diagnose vs retry", "1.4", "After a failure, do you add real information (error text, a hypothesis) — or just say “try again”?"],
  ["Context setting", "1.0", "Do your prompts give the goal, the files, and the constraints — or leave the model guessing?"],
  ["Plan first", "1.0", "On non-trivial work, do you plan (or use plan mode) before the first edit, instead of cold-starting?"],
  ["Iteration discipline", "1.0", "Do you engage with the output — read the diff, push back — or bare-accept and move on?"],
  ["Understanding seeking", "0.8", "Do you occasionally interrogate a decision that matters, building understanding rather than only shipping?"],
  ["Scope discipline", "0.8", "One coherent task per ask, or kitchen-sink prompts that produce unreviewable batches?"],
];

const STEPS: [string, string][] = [
  ["1 · Capture", "A Claude Code plugin records lightweight events from your real sessions to a local file (~/.ai-fluency/events.jsonl). It is fail-open and fast — it can never slow or break a session — and it only scores your own interactive sessions, never agent or scripted runs."],
  ["2 · Score", "After each turn, an on-device engine reads the transcript and scores 7 behaviors 0–100 using deterministic heuristics (plus an optional local LLM judge for the judgment-heavy ones). Everything is computed on your machine."],
  ["3 · Coach", "You get a one-line “what to do better” in the terminal statusline and live coach, plus your single weakest habit to focus on. Optional in-flow nudges are observe-only until you opt in."],
  ["4 · Reflect", "Aggregate scores (never your prompt text) sync to your dashboard and a shareable profile — a radar of your behaviors, your trend, and your Fluency Rating."],
];

export default function HowItWorks() {
  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Clawd<span className="dot">■</span>academy
        </Link>
        <span className="verified" style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
          <Link href="/leaderboard" style={{ color: "inherit", textDecoration: "none" }}>Leaderboard</Link>
          <Link href="/docs" style={{ color: "inherit", textDecoration: "none" }}>Docs</Link>
          <Link href="/start" style={{ color: "inherit", textDecoration: "none" }}>Get your Rating</Link>
        </span>
      </div>

      <div className="hero" style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 8px" }}>
        <h1 style={{ marginBottom: 10 }}>How Clawdacademy works</h1>
        <p style={{ color: "#c9d3df", fontSize: 17 }}>
          Measure — and train — how well you actually work with AI, from your real Claude Code
          sessions. No quizzes, no self-report: your behavior is the input.
        </p>
      </div>

      {/* The why */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>Why it exists</h2>
        <p>
          Most people can&apos;t feel whether AI is making them sharper or lazier. In a controlled
          RCT, experienced developers believed AI made them <b>~20% faster</b> — measured, they were{" "}
          <b>19% slower</b>, and couldn&apos;t tell (
          <a href="https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/" target="_blank" rel="noreferrer">METR, 2025</a>
          ). Separately, a ~1,000-student RCT found unrestricted AI made students{" "}
          <b>17% worse</b> on unassisted exams, while the <i>same tool</i> with guardrails caused no
          harm (
          <a href="https://www.pnas.org/doi/10.1073/pnas.2422633122" target="_blank" rel="noreferrer">PNAS, 2025</a>
          ). The difference isn&apos;t the tool — it&apos;s a set of observable behaviors. You
          can&apos;t self-assess them, so we measure them, then help you train them.
        </p>
      </div>

      {/* The loop */}
      <h2 style={{ maxWidth: 820, margin: "34px auto 0" }}>The loop</h2>
      <div className="grid2" style={{ maxWidth: 820, margin: "12px auto" }}>
        {STEPS.map(([title, body]) => (
          <div className="card" key={title}>
            <h2 style={{ fontSize: 16 }}>{title}</h2>
            <p style={{ marginBottom: 0 }}>{body}</p>
          </div>
        ))}
      </div>

      {/* What it measures */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>The 7 behaviors</h2>
        <p>
          Each is scored from your real sessions and grounded in the research. Weights reflect the
          evidence — verification and diagnosis matter most.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {DIMS.map(([name, w, desc]) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "170px 46px 1fr", gap: 10, alignItems: "baseline" }}>
              <b>{name}</b>
              <span className="score-pill" style={{ justifySelf: "start" }}>{w}×</span>
              <span style={{ color: "#9fb0c3", fontSize: 14 }}>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 14, color: "#9fb0c3" }}>
          <b style={{ color: "var(--text)" }}>Fit-to-task, not a ladder.</b> A behavior that
          doesn&apos;t apply to a turn is marked not-applicable — never penalized. A calibrated
          one-line prompt is not &quot;weak.&quot; And nothing scores speed, volume, or
          acceptance-rate — only judgment.
        </p>
      </div>

      {/* The rating */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto" }}>
        <h2>The Fluency Rating</h2>
        <p>
          Your headline number (0–100, with a band from <b>Emerging</b> to <b>Expert</b>) is the
          mean <i>weighted quality</i> of your recent turns. It is deliberately{" "}
          <b>volume-independent</b>: grinding more sessions can&apos;t inflate it — only working
          better can. It stays <b>provisional</b> until you have 15 scored turns, so a number you
          show a recruiter reflects a real sample. A separate Level/XP tracks activity — that&apos;s
          the game layer, not the credential.
        </p>
      </div>

      {/* Privacy — the trust surface */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto", borderColor: "rgba(52,211,153,0.35)" }}>
        <h2>Privacy — local-first, aggregate-only, audit-invited</h2>
        <p>
          This is a telemetry tool from a solo publisher, so don&apos;t take it on faith — the whole
          path is open source (MIT) and built to be audited.
        </p>
        <ul style={{ color: "#c9d3df", lineHeight: 1.7, marginBottom: 8 }}>
          <li>Your <b>raw prompts and code never leave your machine.</b> Scoring happens on-device.</li>
          <li>Only <b>derived, aggregate</b> events sync (your scores) — never your prompt text.</li>
          <li><code>text</code> and file paths are stripped <b>twice</b>: client-side before sending, and again server-side on receipt.</li>
          <li>Coaching tips can quote your prompt, so they&apos;re <b>local-only</b> unless you explicitly opt in.</li>
          <li>See exactly what would sync, before anything leaves: <code>sync.py --dry-run</code>.</li>
          <li>In-flow nudges are <b>observe-only</b> by default; even when enabled they&apos;re rate-limited, dismissible, and fail-open.</li>
        </ul>
      </div>

      {/* Honesty box */}
      <div className="card" style={{ maxWidth: 820, margin: "26px auto", background: "rgba(255,255,255,0.02)" }}>
        <h2>What this is — and isn&apos;t (yet)</h2>
        <p style={{ marginBottom: 0, color: "#9fb0c3" }}>
          Today your profile is a <b>self-instrumented behavior profile</b>, not an audited
          credential — it&apos;s computed from your own machine&apos;s telemetry. A formal validation
          study (tying these behaviors to real learning outcomes) is in progress. We don&apos;t cite
          the &quot;70% get dumber&quot; figure some people repeat — it isn&apos;t sourced; the
          honest number is that roughly <b>40–50%</b> of real AI use is passive delegation. We&apos;d
          rather under-claim and let the measurement speak.
        </p>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", margin: "36px auto 0", maxWidth: 820 }}>
        <div className="links" style={{ justifyContent: "center" }}>
          <Link className="btn primary" href="/start">Get your Rating</Link>
          <Link className="btn" href="/u/demo-nova">See a live profile →</Link>
        </div>
        <p className="sub" style={{ marginTop: 14, fontSize: 13 }}>
          MIT licensed · local-first · public source repo at launch
        </p>
      </div>
    </div>
  );
}
