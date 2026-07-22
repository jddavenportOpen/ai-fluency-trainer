"use strict";
/*
 * Clawdacademy harness setup (PRD-07 M4) - "configure the harness from Claude Code".
 *
 * Cross-platform Node (Win + Mac; replaces the bash install.sh for mode B). One
 * engine, two front-ends: the standalone app calls this, AND the `/clawdacademy`
 * slash command drives it from inside Claude Code. Flow:
 *   ensure Claude Code (bootstrap) -> install the plugin -> wire the statusline
 *   -> write config.  Idempotent, never clobbers existing settings, reversible.
 * Privacy invariant preserved: this only wires capture/coaching; sync stays the
 * opt-in aggregate-only path (sync.py), never bypassed here.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const bootstrap = require("../desktop/bootstrap/claude-code.js");
const core = require("../coach-core");

// One place for the install surface (rebrand/repo rename touches only these).
const MARKETPLACE = "jddavenportOpen/ai-fluency-trainer";
const PLUGIN_NAME = "ai-fluency";
const PROVISION_API = process.env.CLAWDACADEMY_API || "https://clawdacademy.app";
const claudeSettings = () => path.join(os.homedir(), ".claude", "settings.json");
const statuslineCommand = () => `node ${path.join(__dirname, "..", "coach", "statusline.js")}`;

function run(bin, args) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 120000, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout || ""}${stderr || ""}`.trim() })
    );
  });
}
function readJson(f) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
}
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n");
}

async function installPlugin(claudeBin) {
  const bin = claudeBin || "claude";
  const mk = await run(bin, ["plugin", "marketplace", "add", MARKETPLACE]);
  const inst = await run(bin, ["plugin", "install", PLUGIN_NAME]);
  return { ok: inst.ok, marketplace: mk.out.slice(-200), install: inst.out.slice(-200) };
}

/** Wire coach/statusline.js into ~/.claude/settings.json; never clobber unless force. */
function wireStatusline({ force = false } = {}) {
  const f = claudeSettings();
  const s = readJson(f);
  if (s.statusLine && !force) {
    const mine = String(s.statusLine.command || "").includes("statusline.js");
    return { wired: mine, reason: mine ? "already ours" : "a different statusLine is set (pass force to override)", existing: s.statusLine };
  }
  s.statusLine = { type: "command", command: statuslineCommand() };
  writeJson(f, s);
  return { wired: true, command: s.statusLine.command };
}

function writeConfig(extra = {}) {
  const f = path.join(core.coachDir(), "config.json");
  writeJson(f, { brand: "clawdacademy", ...readJson(f), ...extra });
  return f;
}

/**
 * Score-first provisioning for mode B (parity with install.sh step 2): claim a
 * handle + get this user's OWN sync token, so the marketplace-add / slash-command
 * path also gets a distinct identity (never the shared dev token). Idempotent:
 * a config that already has a token is left alone. Fail-open (returns {ok:false}).
 */
async function provision(handle) {
  const cfgFile = path.join(core.coachDir(), "config.json");
  const cfg = readJson(cfgFile);
  if (cfg.token && cfg.handle) return { ok: true, already: true, handle: cfg.handle };
  if (!handle) return { ok: false, reason: "no handle; re-run: node setup.js setup --handle yourname" };
  try {
    const res = await fetch(`${PROVISION_API}/api/provision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.device_token) {
      return { ok: false, reason: body.error || `provision failed (${res.status})` };
    }
    writeConfig({ url: PROVISION_API, token: body.device_token, handle: body.handle });
    return { ok: true, handle: body.handle, profile: `${PROVISION_API}/u/${body.handle}` };
  } catch (e) {
    return { ok: false, reason: `provision error: ${(e && e.message) || e}` };
  }
}

/** Read-only: what is (and isn't) configured. Safe to call anytime. */
async function status() {
  const claude = await bootstrap.detect();
  const s = readJson(claudeSettings());
  const statuslineWired = !!(s.statusLine && String(s.statusLine.command || "").includes("statusline.js"));
  const events = core.readEvents();
  return {
    claudeCode: claude,
    statuslineWired,
    eventsFile: core.eventsFile(),
    scoredTurns: core.aggregate(events).turns,
  };
}

/** The full mode-B configure flow. autoInstall drives the official Claude installer. */
async function setup({ onProgress = () => {}, autoInstall = false, force = false, handle } = {}) {
  const steps = [];
  const claude = await bootstrap.ensure({ onProgress, autoInstall });
  steps.push({ step: "claude-code", ...claude });
  if (!claude.installed) {
    return { ok: false, steps, next: `Install Claude Code, then re-run: ${bootstrap.installCommandLabel()}` };
  }
  steps.push({ step: "plugin", ...(await installPlugin(claude.path)) });
  steps.push({ step: "statusline", ...wireStatusline({ force }) });
  steps.push({ step: "config", file: writeConfig() });
  const prov = await provision(handle);
  steps.push({ step: "provision", ...prov });
  const next = prov.ok
    ? `Do one real task in Claude Code; your Fluency Rating appears in the statusline and at ${prov.profile || PROVISION_API + "/u/" + (prov.handle || "<handle>")}.`
    : `Provisioning skipped (${prov.reason}). Claim your profile: node ${path.relative(process.cwd(), __filename)} setup --handle yourname`;
  return { ok: true, steps, next };
}

module.exports = { setup, status, provision, installPlugin, wireStatusline, writeConfig, MARKETPLACE, PLUGIN_NAME };

// CLI: node setup.js status | setup [--auto] [--force] [--handle NAME]
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || "status";
  const hi = args.indexOf("--handle");
  const handle = hi >= 0 ? args[hi + 1] : process.env.CLAWDACADEMY_HANDLE;
  (async () => {
    if (cmd === "status") {
      console.log(JSON.stringify(await status(), null, 2));
    } else if (cmd === "setup") {
      const r = await setup({
        onProgress: (s) => process.stdout.write(s),
        autoInstall: args.includes("--auto"),
        force: args.includes("--force"),
        handle,
      });
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === "provision") {
      console.log(JSON.stringify(await provision(handle), null, 2));
    } else {
      console.error("usage: node setup.js status | setup [--auto] [--force] [--handle NAME] | provision --handle NAME");
      process.exit(2);
    }
  })();
}
