"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Success {
  handle: string;
  device_token: string;
}

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Success | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, handle }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone({ handle: body.handle, device_token: body.device_token });
        return;
      }
      setError(body?.error ?? "Signup failed.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const config = JSON.stringify(
      {
        url: "https://clawdacademy.app/api/ingest",
        token: done.device_token,
        handle: done.handle,
      },
      null,
      2
    );
    return (
      <div className="auth-shell">
        <div className="auth-card wide">
          <div className="brand">
            Clawd<span className="dot">■</span>academy
          </div>
          <h1>You’re in, @{done.handle}</h1>
          <p className="auth-lead">
            Save your <b>device token</b> now — it’s shown only once. It wires the plugin/CLI to your
            account. You can always regenerate it later, but copy it before you leave this page.
          </p>

          <div className="token-box">
            <code>{done.device_token}</code>
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(done.device_token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="auth-lead" style={{ marginTop: 22 }}>
            Then create <code>~/.ai-fluency/config.json</code>:
          </p>
          <pre className="config-snippet">{config}</pre>

          <div className="links" style={{ marginTop: 24 }}>
            <button className="btn primary" onClick={() => router.replace("/dashboard")}>
              Go to my dashboard
            </button>
            <Link className="btn" href={`/u/${done.handle}`}>
              View my public profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          Clawd<span className="dot">■</span>academy
        </div>
        <h1>Create your account</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Handle
            <input
              type="text"
              placeholder="e.g. jane-dev"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              required
            />
            <span className="hint">3–30 chars · lowercase letters, numbers, hyphens · your public URL</span>
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="hint">At least 10 characters.</span>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="auth-alt">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
