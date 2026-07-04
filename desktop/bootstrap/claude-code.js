"use strict";
/**
 * Claude Code bootstrap (PRD-07, directive #1) - detect -> install -> verify.
 *
 * Zero-dep Node so it runs from the Electron app (mode A) AND the harness-native
 * setup flow (mode B) with no extra runtime. Principles (PRD-07 §Claude Code
 * auto-install): NEVER ship a repackaged Claude binary - always DRIVE Anthropic's
 * OFFICIAL installer; always expose the exact command first (`installCommandLabel`)
 * so the caller can show it / offer "I'll do it myself"; verify from a fresh
 * child process (fresh PATH) after install; every failure has a forward action.
 *
 * The install surface can change, so it lives in ONE constant (INSTALLER),
 * shipped via auto-update. Confirm against Anthropic's current install docs
 * before GA; swapping the URL/command here is the only change needed.
 */
const { execFile, spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const WIN = process.platform === "win32";
const CLAUDE_BIN = WIN ? "claude.exe" : "claude";

// --- the one place the install surface lives (auto-updatable) ---------------
const INSTALLER = {
  darwin: { shell: "/bin/sh", args: ["-c", "curl -fsSL https://claude.ai/install.sh | sh"], label: "curl -fsSL https://claude.ai/install.sh | sh" },
  linux: { shell: "/bin/sh", args: ["-c", "curl -fsSL https://claude.ai/install.sh | sh"], label: "curl -fsSL https://claude.ai/install.sh | sh" },
  win32: { shell: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"], label: "irm https://claude.ai/install.ps1 | iex" },
};
// Fallback path (documented, needs Node): npm i -g @anthropic-ai/claude-code
const NPM_FALLBACK = { label: "npm install -g @anthropic-ai/claude-code" };

// --- cross-platform PATH lookup (no deps) -----------------------------------
function which(bin) {
  const exts = WIN ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, WIN ? bin.replace(/\.exe$/i, "") + ext : bin);
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
    }
  }
  return null;
}

function knownLocations() {
  const home = os.homedir();
  if (WIN) {
    return [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "claude", "claude.exe"),
      path.join(home, ".claude", "bin", "claude.exe"),
      path.join(home, "AppData", "Roaming", "npm", "claude.cmd"),
    ];
  }
  return [
    path.join(home, ".claude", "local", "claude"),
    path.join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
}

function runVersion(bin) {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const m = String(stdout).match(/\d+\.\d+(\.\d+)?/);
      resolve(m ? m[0] : "unknown");
    });
  });
}

/** Detect Claude Code: PATH first, then known install locations. */
async function detect() {
  const onPath = which(CLAUDE_BIN) || CLAUDE_BIN;
  let version = await runVersion(onPath);
  if (version) return { installed: true, version, path: which(CLAUDE_BIN) || onPath, source: "path" };
  for (const loc of knownLocations()) {
    try { fs.accessSync(loc, fs.constants.X_OK); } catch { continue; }
    version = await runVersion(loc);
    if (version) return { installed: true, version, path: loc, source: "known-location" };
  }
  return { installed: false };
}

/** The exact command that install() will run (show it before running). */
function installCommandLabel() {
  const spec = INSTALLER[process.platform];
  return spec ? spec.label : NPM_FALLBACK.label;
}

/** Drive the official installer. onProgress(str) streams installer output. */
function install({ onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const spec = INSTALLER[process.platform];
    if (!spec) return reject(new Error(`Unsupported platform: ${process.platform}. Install manually: ${NPM_FALLBACK.label}`));
    const child = spawn(spec.shell, spec.args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    const push = (b) => { const s = b.toString(); out += s; if (onProgress) onProgress(s); };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("error", (e) => reject(new Error(`Could not launch installer (${e.message}). Run it yourself: ${spec.label}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve({ ok: true, output: out })
        : reject(new Error(`Installer exited ${code}. You can run it yourself: ${spec.label}\n${out.slice(-800)}`))
    );
  });
}

/** Verify from a FRESH child (fresh PATH) after an install. */
async function verify() {
  const d = await detect();
  return { ...d, verified: d.installed };
}

/** Full flow: detect; if absent, install then verify. Never throws for "absent". */
async function ensure({ onProgress, autoInstall = false } = {}) {
  const found = await detect();
  if (found.installed) return { ...found, action: "already-installed" };
  if (!autoInstall) return { installed: false, action: "needs-install", command: installCommandLabel() };
  await install({ onProgress });
  const v = await verify();
  return { ...v, action: v.installed ? "installed" : "install-unverified", command: installCommandLabel() };
}

module.exports = { detect, install, verify, ensure, installCommandLabel, INSTALLER, NPM_FALLBACK };

// --- CLI harness: node claude-code.js detect|verify|install|command ----------
if (require.main === module) {
  const cmd = process.argv[2] || "detect";
  (async () => {
    if (cmd === "detect" || cmd === "verify") {
      const r = await detect();
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.installed ? 0 : 1);
    } else if (cmd === "command") {
      console.log(installCommandLabel());
    } else if (cmd === "install") {
      console.log("Would run:", installCommandLabel());
      const r = await install({ onProgress: (s) => process.stdout.write(s) }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      console.log("\nresult:", r.ok ? "ok" : "FAILED: " + r.error);
      console.log("verify:", JSON.stringify(await verify()));
    } else {
      console.error("usage: node claude-code.js detect|verify|install|command");
      process.exit(2);
    }
  })();
}
