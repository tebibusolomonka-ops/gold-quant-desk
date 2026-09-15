// =====================================================================
//  EXPLORATORY DATA ANALYSIS — XAUUSD 15m
//  Purpose: characterise the market BEFORE inventing strategies.
//  DISCIPLINE: in-sample = 2021-2024 only. 2025-2026 is HELD OUT and
//  must not be looked at until a hypothesis is pre-registered.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const all = JSON.parse(fs.readFileSync(dataPath('xauusd_m15.json')));

const IS_END = Date.UTC(2025, 0, 1);
const bars = all.filter(b => b.timestamp < IS_END);
console.log(`IN-SAMPLE bars: ${bars.length}  (${new Date(bars[0].timestamp).toISOString().slice(0,10)} -> ${new Date(bars[bars.length-1].timestamp).toISOString().slice(0,10)})`);
console.log(`HELD OUT (untouched): ${all.length - bars.length} bars\n`);

const close = bars.map(b => b.close);
const ret = close.map((c, i) => i ? Math.log(c / close[i - 1]) : 0);

// ---------- 1. AUTOCORRELATION: trending or mean-reverting? ----------
function acf(x, lag) {
  const n = x.length - lag;
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) num += (x[i] - m) * (x[i + lag] - m);
  for (let i = 0; i < x.length; i++) den += (x[i] - m) ** 2;
  return num / den;
}
console.log('--- 1. RETURN AUTOCORRELATION (15m bars) ---');
console.log('   positive = trending/momentum, negative = mean-reverting');
const se = 1 / Math.sqrt(ret.length);           // ~std error of acf under white noise
for (const L of [1, 2, 3, 5, 10, 20]) {
  const a = acf(ret, L);
  const sig = Math.abs(a) > 2 * se ? '  <-- significant' : '';
  console.log(`   lag ${String(L).padStart(2)}: ${a.toFixed(5)}   (2*SE = ${(2*se).toFixed(5)})${sig}`);
}

// ---------- 2. MULTI-HORIZON: does momentum or reversion pay? ----------
// Signal: sum of past L returns. Measure avg forward return over H bars.
console.log('\n--- 2. MOMENTUM vs MEAN-REVERSION PAYOFF ---');
console.log('   avg forward return (bps) after a STRONG UP move of L bars');
for (const L of [4, 8, 16, 32]) {
  const row = [];
  for (const H of [4, 16, 48]) {
    let up = [], dn = [];
    for (let i = L; i < ret.length - H; i++) {
      let past = 0; for (let j = 0; j < L; j++) past += ret[i - j];
      let fwd = 0; for (let j = 1; j <= H; j++) fwd += ret[i + j];
      if (past > 0) up.push(fwd); else dn.push(fwd);
    }
    const mu = a => a.reduce((x, y) => x + y, 0) / a.length * 1e4;
    const t = a => { const m = a.reduce((x,y)=>x+y,0)/a.length; const sd = Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length); return m/(sd/Math.sqrt(a.length)); };
    row.push(`H=${String(H).padStart(2)}: up${mu(up).toFixed(2).padStart(6)}(t${t(up).toFixed(1)}) dn${mu(dn).toFixed(2).padStart(6)}(t${t(dn).toFixed(1)})`);
  }
  console.log(`   L=${String(L).padStart(2)}  ${row.join('  |  ')}`);
}

// ---------- 3. SESSION / HOUR EFFECTS ----------
console.log('\n--- 3. BY UTC HOUR: volatility & drift ---');
const byH = Array.from({ length: 24 }, () => ({ r: [], rng: [] }));
for (let i = 1; i < bars.length; i++) {
  const h = new Date(bars[i].timestamp).getUTCHours();
  byH[h].r.push(ret[i]);
  byH[h].rng.push(bars[i].high - bars[i].low);
}
console.log('   hour |  avg range($) | drift(bps) |   t');
for (let h = 0; h < 24; h++) {
  const r = byH[h].r, g = byH[h].rng;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  const t = m / (sd / Math.sqrt(r.length));
  const rng = g.reduce((a, b) => a + b, 0) / g.length;
  const mark = Math.abs(t) > 2 ? ' *' : '';
  console.log(`   ${String(h).padStart(4)} | ${rng.toFixed(3).padStart(12)} | ${(m*1e4).toFixed(2).padStart(9)} | ${t.toFixed(2).padStart(5)}${mark}`);
}

// ---------- 4. EXCURSION PROFILE: what stop/target geometry is viable? ----------
// From a random bar, how far does price run FOR vs AGAINST within H bars?
console.log('\n--- 4. EXCURSION PROFILE (informs stop/target sizing) ---');
function atr14() {
  const tr = bars.map((x, i) => i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - bars[i-1].close), Math.abs(x.low - bars[i-1].close)));
  const out = []; let s = 0;
  for (let i = 0; i < tr.length; i++) { if (i < 14) { s += tr[i]; out.push(i === 13 ? s/14 : NaN); } else out.push((out[i-1]*13 + tr[i])/14); }
  return out;
}
const atr = atr14();
console.log('   H bars | median MFE/ATR | median MAE/ATR | P(hit 1R before -1R) for R=1xATR');
for (const H of [8, 16, 32, 64]) {
  const mfe = [], mae = []; let winFirst = 0, tot = 0;
  for (let i = 100; i < bars.length - H; i += 7) {
    const a = atr[i]; if (!isFinite(a) || a <= 0) continue;
    const e = bars[i].close;
    let hi = -Infinity, lo = Infinity, hit = 0;
    for (let j = 1; j <= H; j++) {
      hi = Math.max(hi, bars[i+j].high); lo = Math.min(lo, bars[i+j].low);
      if (!hit) { if (bars[i+j].low <= e - a) hit = -1; else if (bars[i+j].high >= e + a) hit = 1; }
    }
    mfe.push((hi - e) / a); mae.push((e - lo) / a);
    if (hit === 1) winFirst++; if (hit !== 0) tot++;
  }
  const med = arr => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(`   ${String(H).padStart(6)} | ${med(mfe).toFixed(3).padStart(14)} | ${med(mae).toFixed(3).padStart(14)} | ${(winFirst/tot*100).toFixed(1)}%`);
}
console.log('\n(Note: P(hit +1R first) near 50% = no directional edge from a random entry — as expected.)');
