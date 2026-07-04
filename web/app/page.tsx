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
      <h1>How well do you use AI — and where to improve.</h1>
      <p>
        The free dashboard for the Clawdacademy plugin: per-dimension scores from your real
        Claude Code sessions, XP and levels, coaching tips, and a recruiter-shareable profile.
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
            <Link className="btn primary" href="/signup">
              Sign up
            </Link>
            <Link className="btn" href="/login">
              Log in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
