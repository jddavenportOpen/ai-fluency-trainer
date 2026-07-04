import Link from "next/link";
import { listUsers, turnScoresFor } from "@/lib/db";
import { fluencyRating, dimAverages, prettifyDim } from "@/lib/stats";

/**
 * Public leaderboard (PRD-02 §4.4). Ranks by the volume-INDEPENDENT Fluency
 * Rating (quality), NOT XP/volume - a grinder cannot climb by farming turns.
 * Established-only (>=15 scored turns): a 3-turn 100 cannot top the board.
 * This ships the two cheap structural anti-gaming guards; continuous anomaly
 * detection is PRD-06's standing tax. Free forever, never a SKU.
 */
export const dynamic = "force-dynamic";

type Row = { handle: string; score: number; band: string; topDim: string | null };

async function board(): Promise<Row[]> {
  const users = await listUsers();
  const rows: Row[] = [];
  for (const u of users) {
    const scores = await turnScoresFor(u.id);
    const r = fluencyRating(scores);
    if (!r.established) continue; // established-only floor
    const top = Object.entries(dimAverages(scores)).sort((a, b) => b[1] - a[1])[0];
    rows.push({ handle: u.handle, score: r.score, band: r.band, topDim: top ? prettifyDim(top[0]) : null });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 100);
}

export default async function LeaderboardPage() {
  const rows = await board();

  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Clawd<span className="dot">■</span>academy
        </Link>
        <span className="verified">Leaderboard · beta</span>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>Fluency Leaderboard</h1>
        <p className="sub" style={{ marginBottom: 22 }}>
          Ranked by <b>quality of AI-collaboration behavior</b> (the Fluency Rating), not volume. Grinding more
          turns cannot move you up - only working better can. Established profiles only (15+ scored turns).
          A self-instrumented measure, not an audited credential.
        </p>

        {rows.length === 0 ? (
          <div className="card">
            <p className="sub" style={{ margin: 0 }}>
              No established profiles yet. Be the first - install the plugin, do real work in Claude Code, and
              your Rating appears here once you have 15 scored turns.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#8b98a9", fontSize: 13 }}>
                  <th style={{ padding: "12px 16px" }}>#</th>
                  <th style={{ padding: "12px 16px" }}>Handle</th>
                  <th style={{ padding: "12px 16px" }}>Band</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Rating</th>
                  <th style={{ padding: "12px 16px" }}>Top habit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.handle} style={{ borderTop: "1px solid #1f2733" }}>
                    <td style={{ padding: "12px 16px", color: "#8b98a9", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/u/${r.handle}`} style={{ color: "#67e8f9", textDecoration: "none", fontWeight: 600 }}>
                        @{r.handle}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#e6edf3" }}>{r.band}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {r.score}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#8b98a9" }}>{r.topDim ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
