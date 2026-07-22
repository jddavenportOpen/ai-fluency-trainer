import Link from "next/link";
import { getLeaderboard, type LeaderboardFilters } from "@/lib/db";
import type { LeaderboardRow } from "@/lib/db";

/**
 * Public leaderboard (PRD-02 §4.4). Reads from aif_leaderboard — a
 * precomputed, indexed table updated per-user on every ingest.
 * Sortable columns are server-rendered as links (?sort=X&order=asc|desc).
 * Filters are also searchParam-driven; no client JS required.
 *
 * Quality columns left: Rating, band, all 7 dims.
 * Output / volume columns right: Commits, LOC, Tokens (labeled "volume, not skill").
 * Null stat columns render as "-" and are never used in rating computation.
 */
export const dynamic = "force-dynamic";

/* ---- types ---- */

type SearchParams = { [key: string]: string | string[] | undefined };

function sp(params: SearchParams, key: string, fallback?: string): string | undefined {
  const v = params[key];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

/* ---- sort link helper ---- */

function sortLink(
  currentSort: string,
  currentOrder: string,
  col: string,
  params: SearchParams
): string {
  const nextOrder = currentSort === col && currentOrder === "desc" ? "asc" : "desc";
  const q = new URLSearchParams();
  q.set("sort", col);
  q.set("order", nextOrder);
  const band = sp(params, "band");
  const minRating = sp(params, "min_rating");
  const minTurns = sp(params, "min_turns");
  const established = sp(params, "established_only");
  const hasGh = sp(params, "has_github");
  if (band) q.set("band", band);
  if (minRating) q.set("min_rating", minRating);
  if (minTurns) q.set("min_turns", minTurns);
  if (established) q.set("established_only", established);
  if (hasGh) q.set("has_github", hasGh);
  return `/leaderboard?${q.toString()}`;
}

function SortTh({
  col, label, currentSort, currentOrder, params, style
}: {
  col: string; label: string; currentSort: string; currentOrder: string;
  params: SearchParams; style?: React.CSSProperties;
}) {
  const active = currentSort === col;
  const arrow = active ? (currentOrder === "desc" ? " ↓" : " ↑") : "";
  return (
    <th style={{ padding: "12px 16px", whiteSpace: "nowrap", ...style }}>
      <Link
        href={sortLink(currentSort, currentOrder, col, params)}
        style={{ color: active ? "#67e8f9" : "#8b98a9", textDecoration: "none", fontSize: 13 }}
      >
        {label}{arrow}
      </Link>
    </th>
  );
}

/* ---- filter form (server-rendered hidden inputs + native selects) ---- */

function fmt(v: number | null | undefined): string {
  if (v == null) return "-";
  return String(v);
}

function fmtDim(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toFixed(0);
}

function fmtLoc(v: number | null | undefined): string {
  if (v == null) return "-";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

/* ---- page ---- */

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sortBy = sp(params, "sort", "rating") as string;
  const order = (sp(params, "order", "desc") === "asc" ? "asc" : "desc") as "asc" | "desc";
  const bandFilter = sp(params, "band");
  const minRating = sp(params, "min_rating") ? Number(sp(params, "min_rating")) : undefined;
  const minTurns = sp(params, "min_turns") ? Number(sp(params, "min_turns")) : undefined;
  const establishedOnly = sp(params, "established_only") === "1";
  const hasGithub = sp(params, "has_github") === "1";

  const filters: LeaderboardFilters = {
    sortBy,
    order,
    band: bandFilter,
    min_rating: minRating,
    min_turns: minTurns,
    established_only: establishedOnly,
    has_github: hasGithub,
    limit: 100,
  };

  const rows = await getLeaderboard(filters);

  // Preserve all current params in filter form.
  const filterBase = new URLSearchParams();
  filterBase.set("sort", sortBy);
  filterBase.set("order", order);

  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Clawd<span className="dot">■</span>academy
        </Link>
        <span className="verified">Leaderboard · beta</span>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>Fluency Leaderboard</h1>
        <p className="sub" style={{ marginBottom: 16 }}>
          Ranked by <b>quality of AI-collaboration behavior</b> (the Fluency Rating), not volume.
          Grinding more turns cannot move you up - only working better can.
          A self-instrumented measure, not an audited credential.
        </p>

        {/* Filter bar */}
        <form method="GET" action="/leaderboard" style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="order" value={order} />

          <label style={{ fontSize: 13, color: "#8b98a9", display: "flex", alignItems: "center", gap: 6 }}>
            Band:
            <select name="band" defaultValue={bandFilter ?? ""} style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #2a3745", borderRadius: 5, padding: "3px 8px", fontSize: 13 }}>
              <option value="">All</option>
              <option value="Expert">Expert</option>
              <option value="Advanced">Advanced</option>
              <option value="Proficient">Proficient</option>
              <option value="Developing">Developing</option>
              <option value="Emerging">Emerging</option>
            </select>
          </label>

          <label style={{ fontSize: 13, color: "#8b98a9", display: "flex", alignItems: "center", gap: 6 }}>
            Min rating:
            <input
              name="min_rating"
              type="number"
              min={0} max={100}
              defaultValue={minRating ?? ""}
              placeholder="0"
              style={{ width: 60, background: "#0d1117", color: "#e6edf3", border: "1px solid #2a3745", borderRadius: 5, padding: "3px 8px", fontSize: 13 }}
            />
          </label>

          <label style={{ fontSize: 13, color: "#8b98a9", display: "flex", alignItems: "center", gap: 6 }}>
            Min turns:
            <input
              name="min_turns"
              type="number"
              min={0}
              defaultValue={minTurns ?? ""}
              placeholder="0"
              style={{ width: 60, background: "#0d1117", color: "#e6edf3", border: "1px solid #2a3745", borderRadius: 5, padding: "3px 8px", fontSize: 13 }}
            />
          </label>

          <label style={{ fontSize: 13, color: "#8b98a9", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="established_only" value="1" defaultChecked={establishedOnly} />
            Established only (15+ turns)
          </label>

          <label style={{ fontSize: 13, color: "#8b98a9", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="has_github" value="1" defaultChecked={hasGithub} />
            Has GitHub
          </label>

          <button
            type="submit"
            style={{ background: "#1f2733", color: "#e6edf3", border: "1px solid #2a3745", borderRadius: 5, padding: "4px 14px", fontSize: 13, cursor: "pointer" }}
          >
            Apply
          </button>
          <Link href="/leaderboard" style={{ fontSize: 13, color: "#8b98a9" }}>Reset</Link>
        </form>

        {rows.length === 0 ? (
          <div className="card">
            <p className="sub" style={{ margin: 0 }}>
              No profiles match the current filters.
              {!establishedOnly && (
                <> Install the plugin, do real work in Claude Code, and your Rating appears here once you have 15 scored turns.</>
              )}
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#0d1117" }}>
                  <th style={{ padding: "12px 16px", color: "#8b98a9", fontSize: 13 }}>#</th>
                  <th style={{ padding: "12px 16px", color: "#8b98a9", fontSize: 13 }}>Handle</th>

                  {/* Quality columns */}
                  <SortTh col="rating" label="Rating" currentSort={sortBy} currentOrder={order} params={params} />
                  <th style={{ padding: "12px 16px", color: "#8b98a9", fontSize: 13 }}>Band</th>
                  <SortTh col="turns" label="Turns" currentSort={sortBy} currentOrder={order} params={params} />
                  <SortTh col="context_eng_score" label="Ctx Eng" currentSort={sortBy} currentOrder={order} params={params} />
                  <SortTh col="harness_score" label="Harness" currentSort={sortBy} currentOrder={order} params={params} />
                  {/* 7 dim sub-columns */}
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Verification">Verify</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Diagnose vs Retry">Diagn</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Context Setting">Ctx</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Plan First">Plan</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Iteration Discipline">Iter</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Understanding Seeking">Und</th>
                  <th style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }} title="Scope Discipline">Scope</th>

                  {/* Output / volume columns — clearly labeled as not skill */}
                  <th colSpan={3} style={{ padding: "12px 16px", color: "#4a5568", fontSize: 11, textAlign: "center", borderLeft: "1px solid #1f2733", whiteSpace: "nowrap" }}>
                    volume, not skill
                  </th>
                </tr>
                <tr style={{ textAlign: "left", background: "#0a0f14" }}>
                  {/* spacer cells to align volume sub-headers */}
                  {Array.from({ length: 12 }).map((_, i) => <th key={i} />)}
                  <SortTh col="gh_commits" label="Commits" currentSort={sortBy} currentOrder={order} params={params} style={{ borderLeft: "1px solid #1f2733", textAlign: "right" }} />
                  <SortTh col="gh_loc" label="LOC" currentSort={sortBy} currentOrder={order} params={params} style={{ textAlign: "right" }} />
                  <SortTh col="tokens" label="Tokens" currentSort={sortBy} currentOrder={order} params={params} style={{ textAlign: "right" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: LeaderboardRow, i: number) => (
                  <tr key={r.user_id} style={{ borderTop: "1px solid #1f2733" }}>
                    <td style={{ padding: "11px 16px", color: "#8b98a9", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{i + 1}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <Link href={`/u/${r.handle}`} style={{ color: "#67e8f9", textDecoration: "none", fontWeight: 600 }}>
                        @{r.handle}
                      </Link>
                      {r.handle.startsWith("demo-") && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#8b98a9", border: "1px solid #2a3745", borderRadius: 5, padding: "1px 6px", verticalAlign: "middle" }}>
                          sample
                        </span>
                      )}
                      {!r.established && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#7c6c2b", border: "1px solid #3a3320", borderRadius: 5, padding: "1px 6px", verticalAlign: "middle" }}>
                          provisional
                        </span>
                      )}
                    </td>

                    {/* Quality */}
                    <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rating}</td>
                    <td style={{ padding: "11px 16px", color: "#e6edf3" }}>{r.band}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#8b98a9", fontVariantNumeric: "tabular-nums" }}>{r.turns}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#8b98a9", fontVariantNumeric: "tabular-nums" }}>{fmt(r.context_eng_score)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#8b98a9", fontVariantNumeric: "tabular-nums" }}>{fmt(r.harness_score)}</td>

                    {/* Dims */}
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_verification)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_diagnose)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_context_setting)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_plan_first)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_iteration)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_understanding)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtDim(r.dim_scope)}</td>

                    {/* Volume */}
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontVariantNumeric: "tabular-nums", borderLeft: "1px solid #1f2733", fontSize: 12 }}>{fmt(r.gh_commits)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{fmtLoc(r.gh_loc)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a5568", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{fmt(r.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.some((r: LeaderboardRow) => r.handle.startsWith("demo-")) && (
          <p className="sub" style={{ marginTop: 12, fontSize: 12.5 }}>
            Profiles tagged <b>sample</b> are seeded demo accounts shown while the board fills in with
            real users. They span the range so you can read what each band looks like; they are not real people.
          </p>
        )}

        <p className="sub" style={{ marginTop: 8, fontSize: 12.5 }}>
          Columns labeled <b>volume, not skill</b> (Commits, LOC, Tokens) are output metrics — they do not
          influence the Fluency Rating. Sort by them only if you want to see who is most active, not who works best.
        </p>
      </div>
    </div>
  );
}
