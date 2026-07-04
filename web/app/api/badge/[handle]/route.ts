import { getUserByHandle, turnScoresFor } from "@/lib/db";
import { fluencyRating } from "@/lib/stats";

/**
 * README / Markdown badge (PRD-02 §4.3) - the GitHub-green-squares move. A
 * shields.io-style SVG pill "Clawdacademy: [band] [score]". Claims discipline:
 * never "verified/certified" on a self-embeddable asset. Cached (Rating is
 * slow-changing). Handle segment may carry a trailing ".svg".
 */
export const runtime = "nodejs";
export const revalidate = 300;

const BAND_COLOR: Record<string, string> = {
  Expert: "#22c55e",
  Advanced: "#4ade80",
  Proficient: "#38bdf8",
  Developing: "#f59e0b",
  Emerging: "#94a3b8",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pill(label: string, value: string, valueColor: string): string {
  const charW = 6.5;
  const pad = 10;
  const lw = Math.ceil(label.length * charW) + pad * 2;
  const vw = Math.ceil(value.length * charW) + pad * 2;
  const w = lw + vw;
  const h = 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${esc(
    label
  )}: ${esc(value)}">
  <rect rx="3" width="${w}" height="${h}" fill="#20242c"/>
  <rect rx="3" x="${lw}" width="${vw}" height="${h}" fill="${valueColor}"/>
  <rect rx="3" width="${w}" height="${h}" fill="url(#g)"/>
  <defs><linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient></defs>
  <g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
    <text x="${lw / 2}" y="14">${esc(label)}</text>
    <text x="${lw + vw / 2}" y="14" font-weight="bold">${esc(value)}</text>
  </g>
</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = raw.replace(/\.svg$/i, "");

  let value = "no profile";
  let color = "#94a3b8";
  try {
    const user = await getUserByHandle(handle);
    if (user) {
      const r = fluencyRating(await turnScoresFor(user.id));
      if (r.established) {
        value = `${r.band} ${r.score}`;
        color = BAND_COLOR[r.band] ?? "#38bdf8";
      } else {
        value = "provisional";
        color = "#64748b";
      }
    }
  } catch {
    /* fail-open: render a neutral badge, never 500 a README */
  }

  return new Response(pill("Clawdacademy", value, color), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
