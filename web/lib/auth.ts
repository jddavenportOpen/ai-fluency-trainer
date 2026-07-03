/**
 * Auth primitives for real multi-user login. NODE RUNTIME ONLY — these use
 * node:crypto (scrypt). Route handlers that import this MUST set
 * `export const runtime = "nodejs"`. Never import from middleware (edge).
 *
 * Password hashing: scrypt with a per-user random salt, stored as
 *   scrypt$N$r$p$<saltHex>$<hashHex>
 * Verification is constant-time (crypto.timingSafeEqual).
 *
 * Session tokens: a random 32-byte token handed to the client in an httpOnly
 * cookie; only its SHA-256 hash is stored server-side (aif_sessions.token_hash),
 * so a DB leak can't be replayed as a live cookie.
 */
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 32;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_COOKIE = "aif_session";

/** Hash a password with a fresh random salt. Returns the storable string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Constant-time password verification. Returns false for any malformed stored
 * value (e.g. legacy rows with a null/empty hash) without throwing.
 */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Generate a device token in the aif_<hex32> format used for ingest auth. */
export function generateDeviceToken(): string {
  return `aif_${randomBytes(24).toString("hex")}`; // 48 hex chars
}

/** A fresh opaque session token (given to the client) + its stored hash. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export const SESSION_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);

/* ---- input validation ---- */

export function isValidEmail(email: string): boolean {
  // Deliberately simple + length-capped; real deliverability isn't the gate.
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export function isValidPassword(password: string): boolean {
  return typeof password === "string" && password.length >= 10 && password.length <= 200;
}

/** Slug-safe handle: [a-z0-9-], 3-30 chars. Returns the normalized handle or null. */
export function normalizeHandle(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(h)) return null;
  return h;
}
