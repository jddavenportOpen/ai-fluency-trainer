import { ImageResponse } from "next/og";
import { getUserByHandle, turnScoresFor } from "@/lib/db";
import { fluencyRating, dimAverages, prettifyDim } from "@/lib/stats";

/**
 * Rendered 1200x630 OG card (PRD-02 §4.1) - the scroll-stopper. Computed
 * server-side from stored scores only (no query-param forgery). Renders the
 * Rating + band + weakest habit (the sting) + the local-first privacy tag that
 * travels ON the shared artifact itself. Satori rule: any element with more
 * than one child (incl. text + interpolation) must set display:flex.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

const BG = "#0b0f17";
const ACCENT = "#67e8f9";
const MUTED = "#8b98a9";

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800, color: "#e6edf3" }}>
      Clawd<span style={{ color: ACCENT, margin: "0 3px" }}>▪</span>academy
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await getUserByHandle(handle).catch(() => undefined);

  if (!user) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, padding: 70, fontFamily: "sans-serif" }}>
          <Wordmark />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 60, fontWeight: 800, color: "#e6edf3" }}>Claim your Clawdacademy profile</div>
            <div style={{ fontSize: 30, color: MUTED, marginTop: 16 }}>Measure how well you actually work with AI, from your real Claude Code sessions.</div>
          </div>
          <div style={{ fontSize: 26, color: MUTED }}>clawdacademy.app  ·  local-first · open source</div>
        </div>
      ),
      { ...size }
    );
  }

  const scores = await turnScoresFor(user.id);
  const rating = fluencyRating(scores);
  const weakest = Object.entries(dimAverages(scores)).sort((a, b) => a[1] - b[1])[0];
  const weakLabel = weakest ? prettifyDim(weakest[0]) : null;
  const bandLine = rating.band + (rating.established ? "" : " · provisional");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, padding: 70, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark />
          <div style={{ fontSize: 26, color: MUTED }}>{`@${user.handle}`}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, color: MUTED, letterSpacing: 3 }}>FLUENCY RATING</div>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 200, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{rating.score}</div>
            <div style={{ fontSize: 54, fontWeight: 700, color: "#e6edf3", marginLeft: 24 }}>{bandLine}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {weakLabel ? (
            <div style={{ display: "flex", gap: 8, fontSize: 30, color: "#e6edf3" }}>
              Weakest habit:<span style={{ color: "#fca5a5" }}>{weakLabel}</span>
            </div>
          ) : (
            <div style={{ fontSize: 30, color: "#e6edf3" }}>Most devs over-rate themselves. Here is the measured number.</div>
          )}
          <div style={{ fontSize: 24, color: MUTED, marginTop: 14 }}>clawdacademy.app  ·  quality of AI behavior, not volume  ·  local-first · open source</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
