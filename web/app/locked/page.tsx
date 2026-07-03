/**
 * Minimal enter-key page shown (via middleware rewrite) when /dashboard is
 * requested without a valid DASHBOARD_KEY. Renders no data.
 */
export const dynamic = "force-dynamic";

export default function Locked() {
  return (
    <div className="landing">
      <div className="brand">
        AI Fluency <span className="dot">■</span> Trainer
      </div>
      <h1>Dashboard is locked</h1>
      <p>Enter the dashboard key to continue.</p>
      <form action="/dashboard" method="get" className="links" style={{ alignItems: "stretch" }}>
        <input
          type="password"
          name="key"
          placeholder="dashboard key"
          autoFocus
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--line, #333)",
            borderRadius: 6,
            color: "inherit",
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <button className="btn primary" type="submit">
          Enter
        </button>
      </form>
    </div>
  );
}
