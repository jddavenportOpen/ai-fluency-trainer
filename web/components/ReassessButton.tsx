"use client";

import { useState } from "react";

interface ReassessResult {
  ok: boolean;
  snapshotted: boolean;
  current: { score: number; band: string; turns: number; established: boolean };
  previous: { score: number; band: string; turns: number; at: string } | null;
  delta?: number | null;
  retryInMs?: number;
  at?: string;
}

function humanizeMs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Owner-only "Reassess" control. Re-fires the assessment via /api/reassess and
 * shows the before/after. Server enforces the cooldown; the UI just reflects it.
 */
export default function ReassessButton({
  lastAt,
  eligible,
  retryInMs,
}: {
  lastAt: string | null;
  eligible: boolean;
  retryInMs: number;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReassessResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reassess", { method: "POST" });
      const data = (await res.json()) as ReassessResult & { error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error || "Could not reassess right now.");
      } else {
        setResult(data);
      }
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Post-action feedback takes over the card body.
  if (result) {
    if (!result.snapshotted) {
      return (
        <p style={{ margin: 0, fontSize: 13, color: "#9fb0c3" }}>
          Already reassessed recently. Your rating is live at{" "}
          <b style={{ color: "#67e8f9" }}>{result.current.score}</b> ({result.current.band}).
          Next reassessment in {humanizeMs(result.retryInMs ?? 0)}.
        </p>
      );
    }
    const d = result.delta;
    return (
      <div style={{ fontSize: 13.5, color: "#c9d3df", lineHeight: 1.6 }}>
        <div style={{ fontSize: 15, color: "#e6edf3", marginBottom: 4 }}>
          Reassessed: <b style={{ color: "#67e8f9" }}>{result.current.score}</b> · {result.current.band}
          {typeof d === "number" && (
            <span style={{ color: d > 0 ? "#5eead4" : d < 0 ? "#f5a97f" : "#9fb0c3", marginLeft: 8 }}>
              {d > 0 ? `↑ +${d}` : d < 0 ? `↓ ${d}` : "→ no change"}
              {result.previous && ` vs ${result.previous.score} last time`}
            </span>
          )}
        </div>
        {!result.previous && (
          <p style={{ margin: 0, color: "#9fb0c3" }}>
            First snapshot recorded. Work a few coached tasks, then reassess to see the delta.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={run}
          disabled={busy || !eligible}
          style={{
            background: eligible ? "#123043" : "#12202b",
            border: `1px solid ${eligible ? "#24506a" : "#1d2735"}`,
            color: eligible ? "#9fe8ff" : "#5b6878",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 15px",
            borderRadius: 8,
            cursor: eligible && !busy ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "Reassessing…" : "Reassess my rating"}
        </button>
        <span style={{ fontSize: 12.5, color: "#8b98a9" }}>
          {eligible
            ? lastAt
              ? "New turns since your last check — see how you moved."
              : "Record your first snapshot to start tracking progress."
            : `Available again in ${humanizeMs(retryInMs)}.`}
        </span>
      </div>
      {err && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#f5a97f" }}>{err}</p>
      )}
    </div>
  );
}
