import { NextRequest, NextResponse } from "next/server";
import { generateDeviceToken, normalizeHandle } from "@/lib/auth";
import { getUserByHandle, upsertUser } from "@/lib/db";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserved handles nobody can claim via the open provision path.
const RESERVED = new Set(["jd", "admin", "clawdacademy", "api", "www", "support", "root", "help", "about", "login", "signup", "dashboard", "leaderboard", "u"]);

// Junk/test/audit handle prefixes. A real install claims a real handle; these
// are the shapes automated probes and load tests use. An audit probe once
// created "zzz-audit-probe-nonexistent" in prod with one curl - this blocks
// that class of pollution while leaving every legitimate handle claimable.
const DENY_PREFIXES = ["zzz-", "qa-audit", "test-", "audit-", "probe-", "dummy-", "sample-"];

// Abuse floor: a real user provisions ONCE per device. 5/IP/hour absorbs
// retries, a shared NAT, and a legit re-provision without letting an anonymous
// caller script-create identities. Fixed-window, durable (see lib/ratelimit.ts).
const PROVISION_LIMIT = 5;
const PROVISION_WINDOW_SEC = 60 * 60; // 1 hour

/**
 * POST /api/provision { handle } -> 200 { handle, device_token }
 *
 * Score-first onboarding (PRD-02 §4.6): a new user claims a handle and gets their
 * OWN sync token so they can see their number in minutes - no email/password wall.
 * Email login (the recovery / multi-device upgrade) is added later. This is what
 * kills the shared `dev-token-jd`: every install provisions a distinct identity.
 */
export async function POST(req: NextRequest) {
  // Abuse floor FIRST: block a flood before it touches the DB. Per-IP so one
  // caller can't script identity creation; fail-open inside so a limiter blip
  // never wedges provisioning.
  const ip = clientIp(req);
  const rl = await checkRateLimit(`provision:${ip}`, PROVISION_LIMIT, PROVISION_WINDOW_SEC);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "too many provision attempts - try again later" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { handle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const handle = normalizeHandle(typeof body.handle === "string" ? body.handle : "");
  if (!handle) {
    return NextResponse.json(
      { ok: false, error: "handle must be 3-30 chars: lowercase letters, numbers, hyphens" },
      { status: 400 }
    );
  }
  // normalizeHandle already enforces the [a-z0-9-]{3,30} slug shape (so empty,
  // >32 chars, and non-slug chars are rejected above). This adds the reserved-
  // prefix denylist for obviously-junk/test/audit handles.
  if (DENY_PREFIXES.some((p) => handle.startsWith(p))) {
    return NextResponse.json({ ok: false, error: "that handle is not allowed" }, { status: 400 });
  }
  if (RESERVED.has(handle)) {
    return NextResponse.json({ ok: false, error: "that handle is reserved" }, { status: 409 });
  }
  if (await getUserByHandle(handle)) {
    return NextResponse.json({ ok: false, error: "handle already taken - pick another" }, { status: 409 });
  }

  const deviceToken = generateDeviceToken();
  try {
    await upsertUser(handle, deviceToken); // handle was pre-checked absent -> insert
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|unique|constraint/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "handle already taken - pick another" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true, handle, device_token: deviceToken });
}
