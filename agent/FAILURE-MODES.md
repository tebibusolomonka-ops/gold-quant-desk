# Failure Modes

A catalogue of wrong answers produced during this research, and how each was caught.

Every entry below actually happened. None were hypothetical, and none were caught by the output *looking* wrong; each one looked right. They were caught by a verification step that existed independently of the answer, which is the only kind of check that works against plausible errors.

Each entry follows the same structure: **what was produced**, **why it was believable**, **how it was caught**, **the fix**, and **the generalizable rule**.

---

## 1. A tool returned a different resolution than the one requested

**Produced.** After switching the chart to 15-minute bars, a data read returned the *previous* resolution's bars. The analysis that followed described 15-minute structure using one-minute data.

**Why it was believable.** The bars were real, well-formed, correctly ordered, and internally consistent. Nothing in the payload said "these are the wrong timeframe." The only tell was bar-to-bar time spacing, which nobody looks at when the numbers already parse.

**How it was caught.** By checking the interval between consecutive timestamps against the expected value for the requested resolution (900 s for 15m, 3600 s for 1h, 14400 s for 4h) and cross-reading the tool's own reported state.

**Fix.** A mandatory post-switch verification: confirm the reported resolution *and* the bar spacing before any data from that read is used. Written into the operating rules as a standing step, not a reminder.

**Rule.** *When a tool has modes, verify which mode actually answered.* A correct-looking payload is not evidence the request was honoured. Well-formed output is the default failure presentation, not a sign of success.

---

## 2. A summary endpoint returned month-scale extremes as intraday context

**Produced.** A request for a 100-bar intraday summary came back with a high and low that were in fact the month's high and low. The analysis built a confident narrative around a dramatic intraday blow-off and crash, a move that had not happened that day.

**Why it was believable.** The numbers were genuine prices from the genuine instrument in the genuine period. Nothing was fabricated. The error was entirely in the *scope* of the aggregation, which the payload did not state.

**How it was caught.** By cross-checking the summary against raw individual bars from the same window. The raw bars showed a far narrower range, and the contradiction was immediate.

**Fix.** Never narrate from an aggregate without confirming it against the underlying rows, particularly after a reconnection.

**Rule.** *Aggregates hide their own scope.* A summary statistic cannot tell you what it summarized. When a tool offers both a rollup and the raw records, the rollup is a convenience, never the evidence.

---

## 3. A statistical artifact that produced a "major discovery"

**Produced.** A momentum test returned t-statistics up to **8.7**, far past any reasonable significance bar. Reported as a substantial finding.

**Why it was believable.** The arithmetic was correct. The code did exactly what it was asked. A t of 8.7 in a financial time series is extraordinary, and extraordinariness reads as importance rather than as a warning.

**How it was caught.** The magnitude itself was the tell. Effects that large do not survive in liquid markets, so the result was treated as a bug hypothesis rather than a finding. The cause was overlapping forward windows: measuring a 96-bar forward return starting at every bar means each observation shares almost all of its data with its neighbours. That violates the independence assumption behind the t-statistic and inflates it by roughly the square root of the horizon.

**Fix.** Re-run with disjoint, non-overlapping windows and detrended returns. Every t then fell between -1.78 and +1.62, nothing significant.

**Rule.** *A result too good for its domain is a bug report.* Domain priors are a debugging tool. And independence is the assumption most often violated silently, because violating it produces confident numbers rather than errors.

---

## 4. A tool's own metric counted the wrong unit

**Produced.** A platform reported `total_trades = 65` and a win rate computed over those 65. Both were quoted as the strategy's trade count and win rate.

**Why it was believable.** The field is named `total_trades`. Reading it as the number of trades requires no inference at all.

**How it was caught.** By opening the trade list instead of the summary. Each entry was exiting in up to three legs because of the partial-exit plan (50% at 1R, 30% at 2R, 20% runner). 65 was the number of *exit legs*; the true independent trade count was 23. The reported win rate was leg-based, and structurally optimistic, since the 1R partial fills far more often than the runner.

**Fix.** Independent trade count is always the *entry* count. The platform's field is never quoted.

**Rule.** *Check the denominator of any statistic a tool hands you.* A field name is a claim by the tool's author about their own semantics, not a specification. This error inflated the sample by 2.8x and biased the win rate upward, in the same direction as the hypothesis, which is the dangerous direction.

---

## 5. Silent rejection presenting as absence

**Produced.** A strategy reported **0 trades despite 21 detected signals**. The natural reading (and the first one taken) was that the entry conditions were never met.

**Why it was believable.** Zero is a coherent answer to "how many trades." Nothing raised an error. The run completed successfully.

**How it was caught.** By instrumenting an explicit entry-attempt counter and comparing it against fills. Attempts were 23; fills were 0. The orders were being generated and then silently rejected because position notional exceeded account capital.

**Fix.** Raise the research capital, and permanently instrument attempts alongside fills. The identical bug class reappeared later on a second instrument and was caught in minutes by the counter that now existed.

**Rule.** *Distinguish "did not happen" from "was rejected."* Any pipeline that can drop work silently needs a counter on both sides of the drop. Absence of output is ambiguous; absence of output next to a nonzero attempt count is a diagnosis.

---

## 6. An undocumented tool limit that invalidated a research plan

**Produced.** A plan to export historical bars for backtesting, built on the assumption that navigation controls (scroll, set range) would let arbitrary historical windows be fetched.

**Why it was believable.** The tool exposed scroll and range commands, they returned success, and the chart visibly moved to the requested dates.

**How it was caught.** By checking the *content* of what came back rather than the success flag. After scrolling to May, the returned bars were still from July. The data endpoint always returns the most recent N bars, capped at 500, regardless of what the view is doing, which is about five days at 15-minute resolution.

**Fix.** Abandon the export approach entirely and source data externally. That pivot is what eventually produced the 131,469-bar dataset and the result the whole repository rests on.

**Rule.** *A success flag describes the call, not the answer.* Verify the payload against what was asked for, especially when the tool's UI and its data path are separate systems, which they usually are.

---

## 7. Small-sample confidence

**Produced.** A profit factor of **1.70** on a three-month window, reported as the best cell of the test matrix and treated as encouraging.

**Why it was believable.** It was the real output of correct code on real data. It was also the *best* result among eight configurations, which is exactly what makes it feel like a signal.

**How it was caught.** Two safeguards, both agreed before the run. First, a pre-registered minimum of 100 trades; this cell had 20. Second, a stated rule that the best cell of many is the expected behaviour of noise, not evidence. Testing on 24x more data later returned 0.73.

The useful control: a deliberately naive moving-average-cross probe, run purely as a baseline, scored profit factor 1.27 on the same window. Any method scoring 1.70 needed to be understood against a strawman scoring 1.27, not against 1.0.

**Fix.** The kill rule executed as written.

**Rule.** *An unqualified number is not a finding.* Report the sample size in the same breath as the statistic, and always run a deliberately stupid baseline; it calibrates what "good" looks like on this data, which nobody's intuition does reliably.

---

## 8. Multiple comparisons dressed as discovery

**Produced.** Two of 24 hour-of-day buckets returned statistically significant directional effects.

**Why it was believable.** Each individual test was correctly computed and correctly significant at conventional thresholds.

**How it was caught.** By counting the tests. With 24 tests at a 5% threshold, roughly 1.2 false positives are expected by construction. Finding two is not a discovery; it is the null hypothesis behaving exactly as advertised.

**Fix.** No claim made. The later mining runs formalized this: 98 daily and 50 intraday candidates, every one counted, against a corrected bar of |t| >= 3.3, with a train/validate/vault split whose vault was examined once. One survivor from 98, which is approximately what chance plus one real effect predicts.

**Rule.** *The significance threshold depends on how many times you looked.* The number of tests run is part of the result and has to be reported with it. An agent that can run hundreds of variants cheaply is the entity most exposed to this, because the cost of one more test feels like zero.

---

## 9. Counts that disagreed with each other

**Produced.** A run logging 21 signals and 23 entry attempts.

**Why it was believable.** Both numbers were small, plausible, and close together. The discrepancy is invisible unless the two are deliberately printed side by side.

**How it was caught.** By printing them side by side. On two bars, price swept a level above *and* a level below and closed back inside both, firing a long and a short simultaneously. With pyramiding disabled the second order silently reversed the first.

**Fix.** An explicit conflict rule: bars firing both directions are chop and are skipped. The sample contained 204 such bars over 5.5 years. The rule is now criterion 5 in [`guardrail.js`](guardrail.js).

**Rule.** *Two counts that should match are a free assertion.* Emit both and compare them. The bug here was not in either number; it was in the gap, and nothing that reported a single number could have surfaced it.

---

## What the pattern is

Eight of these nine errors share a shape: **the output was well-formed and internally consistent, and wrong about something the output could not describe**: its scope, its units, its denominator, its independence assumptions, or how many times it had been attempted.

None were caught by reading the answer more carefully. Every one was caught by a check that did not depend on the answer:

- comparing a payload against the request that produced it
- comparing an aggregate against its underlying rows
- comparing two counts that should be equal
- comparing a result against a deliberately naive baseline
- comparing a result against a domain prior about what is possible
- counting how many times the question had been asked

That is the practical case for verification that is *structural* rather than *attentive*. Attention scales badly and degrades exactly when a result is exciting. Instrumentation does not care how exciting the result is.

---

## Related

- [`RULEBOOK.md`](RULEBOOK.md): the operating rules, including the ones added in response to the failures above
- [`EVALUATION.md`](EVALUATION.md): the criteria used to grade analytical output in this domain
- [`guardrail.js`](guardrail.js): the executable definition that replaced subjective setup identification
- [`../research/program.md`](../research/program.md): the full research log these were drawn from
