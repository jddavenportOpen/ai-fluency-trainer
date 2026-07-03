import { prettifyDim } from "@/lib/stats";

/**
 * Hand-rolled SVG radar chart. Axes are data-driven: one per dim key.
 * Server-renderable (no client JS).
 */
export default function Radar({
  dims,
  size = 380,
}: {
  dims: Record<string, number>;
  size?: number;
}) {
  const keys = Object.keys(dims).sort();
  if (keys.length === 0) {
    return (
      <div style={{ color: "var(--faint)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        No scored turns yet — run a session with the plugin installed.
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 58; // leave room for labels
  const n = keys.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, frac: number): [number, number] => [
    cx + Math.cos(angle(i)) * r * frac,
    cy + Math.sin(angle(i)) * r * frac,
  ];
  const ringPath = (frac: number) =>
    keys.map((_, i) => pt(i, frac).map((v) => v.toFixed(1)).join(",")).join(" ");
  const valuePath = keys
    .map((k, i) => pt(i, Math.max(0, Math.min(100, dims[k])) / 100).map((v) => v.toFixed(1)).join(","))
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      role="img"
      aria-label="Dimension radar chart"
    >
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ringPath(f)} fill="none" stroke="#1d2735" strokeWidth={f === 1 ? 1.5 : 1} />
      ))}
      {/* spokes */}
      {keys.map((k, i) => {
        const [x, y] = pt(i, 1);
        return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke="#1d2735" strokeWidth="1" />;
      })}

      {/* value polygon */}
      <polygon points={valuePath} fill="url(#radarFill)" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
      {keys.map((k, i) => {
        const [x, y] = pt(i, Math.max(0, Math.min(100, dims[k])) / 100);
        return <circle key={k} cx={x} cy={y} r="3.5" fill="#0a0e14" stroke="#22d3ee" strokeWidth="2" />;
      })}

      {/* axis labels */}
      {keys.map((k, i) => {
        const [x, y] = pt(i, 1.14);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <g key={k}>
            <text x={x} y={y} textAnchor={anchor} fontSize="12" fontWeight="600" fill="#8b98a9">
              {prettifyDim(k)}
            </text>
            <text x={x} y={y + 14} textAnchor={anchor} fontSize="11" fontWeight="700" fill="#22d3ee">
              {Math.round(dims[k])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
