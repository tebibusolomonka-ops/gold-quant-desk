// =====================================================================
//  NON-OVERLAPPING momentum test — corrects the inflated t-stats in eda.js
//  Overlapping forward windows violate independence and inflate t by ~sqrt(H).
//  Here each observation uses a DISJOINT forward window.
//  IN-SAMPLE ONLY (2021-2024). 2025-26 remains held out.
// =====================================================================
const fs = require('fs');
const dataPath = require('./_data');
const all = JSON.parse(fs.readFileSync(dataPath('xauusd_m15.json')));
const bars = all.filter(b => b.timestamp < Date.UTC(2025, 0, 1));
const close = bars.map(b => b.close);
const ret = close.map((c, i) => i ? Math.log(c / close[i - 1]) : 0);

function tstat(a) {
  const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1));
  return { n, mean: m * 1e4, t: m / (sd / Math.sqrt(n)) };
}

console.log('=== NON-OVERLAPPING forward windows (disjoint) ===');
console.log('Q: after L bars of up/down momentum, what is the NEXT H-bar return?\n');
console.log(' L   H |  after UP: n / bps / t   |  after DOWN: n / bps / t  | LONG-SHORT spread');
for (const L of [8, 16, 32]) {
  for (const H of [16, 48, 96]) {
    const up = [], dn = [];
    for (let i = L; i + H < ret.length; i += H) {       // step by H = disjoint
      let past = 0; for (let j = 0; j < L; j++) past += ret[i - j];
      let fwd = 0;  for (let j = 1; j <= H; j++) fwd += ret[i + j];
      (past > 0 ? up : dn).push(fwd);
    }
    const u = tstat(up), d = tstat(dn);
    // long-after-up minus long-after-down = the momentum spread
    const spread = u.mean - d.mean;
    console.log(`${String(L).padStart(2)} ${String(H).padStart(3)} | ${String(u.n).padStart(5)} ${u.mean.toFixed(2).padStart(7)} ${u.t.toFixed(2).padStart(6)} | ${String(d.n).padStart(5)} ${d.mean.toFixed(2).padStart(7)} ${d.t.toFixed(2).padStart(6)} | ${spread.toFixed(2).padStart(7)} bps`);
  }
}

console.log('\n=== DETRENDED: is momentum real, or just the 2021-24 gold bull run? ===');
console.log('Subtracting the sample mean return removes overall drift.\n');
const mu = ret.reduce((a, b) => a + b, 0) / ret.length;
console.log(` L   H |  UP-excess bps / t   |  DOWN-excess bps / t`);
for (const L of [8, 16, 32]) {
  for (const H of [48, 96]) {
    const up = [], dn = [];
    for (let i = L; i + H < ret.length; i += H) {
      let past = 0; for (let j = 0; j < L; j++) past += ret[i - j];
      let fwd = 0;  for (let j = 1; j <= H; j++) fwd += (ret[i + j] - mu);   // detrended
      (past > 0 ? up : dn).push(fwd);
    }
    const u = tstat(up), d = tstat(dn);
    console.log(`${String(L).padStart(2)} ${String(H).padStart(3)} | ${u.mean.toFixed(2).padStart(8)} ${u.t.toFixed(2).padStart(6)} | ${d.mean.toFixed(2).padStart(8)} ${d.t.toFixed(2).padStart(6)}`);
  }
}

console.log('\n=== BUY-AND-HOLD baseline (what any strategy must beat) ===');
const totalR = ret.reduce((a, b) => a + b, 0);
const years = (bars[bars.length-1].timestamp - bars[0].timestamp) / (365.25*24*3600*1000);
console.log(`gold in-sample: ${(Math.exp(totalR)-1)*100 >= 0 ? '+' : ''}${((Math.exp(totalR)-1)*100).toFixed(1)}% over ${years.toFixed(2)}y = ${(((Math.exp(totalR))**(1/years)-1)*100).toFixed(1)}%/yr`);
console.log('-> any "edge" that merely stays long in a bull market is NOT an edge.');
