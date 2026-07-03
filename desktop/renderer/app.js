'use strict';
/* Fluency Coach renderer — plain DOM, no framework. */

/* ---------- gamification math (shared contract with coach/fluency.js) ---------- */
const TITLES = ['Novice', 'Apprentice', 'Operator', 'Collaborator', 'Director', 'Architect', 'Conductor'];
const titleFor = (lv) => (lv >= 7 ? 'Virtuoso' : TITLES[lv]);
const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100)); // largest N: xp >= 100*N^2
const xpForLevel = (lv) => 100 * lv * lv;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp01_100 = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const prettify = (k) =>
  String(k)
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
const barClass = (v) => (v >= 70 ? 'good' : v >= 40 ? 'warn' : 'bad');

/* ---------- dom refs ---------- */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const feed = $('feed');
const emptyState = $('empty-state');

/* ---------- state ---------- */
const state = {
  xp: 0,
  level: 0,
  sessionActive: false,
  lastFeedKind: null, // for coalescing tool_use runs
  lastToolTick: null, // { node, count, fails }
  hasFeedItems: false,
};

/* ---------- header ---------- */
function renderHeader() {
  const lv = levelFor(state.xp);
  $('level-num').textContent = String(lv);
  $('level-title').textContent = titleFor(lv);
  $('xp-total').textContent = `${fmt(state.xp)} XP`;
  const cur = xpForLevel(lv);
  const next = xpForLevel(lv + 1);
  const frac = Math.max(0, Math.min(1, (state.xp - cur) / (next - cur)));
  $('progress-fill').style.width = `${(frac * 100).toFixed(1)}%`;
  $('progress-label').textContent = `${fmt(next - state.xp)} XP to Lv ${lv + 1} · ${titleFor(lv + 1)}`;
  $('session-dot').className = `dot ${state.sessionActive ? 'on' : 'off'}`;
  $('session-label').textContent = state.sessionActive ? 'in session' : 'idle';
}

/* ---------- feed ---------- */
const MAX_FEED = 200;

function pushFeed(node, kind) {
  feed.prepend(node);
  state.lastFeedKind = kind;
  if (kind !== 'tools') state.lastToolTick = null;
  state.hasFeedItems = true;
  emptyState.classList.add('hidden');
  while (feed.children.length > MAX_FEED) feed.removeChild(feed.lastChild);
}

function dimRow(name, value) {
  const v = clamp01_100(value);
  const row = el('div', 'dim-row');
  row.appendChild(el('span', 'dim-name', prettify(name)));
  const track = el('div', 'dim-track');
  const fill = el('div', `dim-fill ${barClass(v)}`);
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el('span', 'dim-val', String(Math.round(v))));
  // animate from 0 → v after insertion
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${v}%`; }));
  return row;
}

function addTurnScoreCard(ev) {
  const d = ev.data || {};
  const card = el('div', 'card');
  const head = el('div', 'card-head');
  head.appendChild(el('span', 'turn-label', `Turn ${d.turn ?? '?'}`));
  head.appendChild(el('span', 'xp-chip', `+${fmt(Number(d.xp) || 0)} XP`));
  card.appendChild(head);

  const dims = d.dims && typeof d.dims === 'object' ? d.dims : {};
  for (const [k, v] of Object.entries(dims)) card.appendChild(dimRow(k, v)); // data-driven keys

  if (d.highlight) {
    const line = el('div', 'highlight-line');
    line.appendChild(el('span', 'hl-mark', '✓'));
    line.appendChild(el('span', '', String(d.highlight)));
    card.appendChild(line);
  }
  if (d.tip) {
    const line = el('div', 'tip-line');
    line.appendChild(el('span', 'tip-mark', '→'));
    line.appendChild(el('span', '', String(d.tip)));
    card.appendChild(line);
  }
  pushFeed(card, 'turn');
}

function addLevelUpBanner(lv) {
  const b = el('div', 'levelup');
  b.appendChild(el('div', 'lu-stars', '★ ★ ★'));
  const t = el('div', 'lu-title', 'LEVEL UP — Lv ' + lv + ' ');
  const name = el('span', 'lu-name', titleFor(lv));
  t.appendChild(name);
  b.appendChild(t);
  b.appendChild(el('div', 'lu-sub', `${fmt(xpForLevel(lv + 1) - xpForLevel(lv))} XP to the next rank`));
  pushFeed(b, 'levelup');
}

function addDivider(text, isStart) {
  pushFeed(el('div', `divider ${isStart ? 'start' : 'end'}`, text), 'divider');
}

function addToolTick(ev) {
  const d = ev.data || {};
  const failed = d.ok === false;
  if (state.lastFeedKind === 'tools' && state.lastToolTick) {
    // coalesce a run of tool_use into one tick: "5 tool calls"
    const t = state.lastToolTick;
    t.count += 1;
    if (failed) t.fails += 1;
    t.node.textContent = `⋅ ${t.count} tool calls${t.fails ? ` (${t.fails} failed)` : ''}`;
    return;
  }
  const node = el('div', 'tick');
  node.textContent = `⋅ ${d.tool || 'tool'}${failed ? ' ✗' : ''}`;
  if (failed) node.classList.add('tick-bad');
  pushFeed(node, 'tools');
  state.lastToolTick = { node, count: 1, fails: failed ? 1 : 0 };
}

function addPromptTick(ev) {
  const d = ev.data || {};
  const text = typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').slice(0, 60) : '';
  pushFeed(el('div', 'tick', `❯ ${text}${text.length >= 60 ? '…' : ''}`), 'prompt');
}

/* ---------- event handling ---------- */
function handleEvent(ev) {
  switch (ev.event) {
    case 'session_start': {
      state.sessionActive = true;
      const src = (ev.data && ev.data.source) || '';
      addDivider(`session started${src ? ` · ${src}` : ''}`, true);
      renderHeader();
      break;
    }
    case 'session_end': {
      state.sessionActive = false;
      const why = (ev.data && ev.data.reason) || '';
      addDivider(`session ended${why ? ` · ${why}` : ''}`, false);
      renderHeader();
      break;
    }
    case 'prompt':
      addPromptTick(ev);
      break;
    case 'tool_use':
      addToolTick(ev);
      break;
    case 'turn_score': {
      const gained = Number((ev.data && ev.data.xp) || 0);
      state.xp += gained;
      addTurnScoreCard(ev);
      const newLevel = levelFor(state.xp);
      if (newLevel > state.level) addLevelUpBanner(newLevel);
      state.level = newLevel;
      renderHeader();
      break;
    }
    default:
      break; // unknown event types: ignore (forward-compatible)
  }
}

/* ---------- stats view ---------- */
async function renderStats() {
  const body = $('stats-body');
  body.textContent = '';
  let s;
  try {
    s = await window.aif.stats();
  } catch {
    body.appendChild(el('div', 'stats-empty', 'stats unavailable'));
    return;
  }
  const counts = el('div', 'stats-counts');
  const box = (n, l) => {
    const b = el('div', 'stat-box');
    b.appendChild(el('div', 'n', String(n)));
    b.appendChild(el('div', 'l', l));
    return b;
  };
  counts.appendChild(box(fmt(s.sessions), 'sessions'));
  counts.appendChild(box(fmt(s.turns), 'scored turns'));
  body.appendChild(counts);

  const keys = Object.keys(s.dims || {});
  if (keys.length === 0) {
    body.appendChild(el('div', 'stats-empty', 'no scored turns yet — go use Claude Code!'));
    return;
  }
  body.appendChild(el('div', 'stats-section-title', 'Dimension averages'));
  const wrap = el('div', 'stats-dims');
  const sorted = keys.map((k) => [k, clamp01_100(s.dims[k])]).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) wrap.appendChild(dimRow(k, v));
  body.appendChild(wrap);

  const [bestK, bestV] = sorted[0];
  const [worstK, worstV] = sorted[sorted.length - 1];
  const strong = el('div', 'callout strong');
  strong.appendChild(el('span', 'co-mark', '▲'));
  const st = el('span');
  st.append('Strongest: ');
  st.appendChild(el('b', '', `${prettify(bestK)} (${Math.round(bestV)})`));
  strong.appendChild(st);
  body.appendChild(strong);

  const weak = el('div', 'callout weak');
  weak.appendChild(el('span', 'co-mark', '▼'));
  const wt = el('span');
  wt.append('Focus on: ');
  wt.appendChild(el('b', '', `${prettify(worstK)} (${Math.round(worstV)})`));
  weak.appendChild(wt);
  body.appendChild(weak);
}

/* ---------- tabs ---------- */
function showTab(name) {
  const live = name === 'live';
  $('view-live').classList.toggle('hidden', !live);
  $('view-stats').classList.toggle('hidden', live);
  $('tab-live').classList.toggle('active', live);
  $('tab-stats').classList.toggle('active', !live);
  if (!live) renderStats();
}
$('tab-live').addEventListener('click', () => showTab('live'));
$('tab-stats').addEventListener('click', () => showTab('stats'));

/* ---------- IPC wiring ---------- */
window.aif.on((msg) => {
  switch (msg.type) {
    case 'seed': {
      state.xp = Number(msg.xp) || 0;
      state.level = levelFor(state.xp);
      state.sessionActive = !!msg.sessionActive;
      renderHeader();
      if (state.xp > 0 || msg.turns > 0) emptyState.classList.add('hidden');
      break;
    }
    case 'events':
      for (const ev of msg.events || []) handleEvent(ev);
      break;
    case 'replay-done':
      addDivider('replay complete', false);
      break;
    case 'show-tab':
      showTab(msg.tab === 'stats' ? 'stats' : 'live');
      break;
    default:
      break;
  }
});

renderHeader();
window.aif.ready();
