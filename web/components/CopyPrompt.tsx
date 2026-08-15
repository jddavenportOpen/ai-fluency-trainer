"use client";

import { useState } from "react";

/**
 * A copy-to-clipboard block for a teaching prompt. Collapsed by default (just a
 * "Show coaching prompt" toggle) so a growth-areas card with 3 gaps doesn't turn
 * into a wall of text; expands to the full prompt + a one-tap Copy button.
 */
export default function CopyPrompt({ prompt, label }: { prompt: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (rare) — open state still lets them select manually.
      setCopied(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "#0f1620",
            border: "1px solid #24506a",
            color: "#67e8f9",
            fontSize: 12.5,
            fontWeight: 600,
            padding: "6px 11px",
            borderRadius: 7,
            cursor: "pointer",
          }}
        >
          {open ? "Hide coaching prompt" : `▸ Get a prompt that teaches me ${label}`}
        </button>
        {open && (
          <button
            onClick={copy}
            style={{
              background: copied ? "#12352a" : "#123043",
              border: `1px solid ${copied ? "#34d399" : "#24506a"}`,
              color: copied ? "#5eead4" : "#9fe8ff",
              fontSize: 12.5,
              fontWeight: 700,
              padding: "6px 11px",
              borderRadius: 7,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
      {open && (
        <pre
          style={{
            marginTop: 8,
            marginBottom: 0,
            padding: "12px 13px",
            background: "#0b1119",
            border: "1px solid #1b2734",
            borderRadius: 8,
            color: "#c9d3df",
            fontSize: 12.5,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
          }}
        >
          {prompt}
        </pre>
      )}
      {open && (
        <p style={{ margin: "7px 0 0", fontSize: 12, color: "#5b6878" }}>
          Paste this into Claude Code and work a real task. Come back and reassess to see the dimension move.
        </p>
      )}
    </div>
  );
}
