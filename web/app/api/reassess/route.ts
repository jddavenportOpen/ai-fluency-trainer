import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { turnScoresFor, latestSnapshot, insertSnapshot } from "@/lib/db";
import { fluencyRating, dimAverages } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long a user must wait between reassessments. A reassessment is only
 * meaningful once new turns have accumulated; 20h lets a daily user reassess
 * once per day without gaming the history. */
const COOLDOWN_MS = 20 * 60 * 60 * 1000;

/**
 * POST /api/reassess — re-fire the current user's Fluency assessment.
 *
 * Owner-only (session cookie). Recomputes the live rating, and if the cooldown
 * has elapsed since the last snapshot, records a new snapshot and returns the
 * before/after delta. Gated so the reassessment history reflects real progress,
 * not spam-clicking.
 *
 * → 200 { ok, current, previous, delta, snapshotted:true }   (recorded)
 * → 200 { ok, current, previous, snapshotted:false, retryInMs } (cooldown)
 * → 401 { ok:false } when not logged in.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  }

  const scores = await turnScoresFor(user.id);
  const rating = fluencyRating(scores);
  const dims = dimAverages(scores);

  const prev = await latestSnapshot(user.id);
  const now = Date.now();

  const current = {
    score: rating.score,
    band: rating.band,
    turns: rating.sampled,
    established: rating.established,
  };
  const previous = prev
    ? { score: prev.score, band: prev.band, turns: prev.turns, at: prev.created_at }
    : null;

  // Cooldown: if a recent snapshot exists, don't record another yet.
  if (prev) {
    const age = now - new Date(prev.created_at).getTime();
    if (age < COOLDOWN_MS) {
      return NextResponse.json({
        ok: true,
        snapshotted: false,
        current,
        previous,
        retryInMs: COOLDOWN_MS - age,
      });
    }
  }

  const snap = await insertSnapshot({
    userId: user.id,
    score: rating.score,
    band: rating.band,
    turns: rating.sampled,
    dims,
  });

  const delta = prev ? rating.score - prev.score : null;

  return NextResponse.json({
    ok: true,
    snapshotted: true,
    current,
    previous,
    delta,
    at: snap.created_at,
  });
}
