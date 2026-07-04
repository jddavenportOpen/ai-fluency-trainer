'use strict';
/*
 * Clawdacademy — desktop sibling of coach/fluency.js.
 *
 * Modes (env):
 *   (default)          live-tail $AI_FLUENCY_DIR/events.jsonl (default ~/.ai-fluency)
 *   AIF_REPLAY=<file>  replay that events.jsonl at ~5 ev/sec into the same UI
 *   AIF_SCREENSHOT=1   render, wait ~2s after load / replay start (replay runs fast),
 *                      capture /tmp/aif-desktop.png + /tmp/aif-desktop-stats.png, exit 0
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../coach-core'); // shared engine (Fluency Rating for the tray)

const REPLAY = process.env.AIF_REPLAY ? path.resolve(process.env.AIF_REPLAY) : null;
const SCREENSHOT = process.env.AIF_SCREENSHOT === '1';

function liveEventsFile() {
  const dir = process.env.AI_FLUENCY_DIR || path.join(os.homedir(), '.ai-fluency');
  return path.join(dir, 'events.jsonl');
}
const FILE = REPLAY || liveEventsFile();

/* ---------- shared parsing / aggregation (contract-identical to coach/fluency.js) ---------- */
function parseLine(line) {
  const t = String(line).trim();
  if (!t) return null;
  try {
    const ev = JSON.parse(t);
    if (!ev || typeof ev !== 'object' || typeof ev.event !== 'string') return null;
    return ev;
  } catch {
    return null; // skip malformed lines silently
  }
}

function readEvents(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return raw.split('\n').map(parseLine).filter(Boolean);
}

function aggregate(events) {
  const agg = { xp: 0, sessions: 0, turns: 0, dimSum: {}, dimCount: {}, open: new Set(), lastStartTs: null };
  for (const ev of events) {
    if (ev.event === 'session_start') {
      agg.sessions++;
      agg.open.add(ev.sid || '?');
      agg.lastStartTs = ev.ts || agg.lastStartTs;
    }
    if (ev.event === 'session_end') agg.open.delete(ev.sid || '?');
    if (ev.event === 'turn_score') {
      const d = ev.data || {};
      agg.xp += Number(d.xp) || 0;
      agg.turns++;
      const dims = d.dims && typeof d.dims === 'object' ? d.dims : {};
      for (const [k, v] of Object.entries(dims)) {
        const val = Number(v);
        if (!Number.isFinite(val)) continue;
        agg.dimSum[k] = (agg.dimSum[k] || 0) + val;
        agg.dimCount[k] = (agg.dimCount[k] || 0) + 1;
      }
    }
  }
  // "active recently": open session whose start is within the last 6h
  let sessionActive = false;
  if (agg.open.size > 0 && agg.lastStartTs) {
    const t = Date.parse(agg.lastStartTs);
    sessionActive = Number.isFinite(t) ? Date.now() - t < 6 * 3600 * 1000 : false;
  }
  return { ...agg, sessionActive };
}

function statsPayload() {
  const agg = aggregate(readEvents(FILE));
  const dims = {};
  for (const k of Object.keys(agg.dimSum)) dims[k] = agg.dimSum[k] / agg.dimCount[k];
  return { sessions: agg.sessions, turns: agg.turns, xp: agg.xp, dims };
}

/* ---------- window ---------- */
let win = null;
let tray = null;
let isQuitting = false;
function send(msg) {
  if (win && !win.isDestroyed()) win.webContents.send('aif', msg);
}

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 360,
    minHeight: 520,
    title: 'Clawdacademy',
    backgroundColor: '#0b0e14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Mode A background: closing the window hides it to the tray and the harness
  // keeps running. Real quit is only via the tray menu (isQuitting).
  win.on('close', (e) => {
    if (!isQuitting && !SCREENSHOT && !REPLAY && tray) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* ---------- live mode: watch + poll tail ---------- */
let offset = 0;
let partial = '';

function pollNewLines() {
  let st;
  try {
    st = fs.statSync(FILE);
  } catch {
    return; // not created yet
  }
  if (st.size < offset) {
    // Truncated / rotated: RE-SEED instead of re-emitting the whole file as
    // fresh events — the renderer already counted historical XP from the last
    // seed, so replaying history would double-count it in the header.
    partial = '';
    offset = st.size;
    const seed = aggregate(readEvents(FILE));
    send({
      type: 'seed', mode: 'live', xp: seed.xp, sessions: seed.sessions,
      turns: seed.turns, sessionActive: seed.sessionActive, file: FILE,
    });
    return;
  }
  if (st.size === offset) return;
  let fd;
  try {
    fd = fs.openSync(FILE, 'r');
    const len = st.size - offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, offset);
    offset = st.size;
    const chunk = partial + buf.toString('utf8');
    const lines = chunk.split('\n');
    partial = lines.pop() || ''; // keep incomplete tail
    const evs = lines.map(parseLine).filter(Boolean);
    if (evs.length) send({ type: 'events', events: evs });
  } catch {
    /* fail-open */
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

let watcher = null;
function armWatcher() {
  if (watcher) return;
  const dir = path.dirname(FILE);
  try {
    watcher = fs.watch(dir, () => pollNewLines()); // dir-level: catches file creation too
    watcher.on('error', () => { try { watcher.close(); } catch {} watcher = null; });
  } catch {
    watcher = null; // dir doesn't exist yet — the 500ms poll (+ re-arm) covers it
  }
}

function startLive() {
  const seed = aggregate(readEvents(FILE));
  try {
    offset = fs.statSync(FILE).size; // history is seeded, not replayed into the feed
  } catch {
    offset = 0;
  }
  send({
    type: 'seed',
    mode: 'live',
    xp: seed.xp,
    sessions: seed.sessions,
    turns: seed.turns,
    sessionActive: seed.sessionActive,
    file: FILE,
  });
  armWatcher();
  setInterval(() => {
    armWatcher(); // re-arm if the dir appeared later or the watcher died
    pollNewLines();
  }, 500);
}

/* ---------- replay mode ---------- */
let replayDone = null; // promise resolved when replay finishes
function startReplay() {
  const events = readEvents(FILE);
  send({ type: 'seed', mode: 'replay', xp: 0, sessions: 0, turns: 0, sessionActive: false, file: FILE });
  const tick = SCREENSHOT ? 25 : 200; // ~5 ev/sec live demo; fast-forward under screenshot
  replayDone = new Promise((resolve) => {
    let i = 0;
    const iv = setInterval(() => {
      if (i >= events.length) {
        clearInterval(iv);
        send({ type: 'replay-done' });
        resolve();
        return;
      }
      send({ type: 'events', events: [events[i++]] });
    }, tick);
  });
}

/* ---------- screenshot mode ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doScreenshots() {
  // wait ~2s after load/replay-start; if replaying, also let the (fast) replay finish
  await sleep(2000);
  if (replayDone) await replayDone;
  await sleep(800); // let bar-width transitions settle
  try {
    const img1 = await win.webContents.capturePage();
    fs.writeFileSync('/tmp/aif-desktop.png', img1.toPNG());
    send({ type: 'show-tab', tab: 'stats' });
    await sleep(900);
    const img2 = await win.webContents.capturePage();
    fs.writeFileSync('/tmp/aif-desktop-stats.png', img2.toPNG());
    app.exit(0);
  } catch (e) {
    console.error('screenshot failed:', e);
    app.exit(1);
  }
}

/* ---------- tray + background (mode A) ---------- */
function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  else { win.show(); win.focus(); }
}
function ratingLabel() {
  try {
    const p = core.profile(core.readEvents(liveEventsFile()));
    if (!p.turns) return 'No scored turns yet';
    return `Fluency ${p.rating} ${p.band}${p.established ? '' : ' (prov)'} · Lv ${p.level}`;
  } catch {
    return 'Clawdacademy';
  }
}
function buildTrayMenu() {
  const openAtLogin = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: ratingLabel(), enabled: false },
    { type: 'separator' },
    { label: 'Open Clawdacademy', click: showWindow },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Clawdacademy', click: () => { isQuitting = true; app.quit(); } },
  ]);
}
function setupTray() {
  let img;
  try {
    img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 18, height: 18 });
  } catch {
    img = undefined;
  }
  tray = new Tray(img || path.join(__dirname, 'build', 'icon.png'));
  tray.setToolTip('Clawdacademy — coaching in the background');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
  const iv = setInterval(() => {
    if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
  }, 15000);
  if (iv.unref) iv.unref();
}

/* ---------- wiring ---------- */
ipcMain.handle('stats', () => statsPayload());

let started = false;
ipcMain.on('renderer-ready', () => {
  if (started) { // renderer reloaded — re-seed live state
    if (!REPLAY) {
      const seed = aggregate(readEvents(FILE));
      send({ type: 'seed', mode: 'live', xp: seed.xp, sessions: seed.sessions, turns: seed.turns, sessionActive: seed.sessionActive, file: FILE });
    }
    return;
  }
  started = true;
  if (REPLAY) startReplay();
  else startLive();
  if (SCREENSHOT) doScreenshots();
});

app.whenReady().then(() => {
  createWindow();
  if (!SCREENSHOT && !REPLAY) setupTray(); // mode A: keep coaching in the background
});
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  // Mode A: keep running in the tray. Only quit outright in screenshot/replay
  // modes, or if the tray never came up.
  if (SCREENSHOT || REPLAY || !tray) app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});
