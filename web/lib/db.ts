import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

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

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "fluency.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
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
  return db;
}

export function getUserByToken(token: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE device_token = ?")
    .get(token) as UserRow | undefined;
}

export function getUserByHandle(handle: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE handle = ?")
    .get(handle) as UserRow | undefined;
}

export function upsertUser(handle: string, deviceToken: string): UserRow {
  const d = getDb();
  d.prepare(
    `INSERT INTO users (handle, device_token, created_at) VALUES (?, ?, ?)
     ON CONFLICT(handle) DO UPDATE SET device_token = excluded.device_token`
  ).run(handle, deviceToken, new Date().toISOString());
  return getUserByHandle(handle)!;
}

/**
 * Store a batch of contract events for a user. Every valid event lands in
 * `events`; `turn_score` events additionally land in `turn_scores`.
 * Fail-open per event: malformed entries are skipped, not fatal.
 * Returns the number of events stored.
 */
export function ingestEvents(userId: number, events: IngestEvent[]): number {
  const d = getDb();
  const insEvent = d.prepare(
    "INSERT INTO events (user_id, sid, ts, event, data_json) VALUES (?, ?, ?, ?, ?)"
  );
  const insScore = d.prepare(
    `INSERT INTO turn_scores (user_id, sid, ts, turn, xp, dims_json, tip, highlight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let stored = 0;
  const txn = d.transaction((batch: IngestEvent[]) => {
    for (const ev of batch) {
      if (!ev || typeof ev !== "object") continue;
      const { ts, sid, event } = ev;
      if (typeof ts !== "string" || typeof sid !== "string" || typeof event !== "string") continue;
      const data = ev.data && typeof ev.data === "object" ? ev.data : {};
      insEvent.run(userId, sid, ts, event, JSON.stringify(data));
      stored++;
      if (event === "turn_score") {
        const turn = Number((data as Record<string, unknown>).turn ?? 0);
        const xp = Number((data as Record<string, unknown>).xp ?? 0);
        const dims = (data as Record<string, unknown>).dims;
        const tip = (data as Record<string, unknown>).tip;
        const highlight = (data as Record<string, unknown>).highlight;
        insScore.run(
          userId,
          sid,
          ts,
          Number.isFinite(turn) ? turn : 0,
          Number.isFinite(xp) ? xp : 0,
          JSON.stringify(dims && typeof dims === "object" ? dims : {}),
          typeof tip === "string" ? tip : null,
          typeof highlight === "string" ? highlight : null
        );
      }
    }
  });
  txn(events);
  return stored;
}

export function turnScoresFor(userId: number): TurnScoreRow[] {
  return getDb()
    .prepare("SELECT * FROM turn_scores WHERE user_id = ? ORDER BY ts ASC, id ASC")
    .all(userId) as TurnScoreRow[];
}

export function sessionCountFor(userId: number): number {
  const row = getDb()
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
