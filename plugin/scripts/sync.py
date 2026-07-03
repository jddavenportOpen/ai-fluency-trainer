#!/usr/bin/env python3
"""Sync derived fluency scores to the web dashboard — AGGREGATE-ONLY by design.

Reads ~/.ai-fluency/events.jsonl and uploads ONLY derived/aggregate event types
(turn_score, session_start, session_end, turn_end). Raw `prompt` events never
leave the machine — their text field is the user's own words and stays local.
Even for synced session events, transcript paths are stripped.

Only INTERACTIVE human sessions are synced by default (sid kind derived from
session_start/session_kind events; legacy events backfilled from the transcript
entrypoint field). Headless/unknown sids (claude -p, SDK, fleet/workflow
agents) are excluded unless config sync_all_sessions=true.

Config: ~/.ai-fluency/config.json
  {"url": "http://localhost:3000", "token": "dev-token-jd", "handle": "jd"}
State:  ~/.ai-fluency/sync_state.json  (count of events already examined)

Usage: sync.py [--dry-run] [--full]   (--full re-examines from the start)
"""
import json
import os
import sys
import urllib.request
import urllib.error

FLUENCY_DIR = os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))
EVENTS = os.path.join(FLUENCY_DIR, "events.jsonl")
CONFIG = os.path.join(FLUENCY_DIR, "config.json")
STATE = os.path.join(FLUENCY_DIR, "sync_state.json")

SYNCABLE = {"turn_score", "session_start", "session_end", "turn_end"}
STRIP_KEYS = {"transcript_path", "text"}  # never ship these, ever
# tip/highlight interpolate raw prompt fragments, file names, and bash command
# text. They are for the LOCAL coach surfaces; they leave the machine ONLY with
# explicit consent (config.json "sync_tips": true). Default: stripped.
CONSENT_KEYS = {"tip", "highlight"}


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def sanitize(ev, sync_tips=False):
    drop = STRIP_KEYS if sync_tips else (STRIP_KEYS | CONSENT_KEYS)
    data = {k: v for k, v in (ev.get("data") or {}).items() if k not in drop}
    return {"v": ev.get("v", 1), "ts": ev.get("ts"), "sid": ev.get("sid"),
            "event": ev.get("event"), "data": data}


def _peek_transcript_kind(transcript):
    """Legacy backfill: classify a session by its transcript's entrypoint field
    ("cli" = interactive human session; sdk-* = headless agent/one-shot)."""
    try:
        with open(os.path.expanduser(transcript)) as f:
            for i, line in enumerate(f):
                if i > 100:
                    break
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ep = rec.get("entrypoint")
                if ep:
                    return "interactive" if ep == "cli" else "headless"
    except Exception:
        pass
    return "unknown"


def build_kind_map(events_path):
    """sid -> "interactive"|"headless"|"unknown", derived from session_start /
    session_kind events across the WHOLE file (classification must not depend on
    the sync offset). session_start events without a kind tag (written before
    kind-tagging shipped) are backfilled by peeking their transcript."""
    kinds = {}
    try:
        with open(events_path) as f:
            for line in f:
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if ev.get("event") not in ("session_start", "session_kind"):
                    continue
                sid = ev.get("sid")
                data = ev.get("data") or {}
                kind = data.get("kind")
                if not kind and ev.get("event") == "session_start":
                    kind = _peek_transcript_kind(data.get("transcript_path", ""))
                if kind in ("interactive", "headless"):
                    kinds[sid] = kind        # later resolutions win
                else:
                    kinds.setdefault(sid, "unknown")
    except FileNotFoundError:
        pass
    return kinds


def main():
    dry = "--dry-run" in sys.argv
    full = "--full" in sys.argv

    cfg = load_json(CONFIG, None)
    if not cfg or not cfg.get("token"):
        print(f"sync: no config at {CONFIG} — create it with url/token/handle", file=sys.stderr)
        return 1

    # Only interactive human sessions sync by default — headless/unknown sids
    # (claude -p, SDK runs, fleet/workflow agents) never inflate the dashboard.
    sync_all = bool(cfg.get("sync_all_sessions"))
    kinds = {} if sync_all else build_kind_map(EVENTS)

    seen = 0 if full else load_json(STATE, {}).get("examined", 0)
    batch, examined, skipped = [], 0, 0
    try:
        with open(EVENTS) as f:
            for i, line in enumerate(f):
                examined = i + 1
                if i < seen:
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if ev.get("event") not in SYNCABLE:
                    continue
                if not sync_all and kinds.get(ev.get("sid")) != "interactive":
                    skipped += 1
                    continue
                batch.append(sanitize(ev, sync_tips=bool(cfg.get("sync_tips"))))
    except FileNotFoundError:
        print("sync: no events file yet — nothing to do")
        return 0

    if not batch:
        print(f"sync: up to date ({examined} events examined, 0 new syncable, "
              f"{skipped} non-interactive skipped)")
        return 0

    if dry:
        sids = sorted({e['sid'] for e in batch})
        print(f"sync (dry-run): would upload {len(batch)} events from "
              f"{len(sids)} interactive session(s) to {cfg['url']}/api/ingest "
              f"({skipped} events from non-interactive/unknown sids skipped)")
        print("sids:", json.dumps(sids))
        print(json.dumps(batch[:3], indent=1))
        return 0

    req = urllib.request.Request(
        cfg["url"].rstrip("/") + "/api/ingest",
        data=json.dumps({"events": batch}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {cfg['token']}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"sync: server rejected ({e.code}): {e.read()[:200]}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"sync: upload failed: {e}", file=sys.stderr)
        return 1

    with open(STATE, "w") as f:
        json.dump({"examined": examined}, f)
    print(f"sync: uploaded {len(batch)} events (server stored {body.get('stored')}, "
          f"{skipped} non-interactive skipped) — {cfg['url']}/dashboard")
    return 0


if __name__ == "__main__":
    sys.exit(main())
