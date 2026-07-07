import { NextRequest, NextResponse } from "next/server";
import { getUserByToken, ingestEvents, type IngestEvent } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous cap: ingest is legit high-frequency traffic. The official client
// syncs about every 15 min (~1 req / 15 min = ~40/10h), so 120 requests per
// 10-minute window is orders of magnitude above any real user - it only bites
// a flood. Keyed by device token when present (so one hot token is throttled
// without touching anyone else), else by IP so an anonymous/bad-token flood
// gets stopped BEFORE it costs a getUserByToken DB read on every request.
const INGEST_LIMIT = 120;
const INGEST_WINDOW_SEC = 10 * 60; // 10 minutes

/**
 * POST /api/ingest
 * Auth: Authorization: Bearer <device_token>
 * Body: { "events": [ <contract v1 event objects> ] }
 * → { ok: true, stored: N } | 401 | 400
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // Rate-limit BEFORE the auth DB lookup: key on the token when present, else
  // on the client IP, so a bad-token/anonymous flood is stopped before it costs
  // a DB read per request. Fail-open inside checkRateLimit on any limiter error.
  const rlKey = token ? `ingest:tok:${token}` : `ingest:ip:${clientIp(req)}`;
  const rl = await checkRateLimit(rlKey, INGEST_LIMIT, INGEST_WINDOW_SEC);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded - slow down" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const user = token ? await getUserByToken(token) : undefined;
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) {
    return NextResponse.json(
      { ok: false, error: "body must be {events: [...]}" },
      { status: 400 }
    );
  }
  // Cap batch size: an authenticated token can only bloat its own data, but a
  // hard ceiling keeps a compromised/misconfigured token from ballooning storage.
  // The sync client batches incrementally, so real batches are small.
  if (events.length > 1000) {
    return NextResponse.json(
      { ok: false, error: "too many events in one batch (max 1000)" },
      { status: 413 }
    );
  }

  const stored = await ingestEvents(user.id, events as IngestEvent[]);
  // received vs stored lets a misconfigured client see its events being
  // dropped by per-event validation instead of a silent ok:true.
  const skipped = events.length - stored;
  return NextResponse.json({ ok: true, received: events.length, stored, skipped });
}
