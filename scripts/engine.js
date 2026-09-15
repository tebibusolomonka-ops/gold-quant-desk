// =====================================================================
//  SWEEP & RECLAIM — independent backtest engine
//  Implements Quant-Strategy-Spec.md v0.2 exactly (pre-registered).
//  Anti-look-ahead: a pivot is only KNOWN N bars after it forms.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');

const P = {
  N: 5,          // pivot bars each side
  X: 0.10,       // sweep depth in ATR
  K: 2,          // reclaim window (bars)
  M: 1.5,        // volume multiple
  C: 5,          // cooldown bars
  atrLen: 14,
  slPad: 0.25,   // SL pad in ATR
  spread: 0.30,  // round-trip cost in price units (gold)
  levelMode: 'PIVOT',
  useRegime: false,
  regimeBars: 4, // HTF = regimeBars x chart TF (4 = 1h on 15m), EMA50
};

function rma(vals, len) {                     // Wilder smoothing (ta.atr)
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i < len) { sum += vals[i]; if (i === len - 1) out[i] = sum / len; }
    else out[i] = (out[i - 1] * (len - 1) + vals[i]) / len;
  }
  return out;
}
function sma(vals, len) {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= len) sum -= vals[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}
function atr14(b, len) {
  const tr = b.map((x, i) => i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)));
  return rma(tr, len);
}
// EMA50 on higher timeframe, mapped back with NO look-ahead
// (bar i uses the last FULLY CLOSED htf bar)
function htfEma(b, group, len) {
  const out = new Array(b.length).fill(NaN);
  let ema = NaN, k = 2 / (len + 1), closes = [], seeded = false;
  for (let i = 0; i < b.length; i++) {
    out[i] = ema;                                  // value from PRIOR closed htf bar
    if ((i + 1) % group === 0) {                   // an htf bar just closed
      const c = b[i].close;
      if (!seeded) {
        closes.push(c);
        if (closes.length === len) { ema = closes.reduce((a, x) => a + x, 0) / len; seeded = true; }
      } else ema = c * k + ema * (1 - k);
    }
  }
  return out;
}

function run(bars, p) {
  const atr = atr14(bars, p.atrLen);
  const vMA = sma(bars.map(b => b.volume), 20);
  const rEma = p.useRegime ? htfEma(bars, p.regimeBars, 50) : null;

  // ---- confirmed pivots (known only N bars late) ----
  const lastPH = new Array(bars.length).fill(NaN);
  const lastPL = new Array(bars.length).fill(NaN);
  let ph = NaN, pl = NaN;
  for (let i = 0; i < bars.length; i++) {
    const c = i - p.N;                                   // candidate pivot bar
    if (c >= p.N) {
      let isH = true, isL = true;
      for (let j = c - p.N; j <= c + p.N; j++) {
        if (j === c) continue;
        if (bars[j].high >= bars[c].high) isH = false;
        if (bars[j].low <= bars[c].low) isL = false;
      }
      if (isH) ph = bars[c].high;
      if (isL) pl = bars[c].low;
    }
    lastPH[i] = ph; lastPL[i] = pl;
  }

  // ---- session / prior-day levels (UTC) ----
  const pdh = new Array(bars.length).fill(NaN), pdl = new Array(bars.length).fill(NaN);
  const asH = new Array(bars.length).fill(NaN), asL = new Array(bars.length).fill(NaN);
  {
    let dKey = null, dH = -Infinity, dL = Infinity, prevH = NaN, prevL = NaN;
    let aH = -Infinity, aL = Infinity, lastAH = NaN, lastAL = NaN, inA = false;
    for (let i = 0; i < bars.length; i++) {
      const d = new Date(bars[i].timestamp);
      const key = d.toISOString().slice(0, 10);
      if (key !== dKey) { if (dKey !== null) { prevH = dH; prevL = dL; } dKey = key; dH = -Infinity; dL = Infinity; }
      pdh[i] = prevH; pdl[i] = prevL;
      const h = d.getUTCHours(), nowA = h < 7;            // Asian 00:00-07:00 UTC
      if (nowA && !inA) { aH = -Infinity; aL = Infinity; }
      if (!nowA && inA) { lastAH = aH; lastAL = aL; }
      inA = nowA;
      asH[i] = lastAH; asL[i] = lastAL;
      if (nowA) { aH = Math.max(aH, bars[i].high); aL = Math.min(aL, bars[i].low); }
      dH = Math.max(dH, bars[i].high); dL = Math.min(dL, bars[i].low);
    }
  }
  const nearAbove = (px, a, b) => {
    const c = [a, b].filter(v => isFinite(v) && v > px); return c.length ? Math.min(...c) : NaN;
  };
  const nearBelow = (px, a, b) => {
    const c = [a, b].filter(v => isFinite(v) && v < px); return c.length ? Math.max(...c) : NaN;
  };

  // ---- signal scan ----
  const signals = [];
  let brU = null, brD = null, lastSig = -1e9, conflicts = 0;
  for (let i = p.N * 2 + p.atrLen + 20; i < bars.length; i++) {
    const b = bars[i], a = atr[i];
    if (!isFinite(a) || !isFinite(vMA[i])) continue;
    const up = p.levelMode === 'PIVOT' ? lastPH[i] : nearAbove(b.close, pdh[i], asH[i]);
    const dn = p.levelMode === 'PIVOT' ? lastPL[i] : nearBelow(b.close, pdl[i], asL[i]);

    if (isFinite(up) && !brU && b.high > up + p.X * a) brU = { bar: i, ext: b.high, lvl: up };
    else if (brU) brU.ext = Math.max(brU.ext, b.high);
    if (brU && i - brU.bar > p.K) brU = null;

    if (isFinite(dn) && !brD && b.low < dn - p.X * a) brD = { bar: i, ext: b.low, lvl: dn };
    else if (brD) brD.ext = Math.min(brD.ext, b.low);
    if (brD && i - brD.bar > p.K) brD = null;

    const volOK = b.volume >= p.M * vMA[i];
    const regS = !p.useRegime || (isFinite(rEma[i]) && b.close < rEma[i]);
    const regL = !p.useRegime || (isFinite(rEma[i]) && b.close > rEma[i]);
    const rS = !!brU && b.close < brU.lvl && volOK && regS;
    const rL = !!brD && b.close > brD.lvl && volOK && regL;
    if (rS && rL) { conflicts++; continue; }             // chop bar -> skip
    if (!rS && !rL) continue;
    if (i - lastSig < p.C) continue;

    const dir = rS ? -1 : 1;
    const entry = b.close;
    const ext = rS ? brU.ext : brD.ext;
    const sl = rS ? ext + p.slPad * a : ext - p.slPad * a;
    const R = Math.abs(sl - entry);
    if (!(R > 0)) continue;
    signals.push({ i, dir, entry, sl, R, tp1: entry + dir * R, tp2: entry + dir * 2 * R });
    lastSig = i;
    if (rS) brU = null; else brD = null;
  }

  // ---- trade simulation (SL checked before TP within a bar = conservative) ----
  const trades = [];
  let lastExit = -1;
  for (const s of signals) {
    if (p.flatOnly && s.i <= lastExit) continue;      // one position at a time (matches Pine)
    let slNow = s.sl, tp1 = false, tp2 = false, rTot = 0, closed = 0, exitBar = null;
    for (let i = s.i + 1; i < bars.length; i++) {
      const b = bars[i];
      const hitSL = s.dir < 0 ? b.high >= slNow : b.low <= slNow;
      if (hitSL) {
        const rem = 1 - closed;
        rTot += rem * (s.dir * (slNow - s.entry) / s.R);
        exitBar = i; break;
      }
      if (!tp1 && (s.dir < 0 ? b.low <= s.tp1 : b.high >= s.tp1)) {
        tp1 = true; rTot += 0.5 * 1; closed += 0.5; slNow = s.entry;   // BE
      }
      if (tp1 && !tp2 && (s.dir < 0 ? b.low <= s.tp2 : b.high >= s.tp2)) {
        tp2 = true; rTot += 0.3 * 2; closed += 0.3;
      }
      if (tp1) {                                                        // runner trails structure
        const t = s.dir < 0 ? lastPH[i] : lastPL[i];
        if (isFinite(t)) slNow = s.dir < 0 ? Math.min(slNow, t) : Math.max(slNow, t);
      }
      if (i === bars.length - 1) {
        const rem = 1 - closed;
        rTot += rem * (s.dir * (b.close - s.entry) / s.R);
        exitBar = i;
      }
    }
    if (exitBar === null) continue;
    lastExit = exitBar;
    rTot -= p.spread / s.R;                                             // costs
    trades.push({ ...s, r: rTot, exitBar, year: new Date(bars[s.i].timestamp).getUTCFullYear() });
  }
  return { trades, conflicts, signals: signals.length };
}

function stats(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const rs = trades.map(t => t.r);
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r <= 0);
  const sum = rs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const gp = wins.reduce((a, b) => a + b, 0), gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let eq = 0, peak = 0, dd = 0;
  for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return {
    n, winRate: wins.length / n, expectancyR: mean, totalR: sum,
    profitFactor: gl > 0 ? gp / gl : Infinity, maxDD_R: dd,
    sharpePerTrade: sd > 0 ? mean / sd : 0,
    tStat: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
  };
}

module.exports = { run, stats, P };

if (require.main === module) {
  const bars = JSON.parse(fs.readFileSync(dataPath('xauusd_m15.json')));
  const p = { ...P };
  for (const a of process.argv.slice(3)) {
    const [k, v] = a.split('=');
    p[k] = (v === 'true') ? true : (v === 'false') ? false : (isNaN(+v) ? v : +v);
  }
  const { trades, conflicts, signals } = run(bars, p);
  const s = stats(trades);
  console.log('params:', JSON.stringify(p));
  console.log(`bars=${bars.length} signals=${signals} conflicts=${conflicts} trades=${s.n}`);
  if (s.n) {
    console.log(`winRate=${(s.winRate * 100).toFixed(1)}%  expectancy=${s.expectancyR.toFixed(4)}R  totalR=${s.totalR.toFixed(1)}`);
    console.log(`PF=${s.profitFactor.toFixed(2)}  maxDD=${s.maxDD_R.toFixed(1)}R  sharpe/trade=${s.sharpePerTrade.toFixed(3)}  t=${s.tStat.toFixed(2)}`);
    const byYear = {};
    for (const t of trades) { (byYear[t.year] ||= []).push(t.r); }
    console.log('--- by year ---');
    for (const y of Object.keys(byYear).sort()) {
      const a = byYear[y], tot = a.reduce((x, z) => x + z, 0);
      console.log(`${y}: n=${String(a.length).padStart(3)}  totalR=${tot.toFixed(1).padStart(7)}  avg=${(tot / a.length).toFixed(3)}R`);
    }
  }
}
