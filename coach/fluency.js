#!/usr/bin/env node
'use strict';
/*
 * fluency — real-time terminal coaching sidebar for Claude Code.
 *
 * Modes:
 *   fluency.js                 live tail of the events file (default)
 *   fluency.js --replay <f>    replay an events.jsonl at ~5 ev/sec, then exit
 *   fluency.js --summary       aggregate totals from the whole file
 *
 * Zero dependencies. Fail-open: malformed lines are skipped silently.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/* ---------- ANSI ---------- */
const TTY = process.stdout.isTTY;
const c = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c('1');
const dim = c('2');
const red = c('31');
const green = c('32');
const yellow = c('33');
const magenta = c('35');
const cyan = c('36');

/* ---------- gamification math (shared contract) ---------- */
const TITLES = ['Novice', 'Apprentice', 'Operator', 'Collaborator', 'Director', 'Architect', 'Conductor'];
const titleFor = (lv) => (lv >= 7 ? 'Virtuoso' : TITLES[lv]);
// Level = largest N with totalXP >= 100*N*N
const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100));
const xpForLevel = (lv) => 100 * lv * lv;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const prettify = (k) =>
  String(k)
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/* ---------- events file ---------- */
function eventsFile() {
  const dir = process.env.AI_FLUENCY_DIR || path.join(os.homedir(), '.ai-fluency');
  return path.join(dir, 'events.jsonl');
}

function parseLine(line) {
  const t = line.trim();
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

/* ---------- rendering ---------- */
const BAR_W = 20;

function dimBar(v) {
  const val = Math.max(0, Math.min(100, Number(v) || 0));
  const filled = Math.round((val / 100) * BAR_W);
  const color = val >= 70 ? green : val >= 40 ? yellow : red;
  return color('█'.repeat(filled)) + dim('░'.repeat(BAR_W - filled));
}

function progressBar(xp, width) {
  const lv = levelFor(xp);
  const cur = xpForLevel(lv);
  const next = xpForLevel(lv + 1);
  const frac = Math.max(0, Math.min(1, (xp - cur) / (next - cur)));
  const filled = Math.round(frac * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function headerLine(xp) {
  const lv = levelFor(xp);
  const toNext = xpForLevel(lv + 1) - xp;
  return (
    bold(cyan(`⚡ Lv ${lv} ${titleFor(lv)}`)) +
    dim(' · ') +
    bold(`${fmt(xp)} XP`) +
    dim(' · ') +
    cyan(progressBar(xp, 20)) +
    dim(` ${fmt(toNext)} XP to Lv ${lv + 1}`)
  );
}

function levelUpBanner(lv) {
  const label = `LEVEL UP!  You are now Lv ${lv} — ${titleFor(lv)}`;
  const inner = `  ★  ${label}  ★  `;
  const rule = '═'.repeat(inner.length);
  return ['', magenta(bold(`╔${rule}╗`)), magenta(bold(`║${inner}║`)), magenta(bold(`╚${rule}╝`)), ''].join('\n');
}

function renderTurnScore(ev, xpAfter) {
  const d = ev.data || {};
  const dims = d.dims && typeof d.dims === 'object' ? d.dims : {};
  const out = [];
  out.push('');
  out.push(bold(`── Turn ${d.turn ?? '?'} `) + green(bold(`+${fmt(d.xp || 0)} XP `)) + dim('─'.repeat(30)));
  const keys = Object.keys(dims);
  const pad = Math.max(0, ...keys.map((k) => prettify(k).length));
  for (const k of keys) {
    const v = Math.max(0, Math.min(100, Number(dims[k]) || 0));
    out.push(`  ${prettify(k).padEnd(pad)}  ${dimBar(v)} ${dim(String(Math.round(v)).padStart(3))}`);
  }
  if (d.highlight) out.push(green(`  ✓ ${d.highlight}`));
  if (d.tip) out.push(yellow(`  → ${d.tip}`));
  out.push('  ' + headerLine(xpAfter));
  return out.join('\n');
}

// Renders one event, mutating state {xp, level}. Returns string (may be '').
function renderEvent(ev, state) {
  switch (ev.event) {
    case 'session_start': {
      const src = (ev.data && ev.data.source) || 'unknown';
      return dim(`── session started (${src}) · ${ev.ts || ''} ──`);
    }
    case 'session_end': {
      const why = (ev.data && ev.data.reason) || '';
      return dim(`── session ended${why ? ` (${why})` : ''} ──`);
    }
    case 'prompt': {
      const d = ev.data || {};
      const text = typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').slice(0, 70) : '';
      return dim(`❯ ${text}${text.length >= 70 ? '…' : ''}`);
    }
    case 'tool_use': {
      const d = ev.data || {};
      const ok = d.ok !== false;
      return dim(`  ⋅ ${d.tool || 'tool'} ${ok ? '✓' : red('✗')}`);
    }
    case 'turn_score': {
      const gained = Number((ev.data && ev.data.xp) || 0);
      state.xp += gained;
      let s = renderTurnScore(ev, state.xp);
      const newLevel = levelFor(state.xp);
      if (newLevel > state.level) s += '\n' + levelUpBanner(newLevel);
      state.level = newLevel;
      return s;
    }
    default:
      return '';
  }
}

/* ---------- aggregation (shared by --summary and live seeding) ---------- */
function aggregate(events) {
  const agg = { xp: 0, sessions: 0, turns: 0, dimSum: {}, dimCount: {} };
  for (const ev of events) {
    if (ev.event === 'session_start') agg.sessions++;
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
  return agg;
}

/* ---------- modes ---------- */
function runSummary(file) {
  const events = readEvents(file);
  const agg = aggregate(events);
  console.log('');
  console.log(headerLine(agg.xp));
  console.log(dim(`   ${agg.sessions} session${agg.sessions === 1 ? '' : 's'} · ${agg.turns} scored turn${agg.turns === 1 ? '' : 's'} · ${file}`));
  const keys = Object.keys(agg.dimSum);
  if (keys.length === 0) {
    console.log(dim('   no scored turns yet — go use Claude Code!'));
    console.log('');
    return;
  }
  console.log('');
  console.log(bold('  Dimension averages'));
  const avgs = keys.map((k) => [k, agg.dimSum[k] / agg.dimCount[k]]);
  const pad = Math.max(...avgs.map(([k]) => prettify(k).length));
  avgs.sort((a, b) => b[1] - a[1]);
  for (const [k, v] of avgs) {
    console.log(`  ${prettify(k).padEnd(pad)}  ${dimBar(v)} ${dim(String(Math.round(v)).padStart(3))}`);
  }
  console.log('');
  console.log(green(`  ▲ Strongest: ${prettify(avgs[0][0])} (${Math.round(avgs[0][1])})`));
  const worst = avgs[avgs.length - 1];
  console.log(yellow(`  ▼ Focus on:  ${prettify(worst[0])} (${Math.round(worst[1])})`));
  console.log('');
}

async function runReplay(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`fluency: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const events = raw.split('\n').map(parseLine).filter(Boolean);
  const state = { xp: 0, level: 0 };
  console.log(headerLine(0));
  for (const ev of events) {
    const out = renderEvent(ev, state);
    if (out) console.log(out);
    await new Promise((r) => setTimeout(r, 200)); // ~5 events/sec
  }
  console.log('');
  console.log(dim('── replay complete ──'));
  console.log(headerLine(state.xp));
}

function runLive(file) {
  // Seed cumulative state from history already in the file (no re-render).
  const state = { xp: 0, level: 0 };
  const seed = aggregate(readEvents(file));
  state.xp = seed.xp;
  state.level = levelFor(seed.xp);

  console.log(headerLine(state.xp));
  console.log(dim(`   watching ${file} — Ctrl-C to quit`));

  let offset = 0;
  try {
    offset = fs.statSync(file).size;
  } catch {
    console.log(dim('   (events file does not exist yet — waiting…)'));
  }
  let partial = '';

  setInterval(() => {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return; // not created yet
    }
    if (st.size < offset) {
      // Truncated/rotated: RE-SEED the running total from the new file instead
      // of appending fresh events onto the stale seeded xp (which would render
      // a nonsense sum). Matches the desktop app's re-seed behavior.
      offset = 0;
      partial = '';
      state.xp = aggregate(readEvents(file)).xp;
      state.level = levelFor(state.xp);
    }
    if (st.size === offset) return;
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const len = st.size - offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      offset = st.size;
      const chunk = partial + buf.toString('utf8');
      const lines = chunk.split('\n');
      partial = lines.pop() || ''; // keep incomplete tail
      for (const line of lines) {
        const ev = parseLine(line);
        if (!ev) continue;
        const out = renderEvent(ev, state);
        if (out) console.log(out);
      }
    } catch {
      /* fail-open */
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    }
  }, 500);
}

/* ---------- main ---------- */
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`fluency — live coaching sidebar for Claude Code

Usage:
  fluency.js                 follow ${eventsFile()} live
  fluency.js --replay <file> replay an events.jsonl at ~5 ev/sec, then exit
  fluency.js --summary       print aggregate level/XP/dimension report

Env:
  AI_FLUENCY_DIR   override the events directory (default ~/.ai-fluency)`);
    return;
  }
  const ri = args.indexOf('--replay');
  if (ri !== -1) {
    const f = args[ri + 1];
    if (!f) {
      console.error('fluency: --replay requires a file argument');
      process.exit(1);
    }
    runReplay(f);
    return;
  }
  if (args.includes('--summary')) {
    runSummary(eventsFile());
    return;
  }
  runLive(eventsFile());
}

main();
