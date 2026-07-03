/**
 * Auth is now enforced in-page: /dashboard calls getCurrentUser() and
 * redirects to /login when there's no valid session (see app/dashboard/page.tsx
 * and lib/session.ts). The old shared DASHBOARD_KEY gate is retired.
 *
 * Middleware runs on the edge runtime, which can't use node:crypto/scrypt, so
 * session verification deliberately lives in the Node-runtime page instead.
 * This middleware is a no-op kept only so the matcher stays empty and explicit.
 */
import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.next();
}

// Match nothing — every route handles its own auth.
export const config = {
  matcher: [],
};
