import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  generateDeviceToken,
  newSessionToken,
  sessionExpiry,
  isValidEmail,
  isValidPassword,
  normalizeHandle,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/auth";
import { createUser, createSession, getUserByEmail, getUserByHandle } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup { email, password, handle }
 * → 200 { handle, device_token } + httpOnly aif_session cookie
 * → 400 validation | 409 duplicate email/handle
 */
export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown; handle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const handle = normalizeHandle(typeof body.handle === "string" ? body.handle : "");

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      { ok: false, error: "password must be at least 10 characters" },
      { status: 400 }
    );
  }
  if (!handle) {
    return NextResponse.json(
      { ok: false, error: "handle must be 3-30 chars, lowercase letters/numbers/hyphens" },
      { status: 400 }
    );
  }

  // Pre-check for a clean 409; the DB unique constraints are the real guard.
  if (await getUserByEmail(email)) {
    return NextResponse.json({ ok: false, error: "email already registered" }, { status: 409 });
  }
  if (await getUserByHandle(handle)) {
    return NextResponse.json({ ok: false, error: "handle already taken" }, { status: 409 });
  }

  const deviceToken = generateDeviceToken();
  let user;
  try {
    user = await createUser({
      handle,
      email,
      passwordHash: hashPassword(password),
      deviceToken,
    });
  } catch (e) {
    // Unique-violation race → 409.
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|unique|constraint/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "email or handle already taken" },
        { status: 409 }
      );
    }
    throw e;
  }

  const { token, tokenHash } = newSessionToken();
  const expiresAt = sessionExpiry();
  await createSession({
    userId: user.id,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    userAgent: req.headers.get("user-agent"),
  });

  const res = NextResponse.json({ ok: true, handle: user.handle, device_token: deviceToken });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}
