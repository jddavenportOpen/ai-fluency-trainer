import { NextRequest, NextResponse } from "next/server";
import { generateDeviceToken, normalizeHandle } from "@/lib/auth";
import { getUserByHandle, upsertUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserved handles nobody can claim via the open provision path.
const RESERVED = new Set(["jd", "admin", "clawdacademy", "api", "www", "support", "root", "help", "about", "login", "signup", "dashboard", "leaderboard", "u"]);

/**
 * POST /api/provision { handle } -> 200 { handle, device_token }
 *
 * Score-first onboarding (PRD-02 §4.6): a new user claims a handle and gets their
 * OWN sync token so they can see their number in minutes - no email/password wall.
 * Email login (the recovery / multi-device upgrade) is added later. This is what
 * kills the shared `dev-token-jd`: every install provisions a distinct identity.
 */
export async function POST(req: NextRequest) {
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
