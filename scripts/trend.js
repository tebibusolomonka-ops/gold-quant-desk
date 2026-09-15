// =====================================================================
//  DAILY TREND-FOLLOWING TEST — XAUUSD 2003-2026 (23.5y, 7324 bars)
//  PRE-REGISTERED params from decades of literature (NO tuning):
//   A) TSMOM-252  : long if close > close 252d ago, else SHORT (Moskowitz et al.)
//   B) TSMOM-252LF: same but long/FLAT
//   C) MA 50/200  : long if MA50>MA200 else short
//   D) Donchian 55/20 (Turtle Sys2): long 55d-high break, exit 20d-low; mirrored
//  Execution: signal at close t -> position for t+1 (no look-ahead).
//  Cost: 0.30/oz on each position CHANGE.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const bars = JSON.parse(fs.readFileSync(dataPath('xauusd_d1.json')));
const C = bars.map(b => b.close), H = bars.map(b => b.high), L = bars.map(b => b.low);
const T = bars.map(b => b.timestamp);
const ret = C.map((c, i) => i ? Math.log(c / C[i - 1]) : 0);
const SPREAD = 0.30;

function sma(a, n) { const o = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
const ma50 = sma(C, 50), ma200 = sma(C, 200);

function hh(a, n, i) { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, a[j]); return m; }
function ll(a, n, i) { let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, a[j]); return m; }

function evaluate(name, posFn) {
  const pos = new Array(C.length).fill(0);
  let p = 0;
  for (let i = 260; i < C.length - 1; i++) { p = posFn(i, p); pos[i] = p; }
  const stratRet = [];
  let eq = 0, peak = 0, dd = 0, switches = 0;
  for (let i = 261; i < C.length; i++) {
    let r = pos[i - 1] * ret[i];
    if (pos[i] !== pos[i - 1]) { r -= Math.abs(pos[i] - pos[i - 1]) * SPREAD / C[i]; switches++; }
    stratRet.push(r);
    eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
  }
  const n = stratRet.length, mean = stratRet.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(stratRet.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const annRet = mean * 252 * 100, annSh = mean / sd * Math.sqrt(252), t = mean / (sd / Math.sqrt(n));
  // era breakdown
  const eras = { '2003-12': [0, Date.UTC(2013, 0, 1)], '2013-19': [Date.UTC(2013, 0, 1), Date.UTC(2020, 0, 1)], '2020-26': [Date.UTC(2020, 0, 1), Infinity] };
  let eraStr = '';
  for (const [k, [a, b]] of Object.entries(eras)) {
    const rs = [];
    for (let i = 261; i < C.length; i++) if (T[i] >= a && T[i] < b) {
      let r = pos[i - 1] * ret[i];
      if (pos[i] !== pos[i - 1]) r -= Math.abs(pos[i] - pos[i - 1]) * SPREAD / C[i];
      rs.push(r);
    }
    const m = rs.reduce((x, y) => x + y, 0) / rs.length;
    const s = Math.sqrt(rs.reduce((x, y) => x + (y - m) ** 2, 0) / (rs.length - 1));
    eraStr += `  ${k}: ${(m * 252 * 100).toFixed(1)}%/y Sh ${(m / s * Math.sqrt(252)).toFixed(2)}`;
  }
  console.log(`${name.padEnd(14)} ann ${annRet.toFixed(1).padStart(6)}%  Sharpe ${annSh.toFixed(2).padStart(5)}  t ${t.toFixed(2).padStart(5)}  maxDD ${(dd * 100).toFixed(0).padStart(3)}%  switches ${String(switches).padStart(4)} |${eraStr}`);
}

console.log(`bars=${C.length}  ${new Date(T[0]).toISOString().slice(0,10)} -> ${new Date(T[T.length-1]).toISOString().slice(0,10)}\n`);

// Buy & hold baseline
evaluate('BUY&HOLD', () => 1);
// A) TSMOM 252 long/short
evaluate('TSMOM-252 L/S', (i) => C[i] > C[i - 252] ? 1 : -1);
// B) TSMOM 252 long/flat
evaluate('TSMOM-252 L/F', (i) => C[i] > C[i - 252] ? 1 : 0);
// C) MA 50/200 long/short
evaluate('MA50/200 L/S', (i) => isNaN(ma200[i]) ? 0 : (ma50[i] > ma200[i] ? 1 : -1));
// D) Donchian 55/20 stop-and-reverse-ish (state machine)
evaluate('DONCH 55/20', (i, p) => {
  if (p === 0) { if (C[i] > hh(H, 55, i)) return 1; if (C[i] < ll(L, 55, i)) return -1; return 0; }
  if (p === 1) { if (C[i] < ll(L, 20, i)) return C[i] < ll(L, 55, i) ? -1 : 0; return 1; }
  if (C[i] > hh(H, 20, i)) return C[i] > hh(H, 55, i) ? 1 : 0; return -1;
});
