---
description: Set up or check the Clawdacademy coaching harness (mode B - real-time AI-fluency coaching inside Claude Code)
---

The user wants to configure the **Clawdacademy** coaching harness so they get
real-time AI-fluency coaching directly inside Claude Code - no separate app
(this is delivery "mode B"). The harness scores their real sessions on-device and
shows a Fluency Rating in the statusline.

Do this, reporting each step plainly:

1. **Find the harness, then check current state** (read-only). `harness/setup.js`
   lives at the repo root, next to `plugin/`. `$CLAUDE_PLUGIN_ROOT` is a cached copy of
   `plugin/` alone, so no path relative to it reaches the harness. Use the first of
   these that exists:
   - `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/marketplaces/ai-fluency/harness/setup.js`
     (installed with `/plugin marketplace add jddavenportOpen/ai-fluency-trainer`)
   - `$HOME/.clawdacademy/src/harness/setup.js` (installed with the clawdacademy.app one-liner)

   Then run `node "<that path>" status`. If neither exists, tell the user to run
   `bash -c "$(curl -fsSL https://clawdacademy.app/install.sh)"` and stop.

2. **Run setup**:
   `node "<that path>" setup --auto`
   This ensures Claude Code is installed, installs the capture plugin, wires the
   cross-platform statusline, and writes config. **Before any install command runs,
   SHOW the exact command** (the script prints it) and let the user say "I'll do it
   myself" instead. Never run a repackaged binary - only the official installer.

3. **Confirm**: the statusline should now lead with the Fluency Rating; after one
   real task the score updates. Point the user to their full profile at
   `clawdacademy.app`.

Keep the privacy posture explicit throughout: **local-first, aggregate-only opt-in
sync, raw prompts never leave the machine.** If the user only wanted a status
check, stop after step 1.
