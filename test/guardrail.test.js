// =====================================================================
//  GUARDRAIL TESTS
//  The guardrail's job is to be restrictive and to agree with the
//  engine's independent implementation of the same definition. Two
//  implementations agreeing is evidence the definition is unambiguous —
//  which was the whole point of writing it down as numbers.
// =====================================================================
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { run, P } = require('../scripts/engine.js');
const { evaluateSetup, explain, DEFAULTS } = require('../agent/guardrail.js');

const bars = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'xauusd_m15_2021_sample.json')));
const signals = run(bars, { ...P, flatOnly: true }).trades;

test('guardrail agrees with the engine on signals the engine fired', () => {
  let valid = 0;
  for (const s of signals) if (evaluateSetup(bars, s.i, s.dir).valid) valid++;
  const rate = valid / signals.length;
  assert.ok(rate > 0.90,
    `two independent implementations of one definition should agree; got ${(rate * 100).toFixed(1)}%`);
});

test('guardrail rejects the overwhelming majority of ordinary bars', () => {
  // If a "setup" definition accepts a large share of random bars it is
  // describing the market, not selecting from it.
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let valid = 0, n = 0;
  for (let k = 0; k < 3000; k++) {
    const i = 200 + Math.floor(rnd() * (bars.length - 400));
    const dir = rnd() < 0.5 ? 1 : -1;
    n++;
    if (evaluateSetup(bars, i, dir).valid) valid++;
  }
  const rate = valid / n;
  assert.ok(rate < 0.05,
    `guardrail should accept under 5% of arbitrary bars, accepted ${(rate * 100).toFixed(1)}%`);
});

test('a rejection names which criterion failed, not just that it failed', () => {
  // The point of an adjudicator is that disagreement is inspectable.
  // "No" without a reason is as unfalsifiable as "it looks like a sweep".
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let checked = 0;
  for (let k = 0; k < 200 && checked < 20; k++) {
    const i = 200 + Math.floor(rnd() * (bars.length - 400));
    const r = evaluateSetup(bars, i, rnd() < 0.5 ? 1 : -1);
    if (r.valid) continue;
    checked++;
    assert.ok(r.failed.length > 0, 'a rejection must name at least one failed criterion');
    for (const name of r.failed) {
      const c = r.checks.find(x => x.name === name);
      assert.ok(c && typeof c.note === 'string' && c.note.length > 0,
        `criterion ${name} must carry an explanation`);
    }
    assert.match(explain(r), /NOT A SETUP — failed:/);
  }
  assert.ok(checked > 0, 'expected at least one rejection to inspect');
});

test('every criterion is reachable as a failure', () => {
  // A criterion that never fires is decoration. Sweep the sample and
  // confirm each named check actually rejects something.
  const seen = new Set();
  for (let i = 200; i < bars.length; i += 7) {
    for (const dir of [1, -1]) {
      for (const name of evaluateSetup(bars, i, dir).failed) seen.add(name);
    }
  }
  for (const name of ['level_is_confirmed_pivot', 'sweep_depth', 'reclaim_close',
    'volume_confirmation', 'no_opposite_signal']) {
    assert.ok(seen.has(name), `criterion "${name}" never rejected anything — dead rule`);
  }
});

test('look-ahead is refused: bars inside the warmup cannot be adjudicated', () => {
  const r = evaluateSetup(bars, 5, -1);
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.failed, ['in_range']);
});

test('a level is only usable once the pivot forming it is confirmed', () => {
  // The pivot search must never return a candidate whose confirmation
  // window extends to or past the bar being judged.
  const N = DEFAULTS.N;
  for (const s of signals.slice(0, 50)) {
    const d = evaluateSetup(bars, s.i, s.dir).detail;
    if (d.levelBar == null) continue;
    assert.ok(d.levelBar + N < s.i,
      `pivot at ${d.levelBar} was not confirmed before bar ${s.i} — look-ahead`);
  }
});

test('cooldown rejects a signal too soon after the previous one', () => {
  const s = signals.find(x => evaluateSetup(bars, x.i, x.dir).valid);
  assert.ok(s, 'expected at least one valid signal');
  const tooSoon = evaluateSetup(bars, s.i, s.dir, { lastSignal: s.i - 1 });
  assert.ok(tooSoon.failed.includes('cooldown'));
  const longEnough = evaluateSetup(bars, s.i, s.dir, { lastSignal: s.i - DEFAULTS.C });
  assert.ok(!longEnough.failed.includes('cooldown'));
});

test('passing the guardrail does not imply the trade is profitable', () => {
  // Stated as a test because it is the single most important thing to
  // not confuse. Every trade in the engine's run met this definition,
  // and the set of them loses money.
  const { stats } = require('../scripts/engine.js');
  const s = stats(signals);
  assert.ok(s.expectancyR < 0,
    'the guardrail enforces honesty about what was seen, not profitability');
});
