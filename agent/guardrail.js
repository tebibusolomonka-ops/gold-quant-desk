// =====================================================================
//  GUARDRAIL: binding model judgment to an executable definition
//
//  The problem this solves: an LLM asked "is this a valid setup?" will
//  answer in natural language, and natural language is where "it looks
//  like a sweep" lives. Eyeballing is unfalsifiable, so it is unusable
//  as a research input and dangerous as a trading input.
//
//  The agent's rulebook therefore states that a setup counts ONLY if it
//  matches an objective definition. This module is that definition,
//  executable. The agent does not get to decide; it proposes, and this
//  function adjudicates.
//
//  Note the asymmetry: a PASS here does not mean the trade is good. The
//  full-history test in this repository shows the opposite: signals
//  meeting every criterion below still lose money after costs. The
//  guardrail enforces *honesty about what was seen*, not profitability.
//  Those are different jobs and conflating them is how backtests lie.
// =====================================================================
'use strict';

const DEFAULTS = {
  N: 5,        // pivot must be the extreme of N bars each side
  X: 0.10,     // sweep must exceed the level by X * ATR(14)
  K: 2,        // reclaim must close back inside within K bars
  M: 1.5,      // reclaim-bar volume >= M * SMA20(volume)
  C: 5,        // >= C bars since the previous accepted signal
  atrLen: 14,
};

// --- indicators (Wilder smoothing, to match the engine) ---------------
function atr(bars, len) {
  const tr = bars.map((b, i) => i === 0
    ? b.high - b.low
    : Math.max(b.high - b.low,
               Math.abs(b.high - bars[i - 1].close),
               Math.abs(b.low - bars[i - 1].close)));
  const out = new Array(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < len) { sum += tr[i]; if (i === len - 1) out[i] = sum / len; }
    else out[i] = (out[i - 1] * (len - 1) + tr[i]) / len;
  }
  return out;
}

function volSma(bars, len) {
  const out = new Array(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].volume;
    if (i >= len) sum -= bars[i - len].volume;
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

// Indicator series are a pure function of the bar array, but adjudication
// is called once per candidate bar, and recomputing them each time makes the
// guardrail O(n) per call and O(n^2) over a sweep. Cache per series.
const _cache = new WeakMap();
function indicators(bars, atrLen) {
  let entry = _cache.get(bars);
  if (!entry || entry.atrLen !== atrLen) {
    entry = { atrLen, atr: atr(bars, atrLen), vol: volSma(bars, 20) };
    _cache.set(bars, entry);
  }
  return entry;
}

/**
 * Adjudicate a claimed setup.
 *
 * @param {Array}  bars       OHLCV series, oldest first.
 * @param {number} i          Index of the bar the agent claims is the reclaim.
 * @param {number} dir        +1 for a claimed long, -1 for a claimed short.
 * @param {object} [opts]
 * @param {number} [opts.level]     The level claimed to have been swept.
 *                                  Omitted: derived from the nearest confirmed pivot.
 * @param {number} [opts.lastSignal] Index of the previous accepted signal, for cooldown.
 * @returns {{valid: boolean, checks: Array, failed: Array, detail: object}}
 */
function evaluateSetup(bars, i, dir, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const checks = [];
  const add = (name, pass, note) => checks.push({ name, pass, note });

  const warmup = p.N * 2 + p.atrLen + 20;
  if (i < warmup || i >= bars.length) {
    return {
      valid: false,
      checks: [{ name: 'in_range', pass: false, note: `bar ${i} is inside warmup or past the series` }],
      failed: ['in_range'],
      detail: {},
    };
  }

  const { atr: atrSeries, vol: volSeries } = indicators(bars, p.atrLen);
  const A = atrSeries[i];
  const V = volSeries[i];
  const bar = bars[i];

  // --- 1. the level must be a CONFIRMED pivot ------------------------
  // A pivot is only knowable N bars after it forms. Using one sooner is
  // look-ahead: the agent would be citing a level the market had not yet
  // finished printing.
  let level = opts.level;
  let levelBar = null;
  if (level === undefined) {
    for (let c = i - p.N - 1; c >= p.N && c >= i - 60; c--) {
      if (c + p.N >= i) continue;                     // not yet confirmed at bar i
      let extreme = true;
      for (let j = c - p.N; j <= c + p.N; j++) {
        if (j === c) continue;
        if (dir < 0 ? bars[j].high >= bars[c].high : bars[j].low <= bars[c].low) { extreme = false; break; }
      }
      if (extreme) { level = dir < 0 ? bars[c].high : bars[c].low; levelBar = c; break; }
    }
  }
  const haveLevel = Number.isFinite(level);
  add('level_is_confirmed_pivot', haveLevel,
    haveLevel
      ? `level ${level.toFixed(2)}${levelBar !== null ? ` from bar ${levelBar}, confirmed ${i - levelBar - p.N} bars before this one` : ' (supplied)'}`
      : `no confirmed ${p.N}-bar pivot available to sweep`);
  if (!haveLevel) return finish(checks, {});

  // --- 2. a sweep of real depth must have happened within K bars -----
  // "Price touched the level" is not a sweep. Depth is measured in ATR,
  // not dollars, so the criterion means the same thing in every regime.
  let sweepBar = null, extremeSeen = dir < 0 ? -Infinity : Infinity;
  for (let j = i - p.K; j <= i; j++) {
    if (j < 0) continue;
    const beyond = dir < 0 ? bars[j].high - level : level - bars[j].low;
    if (beyond > p.X * A) {
      if (sweepBar === null) sweepBar = j;
      extremeSeen = dir < 0 ? Math.max(extremeSeen, bars[j].high) : Math.min(extremeSeen, bars[j].low);
    }
  }
  const swept = sweepBar !== null;
  const depth = swept ? Math.abs(extremeSeen - level) : 0;
  add('sweep_depth', swept,
    swept
      ? `wick ${depth.toFixed(2)} beyond level = ${(depth / A).toFixed(3)} ATR (need > ${p.X})`
      : `no bar in the last ${p.K + 1} exceeded the level by ${p.X} ATR (${(p.X * A).toFixed(2)})`);

  // --- 3. reclaim: closed back INSIDE, within K bars of the sweep ----
  const reclaimed = swept && (dir < 0 ? bar.close < level : bar.close > level);
  add('reclaim_close', reclaimed,
    reclaimed
      ? `close ${bar.close.toFixed(2)} is back ${dir < 0 ? 'below' : 'above'} ${level.toFixed(2)}`
      : `close ${bar.close.toFixed(2)} did not return inside the level`);

  const withinK = swept && (i - sweepBar) <= p.K;
  add('reclaim_within_K', withinK,
    swept ? `reclaim came ${i - sweepBar} bar(s) after the sweep (limit ${p.K})` : 'no sweep to time from');

  // --- 4. participation --------------------------------------------
  const volOK = Number.isFinite(V) && bar.volume >= p.M * V;
  // Volume units vary by feed: gold ticks arrive as small floats, index
  // futures as millions. Format for the magnitude actually present rather
  // than rounding a 0.6 and a 0.9 both to "1".
  const fmtVol = v => Math.abs(v) >= 100 ? String(Math.round(v)) : v.toPrecision(3);
  add('volume_confirmation', volOK,
    Number.isFinite(V)
      ? `volume ${fmtVol(bar.volume)} vs ${p.M}x SMA20 ${fmtVol(p.M * V)} (ratio ${(bar.volume / V).toFixed(2)})`
      : 'volume average unavailable');

  // --- 5. no simultaneous opposite signal ---------------------------
  // A bar that sweeps a level above AND below and reclaims both is chop,
  // not a setup. This case was found empirically: the first coded version
  // produced more entry attempts than signals because both directions
  // fired on the same bar and the second order reversed the first.
  const oppLevelSide = dir < 0 ? 'low' : 'high';
  let opposite = false;
  for (let c = i - p.N - 1; c >= p.N && c >= i - 60; c--) {
    if (c + p.N >= i) continue;
    let extreme = true;
    for (let j = c - p.N; j <= c + p.N; j++) {
      if (j === c) continue;
      if (dir < 0 ? bars[j].low <= bars[c].low : bars[j].high >= bars[c].high) { extreme = false; break; }
    }
    if (!extreme) continue;
    const oppLevel = bars[c][oppLevelSide];
    for (let j = i - p.K; j <= i; j++) {
      if (j < 0) continue;
      const beyond = dir < 0 ? oppLevel - bars[j].low : bars[j].high - oppLevel;
      const back = dir < 0 ? bar.close > oppLevel : bar.close < oppLevel;
      if (beyond > p.X * A && back) opposite = true;
    }
    break;
  }
  add('no_opposite_signal', !opposite,
    opposite ? 'this bar also swept and reclaimed the opposite level: chop, skip' : 'no conflicting signal on this bar');

  // --- 6. cooldown ---------------------------------------------------
  const cool = opts.lastSignal === undefined || (i - opts.lastSignal) >= p.C;
  add('cooldown', cool,
    opts.lastSignal === undefined
      ? 'no prior signal supplied'
      : `${i - opts.lastSignal} bars since the last accepted signal (need ${p.C})`);

  return finish(checks, {
    level, levelBar, sweepBar,
    sweepDepthATR: swept ? depth / A : 0,
    atr: A,
    volumeRatio: Number.isFinite(V) ? bar.volume / V : null,
  });
}

function finish(checks, detail) {
  const failed = checks.filter(c => !c.pass).map(c => c.name);
  return { valid: failed.length === 0, checks, failed, detail };
}

/** Human-readable adjudication, for pasting back into an analysis. */
function explain(result) {
  const lines = result.checks.map(c => `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}: ${c.note}`);
  const head = result.valid
    ? 'VALID SETUP: every criterion met'
    : `NOT A SETUP, failed: ${result.failed.join(', ')}`;
  return [head, ...lines].join('\n');
}

module.exports = { evaluateSetup, explain, DEFAULTS };

// --- CLI: adjudicate a bar from the committed data --------------------
if (require.main === module) {
  const dataPath = require('../scripts/_data');
  const bars = JSON.parse(require('fs').readFileSync(dataPath('xauusd_m15.json')));
  const i = Number(process.argv.find(a => a.startsWith('bar='))?.split('=')[1] ?? bars.length - 1);
  const dir = Number(process.argv.find(a => a.startsWith('dir='))?.split('=')[1] ?? -1);
  console.log(`Adjudicating bar ${i} (${new Date(bars[i].timestamp).toISOString()}) as a ${dir < 0 ? 'SHORT' : 'LONG'}:\n`);
  console.log(explain(evaluateSetup(bars, i, dir)));
}
