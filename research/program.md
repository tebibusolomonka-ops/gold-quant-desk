# Research Program: Sweep & Reclaim (XAUUSD)

The full research log, in the order it happened, including the phases that produced wrong answers before they produced right ones. Personal and operational details have been removed; every number is as recorded at the time.

**Mandate:** convert a discretionary "liquidity sweep + reclaim on volume" setup into a statistically validated, rules-based signal system. Signals only, execution stays manual.

---

## 0. What this was and wasn't

- **Building:** a formalized, backtested, robustness-tested setup emitting signals with known expectancy, win rate, drawdown and failure modes.
- **Not building:** an auto-execution bot.
- **Standard of proof:** an edge is only real if it survives out-of-sample data, realistic costs, and parameter perturbation. Belief is not evidence.

### Mandate decisions, fixed before any data

**Kill rule.** If the numbers don't support the setup, state it plainly, no softening, and stop trading it as-is. No auto-iterating into data-dredging. Investigating *why* it failed is allowed; quietly hunting for a variant that works is not.

**Statistical caveat that must not be fudged.** Runs at 5m / 15m / 30m on the same symbol are correlated, not independent; the same market event appears in all three. Pooling them inflates apparent N without proportionally stronger evidence. Cross-*symbol* agreement is the genuinely independent test; cross-timeframe agreement is a consistency check only. Report N per cell, never one merged N presented as independent.

---

## 1. Data audit: the constraint that shaped everything

The charting platform's data bridge returns the most recent N bars, capped at 500.

| Timeframe | 500 bars equals | Usable for backtest? |
|---|---|---|
| 1D | ~2 years | Yes, but wrong TF for a 15m setup |
| 4h | ~83 days | Marginal |
| 1h | ~21 days | No |
| **15m** | **~5 days** | **No, fatal for direct export** |

Direct bar-export backtesting of a 15m strategy was not viable that way. Two routes remained: encode the setup as a platform-native strategy and read results back without exporting bars, or find external data.

---

## 2. Formalization

The discretionary rule was ambiguous, and that ambiguity is exactly what made it untestable. Every term had to become a number.

| Concept | Defined as | Parameter |
|---|---|---|
| Swing high/low | Fractal pivot: extreme with N bars each side | N |
| Sweep | Trades beyond the pivot by X, in ATR units not dollars | X |
| Reclaim | Closes back inside within K bars | K |
| On volume | Reclaim-bar volume > M x rolling average | M |
| Regime filter | Higher-TF EMA50 slope + price side | on/off |
| Entry | Market on reclaim close | variant |
| Stop | Sweep extreme +/- 0.25 x ATR(14) | pad multiple |
| Targets | TP1 1R (50%), TP2 2R (30%), 20% runner trail | fixed |

Baseline: N=5, X=0.10, K=2, M=1.5, cooldown C=5. Chosen before seeing results.

---

## 3. Statistical standards, agreed up front

- **Sample size:** target 100+ trades, ideally 200+. Below ~30, results are noise.
- **In-sample / out-of-sample split:** develop on ~70%, validate on an untouched ~30%, looked at once.
- **Costs modeled** on every trade. An edge that dies under costs is not an edge.
- **Parameter sensitivity:** we want a plateau, not a spike. If it only works at exactly one parameter combination, it is curve-fit noise.
- **Benchmarks:** random entries with identical risk management, buy-and-hold, coin-flip at the same frequency. If we can't beat a random-entry control, the "setup" is just the risk management working.
- **Look-ahead guard:** signals only on closed bars.

---

## Phase 0b: pipeline proven, sample is the constraint

A throwaway EMA-cross probe verified the full loop end to end: inject logic, compile, add to chart, read back metrics, trades and plot values. Logic could be tested without exporting a single bar.

Measured: **5,570 bars at 15m**, first bar three months back. A platform plan limit, not a bridge limit.

The probe produced 175 closed trades at 30.9% win rate, PF 1.27, Sharpe 0.06, meaningless as a strategy, useful as a control. **Note that number: a naive EMA cross scored PF 1.27.**

Realistic expectation for a far more selective setup in this window: 40-120 trades. Borderline against the 100-trade standard, and recorded as such rather than hoped past.

---

## Phase 2-3: strategy coded, baseline run

**Build bug found and fixed.** The first run returned 0 trades despite 21 signals. Entries were being *rejected*, not un-generated: default position size was about $405k notional against $10k initial capital. A diagnostic entry-attempt counter isolated it. **Lesson: "0 trades" is ambiguous between "no signals" and "signals rejected"; always instrument with counters.**

**Metric trap discovered.** The platform reported `total_trades = 65`, but each entry spawned up to three exit legs from the partial-exit plan. 65 was exit legs; true independent trade count was 23. Reported win rate was likewise leg-based.

**Baseline:** 5,570 bars, 21 signal bars, 23 independent entries, net +0.45%, PF 1.29, Sharpe 0.0067, max drawdown 0.91%.

**Verdict: fails the N >= 100 criterion with 23.** No edge could be claimed. PF 1.29 at that sample size is entirely consistent with randomness, compare the EMA probe at PF 1.27.

**Open logic bug:** 21 signals but 23 entry attempts, meaning two bars fired both a long and a short simultaneously. Needed an explicit conflict rule.

---

## Phase 3b: full matrix, verdict rendered

Fixes: conflict bars now skipped as chop; research capital raised after a second silent fill-rejection, the same bug class as the first.

| Run | Entries | PF | Verdict |
|---|---|---|---|
| Gold 15m PIVOT | 20 | 1.70 | best cell |
| Gold 15m SESSION | 17 | 1.58 | agrees with PIVOT |
| Gold 15m PIVOT + regime | 9 | 1.30 | filter cut PF and N |
| Gold 30m PIVOT | 10 | 1.40 | thin |
| Gold 5m PIVOT | 17 | 0.77 | **loses** |
| Second symbol 15m PIVOT | 12 | 0.31 | **loses badly** |
| Second symbol 30m PIVOT | 9 | 1.19 | thin |
| Second symbol 5m PIVOT | 25 | 0.58 | **loses** |

**Verdict: not validated.** Cross-symbol agreement failed decisively at 15m, 1.70 against 0.31. Gold 15m's shine is exactly the "best cell of many" pattern we had pre-committed to distrust.

Real findings retained: 5m is bad on both symbols, the only cross-symbol-consistent result. Gold 15m is stable across both level definitions. The regime filter did not earn its keep in this window.

---

## Phase 4-5: independent 5.5-year test. STRATEGY KILLED

**Data ceiling broken.** A free public historical feed yielded **131,469 bars of XAUUSD 15m, 2021-01-03 to 2026-07-24**, 24x the platform's 5,570. Sanity-checked against the platform: closes matched within 2-4 points, normal broker-feed drift.

An independent backtest engine was written from scratch implementing the spec exactly: anti-look-ahead (a pivot is only known N bars after it forms), stop-loss checked before take-profit within a bar (conservative), costs modeled.

**Every configuration loses, with statistical significance:**

| Config | Trades | Win% | Expectancy | PF | t-stat |
|---|---|---|---|---|---|
| Baseline PIVOT (overlapping) | 2,542 | 46.6% | -0.147R | 0.75 | -6.57 |
| Baseline PIVOT (flat-only) | 1,953 | 46.2% | -0.159R | 0.73 | -6.27 |
| SESSION levels | 2,137 | 49.0% | -0.075R | 0.87 | -3.05 |
| Regime filter on | 1,154 | 47.5% | -0.094R | 0.84 | -2.70 |

**Pre-registered prediction failed.** Expectancy was predicted to peak at K=1-2 and decay as K rose. Observed: K1 -0.135, K2 -0.159, K3 -0.104, K4 -0.096, K5 -0.100. No decay, if anything inverted, all negative.

**Cost isolation, the most informative run:**

| Config, zero costs | Expectancy | PF | t |
|---|---|---|---|
| PIVOT | -0.061R | 0.89 | -2.40 (still negative) |
| SESSION | **+0.016R** | 1.03 | **0.65, not significant** |

The raw signal's true edge is statistically indistinguishable from zero. Realistic spread converts zero into a reliable loss.

**Root cause: structural cost drag.** Cost impact is about 0.09R per trade from a 0.30 spread, which implies an average R of about 3.3 price points. The tight stop means gold's spread consumes ~9% of every R. Tight stops plus gold spread is mathematically hostile before any market opinion enters.

**The illusion, quantified.** The platform's three-month window was the only favourable slice in 5.5 years. It showed PF 1.70; the full sample showed 0.73-0.87. Year by year: 2021 -0.21, 2022 -0.22, 2023 -0.21, 2024 -0.05, 2025 -0.20, 2026 +0.07.

**Verdict against pre-registered criteria:** positive expectancy: no. N >= 100: yes (1,953). Holds out-of-sample: no, fails every pre-2026 year. Parameter plateau: no. Beats random: no, worse than zero. Cross-market: no.

**Killed, per the mandate.**

**Findings retained:** session and prior-day levels genuinely beat arbitrary pivots (+0.016R vs -0.061R raw), weak, not significant, but the only part of the theory that survived. The regime filter "helped" only by taking fewer negative-expectancy trades. The earlier rarity claim was wrong: real frequency is about 7 signals per month, not 1.7 per week of A+ quality; the small sample under-counted because a position was usually already open.

**Next hypothesis, to be tested fresh and not as a rescue:** materially wider stops and higher R targets, where a 0.30 spread costs ~2% of R instead of 9%. Must be pre-registered and tested independently.

---

## Exploratory analysis: is there any edge at all in gold 15m?

Rather than guessing at indicator combinations, the market itself was characterized. Discipline imposed: in-sample 2021-2024 only (94,553 bars); 2025-2026 held out untouched (36,916 bars).

**1. Autocorrelation of 15m returns.** Lag-1 = -0.0144 (2 SE = 0.0065, so significant), lag-3 = -0.0070. Weak mean reversion exists but is economically trivial, far below spread. Real and untradeable.

**2. Momentum, and a statistics trap caught in our own output.** The first pass used overlapping forward windows and showed t up to **8.7**, it looked like a major discovery. It was an artifact: overlapping windows violate independence and inflate t by roughly the square root of the horizon.

Re-run with disjoint windows:

| L,H | after UP (bps, t) | after DOWN (bps, t) |
|---|---|---|
| 16,48 | 3.15, t=1.60 | 0.04, t=0.02 |
| 16,96 | 9.97, t=2.39 | -3.68, t=-0.95 |
| 32,48 | 1.10, t=0.55 | 2.07, t=1.00 |

One cell at t=2.39 out of nine tested is exactly what chance produces. Detrended to remove the gold bull run, every t fell between -1.78 and +1.62. Nothing significant.

**3. Hour of day.** Only 2 of 24 hours significant. With 24 tests, about 1.2 false positives are expected. Not treated as an edge. The *volatility* profile is solid though: peak 12:00-15:00 UTC, trough 20:00-21:00 UTC.

**4. Excursion profile and engine validation.** P(hit +1R before -1R) from random entries came back 49.8 / 49.9 / 50.0 / 50.1% across four horizons. Median favourable excursion equals median adverse excursion at every horizon. Exactly 50-50 confirms the engine is unbiased and there is no free directional edge.

**5. Benchmark.** Gold buy-and-hold in-sample was +37.5% over 3.99 years, or +8.3%/yr. Anything built must beat that, and must not merely be "long in a bull market."

**Conclusion.** Across reversal, momentum, short-term mean reversion and session effects, no statistically robust directional edge was found in gold 15m bars. The classic retail toolkit does not contain a demonstrable edge at this timeframe on this instrument. Combining components with zero individual edge cannot help; they sum to zero edge with fewer trades and more cost.

---

## Daily trend following, 23.5 years

Daily bars 2003-2026 (7,324 bars, gold $346 to $4,049). Pre-registered literature parameters, zero tuning, costs modeled, next-day execution.

| System | Annual | Sharpe | t | maxDD |
|---|---|---|---|---|
| **Buy & hold** | **8.3%** | **0.51** | 2.71 | 60% |
| TSMOM-252 long/flat | 6.3% | 0.45 | 2.40 | 52% |
| MA 50/200 long/short | 6.3% | 0.39 | 2.05 | 43% |
| TSMOM-252 long/short | 4.4% | 0.27 | 1.42 | 93% |
| Donchian 55/20 | 1.1% | 0.08 | 0.43 | 59% |

**No trend system beat buy-and-hold over 23.5 years.** The long/flat variants are diluted buy-and-hold; gold rose 11.7x over the period. Directional prediction is now falsified at 15m *and* daily on this instrument.

Nuance kept: trend variants did cut max drawdown to 43-52% against 60%. Trend filters have risk value, not alpha value.

---

## Volatility predictability: the first genuinely significant structure

In-sample 2021-2024, 1,032 trading days built from 15m bars.

- **Realized-volatility lag-1 autocorrelation = 0.398** (2 SE = 0.062, t = 13). Compare direction lag-1 = -0.014. **Tomorrow's volatility is about 28x more predictable than tomorrow's direction.** Decays slowly; lag-20 is still 0.114, the classic long-memory clustering stylized fact.
- EWMA(0.8) next-day RV forecast **R-squared = 0.146**. Direction R-squared is about 0.0002.
- **Regime persistence:** P(high vol then high vol) = 48%, P(low then low) = 46%, against a 25% base rate.
- **Practical range table**: today's vol quartile maps to tomorrow's median day range: Q1 $20.0 (p80 $29.6), Q2 $23.1, Q3 $24.2, Q4 $28.6 (p80 $40.3).

Combined with the hour-of-day volatility map, *when* movement happens is also predictable even though *which way* is not.

**Synthesis.** In XAUUSD, direction is unpredictable at every tested horizon; risk (the magnitude and timing of movement) is strongly predictable. The scientific value of this desk to a manual trader is therefore risk engineering, not signal generation.

---

## Pattern mining: "find our own patterns"

Anti-data-dredging protocol: systematic feature search with **every test counted**, corrected significance bar (|t| >= 3.3, roughly the noise maximum for ~100 tests), and a triple split: TRAIN 2003-2016, VALIDATE 2017-2021, VAULT 2022-2026 one-shot. Intraday: TRAIN 2021-2023, VALIDATE 2024, VAULT 2025-2026.

**Daily: 49 features x 2 horizons = 98 tests.** Calendar effects, streaks, NR7/WR7, inside and outside days, close location, gaps, distance from the 200-day average, RSI extremes, volatility regimes, 20-day breakouts, big-day continuation, reversal days.

**One survivor: the end-of-week long effect.**

- Friday close to next trading day: TRAIN t = 4.42 (n=671), VALIDATE t = 2.64 same sign, VAULT one-shot t = 1.28 same sign, decaying but sign-consistent.
- Supporting leg, Thursday close to Friday close, pooled 2003-2026 and not split-tested: **+0.078 ATR, t = 3.34, n = 1,157, positive in 19 of 23 years.**
- Consistent with the documented weekend-hedging effect. One survivor from 98 tests is approximately what academia considers real, which validates the pipeline as much as the finding.
- Status: **weak tilt, not a system.**

**Intraday 15m: 50 tests.** Hour of day crossed with prior direction, plus weekday variants. **Zero train survivors.** No entry-timing pattern of this class exists.

**Everything that died in training**, recorded so it is not re-tested: all months, all other weekdays, all streak lengths, NR7/WR7, inside and outside days, close location, gaps, 200-day extension, RSI 20/30/70/80, volatility quartiles, 20-day high and low breaks, 2-ATR big days, reversal days.

---

## Cumulative verdict

| Claim | Status |
|---|---|
| Sweep/reclaim (SMC) edge | Killed, t = -6.27 over 5.5 years |
| 15m momentum / mean-reversion / session direction | Nothing significant |
| Daily trend systems beat buy-and-hold | None over 23.5 years |
| Intraday timing patterns | 0 of 50 survived |
| **Volatility predictability** | **Survived**: t = 13, R-squared 0.15, regime persistence 2x |
| **End-of-week long tilt** | **Survived**: weak, triple-tested, 19/23 years |
| Volatility timing map (12:00-15:00 UTC) | Robust descriptive fact |

---

## Top risks, stated honestly

1. **Overfitting**: the number one killer. Many parameters against a small sample guarantees a beautiful, worthless backtest.
2. **Insufficient sample**: the likeliest hard blocker, and the one that nearly produced a false positive here.
3. **Data fragmentation**: gold has no consolidated tape; results are venue-specific.
4. **Look-ahead and repainting**: a bug that makes a losing strategy look brilliant.
5. **Cost underestimation**: spreads widen exactly when these signals trigger.
6. **Regime decay**: edges erode as they get crowded.
7. **Multiple testing**: run 50 variants and one looks great by chance. Mitigation: count every test, raise the bar as you try more.

---

## What success looked like

Not a nice equity curve. Success was **knowing the truth about the setup**: whether it has an edge, how big, in which regime, how often it fails, and what the worst realistic drawdown is, so that expectations are grounded in evidence rather than belief.

By that standard this program succeeded. It just did so by proving the thing did not work.
