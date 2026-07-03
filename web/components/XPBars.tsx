import type { SessionXP } from "@/lib/stats";
import { fmtDate } from "@/lib/stats";

/** Simple hand-rolled SVG bar chart: XP earned per session, chronological. */
export default function XPBars({ sessions }: { sessions: SessionXP[] }) {
  if (sessions.length === 0) {
    return (
      <div style={{ color: "var(--faint)", fontSize: 13, padding: "30px 0", textAlign: "center" }}>
        No sessions scored yet.
      </div>
    );
  }
  const W = 460;
  const H = 190;
  const padB = 26;
  const padT = 18;
  const max = Math.max(...sessions.map((s) => s.xp), 1);
  const slot = W / sessions.length;
  const barW = Math.min(46, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="XP per session">
      <defs>
        <linearGradient id="barFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="#1d2735" strokeWidth="1" />
      {sessions.map((s, i) => {
        const h = ((H - padB - padT) * s.xp) / max;
        const x = slot * i + (slot - barW) / 2;
        const y = H - padB - h;
        return (
          <g key={s.sid}>
            <rect x={x} y={y} width={barW} height={h} rx="5" fill="url(#barFill)" />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e6edf3">
              {s.xp}
            </text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b6878">
              {fmtDate(s.firstTs)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
