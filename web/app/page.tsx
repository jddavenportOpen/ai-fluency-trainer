import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

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
            <Link className="btn primary" href="/start">
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
    </div>
  );
}
