import { ImageResponse } from "next/og";
import { getUserByHandle, turnScoresFor } from "@/lib/db";
import { fluencyRating, dimAverages, prettifyDim } from "@/lib/stats";

/**
 * Rendered 1200x630 OG card (PRD-02 §4.1) - the scroll-stopper. Computed
 * server-side from stored scores only (no query-param forgery). ONE unified,
 * Satori-safe render: single-string text nodes only (no inline span/gap/
 * letterSpacing/baseline - Satori chokes on multi-child text and some props).
 * Data errors fall back to the claim card, never a 500.
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

  let bigNum: string | null = null;
  let headline = "Claim your Clawdacademy profile";
  let sub = "Measure how well you actually work with AI, from your real Claude Code sessions.";
  let handleLine = "";

  try {
    const user = await getUserByHandle(handle);
    if (user) {
      const scores = await turnScoresFor(user.id);
      const rating = fluencyRating(scores);
      const weakest = Object.entries(dimAverages(scores)).sort((a, b) => a[1] - b[1])[0];
      const weakLabel = weakest ? prettifyDim(weakest[0]) : null;
      bigNum = String(rating.score);
      headline = rating.band + (rating.established ? "" : " · provisional");
      sub = weakLabel
        ? `Weakest habit: ${weakLabel}`
        : "Most devs over-rate themselves. Here is the measured number.";
      handleLine = `@${user.handle}`;
    }
  } catch {
    /* fall back to claim card, never 500 */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 70,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark />
          <div style={{ fontSize: 26, color: MUTED }}>{handleLine}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, color: MUTED }}>{bigNum ? "FLUENCY RATING" : ""}</div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            {bigNum ? (
              <div style={{ fontSize: 180, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{bigNum}</div>
            ) : null}
            <div style={{ fontSize: bigNum ? 54 : 62, fontWeight: 800, color: "#e6edf3", marginLeft: bigNum ? 24 : 0 }}>
              {headline}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#e6edf3" }}>{sub}</div>
          <div style={{ fontSize: 24, color: MUTED, marginTop: 14 }}>
            clawdacademy.app · quality of AI behavior, not volume · local-first · open source
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
