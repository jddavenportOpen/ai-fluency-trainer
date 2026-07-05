"use client";

import Link from "next/link";
import { useState } from "react";

interface Claimed {
  handle: string;
  device_token: string;
}

/**
 * Score-first onboarding (the door a shared-card skeptic actually wants): pick a
 * handle, get your token + install command, see your number in minutes. NO email,
 * NO password. Email login is the optional upgrade at /signup for recovery /
 * multi-device — this is the default path the "Get your Rating" CTAs point at.
 */
export default function StartForm() {
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Claimed | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.device_token) {
        setDone({ handle: body.handle, device_token: body.device_token });
        return;
      }
      setError(body?.error ?? "Could not claim that handle.");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function copy(key: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (done) {
    const config = JSON.stringify(
      { url: "https://clawdacademy.app", token: done.device_token, handle: done.handle },
      null,
      2
    );
    const cliInstall =
      "git clone https://github.com/JDDavenport/ai-fluency-trainer && cd ai-fluency-trainer && ./install.sh";
    return (
      <div className="auth-shell">
        <div className="auth-card wide">
          <div className="brand">
            Clawd<span className="dot">■</span>academy
          </div>
          <h1>Claimed — @{done.handle} is yours</h1>
          <p className="auth-lead">
            No account needed. Save your <b>device token</b> (shown once), wire it up, and do one
            real task in Claude Code — your Fluency Rating appears in minutes.
          </p>

          <ol
            style={{
              margin: "14px 0 22px",
              padding: "14px 16px 14px 34px",
              background: "#0f1620",
              borderRadius: 10,
              lineHeight: 1.7,
              color: "#c9d3df",
              fontSize: 14,
            }}
          >
            <li>Wire it up (one line below).</li>
            <li>Do one real task in Claude Code — a fix, a script, a question about your repo.</li>
            <li>
              Your <b>first turn scores instantly</b>. After <b>15 turns</b> your Rating goes from
              provisional to established — the progress bar on your profile counts you up.
            </li>
          </ol>

          <div className="token-box">
            <code>{done.device_token}</code>
            <button type="button" className="btn" onClick={() => copy("tok", done.device_token)}>
              {copied === "tok" ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="auth-lead" style={{ marginTop: 22, marginBottom: 6 }}>
            <b>Fastest — inside Claude Code:</b>
          </p>
          <div className="token-box">
            <code>/clawdacademy setup --handle {done.handle}</code>
            <button
              type="button"
              className="btn"
              onClick={() => copy("modeb", `/clawdacademy setup --handle ${done.handle}`)}
            >
              {copied === "modeb" ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="auth-lead" style={{ marginTop: 18, marginBottom: 6 }}>
            <b>Or the CLI:</b> save <code>~/.ai-fluency/config.json</code> then run the installer
            (it detects your config and skips re-claiming):
          </p>
          <pre className="config-snippet">{config}</pre>
          <div className="token-box">
            <code>{cliInstall}</code>
            <button type="button" className="btn" onClick={() => copy("cli", cliInstall)}>
              {copied === "cli" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="links" style={{ marginTop: 24 }}>
            <Link className="btn primary" href={`/u/${done.handle}`}>
              View my profile →
            </Link>
            <Link className="btn" href="/signup">
              Add email login (optional, for recovery)
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
        <h1>Get your Rating</h1>
        <p className="auth-lead">
          Pick a handle for your public profile. That’s it — no email, no password. Your score comes
          from your <b>real</b> Claude Code sessions, scored on your machine.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Handle
            <input
              type="text"
              autoComplete="off"
              autoFocus
              placeholder="e.g. ada-lovelace"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
              minLength={3}
              maxLength={30}
            />
          </label>
          <p className="sub" style={{ marginTop: -4, fontSize: 12.5 }}>
            3–30 chars: lowercase letters, numbers, hyphens. Your profile lives at
            clawdacademy.app/u/&lt;handle&gt;.
          </p>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn primary" disabled={busy || handle.trim().length < 3}>
            {busy ? "Claiming…" : "Claim my handle →"}
          </button>
        </form>
        <p className="auth-lead" style={{ marginTop: 20, fontSize: 13 }}>
          Want email login for recovery / multiple machines?{" "}
          <Link href="/signup" style={{ color: "#67e8f9" }}>
            Create a full account
          </Link>{" "}
          instead.
        </p>
      </div>
    </div>
  );
}
