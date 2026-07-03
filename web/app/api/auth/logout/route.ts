import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/auth";
import { deleteSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout → delete the session row + clear the cookie. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await deleteSession(hashSessionToken(token));
    } catch {
      /* best-effort; clearing the cookie still logs the client out */
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
