import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  newSessionToken,
  sessionExpiry,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/auth";
import { getUserByEmail, createSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login { email, password }
 * → 200 { handle } + httpOnly aif_session cookie
 * → 401 generic "invalid credentials" (no user-enumeration in text OR timing:
 *   we always run a scrypt verify, even for unknown emails, via a decoy hash).
 */
// A well-formed scrypt hash of a random value — verified against when the email
// is unknown so the timing of "no such user" matches "wrong password".
const DECOY_HASH =
  "scrypt$16384$8$1$00000000000000000000000000000000$" +
  "0000000000000000000000000000000000000000000000000000000000000000";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = email ? await getUserByEmail(email) : undefined;
  const ok = verifyPassword(password, user?.password_hash ?? DECOY_HASH);

  if (!user || !ok) {
    return NextResponse.json({ ok: false, error: "invalid credentials" }, { status: 401 });
  }

  const { token, tokenHash } = newSessionToken();
  const expiresAt = sessionExpiry();
  await createSession({
    userId: user.id,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    userAgent: req.headers.get("user-agent"),
  });

  const res = NextResponse.json({ ok: true, handle: user.handle });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}
