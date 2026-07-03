#!/usr/bin/env python3
"""Generate synthetic Claude Code transcripts + event logs for scorer tests.

Two contrasting sessions in real transcript JSONL shape:
  bad-user   — vague prompts, blind accepts, no verification, rage-retries
  good-user  — context-rich prompts, plans first, verifies, asks why, iterates

A scorer must rank good-user clearly above bad-user on every dimension.
Usage: python3 make_fixtures.py [outdir]   (default: ./out)
"""
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

BASE = datetime(2026, 7, 1, 9, 0, 0, tzinfo=timezone.utc)


class Session:
    def __init__(self, sid):
        self.sid = sid
        self.records = []
        self.events = []
        self.t = BASE
        self.last_uuid = None
        self.turn = 0

    def tick(self, seconds=20):
        self.t += timedelta(seconds=seconds)
        return self.t.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    def _rec(self, rectype, **kw):
        u = str(uuid.uuid5(uuid.NAMESPACE_OID, f"{self.sid}-{len(self.records)}"))
        rec = {
            "type": rectype, "uuid": u, "parentUuid": self.last_uuid,
            "sessionId": self.sid, "timestamp": self.tick(),
            "cwd": "/tmp/demo-project", "gitBranch": "main", "isSidechain": False,
            "userType": "external", "version": "2.1.179", "entrypoint": "cli",
            **kw,
        }
        self.records.append(rec)
        self.last_uuid = u
        return rec

    def _event(self, event, data):
        self.events.append({"v": 1, "ts": self.t.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                            "sid": self.sid, "event": event, "data": data})

    def user_prompt(self, text):
        self.turn += 1
        self._rec("user", message={"role": "user", "content": text},
                  promptId=f"p{self.turn}", permissionMode="default")
        self._event("prompt", {"text": text, "chars": len(text), "words": len(text.split())})

    def assistant_text(self, text):
        self._rec("assistant", message={
            "role": "assistant", "type": "message", "model": "claude-fable-5",
            "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": 2000, "output_tokens": len(text) // 3},
        })

    def tool(self, name, tool_input, result="ok", ok=True):
        self._rec("assistant", message={
            "role": "assistant", "type": "message", "model": "claude-fable-5",
            "content": [{"type": "tool_use", "id": f"tu_{len(self.records)}",
                         "name": name, "input": tool_input}],
            "usage": {"input_tokens": 2000, "output_tokens": 80},
        })
        self._rec("user", message={"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": f"tu_{len(self.records) - 1}",
             "content": result, "is_error": not ok}]})
        self._event("tool_use", {"tool": name, "ok": ok,
                                 "input_keys": sorted(tool_input.keys())})

    def turn_end(self, transcript_path):
        self._event("turn_end", {"transcript_path": transcript_path})


def build_bad(path):
    s = Session("fixture-bad-user")
    s._event("session_start", {"source": "startup", "cwd_hash": "1", "transcript_path": path})

    s.user_prompt("make a login page")
    s.assistant_text("I'll create a login page for you.")
    s.tool("Write", {"file_path": "/tmp/demo-project/login.html", "content": "<html>..."})
    s.assistant_text("Created login.html with a basic login form.")
    s.turn_end(path)

    s.user_prompt("it doesnt work")
    s.assistant_text("Let me check the file.")
    s.tool("Read", {"file_path": "/tmp/demo-project/login.html"})
    s.assistant_text("I see a possible issue — I've rewritten the form handler.")
    s.tool("Write", {"file_path": "/tmp/demo-project/login.html", "content": "<html>v2..."})
    s.turn_end(path)

    s.user_prompt("still broken try again")
    s.tool("Write", {"file_path": "/tmp/demo-project/login.html", "content": "<html>v3..."})
    s.assistant_text("I've rewritten it again with a different approach.")
    s.turn_end(path)

    s.user_prompt("just write the whole thing for me, also do the signup page and the db and deploy it")
    s.assistant_text("That's several pieces — I'll do them all.")
    for f in ["signup.html", "db.py", "deploy.sh"]:
        s.tool("Write", {"file_path": f"/tmp/demo-project/{f}", "content": "..."})
    s.turn_end(path)

    s.user_prompt("ok")
    s.assistant_text("Anything else?")
    s.turn_end(path)
    s._event("session_end", {"reason": "exit"})
    return s


def build_good(path):
    s = Session("fixture-good-user")
    s._event("session_start", {"source": "startup", "cwd_hash": "2", "transcript_path": path})

    s.user_prompt(
        "I need a login page for the demo Flask app in this repo. Constraints: it must use the "
        "existing auth blueprint in app/auth.py, session cookies (no JWT), and match the form "
        "styling in templates/base.html. Before writing code, read those two files and give me "
        "a short plan — I want to review the approach first.")
    s.tool("Read", {"file_path": "/tmp/demo-project/app/auth.py"})
    s.tool("Read", {"file_path": "/tmp/demo-project/templates/base.html"})
    s.assistant_text("Plan: 1) add /login route to the auth blueprint 2) template extending "
                     "base.html 3) session cookie on success 4) pytest for both paths.")
    s.turn_end(path)

    s.user_prompt("Plan looks right, but use the existing rate-limiter from app/limits.py on the "
                  "login route — we got hammered last month. Then implement it with the tests.")
    s.tool("Read", {"file_path": "/tmp/demo-project/app/limits.py"})
    s.tool("Edit", {"file_path": "/tmp/demo-project/app/auth.py", "old_string": "x", "new_string": "y"})
    s.tool("Write", {"file_path": "/tmp/demo-project/templates/login.html", "content": "..."})
    s.tool("Write", {"file_path": "/tmp/demo-project/tests/test_login.py", "content": "..."})
    s.tool("Bash", {"command": "pytest tests/test_login.py -v"},
           result="2 passed", ok=True)
    s.assistant_text("Implemented with rate limiting; both tests pass.")
    s.turn_end(path)

    s.user_prompt("Tests pass but I want to understand the rate-limiter integration — why did you "
                  "wrap the route instead of using a before_request hook? Walk me through the tradeoff.")
    s.assistant_text("Wrapping the route scopes the limit to login attempts only; before_request "
                     "would tax every route and needs path filtering...")
    s.turn_end(path)

    s.user_prompt("Makes sense. I ran the app myself and the redirect loops when 'next' param is "
                  "external — that's an open-redirect risk. Fix it and add a test case for it.")
    s.tool("Edit", {"file_path": "/tmp/demo-project/app/auth.py", "old_string": "a", "new_string": "b"})
    s.tool("Edit", {"file_path": "/tmp/demo-project/tests/test_login.py", "old_string": "c", "new_string": "d"})
    s.tool("Bash", {"command": "pytest tests/test_login.py -v"}, result="3 passed", ok=True)
    s.assistant_text("Fixed: 'next' is now validated against the host; regression test added, 3 pass.")
    s.turn_end(path)

    s._event("session_end", {"reason": "exit"})
    return s


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(outdir, exist_ok=True)
    for name, builder in [("bad-user", build_bad), ("good-user", build_good)]:
        tpath = os.path.join(outdir, f"{name}.transcript.jsonl")
        s = builder(tpath)
        with open(tpath, "w") as f:
            f.writelines(json.dumps(r) + "\n" for r in s.records)
        with open(os.path.join(outdir, f"{name}.events.jsonl"), "w") as f:
            f.writelines(json.dumps(e) + "\n" for e in s.events)
        print(f"{name}: {len(s.records)} transcript records, {len(s.events)} events -> {tpath}")


if __name__ == "__main__":
    main()
