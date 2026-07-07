/**
 * Admin-only query functions. SERVER SIDE ONLY — uses SERVICE ROLE key via getSb().
 * All queries are Supabase-only (no SQLite fallback needed: admin panel is cloud-only).
 *
 * aif_events schema (derived from db.ts ingestEvents insert):
 *   id, user_id (FK → aif_users.id), sid, ts (ISO timestamp), event, data_json
 *
 * User classification:
 *   REAL    — handle does not match any test/seed pattern
 *   seeded  — handle LIKE 'demo-%'
 *   test    — handle LIKE 'qa-%' OR handle LIKE 'zzz-%' OR handle CONTAINS '-test'
 *              OR handle IN ('maya-p','sam-cs-test','jordan-mba-test')
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TurnScoreRow } from "./db.ts";
import { fluencyRating } from "./stats.ts";

// Reuse a single client (module-level singleton, server runtime only).
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _sb;
}

function throwOn(error: { message: string } | null, ctx: string): void {
  if (error) throw new Error(`admin ${ctx}: ${error.message}`);
}

// Page through PostgREST's 1000-row cap.
const PAGE = 1000;
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    throwOn(error, "pageAll");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type UserTag = "real" | "seeded" | "test";

export interface AdminUserRow {
  id: number;
  handle: string;
  created_at: string;
  email: string | null;
  tag: UserTag;
  fluencyScore: number;
  fluencyBand: string;
  fluencyEstablished: boolean;
  eventCount: number;
  lastActive: string | null; // ISO date string or null
}

export interface SignupDay {
  date: string; // "YYYY-MM-DD"
  count: number;
}

export interface AdminSummary {
  realUsers: number;
  seededUsers: number;
  testUsers: number;
  totalUsers: number;
  totalEvents: number;
  activeUsers7d: number;
}

/* ------------------------------------------------------------------ */
/* Classification                                                       */
/* ------------------------------------------------------------------ */

const JUNK_HANDLES = new Set(["maya-p", "sam-cs-test", "jordan-mba-test"]);

export function classifyHandle(handle: string): UserTag {
  if (JUNK_HANDLES.has(handle)) return "test";
  if (handle.startsWith("demo-")) return "seeded";
  if (
    handle.startsWith("qa-") ||
    handle.startsWith("zzz-") ||
    handle.includes("-test")
  ) {
    return "test";
  }
  return "real";
}

/* ------------------------------------------------------------------ */
/* Queries                                                              */
/* ------------------------------------------------------------------ */

/** Headline counts: user buckets + total events + active-7d distinct users. */
export async function getAdminSummary(): Promise<AdminSummary> {
  const s = sb();

  // All users (id + handle only — cheap).
  const users = await pageAll<{ id: number; handle: string }>(
    (from, to) => s.from("aif_users").select("id, handle").range(from, to)
  );

  let realUsers = 0;
  let seededUsers = 0;
  let testUsers = 0;
  for (const u of users) {
    const tag = classifyHandle(u.handle);
    if (tag === "real") realUsers++;
    else if (tag === "seeded") seededUsers++;
    else testUsers++;
  }

  // Total event count.
  const { count: totalEvents, error: evErr } = await s
    .from("aif_events")
    .select("*", { count: "exact", head: true });
  throwOn(evErr, "getAdminSummary.totalEvents");

  // Active users in last 7 days: distinct user_id with at least one event where ts >= 7d ago.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activeRows = await pageAll<{ user_id: number }>(
    (from, to) =>
      s
        .from("aif_events")
        .select("user_id")
        .gte("ts", cutoff)
        .range(from, to)
  );
  const activeSet = new Set(activeRows.map((r) => r.user_id));

  return {
    realUsers,
    seededUsers,
    testUsers,
    totalUsers: users.length,
    totalEvents: totalEvents ?? 0,
    activeUsers7d: activeSet.size,
  };
}

/** Signups per calendar day (UTC), ascending. */
export async function getSignupsByDay(): Promise<SignupDay[]> {
  const rows = await pageAll<{ created_at: string }>(
    (from, to) =>
      sb()
        .from("aif_users")
        .select("created_at")
        .order("created_at", { ascending: true })
        .range(from, to)
  );

  const map = new Map<string, number>();
  for (const r of rows) {
    const day = (r.created_at ?? "").slice(0, 10);
    if (!day) continue;
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
}

/** Full user roster with fluency rating, event count, last-active. Sorted by fluency score desc. */
export async function getAdminRoster(): Promise<AdminUserRow[]> {
  const s = sb();

  // All users.
  const users = await pageAll<{
    id: number;
    handle: string;
    created_at: string;
    email: string | null;
  }>((from, to) => s.from("aif_users").select("id, handle, created_at, email").range(from, to));

  // All turn scores (for fluency rating).
  const allScores = await pageAll<TurnScoreRow>(
    (from, to) =>
      s
        .from("aif_turn_scores")
        .select("*")
        .order("ts", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
  );

  // All events (for event count + last-active per user).
  const allEvents = await pageAll<{ user_id: number; ts: string }>(
    (from, to) => s.from("aif_events").select("user_id, ts").range(from, to)
  );

  // Build per-user maps.
  const scoresByUser = new Map<number, TurnScoreRow[]>();
  for (const sc of allScores) {
    const arr = scoresByUser.get(sc.user_id) ?? [];
    arr.push(sc);
    scoresByUser.set(sc.user_id, arr);
  }

  const eventCountByUser = new Map<number, number>();
  const lastActiveByUser = new Map<number, string>();
  for (const ev of allEvents) {
    eventCountByUser.set(ev.user_id, (eventCountByUser.get(ev.user_id) ?? 0) + 1);
    const prev = lastActiveByUser.get(ev.user_id);
    if (!prev || ev.ts > prev) lastActiveByUser.set(ev.user_id, ev.ts);
  }

  const roster: AdminUserRow[] = users.map((u) => {
    const scores = scoresByUser.get(u.id) ?? [];
    const rating = fluencyRating(scores);
    return {
      id: u.id,
      handle: u.handle,
      created_at: u.created_at,
      email: u.email,
      tag: classifyHandle(u.handle),
      fluencyScore: rating.score,
      fluencyBand: rating.band,
      fluencyEstablished: rating.established,
      eventCount: eventCountByUser.get(u.id) ?? 0,
      lastActive: lastActiveByUser.get(u.id) ?? null,
    };
  });

  // Sort by fluency score desc, then handle asc as tiebreaker.
  roster.sort((a, b) => b.fluencyScore - a.fluencyScore || a.handle.localeCompare(b.handle));
  return roster;
}
