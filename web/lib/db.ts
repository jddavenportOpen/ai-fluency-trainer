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
  email: string | null;
  password_hash: string | null;
}

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
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
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      handle        TEXT NOT NULL UNIQUE,
      device_token  TEXT NOT NULL UNIQUE,
      created_at    TEXT NOT NULL,
      email         TEXT UNIQUE,
      password_hash TEXT
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
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_user_ts       ON events(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_turn_scores_user_ts  ON turn_scores(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
  `);
  // Migrate pre-existing dev DBs whose users table predates the auth columns.
  const cols = sqliteDb.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("email")) sqliteDb.exec("ALTER TABLE users ADD COLUMN email TEXT");
  if (!names.has("password_hash")) sqliteDb.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
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

export async function getUserById(id: number): Promise<UserRow | undefined> {
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwOn(error, "getUserById");
    return (data as UserRow | null) ?? undefined;
  }
  return getSqlite().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const e = email.trim().toLowerCase();
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_users")
      .select("*")
      .eq("email", e)
      .maybeSingle();
    throwOn(error, "getUserByEmail");
    return (data as UserRow | null) ?? undefined;
  }
  return getSqlite().prepare("SELECT * FROM users WHERE email = ?").get(e) as UserRow | undefined;
}

/**
 * Create a fully-formed signup user. Assumes handle/email uniqueness has been
 * pre-checked, but the DB unique constraints are the real guard: on a race the
 * insert throws and the caller maps it to 409.
 */
export async function createUser(params: {
  handle: string;
  email: string;
  passwordHash: string;
  deviceToken: string;
}): Promise<UserRow> {
  const email = params.email.trim().toLowerCase();
  const created_at = new Date().toISOString();
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_users")
      .insert({
        handle: params.handle,
        email,
        password_hash: params.passwordHash,
        device_token: params.deviceToken,
        created_at,
      })
      .select("*")
      .single();
    if (error) throw new Error(`supabase createUser: ${error.message}`);
    return data as UserRow;
  }
  const d = getSqlite();
  const info = d
    .prepare(
      "INSERT INTO users (handle, email, password_hash, device_token, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(params.handle, email, params.passwordHash, params.deviceToken, created_at);
  return (await getUserById(Number(info.lastInsertRowid)))!;
}

/** Backfill email/password on an existing row (used to give legacy jd a login). */
export async function setUserAuth(
  userId: number,
  email: string,
  passwordHash: string
): Promise<void> {
  const e = email.trim().toLowerCase();
  if (useSupabase()) {
    const { error } = await getSb()
      .from("aif_users")
      .update({ email: e, password_hash: passwordHash })
      .eq("id", userId);
    throwOn(error, "setUserAuth");
    return;
  }
  getSqlite()
    .prepare("UPDATE users SET email = ?, password_hash = ? WHERE id = ?")
    .run(e, passwordHash, userId);
}

/* ---- sessions ---- */

export async function createSession(params: {
  userId: number;
  tokenHash: string;
  expiresAt: string;
  userAgent: string | null;
}): Promise<void> {
  if (useSupabase()) {
    const { error } = await getSb().from("aif_sessions").insert({
      user_id: params.userId,
      token_hash: params.tokenHash,
      expires_at: params.expiresAt,
      user_agent: params.userAgent,
    });
    throwOn(error, "createSession");
    return;
  }
  getSqlite()
    .prepare(
      "INSERT INTO sessions (user_id, token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      params.userId,
      params.tokenHash,
      new Date().toISOString(),
      params.expiresAt,
      params.userAgent
    );
}

/**
 * Resolve a session token-hash to its owning user, enforcing expiry
 * server-side. Expired sessions are deleted lazily and return null.
 */
export async function getUserBySessionToken(tokenHash: string): Promise<UserRow | undefined> {
  if (useSupabase()) {
    const { data, error } = await getSb()
      .from("aif_sessions")
      .select("user_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    throwOn(error, "getUserBySessionToken");
    const row = data as { user_id: number; expires_at: string } | null;
    if (!row) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await deleteSession(tokenHash);
      return undefined;
    }
    return getUserById(row.user_id);
  }
  const d = getSqlite();
  const row = d
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { user_id: number; expires_at: string } | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(tokenHash);
    return undefined;
  }
  return getUserById(row.user_id);
}

export async function deleteSession(tokenHash: string): Promise<void> {
  if (useSupabase()) {
    const { error } = await getSb().from("aif_sessions").delete().eq("token_hash", tokenHash);
    throwOn(error, "deleteSession");
    return;
  }
  getSqlite().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
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
