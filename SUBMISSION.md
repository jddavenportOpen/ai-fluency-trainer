# Community Marketplace Submission

Paste these answers into the community marketplace PR / submission form.
Target repo: https://github.com/anthropics/claude-plugins-community

## Step-by-step submission process

1. Go to https://github.com/anthropics/claude-plugins-community
2. Fork the repo (top-right "Fork" button)
3. In your fork, add an entry for this plugin to the community marketplace catalog
   (follow the repo's CONTRIBUTING.md — typically a PR adding a JSON entry or a
   markdown file under a `plugins/` directory)
4. Open a Pull Request from your fork to `anthropics/claude-plugins-community:main`
5. Use the fields below as the PR body / form answers

---

## Submission fields

**Plugin name (kebab-case)**
```
ai-fluency
```

**Display name**
```
AI Fluency Trainer
```

**One-liner**
```
Measures and trains 7 AI-fluency behaviors from your real Claude Code sessions — local-first, open source.
```

**Description (2-4 sentences)**
```
AI Fluency Trainer scores how well you actually work with AI by observing your real Claude Code
sessions across 7 research-grounded behaviors: context-setting, plan-first, verification,
diagnose-vs-retry, understanding-seeking, scope discipline, and iteration discipline. All scoring
runs on-device; raw prompts never leave your machine. Aggregate turn scores sync to a free hosted
dashboard (opt-in, token-gated) so you can track your Fluency Rating over time and share a
public profile with recruiters.
```

**Repository URL**
```
https://github.com/JDDavenport/ai-fluency-trainer
```

**Homepage / docs URL**
```
https://clawdacademy.app
```

**Category**
```
productivity
```

**Tags**
```
ai-fluency, learning, analytics, habits, coaching, metrics, telemetry
```

**License**
```
MIT
```

**Version**
```
0.1.0
```

**Author**
```
JD Davenport (jddavenport46@gmail.com)
```

---

## Data-use disclosure (required for telemetry plugins)

This plugin collects data. Full disclosure:

**What is captured locally:**
The plugin hooks into Claude Code lifecycle events (SessionStart, UserPromptSubmit, PostToolUse,
Stop, SessionEnd, etc.) and appends structured events to `~/.ai-fluency/events.jsonl` on the
user's machine. Locally captured data includes raw prompt text (word/char count + full text),
tool names and success/failure, and numeric turn scores produced by the on-device scorer.

**What leaves the machine:**
Nothing leaves the machine unless the user sets a `"token"` field in
`~/.ai-fluency/config.json` (opt-in). With a token configured, the sync script
(`plugin/scripts/sync.py`) sends ONLY:
- Numeric turn scores (7 dimension scores, XP, session ID, timestamp)
- Session lifecycle events (start/end, session kind, timestamp)

**What is NEVER synced, under any config:**
- Raw prompt text (the `text` field is in `STRIP_KEYS` and stripped before payload construction)
- Transcript paths
- Headless / non-interactive sessions (fleet agents, `claude -p` runs)
- Coaching tips (may interpolate prompt fragments; local-only unless `sync_tips: true`)

**How users can verify and disable:**
- Run `python3 plugin/scripts/sync.py --dry-run` to see the exact payload before anything is sent
- Set `"no_upload": true` in `~/.ai-fluency/config.json` or omit the `"token"` field entirely
- The full pipeline is MIT-licensed and auditable at the repo URL above

---

## Install command (for users, after marketplace is live)

```
/plugin marketplace add JDDavenport/ai-fluency-trainer
/plugin install ai-fluency@ai-fluency
```
