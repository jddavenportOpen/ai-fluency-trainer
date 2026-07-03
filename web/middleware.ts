import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight key gate for /dashboard (the private owner view).
 *   - ?key=<DASHBOARD_KEY> → set httpOnly cookie + redirect to a clean URL,
 *     so subsequent navigation keeps working without the query param.
 *   - valid cookie → pass through.
 *   - otherwise → rewrite to the minimal enter-key page (no data rendered).
 * If DASHBOARD_KEY is unset (local dev), the dashboard is open.
 * /, /u/[handle] and /api/ingest are NOT matched — they keep their own auth.
 */

const COOKIE = "aif_dash";

export function middleware(req: NextRequest) {
  const key = process.env.DASHBOARD_KEY;
  if (!key) return NextResponse.next(); // local dev: no gate configured

  const url = req.nextUrl;
  const queryKey = url.searchParams.get("key");

  if (queryKey !== null) {
    if (queryKey === key) {
      const clean = url.clone();
      clean.searchParams.delete("key");
      const res = NextResponse.redirect(clean);
      res.cookies.set(COOKIE, key, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return res;
    }
    // wrong key in query: fall through to the locked page
  }

  if (req.cookies.get(COOKIE)?.value === key) return NextResponse.next();

  return NextResponse.rewrite(new URL("/locked", req.url));
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
