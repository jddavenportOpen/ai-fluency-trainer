/**
 * Durable, serverless-safe rate limiter for the public API (provision/ingest).
 *
 * WHY A DB AND NOT A JS Map: Vercel runs these routes as serverless functions.
 * Every invocation may be a *fresh* lambda (cold start) or a different instance
 * behind the load balancer, so any in-process counter (a module-level Map) is
 * per-instance and effectively resets constantly - it cannot enforce a real
 * limit. The counter therefore lives in Postgres (Supabase), which every lambda
 * shares. State survives cold starts because it never lived in the lambda.
 *
 * ALGORITHM: fixed-window counter. Time is floored to the start of each
 * `windowSeconds` window; the key is `<bucket>@<windowStartEpoch>`. Each request
 * atomically increments that window's count via the `aif_ratelimit_hit` RPC
 * (a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so two concurrent
 * lambdas can't both read-then-write the same stale value - Postgres serializes
 * the upsert). If the returned count exceeds `limit`, the request is over.
 *
 * FAIL-OPEN: a DB hiccup must never take down provisioning/ingest, so any
 * limiter error returns { ok: true } (allow). We only ever fail *closed* on a
 * clear, successful over-limit signal from the database.
 *
 * Server-only: uses the SUPABASE service-role key (bypasses RLS). Never import
 * from client components or the edge runtime.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  /** true = allow the request; false = block (over limit). */
  ok: boolean;
  /** Seconds until the current window resets (for a Retry-After header). */
  retryAfter: number;
}

function haveSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Own client instance (module-cached) so this file stays self-contained and
// never imports db.ts internals. Same service-role config as db.ts's getSb().
let rlClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!rlClient) {
    rlClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return rlClient;
}

/**
 * Atomically record one hit against `bucket` and decide if it is within `limit`
 * hits per `windowSeconds`.
 *
 * @param bucket        stable key for the caller+route, e.g. "provision:1.2.3.4"
 * @param limit         max allowed hits within a single window
 * @param windowSeconds window length in seconds (fixed window)
 * @returns { ok, retryAfter } - ok=false only on a confirmed over-limit; any
 *          limiter/DB error returns ok=true (fail-open).
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // No durable store configured (e.g. local SQLite dev) -> don't rate-limit.
  if (!haveSupabase()) return { ok: true, retryAfter: 0 };

  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  // retryAfter = time left until this window rolls over (min 1s so a client
  // that reads the header doesn't hot-loop).
  const retryAfter = Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));

  try {
    const { data, error } = await getClient().rpc("aif_ratelimit_hit", {
      p_bucket: bucket,
      p_window: new Date(windowStartMs).toISOString(),
    });
    // Fail-OPEN on any limiter error: availability of provision/ingest beats
    // strict enforcement during a DB blip.
    if (error) return { ok: true, retryAfter: 0 };
    const count = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(count)) return { ok: true, retryAfter: 0 };
    if (count > limit) return { ok: false, retryAfter };
    return { ok: true, retryAfter: 0 };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

/**
 * Extract the client IP from standard Vercel/proxy headers. x-forwarded-for is
 * a comma-separated list appended hop-by-hop; the FIRST entry is the original
 * client. Falls back to x-real-ip, then a sentinel so a missing header collapses
 * all unknown callers into one shared (still-limited) bucket rather than
 * bypassing the limiter with a unique key.
 */
export function clientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return "unknown";
}
