# web/ — AI Fluency dashboard + share page

Next.js 15 (App Router) + better-sqlite3. Free-tier analytics dashboard and the
recruiter-facing public profile. Dark theme, zero chart libraries (hand-rolled SVG).

## Run

```bash
cd web
npm install
npm run seed          # creates data/fluency.db, demo user "jd" (token: dev-token-jd),
                      # 4 synthesized sessions + 18 turn_score events, plus the
                      # fixtures/out/*.events.jsonl logs if present
npm run dev           # http://localhost:3000
# or production:
npm run build
npm run start -- -p 4173
```

Requires Node >= 23.6 (the seed script runs TypeScript via Node's native type stripping).

## Pages

- `/` — landing
- `/dashboard` — level + XP header, dimension radar, "where to improve" (3 weakest dims with
  their recent coaching tips), XP-per-session bars, recent coaching feed. MVP: renders user `jd`,
  no read auth.
- `/u/[handle]` — public share page: level badge + title, radar, verified stats, top skill badges.

## API

`POST /api/ingest` — batched contract-v1 events.

```bash
curl -s -X POST http://localhost:4173/api/ingest \
  -H "Authorization: Bearer $CLAWDACADEMY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"events":[{"v":1,"ts":"2026-07-03T12:00:00Z","sid":"s-live","event":"turn_score",
       "data":{"turn":1,"dims":{"verification":80,"context_setting":65},"xp":30,
       "tip":"Run the tests before accepting.","highlight":"Scoped the ask well."}}]}'
# → {"ok":true,"stored":1}
```

- Auth: `Authorization: Bearer <device_token>` (401 otherwise).
- All events land in `events`; `turn_score` events additionally land in `turn_scores`
  (drives every chart). Malformed entries in a batch are skipped, not fatal.
- Dimension keys are **data-driven** — the UI renders whatever snake_case keys appear.

## Gamification contract

- `totalXP` = Σ `xp` over `turn_score` events.
- Level = largest N with `totalXP >= 100·N²`.
- Titles: 0 Novice · 1 Apprentice · 2 Operator · 3 Collaborator · 4 Director · 5 Architect ·
  6 Conductor · 7+ Virtuoso.

## Storage

SQLite at `web/data/fluency.db` (gitignored, WAL mode). Tables: `users`, `events`,
`turn_scores`. Schema auto-creates on first open (`lib/db.ts`). Reseeding is idempotent
(wipes and rewrites the demo user's rows).
