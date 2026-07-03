/**
 * Data layer with a backend switch:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set  → Supabase Postgres (tables aif_*)
 *   - otherwise                                     → local SQLite via better-sqlite3
 *
 * better-sqlite3 (native module) is lazy-required so the Supabase/Vercel path
 * never loads it. All exports are async so both backends share one interface.
 * The Supabase client uses the SERVICE ROLE key — server-side only, never
 * exposed to the browser (only imported from server components / route handlers).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface UserRow {
  id: number;
  handle: string;
  device_token: string;
  created_at: string;
}

export interface TurnScoreRow {
  id: number;
  user_id: number;
  sid: string;
  ts: string;
  turn: number;
  xp: number;
  dims_json: string;
  tip: string | null;
  highlight: string | null;
}

/** Loose shape of an incoming contract event (v1). */
export interface IngestEvent {
  v?: number;
  ts?: string;
  sid?: string;
  event?: string;
  data?: Record<string, unknown>;
}

function useSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/* ------------------------------------------------------------------ */
/* Supabase backend (tables: aif_users, aif_events, aif_turn_scores)   */
/* ------------------------------------------------------------------ */

let sb: SupabaseClient | null = null;

function getSb(): SupabaseClient {
  if (!sb) {
    sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return sb;
}

function throwOn(error: { message: string } | null, ctx: string): void {
  if (error) throw new Error(`supabase ${ctx}: ${error.message}`);
}

/* ------------------------------------------------------------------ */
/* SQLite backend (local dev; unchanged schema/behavior)               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqliteDb: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSqlite(): any {
  if (sqliteDb) return sqliteDb;
  // Lazy require: must NOT be a top-level import or the Supabase path
  // (Vercel build/runtime) would try to load the native module.
  const require_ = createRequire(import.meta.url);
  const Database = require_("better-sqlite3");
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  sqliteDb = new Database(path.join(dir, "fluency.db"));
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      handle       TEXT NOT NULL UNIQUE,
      device_token TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      sid       TEXT NOT NULL,
      ts        TEXT NOT NULL,
      event     TEXT NOT NULL,
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turn_scores (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      sid       TEXT NOT NULL,
      ts        TEXT NOT NULL,
      turn      INTEGER NOT NULL,
      xp        INTEGER NOT NULL,
      dims_json TEXT NOT NULL,
      tip       TEXT,
      highlight TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_user_ts       ON events(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_turn_scores_user_ts  ON turn_scores(user_id, ts);
  `);
  return sqliteDb;
}

/* ------------------------------------------------------------------ */
/* Shared validation                                                   */
/* ------------------------------------------------------------------ */

interface ValidEvent {
  sid: string;
  ts: string;
  event: string;
  data: Record<string, unknown>;
}

interface ValidScore {
  sid: string;
  ts: string;
  turn: number;
  xp: number;
  dims_json: string;
  tip: string | null;
  highlight: string | null;
}

/** Fail-open per event: malformed entries are skipped, not fatal. */
function validateBatch(events: IngestEvent[]): { events: ValidEvent[]; scores: ValidScore[] } {
  const okEvents: ValidEvent[] = [];
  const okScores: ValidScore[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const { ts, sid, event } = ev;
    if (typeof ts !== "string" || typeof sid !== "string" || typeof event !== "string") continue;
    const data = ev.data && typeof ev.data === "object" ? ev.data : {};
    okEvents.push({ sid, ts, event, data });
    if (event === "turn_score") {
      const d = data as Record<string, unknown>;
      const turn = Number(d.turn ?? 0);
      const xp = Number(d.xp ?? 0);
      const dims = d.dims;
      okScores.push({
        sid,
        ts,
        turn: Number.isFinite(turn) ? turn : 0,
        xp: Number.isFinite(xp) ? xp : 0,
        dims_json: JSON.stringify(dims && typeof dims === "object" ? dims : {}),
        tip: typeof d.tip === "string" ? d.tip : null,
        highlight: typeof d.highlight === "string" ? d.highlight : null,
      });
    }
  }
  return { events: okEvents, scores: okScores };
}

/* ------------------------------------------------------------------ */
/* Public API (async, backend-agnostic)                                */
/* ------------------------------------------------------------------ */

export async function getUserByToken(token: string): Promise<UserRow | undefined> {
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_users")
      .select("*")
      .eq("device_token", token)
      .maybeSingle();
    throwOn(error, "getUserByToken");
    return (data as UserRow | null) ?? undefined;
  }
  return getSqlite()
    .prepare("SELECT * FROM users WHERE device_token = ?")
    .get(token) as UserRow | undefined;
}

export async function getUserByHandle(handle: string): Promise<UserRow | undefined> {
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_users")
      .select("*")
      .eq("handle", handle)
      .maybeSingle();
    throwOn(error, "getUserByHandle");
    return (data as UserRow | null) ?? undefined;
  }
  return getSqlite()
    .prepare("SELECT * FROM users WHERE handle = ?")
    .get(handle) as UserRow | undefined;
}

/** Insert user, or update device_token if the handle already exists. */
export async function upsertUser(handle: string, deviceToken: string): Promise<UserRow> {
  if (useSupabase()) {
    const existing = await getUserByHandle(handle);
    if (existing) {
      const { error } = await getSb()
        .from("aif_users")
        .update({ device_token: deviceToken })
        .eq("id", existing.id);
      throwOn(error, "upsertUser.update");
    } else {
      const { error } = await getSb()
        .from("aif_users")
        .insert({ handle, device_token: deviceToken, created_at: new Date().toISOString() });
      throwOn(error, "upsertUser.insert");
    }
    return (await getUserByHandle(handle))!;
  }
  const d = getSqlite();
  d.prepare(
    `INSERT INTO users (handle, device_token, created_at) VALUES (?, ?, ?)
     ON CONFLICT(handle) DO UPDATE SET device_token = excluded.device_token`
  ).run(handle, deviceToken, new Date().toISOString());
  return (await getUserByHandle(handle))!;
}

/**
 * Store a batch of contract events for a user. Every valid event lands in
 * events; turn_score events additionally land in turn_scores.
 * Fail-open per event: malformed entries are skipped, not fatal.
 * Returns the number of events stored.
 */
export async function ingestEvents(userId: number, events: IngestEvent[]): Promise<number> {
  const { events: okEvents, scores: okScores } = validateBatch(events);

  if (useSupabase()) {
    const s = getSb();
    if (okEvents.length > 0) {
      const { error } = await s.from("aif_events").insert(
        okEvents.map((e) => ({
          user_id: userId,
          sid: e.sid,
          ts: e.ts,
          event: e.event,
          data_json: JSON.stringify(e.data),
        }))
      );
      throwOn(error, "ingestEvents.events");
    }
    if (okScores.length > 0) {
      const { error } = await s
        .from("aif_turn_scores")
        .insert(okScores.map((sc) => ({ user_id: userId, ...sc })));
      throwOn(error, "ingestEvents.scores");
    }
    return okEvents.length;
  }

  const d = getSqlite();
  const insEvent = d.prepare(
    "INSERT INTO events (user_id, sid, ts, event, data_json) VALUES (?, ?, ?, ?, ?)"
  );
  const insScore = d.prepare(
    `INSERT INTO turn_scores (user_id, sid, ts, turn, xp, dims_json, tip, highlight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const txn = d.transaction(() => {
    for (const e of okEvents) insEvent.run(userId, e.sid, e.ts, e.event, JSON.stringify(e.data));
    for (const sc of okScores)
      insScore.run(userId, sc.sid, sc.ts, sc.turn, sc.xp, sc.dims_json, sc.tip, sc.highlight);
  });
  txn();
  return okEvents.length;
}

export async function turnScoresFor(userId: number): Promise<TurnScoreRow[]> {
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_turn_scores")
      .select("*")
      .eq("user_id", userId)
      .order("ts", { ascending: true })
      .order("id", { ascending: true })
      .range(0, 9999);
    throwOn(error, "turnScoresFor");
    return (data ?? []) as TurnScoreRow[];
  }
  return getSqlite()
    .prepare("SELECT * FROM turn_scores WHERE user_id = ? ORDER BY ts ASC, id ASC")
    .all(userId) as TurnScoreRow[];
}

export async function sessionCountFor(userId: number): Promise<number> {
  if (useSupabase()) {
    const s = getSb();
    const [a, b] = await Promise.all([
      s.from("aif_events").select("sid").eq("user_id", userId).range(0, 9999),
      s.from("aif_turn_scores").select("sid").eq("user_id", userId).range(0, 9999),
    ]);
    throwOn(a.error, "sessionCountFor.events");
    throwOn(b.error, "sessionCountFor.scores");
    const sids = new Set<string>();
    for (const r of a.data ?? []) sids.add((r as { sid: string }).sid);
    for (const r of b.data ?? []) sids.add((r as { sid: string }).sid);
    return sids.size;
  }
  const row = getSqlite()
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT sid FROM events WHERE user_id = ?
         UNION
         SELECT sid FROM turn_scores WHERE user_id = ?
       )`
    )
    .get(userId, userId) as { n: number };
  return row.n;
}

/* ---- seed helpers (used by scripts/seed.ts; idempotent reseeding) ---- */

/** Delete all events + turn_scores for a user (NOT the user row). */
export async function resetUserData(userId: number): Promise<void> {
  if (useSupabase()) {
    const s = getSb();
    const a = await s.from("aif_turn_scores").delete().eq("user_id", userId);
    throwOn(a.error, "resetUserData.scores");
    const b = await s.from("aif_events").delete().eq("user_id", userId);
    throwOn(b.error, "resetUserData.events");
    return;
  }
  const d = getSqlite();
  d.prepare("DELETE FROM events WHERE user_id = ?").run(userId);
  d.prepare("DELETE FROM turn_scores WHERE user_id = ?").run(userId);
}

export async function setUserCreatedAt(userId: number, iso: string): Promise<void> {
  if (useSupabase()) {
    const { error } = await getSb().from("aif_users").update({ created_at: iso }).eq("id", userId);
    throwOn(error, "setUserCreatedAt");
    return;
  }
  getSqlite().prepare("UPDATE users SET created_at = ? WHERE id = ?").run(iso, userId);
}
