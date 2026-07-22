#!/usr/bin/env python3
"""Instant-rating backfill — score the user's EXISTING Claude Code history once,
at install/first-run, so their Fluency Rating is established in seconds instead
of after ~15 live turns (days of use).

What it does, ONCE (sentinel ~/.ai-fluency/state/backfill.done):
  1. Scan ~/.claude/projects recursively for INTERACTIVE human sessions, most
     recent first.
  2. EXCLUDE: agent/fleet sessions (first user turn passes _is_agent_bootstrap),
     tiny/test-fixture transcripts (path contains 'pytest' or 'test-', or <3
     turns), and non-interactive entrypoints (sdk-*, claude -p one-shots).
  3. Score a recent window comfortably past the 15-turn provisional gate
     (TARGET_TURNS interactive turns), CAPPING the work so a power user with tens
     of thousands of transcripts does not score everything.
  4. Append the resulting turn_score events to events.jsonl (same shape as
     score_turn.py), unless --dry-run.
  5. Trigger sync.py so the seeded turns upload and the profile is established.

Fail-OPEN: any exception logs and exits 0 — this NEVER blocks or errors an
install. Privacy: scoring is local; only aggregate numeric scores sync (raw
prompts/transcripts never leave the machine — enforced by sync.py, unchanged).

Usage: backfill.py [--dry-run] [--force] [--no-sync]
Stdlib only.
"""
import argparse
import json
import os
import subprocess
import sys
import traceback
from datetime import datetime, timezone

# Import the scorer engine + the persistence helpers from score_turn.py. Resolve
# the scorer dir the same way the capture hook does (bundled copy next to the
# plugin, repo checkout, or well-known path) so this works on a marketplace
# install with no repo checkout.
FLUENCY_DIR = os.path.expanduser(os.environ.get("AI_FLUENCY_DIR", "~/.ai-fluency"))

# How many interactive turns to seed. The web gate (web/lib/stats.ts
# RATING_MIN_TURNS) is 15; we target well past it so the very first synced
# profile reads "established", not "provisional".
GATE_TURNS = 15
TARGET_TURNS = 40
# Hard ceiling on transcript files opened, so a power user with tens of
# thousands of sessions never scores their whole history.
MAX_FILES_SCANNED = 400


def _find_scorer_dir():
    """Directory containing engine.py / score_turn.py. Mirrors capture._find_scorer."""
    here = os.path.dirname(os.path.abspath(__file__))
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or os.path.dirname(here)
    cands = [os.environ.get("AI_FLUENCY_SCORER", "")]
    try:
        with open(os.path.join(FLUENCY_DIR, "config.json")) as f:
            cands.append(json.load(f).get("scorer", ""))
    except Exception:
        pass
    # config "scorer" points at score_turn.py — take its dir
    dirs = []
    for c in cands:
        if c:
            dirs.append(c if os.path.isdir(c) else os.path.dirname(c))
    dirs += [
        os.path.join(plugin_root, "scorer"),                       # bundled
        os.path.normpath(os.path.join(here, "..", "scorer")),      # plugin/scorer
        os.path.normpath(os.path.join(here, "..", "..", "scorer")),  # repo /scorer
        os.path.expanduser("~/code/ai-fluency-trainer/scorer"),
    ]
    for d in dirs:
        if d and os.path.exists(os.path.join(d, "engine.py")) \
                and os.path.exists(os.path.join(d, "score_turn.py")):
            return d
    return None


_SCORER_DIR = _find_scorer_dir()
if _SCORER_DIR:
    sys.path.insert(0, _SCORER_DIR)
import engine        # noqa: E402
import score_turn    # noqa: E402  (reuse append_events + fluency_dir + log)


def _find_sync():
    here = os.path.dirname(os.path.abspath(__file__))
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or os.path.dirname(here)
    for c in (os.environ.get("AI_FLUENCY_SYNC", ""),
              os.path.join(plugin_root, "scripts", "sync.py"),
              os.path.normpath(os.path.join(here, "sync.py")),
              os.path.expanduser("~/code/ai-fluency-trainer/plugin/scripts/sync.py")):
        if c and os.path.exists(c):
            return c
    return None


def _sentinel():
    return os.path.join(FLUENCY_DIR, "state", "backfill.done")


def _config():
    try:
        with open(os.path.join(FLUENCY_DIR, "config.json")) as f:
            return json.load(f)
    except Exception:
        return {}


def _projects_root():
    return os.path.expanduser(os.environ.get("CLAUDE_PROJECTS_DIR", "~/.claude/projects"))


def _is_excluded_path(path):
    low = path.lower()
    return "pytest" in low or "test-" in low or "/fixtures/" in low


def _entrypoint_interactive(records):
    """Peek the transcript's entrypoint field: 'cli' = interactive human session;
    sdk-* / other = headless. Returns True only when we can confirm interactive.
    Unknown (no entrypoint field found) -> None so the bootstrap check decides."""
    for rec in records[:100]:
        ep = rec.get("entrypoint")
        if ep:
            return ep == "cli"
    return None


def discover_transcripts():
    """All transcript files under ~/.claude/projects, most-recently-modified
    first. Excludes obvious test/fixture paths up front."""
    root = _projects_root()
    found = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            full = os.path.join(dirpath, name)
            if _is_excluded_path(full):
                continue
            try:
                found.append((os.path.getmtime(full), full))
            except OSError:
                continue
    found.sort(reverse=True)   # most recent first
    return [p for _mt, p in found]


def select_and_score(dry_run=False):
    """Walk transcripts most-recent-first, keep INTERACTIVE human sessions, score
    them, and stop once TARGET_TURNS interactive turns are collected (or the file
    cap is hit). Returns (all_results, stats)."""
    all_results = []
    scanned = 0
    kept_sessions = 0
    skipped_agent = 0
    skipped_tiny = 0
    skipped_headless = 0

    for path in discover_transcripts():
        if len(all_results) >= TARGET_TURNS or scanned >= MAX_FILES_SCANNED:
            break
        scanned += 1
        try:
            turns = engine.parse_transcript(path)
        except Exception:
            continue
        if len(turns) < 3:                     # tiny / test-fixture-ish
            skipped_tiny += 1
            continue
        # entrypoint says headless (SDK / claude -p) -> never score
        try:
            with open(path, "r", errors="replace") as f:
                head = []
                for i, line in enumerate(f):
                    if i > 100:
                        break
                    try:
                        head.append(json.loads(line))
                    except Exception:
                        continue
            interactive = _entrypoint_interactive(head)
        except Exception:
            interactive = None
        if interactive is False:
            skipped_headless += 1
            continue
        # agent/fleet bootstrap: parse_transcript already tags turns[0].bootstrap
        # when the first human turn is a machine-injected agent prompt.
        if turns and turns[0].get("bootstrap"):
            skipped_agent += 1
            continue

        try:
            results = engine.score_session(turns)   # no judge: fast + offline
        except Exception:
            continue
        if not results:
            continue
        sid = turns[0].get("sid") or ("backfill-" + os.path.basename(path)[:16])
        for r in results:
            r["_sid"] = sid
        all_results.extend(results)
        kept_sessions += 1

    # trim to the target so we don't over-seed by a partial last session
    seeded = all_results[:max(TARGET_TURNS, GATE_TURNS + 5)] if all_results else []
    if not dry_run and seeded:
        # group by session and persist via score_turn.append_events (same shape
        # the Stop hook writes). Idempotent across re-runs is guaranteed by the
        # sentinel, not per-turn dedup, so --force will duplicate by design.
        by_sid = {}
        for r in seeded:
            by_sid.setdefault(r["_sid"], []).append(r)
        for sid, rows in by_sid.items():
            score_turn.append_events(sid, rows)

    stats = {
        "files_scanned": scanned,
        "sessions_kept": kept_sessions,
        "skipped_agent_fleet": skipped_agent,
        "skipped_tiny_or_test": skipped_tiny,
        "skipped_headless": skipped_headless,
        "turns_available": len(all_results),
        "turns_seeded": len(seeded),
        "clears_provisional_gate": len(seeded) >= GATE_TURNS,
    }
    return seeded, stats


def main(argv=None):
    ap = argparse.ArgumentParser(description="AI Fluency instant-rating backfill")
    ap.add_argument("--dry-run", action="store_true",
                    help="compute + report what WOULD be seeded; write nothing")
    ap.add_argument("--force", action="store_true",
                    help="run even if the sentinel exists (will duplicate turns)")
    ap.add_argument("--no-sync", action="store_true", help="skip the upload step")
    args = ap.parse_args(argv)

    sentinel = _sentinel()
    if os.path.exists(sentinel) and not args.force and not args.dry_run:
        return 0   # already ran once; silent no-op

    seeded, stats = select_and_score(dry_run=args.dry_run)

    cfg = _config()
    url = (cfg.get("url") or "").rstrip("/")
    handle = cfg.get("handle") or "<handle>"
    profile = f"{url}/u/{handle}" if url else f"/u/{handle}"

    if args.dry_run:
        print("backfill (dry-run): would seed "
              f"{stats['turns_seeded']} turn(s) from {stats['sessions_kept']} "
              f"interactive session(s) "
              f"[scanned {stats['files_scanned']} file(s); excluded "
              f"{stats['skipped_agent_fleet']} agent/fleet, "
              f"{stats['skipped_tiny_or_test']} tiny/test, "
              f"{stats['skipped_headless']} headless].")
        print("SUMMARY " + json.dumps(stats))
        gate = "CLEARS" if stats["clears_provisional_gate"] else "does NOT clear"
        print(f"This {gate} the {GATE_TURNS}-turn provisional gate. "
              f"Rating would be ready at: {profile}")
        return 0

    # persist the run-once sentinel BEFORE syncing, so a sync hiccup never
    # re-seeds on the next SessionStart.
    try:
        os.makedirs(os.path.dirname(sentinel), exist_ok=True)
        with open(sentinel, "w") as f:
            json.dump({"ran": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                       **stats}, f)
    except Exception:
        pass
    score_turn.log(f"backfill: seeded {stats['turns_seeded']} turns "
                   f"from {stats['sessions_kept']} sessions ({stats})")

    if seeded and not args.no_sync and cfg.get("token") \
            and not (cfg.get("no_upload") or cfg.get("sync_disabled")):
        sync = _find_sync()
        if sync:
            try:
                subprocess.Popen([sys.executable, sync],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 start_new_session=True)
            except Exception:
                pass

    if seeded:
        print(f"Seeded {stats['turns_seeded']} turns from your history. "
              f"Your rating is ready: {profile}")
    else:
        print("No prior interactive history to seed — your rating will build as you work.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        try:
            score_turn.log("BACKFILL FATAL " + traceback.format_exc().replace("\n", " | "))
        except Exception:
            pass
        sys.exit(0)   # fail-open: never break the install
