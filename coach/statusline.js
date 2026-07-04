#!/usr/bin/env node
'use strict';
/*
 * Clawdacademy statusline (PRD-07 M4) - cross-platform replacement for
 * statusline.sh (bash+awk = a Windows gap). One line for Claude Code's
 * `statusLine` command, computed from the shared coach-core. Leads with the
 * Fluency RATING (quality, the headline), with Lv/XP as demoted activity.
 * Reads (and ignores) the statusLine JSON on stdin; never blocks, never errors.
 */
const core = require('../coach-core');

function line() {
  const p = core.profile(core.readEvents());
  const cur = core.xpForLevel(p.level);
  const next = core.xpForLevel(p.level + 1);
  const frac = next > cur ? Math.max(0, Math.min(1, (p.xp - cur) / (next - cur))) : 0;
  const W = 5;
  const fill = Math.round(frac * W);
  const bar = '▓'.repeat(fill) + '░'.repeat(W - fill);
  const rating =
    p.turns > 0
      ? `${p.rating} ${p.band}${p.established ? '' : ' (prov)'}`
      : 'no score yet';
  return `⚡ ${rating} · Lv${p.level} ${p.title} ${bar}`;
}

try {
  process.stdout.write(line());
} catch {
  process.stdout.write('⚡ Clawdacademy');
}
