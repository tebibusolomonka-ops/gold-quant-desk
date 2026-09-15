# About this project

## Why it exists

I trade gold manually. I had been taught a setup — sweep a prior high or low, wait for price to close back inside on strong volume, enter the reclaim — and I traded it because the people who taught it were confident and the examples they showed worked.

I wanted to know whether it actually worked, not whether it looked like it worked. So I set up an LLM agent as a research desk and pointed it at the question.

The answer was no. Over 131,469 bars and 1,953 trades the setup loses money at t = −6.27, and it loses in five of the six years tested. I stopped trading it.

This repository is the record, including the parts where the research told me things I did not want to hear and the parts where the agent was confidently wrong.

## What I did and what the agent did

The agent wrote most of the code here. I want to be straightforward about that, because the division of labour is the interesting part.

**What I set:**

- **The standard of proof, before any data existed.** An edge is real only if it survives out-of-sample data, realistic costs, and parameter perturbation. Belief is not evidence.
- **The kill rule, while I still believed in the setup.** If the numbers don't support it, say so plainly, no softening, and stop trading it. Investigating *why* it failed is allowed; quietly hunting for a variant that works is not. Writing that down before the results came in is the only reason it was possible to follow afterwards.
- **The instruction to count every test.** When I asked the agent to find patterns, I asked it to find *our own* — and to report how many candidates it had tried, not just the ones that survived. That turned into the 98-test daily and 50-test intraday mining protocol with a corrected significance bar and a one-shot vault. One survivor from 98.
- **Which market, and the cost of that choice.** Gold, because it is what I actually trade, accepting knowingly that it gives fewer clean samples than a crypto pair and that every broker's gold feed differs. I later dropped the second instrument entirely to stop the scope from spreading.
- **The decision to publish a negative result** rather than quietly shelve it.

**What the agent did:** wrote the backtest engine, the analysis and mining scripts, ran the matrix, and produced the research log.

**What neither of us did alone:** catch the errors. That took both — see below.

## The time I caught the agent being wrong

Early on, the agent told me the Asian session was too thin to trade and that I should focus on London and New York. This is conventional wisdom and it wrote it confidently.

It did not match what I was seeing on my own screen, so I pushed back and asked it to check against live data instead of received opinion. It pulled ten days of hourly bars: Asian session average range $47.8 against London's $43.9, and Asian volume *higher* than London's. Per-hour range within about 5% across all three sessions.

The rule was false, and the recommendation built on it had been wrong. We replaced it and recorded why.

I think this is the most useful thing in the project. [`agent/FAILURE-MODES.md`](agent/FAILURE-MODES.md) catalogues nine errors caught by structural checks — counters, cross-references, baselines. This one was caught by a human with domain contact noticing that a fluent answer did not match reality. Both kinds of check are necessary and neither substitutes for the other. An agent that sounds authoritative on a domain it has only read about is exactly as confident as one that has it right.

## What I learned that transfers

**Fluent and correct come apart, and fluency wins by default.** A response saying "price swept liquidity below 4,022 and reclaimed on volume, targeting 4,111" is well-structured, uses the framework correctly, and can be produced without looking at a chart. Grading that requires criteria set in advance — which is why I ended up writing [`agent/EVALUATION.md`](agent/EVALUATION.md).

**The wrong answers were never sloppy.** Every error in this project was well-formed and internally consistent, and wrong about something the output could not describe: its scope, its units, its denominator, its independence assumptions. Reading more carefully does not catch these. Only a check that exists independently of the answer does.

**Verification has to be structural, not attentive.** Attention degrades exactly when a result is exciting. A t-statistic of 8.7 is when you are least likely to go looking for a bug, so the check has to already exist. Counters on both sides of a silent drop. Aggregates compared against their rows. A deliberately naive baseline, so you know what "good" looks like on this data rather than guessing.

**Small samples lie in a measurable way.** Three months of data said profit factor 1.70. Five and a half years said 0.73. Not a smaller edge — the opposite sign. I was one dataset away from risking real money on a proven loser.

**A negative result is a result.** The rule I was trading does not work. Knowing that cost me a few weeks and saved me considerably more.

## What this does and doesn't show

It shows that I will set a standard of proof before I know the answer and hold to it when the answer is unwelcome, that I can spot a confidently wrong output in a domain I know, and that I would rather publish a falsification than a flattering backtest.

It does not show model training, fine-tuning, or serving work. There is none here. It is a study of what a capable general-purpose model does when pointed at expert work for months, what its failures look like up close, and which checks catch them.

## Open threads

The honest state of the work:

- The dataset ends 2026-07-24. 2026 was the only positive year in the sample, and whether that held afterwards is genuinely unknown. The test suite reports out-of-sample bars separately rather than folding them into the headline number.
- One pre-registered hypothesis remains untested: materially wider stops and higher R targets, where a 0.30 spread costs about 2% of each R instead of 9%. It needs to be tested as a fresh question, not as a rescue of the dead one.
- The end-of-week long tilt survived a triple split but decayed in the vault. It is a tilt, not a system, and I treat it as one.

---

Questions or corrections welcome — including about the research itself. If something here is wrong I would rather know.
