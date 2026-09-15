// =====================================================================
//  VOLATILITY PREDICTABILITY: the one structure finance says IS forecastable
//  Data: 15m bars -> daily realized volatility (RV). In-sample 2021-24.
//  Tests: 1) RV autocorrelation  2) next-day RV forecast R^2
//         3) high/low vol regime persistence  4) practical size/stop table
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const all = JSON.parse(fs.readFileSync(dataPath('xauusd_m15.json')));
const IS = all.filter(b => b.timestamp < Date.UTC(2025, 0, 1));

// daily realized vol from 15m returns
const days = new Map();
let prevC = null;
for (const b of IS) {
  const d = new Date(b.timestamp).toISOString().slice(0, 10);
  if (!days.has(d)) days.set(d, { ss: 0, n: 0, range: 0, hi: -Infinity, lo: Infinity });
  const o = days.get(d);
  if (prevC) { const r = Math.log(b.close / prevC); o.ss += r * r; o.n++; }
  o.hi = Math.max(o.hi, b.high); o.lo = Math.min(o.lo, b.low);
  prevC = b.close;
}
const list = [...days.entries()].filter(([, v]) => v.n >= 60)
  .map(([d, v]) => ({ d, rv: Math.sqrt(v.ss) * 1e4, range: v.hi - v.lo }));  // rv in bps
console.log(`days: ${list.length}  (need >=60 15m bars/day)`);

const rv = list.map(x => x.rv);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const mu = mean(rv);

// 1) autocorrelation of RV
function acf(x, lag) {
  const m = mean(x); let num = 0, den = 0;
  for (let i = 0; i < x.length - lag; i++) num += (x[i] - m) * (x[i + lag] - m);
  for (let i = 0; i < x.length; i++) den += (x[i] - m) ** 2;
  return num / den;
}
console.log('\n--- RV autocorrelation (vs 2SE=' + (2 / Math.sqrt(rv.length)).toFixed(3) + ') ---');
for (const L of [1, 2, 3, 5, 10, 20]) console.log(`  lag ${String(L).padStart(2)}: ${acf(rv, L).toFixed(3)}`);

// 2) forecast R^2: predict RV_t+1 with EWMA(RV) vs naive mean
let ew = rv[0]; const lam = 0.8; let sseF = 0, sseM = 0;
for (let i = 0; i < rv.length - 1; i++) {
  if (i > 10) { sseF += (rv[i + 1] - ew) ** 2; sseM += (rv[i + 1] - mu) ** 2; }
  ew = lam * ew + (1 - lam) * rv[i];
}
console.log(`\nEWMA(0.8) next-day RV forecast R^2 = ${(1 - sseF / sseM).toFixed(3)}  (0 = useless, 1 = perfect)`);

// 3) regime persistence
const q = [...rv].sort((a, b) => a - b);
const hi = q[Math.floor(q.length * 0.75)], lo = q[Math.floor(q.length * 0.25)];
let hh = 0, hn = 0, ll = 0, ln = 0;
for (let i = 0; i < rv.length - 1; i++) {
  if (rv[i] >= hi) { hn++; if (rv[i + 1] >= hi) hh++; }
  if (rv[i] <= lo) { ln++; if (rv[i + 1] <= lo) ll++; }
}
console.log(`\nP(high-vol day follows high-vol day) = ${(hh / hn * 100).toFixed(0)}%   (base rate 25%)`);
console.log(`P(low-vol day follows low-vol day)   = ${(ll / ln * 100).toFixed(0)}%   (base rate 25%)`);

// 4) practical table: today's ATR percentile -> tomorrow's expected $ range
const byBucket = [[], [], [], []];
for (let i = 0; i < list.length - 1; i++) {
  const r = list[i].rv;
  const b = r <= lo ? 0 : r >= hi ? 3 : (r < q[Math.floor(q.length * 0.5)] ? 1 : 2);
  byBucket[b].push(list[i + 1].range);
}
const names = ['Q1 quiet', 'Q2', 'Q3', 'Q4 wild'];
console.log('\n--- today\'s vol quartile -> TOMORROW\'s median day range ($) ---');
byBucket.forEach((a, i) => {
  const s = [...a].sort((x, y) => x - y);
  console.log(`  ${names[i].padEnd(9)} n=${String(a.length).padStart(4)}  median $${s[Math.floor(s.length / 2)].toFixed(1)}  p80 $${s[Math.floor(s.length * 0.8)].toFixed(1)}`);
});
