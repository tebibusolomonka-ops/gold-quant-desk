// =====================================================================
//  REPRODUCTION TESTS
//  The claim this repository makes is that its numbers hold up. These
//  tests are that claim, executable. If a change to the engine moves a
//  published result, this fails.
//
//  Pinned against the committed 2021 sample (23,626 bars) and the full
//  committed daily series (7,324 bars). Full-history numbers quoted in
//  the README require `npm run fetch` and are checked separately.
// =====================================================================
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { run, stats, P } = require('../scripts/engine.js');

const ROOT = path.join(__dirname, '..');
const SAMPLE = path.join(ROOT, 'data', 'xauusd_m15_2021_sample.json');
const DAILY = path.join(ROOT, 'data', 'xauusd_d1.json');
const FULL = path.join(ROOT, 'data', 'xauusd_m15.json');

const bars = JSON.parse(fs.readFileSync(SAMPLE));
const near = (a, b, dp = 4) => assert.strictEqual(+a.toFixed(dp), +b.toFixed(dp),
  `expected ${b.toFixed(dp)}, got ${a.toFixed(dp)}`);

// ---------------------------------------------------------------------
//  Data integrity: a moved dataset invalidates every pinned number
// ---------------------------------------------------------------------
test('sample dataset is intact', () => {
  assert.strictEqual(bars.length, 23626);
  assert.strictEqual(new Date(bars[0].timestamp).toISOString().slice(0, 10), '2021-01-03');
  assert.strictEqual(new Date(bars.at(-1).timestamp).toISOString().slice(0, 10), '2021-12-31');
  for (let i = 1; i < bars.length; i++) {
    assert.ok(bars[i].timestamp > bars[i - 1].timestamp, `timestamps not monotonic at ${i}`);
  }
  const spacings = new Set();
  for (let i = 1; i < 500; i++) spacings.add(bars[i].timestamp - bars[i - 1].timestamp);
  assert.ok(spacings.has(900000), '15-minute bars expected (900000 ms)');
});

test('daily dataset is intact', () => {
  const d = JSON.parse(fs.readFileSync(DAILY));
  assert.strictEqual(d.length, 7324);
  assert.strictEqual(new Date(d[0].timestamp).toISOString().slice(0, 10), '2003-01-02');
  assert.strictEqual(new Date(d.at(-1).timestamp).toISOString().slice(0, 10), '2026-07-24');
});

// ---------------------------------------------------------------------
//  The kill result: the strategy loses, on the sample as on the whole
// ---------------------------------------------------------------------
const CASES = [
  {
    name: 'baseline PIVOT, one position at a time',
    cfg: { flatOnly: true },
    n: 379, expectancyR: -0.209311, profitFactor: 0.668110, tStat: -3.444900, winRate: 0.440633,
  },
  {
    name: 'baseline PIVOT, overlapping',
    cfg: {},
    n: 500, expectancyR: -0.157214, profitFactor: 0.736532, tStat: -2.994310, winRate: 0.466000,
  },
  {
    name: 'SESSION levels',
    cfg: { flatOnly: true, levelMode: 'SESSION' },
    n: 388, expectancyR: -0.128818, profitFactor: 0.775543, tStat: -2.331367, winRate: 0.484536,
  },
  {
    name: 'zero costs: the edge is not merely eaten by spread',
    cfg: { flatOnly: true, spread: 0 },
    n: 379, expectancyR: -0.090559, profitFactor: 0.838104, tStat: -1.496994, winRate: 0.440633,
  },
];

for (const c of CASES) {
  test(`engine reproduces: ${c.name}`, () => {
    const s = stats(run(bars, { ...P, ...c.cfg }).trades);
    assert.strictEqual(s.n, c.n);
    near(s.expectancyR, c.expectancyR);
    near(s.profitFactor, c.profitFactor);
    near(s.tStat, c.tStat);
    near(s.winRate, c.winRate);
    assert.ok(s.expectancyR < 0, 'expectancy must be negative; this strategy loses');
  });
}

test('SESSION levels beat arbitrary PIVOTs: the one surviving piece of the theory', () => {
  const pivot = stats(run(bars, { ...P, flatOnly: true, spread: 0 }).trades);
  const session = stats(run(bars, { ...P, flatOnly: true, spread: 0, levelMode: 'SESSION' }).trades);
  assert.ok(session.expectancyR > pivot.expectancyR,
    `session (${session.expectancyR.toFixed(4)}) should beat pivot (${pivot.expectancyR.toFixed(4)})`);
});

test('K-sweep shows no decay structure: the pre-registered prediction failed', () => {
  const ks = [1, 2, 3, 4, 5].map(K => stats(run(bars, { ...P, flatOnly: true, K }).trades).expectancyR);
  for (const e of ks) assert.ok(e < 0, `every K must be negative, saw ${e.toFixed(4)}`);
  const monotonicDecay = ks.every((e, i) => i === 0 || e <= ks[i - 1]);
  assert.ok(!monotonicDecay, 'prediction was monotonic decay in K; it must not hold');
});

// ---------------------------------------------------------------------
//  Engine bias control: if random entries are not 50-50, nothing above
//  can be trusted
// ---------------------------------------------------------------------
test('random entries hit +1R before -1R about half the time', () => {
  let seed = 20260726;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const R = 3.3; // the measured average R, in price points
  let hits = 0, total = 0;
  for (let k = 0; k < 4000; k++) {
    const i = 100 + Math.floor(rnd() * (bars.length - 400));
    const dir = rnd() < 0.5 ? 1 : -1;
    const entry = bars[i].close;
    const tp = entry + dir * R, sl = entry - dir * R;
    for (let j = i + 1; j < Math.min(i + 64, bars.length); j++) {
      const hitSL = dir > 0 ? bars[j].low <= sl : bars[j].high >= sl;
      const hitTP = dir > 0 ? bars[j].high >= tp : bars[j].low <= tp;
      if (hitSL || hitTP) { total++; if (hitTP && !hitSL) hits++; break; }
    }
  }
  const rate = hits / total;
  assert.ok(rate > 0.45 && rate < 0.55,
    `expected roughly 50% with no directional edge, got ${(rate * 100).toFixed(1)}%`);
});

// ---------------------------------------------------------------------
//  The one survivor
// ---------------------------------------------------------------------
test('end-of-week long tilt reproduces on 23.5 years of daily data', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'friday.js')],
    { encoding: 'utf8' });
  const m = out.match(/n=(\d+)\s+Fridays\s+mean=([+-][\d.]+)\s+ATR\s+t=([\d.]+)/);
  assert.ok(m, `could not parse friday.js output:\n${out}`);
  assert.strictEqual(+m[1], 1157);
  near(+m[2], 0.0784, 4);
  near(+m[3], 3.34, 2);
  const yrs = out.match(/positive Friday mean:\s*(\d+)\/(\d+)/);
  assert.ok(yrs, 'expected a per-year consistency line');
  assert.strictEqual(`${yrs[1]}/${yrs[2]}`, '19/23');
});

// ---------------------------------------------------------------------
//  Full history: only when the 14 MB dataset has been fetched
// ---------------------------------------------------------------------
// The published figures describe a specific window. Bound the test to that
// window rather than to the whole file, so refreshing the dataset with newer
// bars extends the data without invalidating the reproduction. A pinned
// number should be pinned to the period it describes, not to a file length.
const PUBLISHED_END = Date.UTC(2026, 6, 25); // 2026-07-25, exclusive

test('published window reproduces the kill result', { skip: !fs.existsSync(FULL) }, () => {
  const full = JSON.parse(fs.readFileSync(FULL))
    .filter(b => b.timestamp < PUBLISHED_END);
  assert.strictEqual(full.length, 131469,
    'the published window must contain exactly the bars the README describes');
  const s = stats(run(full, { ...P, flatOnly: true }).trades);
  assert.strictEqual(s.n, 1953);
  near(s.expectancyR, -0.1592, 4);
  near(s.profitFactor, 0.73, 2);
  near(s.tStat, -6.27, 2);
  assert.ok(s.tStat < -2, 'the loss must remain statistically significant');
});

test('any data beyond the published window is reported, not silently included',
  { skip: !fs.existsSync(FULL) }, () => {
    const all = JSON.parse(fs.readFileSync(FULL));
    const extra = all.filter(b => b.timestamp >= PUBLISHED_END);
    if (extra.length === 0) return;
    // Not a failure; newer data is welcome. But it is out-of-sample relative
    // to everything published here, so it must be looked at deliberately and
    // once, not folded into the headline number by accident.
    const s = stats(run(all, { ...P, flatOnly: true }).trades);
    console.log(`\n  [out-of-sample] ${extra.length} bars past the published window ` +
      `(to ${new Date(all.at(-1).timestamp).toISOString().slice(0, 10)}).\n` +
      `  [out-of-sample] Full-file expectancy ${s.expectancyR.toFixed(4)}R over ${s.n} trades ` +
      `vs published -0.1592R over 1953.\n` +
      `  [out-of-sample] Treat as a fresh observation; update the README deliberately.\n`);
    assert.ok(true);
  });
