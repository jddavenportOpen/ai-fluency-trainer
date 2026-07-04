"use client";

import { useState } from "react";

/**
 * One-click share (PRD-02 §4.2). Converts a surprising Rating into a public,
 * challenge-framed post in one tap. Claims-safe copy: "how well I actually work
 * with AI," never "validated/certified." Every share URL carries a channel tag
 * (?s=) for per-channel k-factor attribution (§6). Free forever, no SKU.
 */
const BASE = "https://clawdacademy.app";

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #2b3444",
  background: "#141a24",
  color: "#e6edf3",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  lineHeight: 1,
};

export default function ShareRow({
  handle,
  band,
  score,
  weakestDim,
  established,
}: {
  handle: string;
  band: string;
  score: number;
  weakestDim?: string | null;
  established: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const profile = `${BASE}/u/${handle}`;
  const badgeSnippet = `[![My Fluency Rating](${BASE}/api/badge/${handle}.svg)](${profile})`;
  const scoreStr = established ? `${band} ${score}` : `provisional (${score})`;
  const weak = weakestDim ? ` Weakest habit: ${weakestDim}.` : "";
  const tweet =
    `My Fluency Rating (how well I actually work with AI, measured from real Claude Code sessions): ${scoreStr}.${weak} ` +
    `What's yours? ${profile}?s=x  free, open-source, 100% local.`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    `${profile}?s=li`
  )}`;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", margin: "18px 0 26px" }}>
      <a style={btn} href={xUrl} target="_blank" rel="noopener noreferrer">
        Post to X
      </a>
      <a style={btn} href={liUrl} target="_blank" rel="noopener noreferrer">
        Share to LinkedIn
      </a>
      <button style={btn} onClick={() => copy(profile, "link")}>
        {copied === "link" ? "Copied ✓" : "Copy link"}
      </button>
      <button style={btn} onClick={() => copy(badgeSnippet, "badge")}>
        {copied === "badge" ? "Copied ✓" : "Copy README badge"}
      </button>
    </div>
  );
}
