import { NextRequest, NextResponse } from "next/server";
import { getUserByToken, ingestEvents, type IngestEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest
 * Auth: Authorization: Bearer <device_token>
 * Body: { "events": [ <contract v1 event objects> ] }
 * → { ok: true, stored: N } | 401 | 400
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
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
