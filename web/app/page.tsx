import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const codeBlockStyle: React.CSSProperties = {
  background: "var(--bg-inset)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "12px 16px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  color: "#c9d3df",
  overflowX: "auto",
  margin: "8px 0 0",
  whiteSpace: "pre",
};

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="landing">
      <div className="brand">
        Clawd<span className="dot">■</span>academy
      </div>
      <h1>Everyone&apos;s getting dumber with AI. Get sharper.</h1>
      <p style={{ color: "#c9d3df" }}>
        In a controlled study, developers believed AI made them <b>20% faster</b>. Measured, they
        were <b>19% slower</b> — and couldn&apos;t tell. You can&apos;t self-assess how well you work
        with AI. <b>So measure it, then train it.</b>
      </p>
      <p>
        Clawdacademy scores 7 behaviors from your <b>real</b> Claude Code sessions — verification,
        planning, context, diagnosis and more — names your weakest habit, and coaches you in-flow to
        fix it. Free, local-first, open source.
      </p>
      <p style={{ color: "#9fb0c3", fontSize: 14, marginTop: 0 }}>
        Requires <b>Claude Code</b> (the CLI). If you use it, this plugin runs inside it.
      </p>

      {/* Get started section */}
      <div id="get-started" style={{ width: "100%", maxWidth: 640, margin: "28px auto 0" }}>
        <h2 style={{ fontSize: 18, marginBottom: 18, textAlign: "center" }}>
          Get started in 30 seconds
        </h2>

        {/* Step 1 */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13, minWidth: 20 }}>1</span>
            <b>Install in Claude Code</b>
          </div>
          <p style={{ margin: "0 0 6px", color: "#9fb0c3", fontSize: 13 }}>
            Run these two commands inside any Claude Code session:
          </p>
          <pre style={codeBlockStyle}>{`/plugin marketplace add jddavenportOpen/ai-fluency-trainer\n/plugin install ai-fluency@ai-fluency`}</pre>
          <p style={{ margin: "10px 0 4px", color: "#9fb0c3", fontSize: 13 }}>
            Or paste one line into your terminal:
          </p>
          <pre style={codeBlockStyle}>{`curl -fsSL https://clawdacademy.app/install.sh | bash`}</pre>
        </div>

        {/* Step 2 */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13, minWidth: 20 }}>2</span>
            <b>Work like you normally do</b>
          </div>
          <p style={{ margin: 0, color: "#9fb0c3", fontSize: 13 }}>
            The plugin runs quietly in the background and scores your real sessions on 7 behaviors:
            verification, planning, context, diagnosis, and more. No surveys, no special prompts.
          </p>
        </div>

        {/* Step 3 */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13, minWidth: 20 }}>3</span>
            <b>See your score</b>
          </div>
          <p style={{ margin: "0 0 6px", color: "#9fb0c3", fontSize: 13 }}>
            Your public Fluency Rating lives at:
          </p>
          <pre style={codeBlockStyle}>{`clawdacademy.app/u/<your-handle>`}</pre>
          <p style={{ margin: "10px 0 0", color: "#9fb0c3", fontSize: 13 }}>
            <Link href="/docs" style={{ color: "var(--accent)" }}>Full walkthrough in the docs →</Link>
          </p>
        </div>
      </div>

      <div className="links">
        {user ? (
          <>
            <Link className="btn primary" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="btn" href={`/u/${user.handle}`}>
              My profile
            </Link>
          </>
        ) : (
          <>
            <Link className="btn primary" href="#get-started">
              Get your Rating
            </Link>
            <Link className="btn" href="/u/demo-nova">
              See a live profile →
            </Link>
          </>
        )}
      </div>
      <p className="sub" style={{ marginTop: 16, fontSize: 13 }}>
        Local-first · aggregate-only sync · a verified behavior profile, not a validated score.
      </p>
      <p className="sub" style={{ marginTop: 10, fontSize: 13 }}>
        <Link href="/how-it-works" style={{ color: "var(--accent)" }}>
          How it works →
        </Link>
        {" · "}
        <Link href="/docs" style={{ color: "var(--accent)" }}>
          Docs →
        </Link>
      </p>
    </div>
  );
}
