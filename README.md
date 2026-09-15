# Gold Quant Desk

[![tests](https://github.com/tebibusolomonka-ops/gold-quant-desk/actions/workflows/test.yml/badge.svg)](https://github.com/tebibusolomonka-ops/gold-quant-desk/actions/workflows/test.yml)

**An LLM agent was given a quant research mandate and a kill rule. It killed the strategy it was built to trade.**

This repository is the record of that: the backtest engine, the exploratory analysis, the pattern miner, and the agent rulebook that was rewritten against its own prior instructions once the evidence came in.

The headline result is negative. That is the point.

---

## Start here

The trading is the domain. The subject is what happens when a capable model does expert work for months, how its wrong answers look from close up, and which checks catch them.

| | |
|---|---|
| [**Failure modes**](agent/FAILURE-MODES.md) | Nine wrong answers produced during this research, why each was believable, and the check that caught it |
| [**Evaluation rubric**](agent/EVALUATION.md) | How to grade analytical output in this domain — including a worked comparison of a fluent wrong answer against a correct one |
| [**Architecture**](agent/ARCHITECTURE.md) | Tool layer, cross-session memory, a self-amending rulebook, and the execution boundary |
| [**Rulebook**](agent/RULEBOOK.md) | The operating instructions, including the `SUSPENDED` block the agent wrote against its own prior orders |
| [**Guardrail**](agent/guardrail.js) | A subjective judgment call ("is this a setup?") replaced by an executable definition that says which criterion failed |
| [**Research log**](research/program.md) | Every phase, every verdict, in the order it happened |
| [**About**](ABOUT.md) | Why I built this, what I set versus what the agent did, and the time I caught it being wrong |

### What this demonstrates

- **Catching confidently wrong output in a specialist domain.** Every error in the catalogue was well-formed, internally consistent, and wrong about something the output could not describe — its scope, its units, its denominator, its independence assumptions. None were caught by reading more carefully.
- **Verification that is structural rather than attentive.** Counters on both sides of a silent drop. Aggregates checked against their rows. A deliberately naive baseline to calibrate what "good" looks like. Attention degrades exactly when a result is exciting; instrumentation does not.
- **Constraining model judgment with executable rules.** The guardrail accepts 2.4% of arbitrary bars and names the failing criterion on rejection, which makes disagreement inspectable instead of rhetorical.
- **Accepting an unwanted answer.** The kill rule was written while the strategy was still believed in, and executed when the evidence arrived.

---

## The result

The strategy under test was **"liquidity sweep + reclaim close on volume"** — a staple of retail Smart Money Concepts trading. Sweep a prior high or low, close back inside within a couple of bars on elevated volume, enter on the reclaim, stop beyond the sweep extreme.

Tested on **131,469 bars of XAUUSD 15-minute data, 2021-01-03 to 2026-07-24**, with modeled costs, anti-look-ahead pivots and conservative intrabar fills:

| Config | Trades | Win% | Expectancy | PF | t-stat |
|---|---|---|---|---|---|
| Baseline PIVOT (one position at a time) | 1,953 | 46.2% | **-0.159R** | 0.73 | **-6.27** |
| Baseline PIVOT (overlapping) | 2,542 | 46.6% | -0.147R | 0.75 | -6.57 |
| Session / PDH-PDL levels | 2,137 | 49.0% | -0.075R | 0.87 | -3.05 |
| With higher-timeframe regime filter | 1,154 | 47.5% | -0.094R | 0.84 | -2.70 |

Negative every year except one:

```
2021 -0.210R   2022 -0.223R   2023 -0.208R
2024 -0.053R   2025 -0.200R   2026 +0.068R
```

### The illusion, quantified

Before the full dataset existed, the same strategy was run inside a charting platform whose plan capped history at about three months. That window said **profit factor 1.70**. The full 5.5 years said **0.73**.

The favourable window was 2026 — the single positive year in the sample.

That gap is the most useful thing in this repository. A three-month backtest did not merely overstate the edge; it inverted the sign.

### Root cause

Strip the costs out and the raw signal's edge is **statistically indistinguishable from zero** (best case t = 0.65; significance needs |t| of roughly 2 or more). Add a realistic spread and zero becomes a reliable loss.

The mechanism is stop geometry, not market opinion. A stop placed at `sweep extreme +/- 0.25 x ATR(14)` produces an average R of about **3.3 price points**. A 0.30 spread therefore consumes roughly **9% of every R** before the trade has an opinion about anything.

A pre-registered prediction — that expectancy would peak at a reclaim window of K=1-2 and decay as K rose — **failed**. Observed: K1 -0.135, K2 -0.159, K3 -0.104, K4 -0.096, K5 -0.100. No decay, no structure, all negative. The setup does not behave the way the stop-run theory says it should.

---

## What survived

Several mechanisms were tested for edge. Two survived.

| Claim | Status |
|---|---|
| Sweep / reclaim (SMC) edge | Killed — t = -6.27 over 1,953 trades |
| 15m momentum, mean-reversion, session direction | Nothing significant after correcting for overlapping windows |
| Daily trend systems beating buy-and-hold (23.5y) | None did — B&H 8.3%/yr Sharpe 0.51 vs best trend 0.45 |
| Intraday entry-timing patterns | 0 of 50 survived training |
| **Volatility predictability** | **Survived** — RV lag-1 autocorrelation 0.398 (t = 13) |
| **End-of-week long tilt** | **Survived** — 1 of 98 mined tests, positive in 19/23 years |

**Direction is unpredictable at every horizon tested. Magnitude is not.** Realized-volatility lag-1 autocorrelation is 0.398 against direction's -0.014 — tomorrow's *range* is roughly **28x more forecastable** than tomorrow's *sign*. Volatility regimes persist at 46-48% against a 25% base rate. Next-day RV forecast R-squared is 0.146; next-day direction R-squared is 0.0002.

The practical consequence is that the useful output of this kind of research is **risk engineering, not signal generation** — position sizing conditioned on a volatility regime, stop distances that fit the day's realistic range budget, and knowing which hours actually move.

The end-of-week tilt is the only directional pattern that cleared a corrected significance bar across a three-way split. It is worth about 0.078 ATR per event — a tilt, not a system. It is reported here because it survived, not because it is tradeable on its own.

---

## Reproduce it

```bash
npm install
npm test
```

The test suite re-runs the engine and the miner against committed data and asserts the published numbers to four decimal places. If a change to the engine moves a result, the test fails.

The full 15m dataset is 14 MB and is not committed. A **2021 sample** is, so everything runs out of the box — the scripts warn loudly on stderr when they fall back to it, because a sample number is not a README number.

To build the full history:

```bash
npm run fetch
```

Then the headline run:

```bash
node scripts/engine.js data/xauusd_m15.json flatOnly=true
```

Every parameter is overridable from the command line, which is how the sweeps were run:

```bash
node scripts/engine.js data/xauusd_m15.json K=3 levelMode=SESSION useRegime=true spread=0
```

---

## What's in here

```
agent/FAILURE-MODES.md  nine wrong answers and the checks that caught them
agent/EVALUATION.md     rubric for grading analytical output in this domain
agent/ARCHITECTURE.md   tools, memory, the self-amending rulebook, the execution boundary
agent/RULEBOOK.md       the operating instructions, including the agent's own kill switch
agent/guardrail.js      subjective setup identification, made executable

scripts/engine.js       backtest engine - the strategy spec, executable
scripts/eda.js          autocorrelation, excursion profiles, engine bias check
scripts/momentum.js     momentum tests, disjoint windows, detrended
scripts/vol.js          volatility predictability - the one thing that worked
scripts/trend.js        23.5 years of daily trend systems vs buy-and-hold
scripts/mine_daily.js   98-test daily pattern miner, TRAIN/VALIDATE/VAULT
scripts/mine_15m.js     50-test intraday miner
scripts/friday.js       the one daily survivor, isolated
scripts/fetch.js        rebuild the 15m dataset
scripts/fetchd.js       rebuild the daily dataset

research/program.md     the full research log - every phase, every verdict
test/                   19 tests pinning every published number
```

Adjudicate a bar against the objective definition:

```bash
node agent/guardrail.js bar=539 dir=-1
```

```
NOT A SETUP — failed: volume_confirmation
  PASS  level_is_confirmed_pivot: level 1850.59 from bar 528, confirmed 6 bars before this one
  PASS  sweep_depth: wick 0.92 beyond level = 0.253 ATR (need > 0.1)
  PASS  reclaim_close: close 1846.94 is back below 1850.59
  PASS  reclaim_within_K: reclaim came 2 bar(s) after the sweep (limit 2)
  FAIL  volume_confirmation: volume 0.973 vs 1.5x SMA20 1.44 (ratio 1.01)
  PASS  no_opposite_signal: no conflicting signal on this bar
  PASS  cooldown: no prior signal supplied
```

A near-miss on one criterion, stated as a number. This is the case the guardrail exists for: everything about the bar looks like a sweep, and a model asked in natural language would very likely have called it one.

---

## The agent layer

The research above was run by an LLM agent operating under a written rulebook, committed here as [`agent/RULEBOOK.md`](agent/RULEBOOK.md).

The part worth reading is the section that begins `SUSPENDED`. The rulebook originally instructed the agent to identify and grade sweep-reclaim setups as its primary job. After the 5.5-year test came back at t = -6.27, the agent rewrote that section of its own instructions to forbid the behaviour it had been built for, and left the original text in place, marked archived, so the reversal stays legible.

Three design choices made that possible:

**A kill rule agreed before the data.** "If the numbers don't support the setup, state it plainly, no softening, and stop trading it. No auto-iterating into data-dredging. Investigating *why* it failed is allowed; quietly hunting for a variant that works is not." Written down while the strategy was still believed in.

**Pre-registration.** Baseline parameters and a predicted result shape were committed to before any run. Predicting the *shape* of a result is a stronger test than finding a winner, and the K-sweep prediction failing is more informative than it passing would have been.

**Counted tests.** The pattern miner ran 98 daily and 50 intraday candidates against a corrected significance bar (|t| >= 3.3) and a TRAIN / VALIDATE / VAULT split with a one-shot vault. One survivor from 98 is roughly what chance and a real weekend effect jointly predict — a credential for the pipeline, not a discovery to size up on.

The surrounding system — an application with no API driven over a debug protocol, a plain-markdown memory layer that survives between sessions, and the boundary that kept the agent from ever placing an order — is described in [`agent/ARCHITECTURE.md`](agent/ARCHITECTURE.md).

### Grading the output

Judging this kind of work is harder than producing it, because in this domain fluent and correct come apart. A response that says *"gold swept liquidity below 4,022 and reclaimed on strong volume, targeting 4,111"* is well-structured, uses the framework properly, and is indistinguishable from a response written by someone who never looked at the chart.

[`agent/EVALUATION.md`](agent/EVALUATION.md) is the rubric used here: eight dimensions, three of them gating, scored against the failures that motivated them — sourcing, calibration, cost realism, look-ahead discipline, multiple-testing disclosure, baseline comparison, falsifiability, and refusal to fabricate. It includes a worked comparison of two answers to the same question, one fluent and wrong, one correct and less satisfying, and a note on why the second scores higher despite being the one a reader enjoys less.

---

## Failure modes hit along the way

Nine wrong answers were produced during this research. Each was well-formed, internally consistent, and wrong about something the output could not describe. A few, in short:

**Overlapping windows inflated a t-statistic to 8.7.** Momentum looked like a major finding. Forward windows that overlap violate independence and inflate t by roughly the square root of the horizon. Re-run with disjoint windows and detrended, every t fell between -1.78 and +1.62 — nothing.

**"0 trades" was ambiguous.** A strategy returned no trades despite firing 21 signals. The entries were not un-generated; they were silently rejected because position notional exceeded account capital. An explicit entry-attempt counter isolated it in minutes. Fill rejection is silent — always compare attempts against fills.

**A tool returned month-scale extremes as intraday context.** A request for a 100-bar intraday summary came back with the month's high and low. The analysis built a confident narrative around a dramatic move that had not happened that day. Every number in it was genuine; only the scope was wrong, and the payload did not state its scope.

**The platform's `total_trades` counted exit legs, not trades.** Partial exits meant one entry produced up to three legs. A reported 65 "trades" was 23 independent positions, and the reported win rate was leg-based — biased upward, in the same direction as the hypothesis.

The full catalogue, with how each was caught and the generalizable rule, is in [`agent/FAILURE-MODES.md`](agent/FAILURE-MODES.md). The short version: none were caught by reading the answer more carefully. Every one was caught by a check that did not depend on the answer.

---

## Data

XAUUSD OHLCV from the Dukascopy public historical feed via [`dukascopy-node`](https://github.com/Leo4815162342/dukascopy-node). 15-minute bars from 2021, daily bars from 2003.

Gold has no consolidated tape — every broker's feed differs slightly, so absolute levels are venue-specific and results carry that caveat. Spot checks against an independent feed showed drift of 2-4 price points on matched closes, which is normal and does not affect R-multiple conclusions.

Committed here: the full daily series (784 KB) and a 2021 15m sample. Rebuild the rest with `npm run fetch`.

---

## Disclaimer

**This is research, not advice.** Nothing here is a recommendation to trade anything. The primary finding is that a widely-taught setup loses money after costs; do not read that as an instruction to trade the inverse, which has not been tested and would face the same spread.

The code executes no orders and connects to no broker. Results are historical, venue-specific, and carry no claim about the future.

---

## Credits

Chart interaction during the discretionary phase of this work used [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) (MIT). It is a dependency of that workflow, not part of this repository.

## License

MIT — see [LICENSE](LICENSE).
