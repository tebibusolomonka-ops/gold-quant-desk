// =====================================================================
//  PATTERN MINER — 15m XAUUSD intraday conditioning
//  TRAIN 2021-2023 · VALIDATE 2024 · VAULT 2025-26 (one-shot)
//  Tests: hour-of-day × prior-hour direction -> forward 8 bars (2h), ATR-norm.
//  Bar: |t|>=3.3 train, same-sign |t|>=2.0 validate.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const bars = JSON.parse(fs.readFileSync(dataPath('xauusd_m15.json')));
const n = bars.length;
const C = bars.map(b => b.close), H = bars.map(b => b.high), L = bars.map(b => b.low), T = bars.map(b => b.timestamp);
const ret = C.map((c, i) => i ? Math.log(c / C[i - 1]) : 0);
const tr = bars.map((b, i) => i ? Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])) : H[i] - L[i]);
const atr = []; { let s = 0; for (let i = 0; i < n; i++) { if (i < 14) { s += tr[i]; atr.push(i === 13 ? s / 14 : NaN); } else atr.push((atr[i - 1] * 13 + tr[i]) / 14); } }

const SPLITS = {
  TRAIN:    [Date.UTC(2021, 0, 1), Date.UTC(2024, 0, 1)],
  VALIDATE: [Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)],
  VAULT:    [Date.UTC(2025, 0, 1), Infinity],
};
const HFWD = 8; // 2 hours forward

function test(pred, [a, b]) {
  const xs = []; let last = -1e9;
  for (let i = 30; i < n - HFWD; i++) {
    if (T[i] < a || T[i] >= b) continue;
    if (!pred(i)) continue;
    if (i - last < HFWD) continue;
    last = i;
    let f = 0; for (let j = 1; j <= HFWD; j++) f += ret[i + j];
    xs.push(f / (atr[i] / C[i]));
  }
  if (xs.length < 30) return null;
  const m = xs.reduce((x, y) => x + y, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((x, y) => x + (y - m) ** 2, 0) / (xs.length - 1));
  return { n: xs.length, mean: m, t: m / (sd / Math.sqrt(xs.length)) };
}

const F = [];
for (let h = 0; h < 24; h++) {
  F.push([`H${h}_afterUP`, i => new Date(T[i]).getUTCHours() === h && ret.slice(i - 3, i + 1).reduce((a, b) => a + b) > 0]);
  F.push([`H${h}_afterDN`, i => new Date(T[i]).getUTCHours() === h && ret.slice(i - 3, i + 1).reduce((a, b) => a + b) < 0]);
}
// day-of-week intraday variants of the Friday finding
F.push(['FRI_00UTC_open', i => { const d = new Date(T[i]); return d.getUTCDay() === 5 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0; }]);
F.push(['THU_20UTC (pre-Friday hold)', i => { const d = new Date(T[i]); return d.getUTCDay() === 4 && d.getUTCHours() === 20 && d.getUTCMinutes() === 0; }]);

let tests = 0; const cands = [];
for (const [name, pred] of F) {
  tests++;
  const t_ = test(pred, SPLITS.TRAIN);
  if (t_ && Math.abs(t_.t) >= 3.3) cands.push({ name, pred, train: t_ });
}
console.log(`TOTAL TESTS=${tests}  noise-expected max|t| ≈ ${Math.sqrt(2 * Math.log(tests)).toFixed(2)}`);
console.log(`TRAIN survivors (|t|>=3.3): ${cands.length}\n`);
for (const c of cands) {
  const v = test(c.pred, SPLITS.VALIDATE);
  const pass = v && Math.sign(v.mean) === Math.sign(c.train.mean) && Math.abs(v.t) >= 2.0;
  console.log(`${c.name}: TRAIN n=${c.train.n} mean=${c.train.mean.toFixed(3)} t=${c.train.t.toFixed(2)} | VALID ${v ? `n=${v.n} mean=${v.mean.toFixed(3)} t=${v.t.toFixed(2)}` : 'n<30'} -> ${pass ? '*** SURVIVES ***' : 'DIES'}`);
  if (pass) {
    const vault = test(c.pred, SPLITS.VAULT);
    console.log(`   VAULT one-shot: ${vault ? `n=${vault.n} mean=${vault.mean.toFixed(3)} t=${vault.t.toFixed(2)}` : 'n<30'}`);
  }
}
if (!cands.length) console.log('No intraday conditioning survived the corrected bar on TRAIN.');
