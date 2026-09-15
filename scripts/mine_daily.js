// =====================================================================
//  PATTERN MINER: DAILY XAUUSD 2003-2026
//  Honest protocol:
//   TRAIN    2003-2016  (search here)
//   VALIDATE 2017-2021  (survivors must repeat here, blind)
//   VAULT    2022-2026  (one-shot final test, only for double-survivors)
//  Multiple-testing bar: with ~90 tests, max|t| under pure noise ~3.3.
//  Survival requires TRAIN |t| >= 3.3 AND VALIDATE same-sign |t| >= 2.0.
//  Forward returns are ATR-normalised; 5d-horizon fires de-overlapped.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const bars = JSON.parse(fs.readFileSync(dataPath('xauusd_d1.json')));
const n = bars.length;
const C = bars.map(b => b.close), O = bars.map(b => b.open), H = bars.map(b => b.high), L = bars.map(b => b.low), T = bars.map(b => b.timestamp);
const ret = C.map((c, i) => i ? Math.log(c / C[i - 1]) : 0);

// --- indicators ---
const tr = bars.map((b, i) => i ? Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])) : H[i] - L[i]);
const atr = []; { let s = 0; for (let i = 0; i < n; i++) { if (i < 14) { s += tr[i]; atr.push(i === 13 ? s / 14 : NaN); } else atr.push((atr[i - 1] * 13 + tr[i]) / 14); } }
const ma200 = []; { let s = 0; for (let i = 0; i < n; i++) { s += C[i]; if (i >= 200) s -= C[i - 200]; ma200.push(i >= 199 ? s / 200 : NaN); } }
const rsi = []; { let ag = 0, al = 0; for (let i = 0; i < n; i++) { const ch = i ? C[i] - C[i - 1] : 0, g = Math.max(ch, 0), l = Math.max(-ch, 0); if (i < 14) { ag += g / 14; al += l / 14; rsi.push(NaN); } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al)); } } }
const rv20 = []; for (let i = 0; i < n; i++) { if (i < 20) { rv20.push(NaN); continue; } const w = ret.slice(i - 19, i + 1); const m = w.reduce((a, b) => a + b) / 20; rv20.push(Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20)); }
const rvRank = []; for (let i = 0; i < n; i++) { if (i < 272) { rvRank.push(NaN); continue; } const w = rv20.slice(i - 251, i + 1).filter(isFinite); rvRank.push(w.filter(x => x <= rv20[i]).length / w.length); }

function streak(i, dir) { let s = 0; for (let j = i; j > 0 && Math.sign(ret[j]) === dir; j--) s++; return s; }

// --- feature library (each: name + predicate at close of day i) ---
const F = [];
const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
for (let d = 1; d <= 5; d++) F.push([`DOW=${dow[d]}`, i => new Date(T[i]).getUTCDay() === d]);
for (let m = 0; m < 12; m++) F.push([`MONTH=${m + 1}`, i => new Date(T[i]).getUTCMonth() === m]);
for (const s of [2, 3, 4, 5]) F.push([`UP_STREAK>=${s}`, i => streak(i, 1) >= s]);
for (const s of [2, 3, 4, 5]) F.push([`DN_STREAK>=${s}`, i => streak(i, -1) >= s]);
F.push(['NR7 (tightest range of 7)', i => { for (let j = i - 6; j < i; j++) if (H[j] - L[j] <= H[i] - L[i]) return false; return true; }]);
F.push(['WR7 (widest range of 7)', i => { for (let j = i - 6; j < i; j++) if (H[j] - L[j] >= H[i] - L[i]) return false; return true; }]);
F.push(['INSIDE_DAY', i => H[i] < H[i - 1] && L[i] > L[i - 1]]);
F.push(['OUTSIDE_DAY', i => H[i] > H[i - 1] && L[i] < L[i - 1]]);
F.push(['CLOSE_TOP20%', i => (C[i] - L[i]) / Math.max(H[i] - L[i], 1e-9) > 0.8]);
F.push(['CLOSE_BOT20%', i => (C[i] - L[i]) / Math.max(H[i] - L[i], 1e-9) < 0.2]);
F.push(['GAP_UP>0.3ATR', i => O[i] - C[i - 1] > 0.3 * atr[i]]);
F.push(['GAP_DN>0.3ATR', i => C[i - 1] - O[i] > 0.3 * atr[i]]);
F.push(['EXT>2ATR_ABOVE_MA200', i => C[i] - ma200[i] > 2 * atr[i] * 5]);
F.push(['EXT>2ATR_BELOW_MA200', i => ma200[i] - C[i] > 2 * atr[i] * 5]);
F.push(['ABOVE_MA200', i => C[i] > ma200[i]]);
F.push(['BELOW_MA200', i => C[i] < ma200[i]]);
F.push(['RSI<30', i => rsi[i] < 30]);
F.push(['RSI>70', i => rsi[i] > 70]);
F.push(['RSI<20', i => rsi[i] < 20]);
F.push(['RSI>80', i => rsi[i] > 80]);
F.push(['VOL_Q4 (rvRank>0.75)', i => rvRank[i] > 0.75]);
F.push(['VOL_Q1 (rvRank<0.25)', i => rvRank[i] < 0.25]);
F.push(['NEW_20D_HIGH_CLOSE', i => { for (let j = i - 20; j < i; j++) if (C[j] >= C[i]) return false; return true; }]);
F.push(['NEW_20D_LOW_CLOSE', i => { for (let j = i - 20; j < i; j++) if (C[j] <= C[i]) return false; return true; }]);
F.push(['BIG_UP>2ATR', i => C[i] - C[i - 1] > 2 * atr[i]]);
F.push(['BIG_DN>2ATR', i => C[i - 1] - C[i] > 2 * atr[i]]);
F.push(['REV_DAY_UP (new20L then close top20%)', i => { let nl = true; for (let j = i - 20; j < i; j++) if (L[j] <= L[i]) { nl = false; break; } return nl && (C[i] - L[i]) / Math.max(H[i] - L[i], 1e-9) > 0.8; }]);
F.push(['REV_DAY_DN (new20H then close bot20%)', i => { let nh = true; for (let j = i - 20; j < i; j++) if (H[j] >= H[i]) { nh = false; break; } return nh && (C[i] - L[i]) / Math.max(H[i] - L[i], 1e-9) < 0.2; }]);

const HORIZONS = [1, 5];
const SPLITS = {
  TRAIN:    [Date.UTC(2003, 0, 1), Date.UTC(2017, 0, 1)],
  VALIDATE: [Date.UTC(2017, 0, 1), Date.UTC(2022, 0, 1)],
  VAULT:    [Date.UTC(2022, 0, 1), Infinity],
};

function testFeature(pred, h, [a, b]) {
  const xs = []; let lastFire = -1e9;
  for (let i = 300; i < n - h; i++) {
    if (T[i] < a || T[i] >= b) continue;
    if (!pred(i)) continue;
    if (i - lastFire < h) continue;               // de-overlap
    lastFire = i;
    let f = 0; for (let j = 1; j <= h; j++) f += ret[i + j];
    xs.push(f / (atr[i] / C[i]));                 // ATR-normalised fwd return
  }
  if (xs.length < 30) return null;
  const m = xs.reduce((x, y) => x + y, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((x, y) => x + (y - m) ** 2, 0) / (xs.length - 1));
  return { n: xs.length, mean: m, t: m / (sd / Math.sqrt(xs.length)) };
}

let tests = 0; const candidates = [];
for (const [name, pred] of F) for (const h of HORIZONS) {
  tests++;
  const tr_ = testFeature(pred, h, SPLITS.TRAIN);
  if (!tr_) continue;
  if (Math.abs(tr_.t) >= 3.3) candidates.push({ name, h, train: tr_ });
}
console.log(`features=${F.length}  horizons=${HORIZONS.length}  TOTAL TESTS=${tests}`);
console.log(`noise-expected max|t| across ${tests} tests ~ ${Math.sqrt(2 * Math.log(tests)).toFixed(2)}`);
console.log(`TRAIN survivors (|t|>=3.3): ${candidates.length}\n`);

for (const c of candidates) {
  const v = testFeature(F.find(f => f[0] === c.name)[1], c.h, SPLITS.VALIDATE);
  const pass = v && Math.sign(v.mean) === Math.sign(c.train.mean) && Math.abs(v.t) >= 2.0;
  console.log(`${c.name}  h=${c.h}d`);
  console.log(`   TRAIN 03-16: n=${c.train.n} mean=${c.train.mean.toFixed(3)}ATR t=${c.train.t.toFixed(2)}`);
  console.log(`   VALID 17-21: ${v ? `n=${v.n} mean=${v.mean.toFixed(3)}ATR t=${v.t.toFixed(2)}` : 'insufficient n'}  -> ${pass ? '*** SURVIVES -> VAULT-ELIGIBLE ***' : 'DIES'}`);
  if (pass) {
    const vault = testFeature(F.find(f => f[0] === c.name)[1], c.h, SPLITS.VAULT);
    console.log(`   VAULT 22-26 (one-shot): ${vault ? `n=${vault.n} mean=${vault.mean.toFixed(3)}ATR t=${vault.t.toFixed(2)}` : 'insufficient n'}`);
  }
}
if (!candidates.length) console.log('No TRAIN survivors at the corrected bar. That is a valid result: 23y of daily gold contains no simple calendar/price-shape edge of this class.');
