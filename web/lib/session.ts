/**
 * Server-side session resolution. Reads the httpOnly aif_session cookie,
 * hashes it, and looks up the (non-expired) owning user. Returns null when
 * there is no valid session. NODE RUNTIME ONLY (imports auth + db).
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, hashSessionToken } from "./auth.ts";
import { getUserBySessionToken, type UserRow } from "./db.ts";

export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await getUserBySessionToken(hashSessionToken(token));
  return user ?? null;
}
