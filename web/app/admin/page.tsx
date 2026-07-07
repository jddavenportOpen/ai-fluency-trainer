/**
 * /admin — operator adoption dashboard.
 *
 * Auth gate (same mechanism as /dashboard):
 *   1. getCurrentUser() reads the httpOnly aif_session cookie → DB lookup.
 *   2. Not logged in → redirect /login.
 *   3. Logged in but handle not in ADMIN_HANDLES → 404.
 *   4. Admin → render dashboard.
 *
 * ADMIN_HANDLES env var: comma-separated list of handles, default "jd".
 * Example: ADMIN_HANDLES=jd,alice,bob
 */
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  getAdminSummary,
  getAdminRoster,
  getSignupsByDay,
  type UserTag,
} from "@/lib/admin";

export const dynamic = "force-dynamic";

function adminHandles(): Set<string> {
  const raw = process.env.ADMIN_HANDLES ?? "jd";
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

const TAG_STYLES: Record<UserTag, { label: string; color: string }> = {
  real: { label: "REAL", color: "#22c55e" },
  seeded: { label: "demo", color: "#60a5fa" },
  test: { label: "test", color: "#f87171" },
};

export default async function AdminPage() {
  // Step 1: session auth (identical to /dashboard).
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  // Step 2: admin gate.
  if (!adminHandles().has(user.handle)) return notFound();

  // Step 3: fetch all data in parallel.
  const [summary, roster, signupDays] = await Promise.all([
    getAdminSummary(),
    getAdminRoster(),
    getSignupsByDay(),
  ]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: "32px 20px", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
            Clawd<span style={{ color: "#6366f1" }}>■</span>academy Admin
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Operator adoption dashboard — signed in as <b>{user.handle}</b>
          </p>
        </div>
        <a href="/dashboard" style={{ fontSize: 13, color: "#6366f1" }}>My dashboard →</a>
      </div>

      {/* Headline cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 36 }}>
        <StatCard label="Real users" value={summary.realUsers} accent="#22c55e" />
        <StatCard label="Active (7d)" value={summary.activeUsers7d} accent="#f59e0b" />
        <StatCard label="Total events" value={summary.totalEvents} accent="#6366f1" />
        <StatCard label="Demo users" value={summary.seededUsers} accent="#60a5fa" />
        <StatCard label="Test/junk" value={summary.testUsers} accent="#f87171" />
        <StatCard label="All users" value={summary.totalUsers} accent="#94a3b8" />
      </div>

      {/* Signups by day */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "#cbd5e1" }}>
          Signups by day
        </h2>
        {signupDays.length === 0 ? (
          <p style={{ color: "#475569", fontSize: 13 }}>No signups yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {signupDays.map(({ date, count }) => (
              <div key={date} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <span style={{ width: 100, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{date}</span>
                <div style={{ flex: 1, background: "#1e293b", borderRadius: 3, height: 16, maxWidth: 300 }}>
                  <div
                    style={{
                      width: `${Math.min(100, count * 20)}%`,
                      background: "#6366f1",
                      borderRadius: 3,
                      height: "100%",
                      minWidth: 4,
                    }}
                  />
                </div>
                <span style={{ color: "#e2e8f0", minWidth: 20 }}>+{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Full roster table */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "#cbd5e1" }}>
          Full roster ({roster.length} users, sorted by fluency score)
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left", borderBottom: "1px solid #1e293b" }}>
                <th style={thStyle}>Handle</th>
                <th style={thStyle}>Tag</th>
                <th style={thStyle}>Fluency</th>
                <th style={thStyle}>Band</th>
                <th style={thStyle}>Events</th>
                <th style={thStyle}>Last active</th>
                <th style={thStyle}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row) => {
                const tagStyle = TAG_STYLES[row.tag];
                return (
                  <tr
                    key={row.id}
                    style={{ borderBottom: "1px solid #0f172a" }}
                  >
                    <td style={tdStyle}>
                      <a
                        href={`/u/${row.handle}`}
                        style={{ color: "#e2e8f0", textDecoration: "none" }}
                      >
                        {row.handle}
                      </a>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          color: tagStyle.color,
                          background: tagStyle.color + "22",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {tagStyle.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {row.fluencyScore}
                      {!row.fluencyEstablished && (
                        <span style={{ color: "#475569", fontSize: 11 }}> ~</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "#94a3b8" }}>{row.fluencyBand}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{row.eventCount}</td>
                    <td style={{ ...tdStyle, color: "#64748b" }}>
                      {row.lastActive ? row.lastActive.slice(0, 10) : "—"}
                    </td>
                    <td style={{ ...tdStyle, color: "#475569" }}>
                      {row.created_at.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#0f172a",
        border: `1px solid ${accent}33`,
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 500,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  color: "#e2e8f0",
};
