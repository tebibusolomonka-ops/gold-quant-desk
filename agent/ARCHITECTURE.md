# Architecture

How the agent was actually wired: what it could touch, what it remembered, what it was forbidden to do, and where the humans sat.

The domain is incidental. The design problems — no API, no persistent context, a mutable instruction set, and an output nobody should trust unverified — are general.

---

## The shape

```
                   ┌──────────────────────────────┐
     operator ────►│         AGENT SESSION        │
    (decides,      │  reasoning + tool selection  │
     executes)◄────│                              │
                   └───┬──────────┬───────────┬───┘
                       │          │           │
          ┌────────────▼──┐  ┌────▼──────┐  ┌─▼──────────────┐
          │  TOOL LAYER   │  │  MEMORY   │  │  VERIFICATION  │
          │               │  │           │  │                │
          │ MCP ── CDP ──►│  │ markdown  │  │ guardrail.js   │
          │ desktop chart │  │ vault on  │  │ reproduction   │
          │ app (no API)  │  │ disk      │  │ tests, counts, │
          │               │  │           │  │ baselines      │
          │ local backtest│  │ rulebook  │  │                │
          │ engine + data │  │ + journal │  │                │
          └───────────────┘  └───────────┘  └────────────────┘
                       │          ▲
                       │          │ every read, decision, lesson
                       └──────────┘  written as it happens

              ┌───────────────────────────────────────┐
              │  HARD BOUNDARY: no order ever placed  │
              └───────────────────────────────────────┘
```

---

## Tool layer — driving an application that has no API

The market data and charting lived in a desktop application with no public API and no export path for the resolution needed. The application is an Electron build, so it exposes Chrome DevTools Protocol when launched with a debug port. An MCP server wraps that protocol and presents chart state, OHLCV reads, drawing, alerts and script injection as typed tools.

This is the ordinary situation when an agent has to work inside software built for humans: the integration surface is whatever the application already exposes for other reasons, and it is undocumented, unstable, and not designed to be depended on.

Three consequences shaped everything downstream.

**Tool output required verification, not trust.** Entries 1, 2 and 6 in [`FAILURE-MODES.md`](FAILURE-MODES.md) are all this layer returning well-formed, internally consistent, wrong data — the previous timeframe's bars after a switch, month-scale extremes labelled as intraday, and navigation commands that reported success while the data endpoint ignored them. Every one was caught by a check that did not depend on the answer: comparing bar spacing against the requested resolution, comparing an aggregate against its rows, comparing a payload against the request.

**An undocumented limit invalidated the original plan.** The data endpoint returns the most recent N bars, capped at 500 — five days at 15-minute resolution — regardless of what the chart view is doing. The entire export-based research design was unworkable and had to be replaced with an external data source. That pivot produced the 131,469-bar dataset the repository's main result rests on. Discovering the constraint early was worth more than any amount of building against the assumption.

**The integration broke in a way the agent could not fix.** Mid-project, an OS account change made the installed bridge unreadable — a different user profile, no administrator rights, access denied. The agent could diagnose it (enumerate profiles, check group membership, test the debug port, search accessible locations) but the fix required elevated privileges it did not have. It produced a diagnosis and an exact remediation for a human to run, rather than attempting workarounds. Knowing where its own authority ended was the correct behaviour, and the failure is documented rather than hidden.

---

## Memory layer — durability across sessions

An agent session has no memory of previous sessions. The research spanned many, and each one had to resume with the full state of a months-long investigation: what had been tested, what had been killed, what the current rules were, and why.

The solution was deliberately unsophisticated: **a directory of markdown files on disk, treated as the single source of truth.**

```
Reference/
  Setup.md          durable framework — what the system is, how it works
  Rules.md          the operating constitution (mirrored as RULEBOOK.md here)
  Journal.md        dated running log, newest entry on top
  Research.md       the research program — phases, verdicts, evidence
```

Three properties made it work.

**Write-as-you-go, not summarize-at-the-end.** The standing rule was to log every read, decision and lesson at the moment it happened. End-of-session summarization loses exactly what turns out to matter later — the discarded hypothesis, the read that looked wrong, the reason a parameter was chosen. Those are invisible as they occur and load-bearing in hindsight.

**Bootstrap is mandatory and ordered.** Every session began by reading the framework, then the rules, then the recent journal, before touching any tool. A session that skips this is not continuing the work; it is starting similar work from scratch with a confident tone.

**Time-stamped facts are marked as such.** Price levels, positions and market reads are explicitly recorded as point-in-time and never treated as current. A note carrying a seven-week-old price is only dangerous if something reads it as today's. This is the memory-layer form of dimension 8 in [`EVALUATION.md`](EVALUATION.md): analysing stale data as though it were live is fabrication about time.

The format is plain text on purpose. It is greppable, diffable, human-editable, survives every tool in the stack being replaced, and the operator can read and correct it directly. A database would have been worse at all five.

---

## Rulebook — an instruction set the agent can amend

[`RULEBOOK.md`](RULEBOOK.md) is loaded at the start of every session and governs behaviour: which market, which timeframes, the required analysis sequence, the risk rules, the honesty rules.

The design decision worth noting is that **it is mutable by the agent, under evidence.**

Its original core instruction was to identify and grade sweep-and-reclaim setups. When testing over 5.5 years returned an expectancy of −0.159R at t = −6.27, the agent rewrote that section to forbid the behaviour the rulebook had been written to produce — and left the superseded text in place, marked archived, rather than deleting it.

Two properties make that safe rather than alarming:

**The reversal condition was agreed in advance.** The kill rule was written while the strategy was still believed in: *if the numbers don't support the setup, state it plainly, no softening, and stop trading it. No auto-iterating into data-dredging.* The agent was not exercising judgment about whether to change its instructions; it was executing a rule about when to.

**Amendments are append-and-mark, never silent edits.** Superseded rules stay visible with the reason and date. An instruction set that quietly rewrites itself is unauditable; one that accretes marked revisions is a record. Reading the rulebook top to bottom shows what was believed, what changed it, and when.

---

## Verification layer

Output is not trusted because it is well-formed. Three mechanisms, in increasing strength.

**Executable definitions.** [`guardrail.js`](guardrail.js) replaces subjective setup identification with an adjudicator. The agent proposes; the function decides, and names which criterion failed. A natural-language claim of "this looks like a sweep" is unfalsifiable and therefore unusable as a research input — the guardrail converts it into something that can be wrong. It accepts 2.4% of arbitrary bars, so it is genuinely selecting rather than describing.

**Pinned reproduction.** The [test suite](../test) asserts published results to four decimal places across multiple configurations. A change to the engine that moves a number fails the build. The repository's claim is that its figures hold up, and that claim is executable rather than asserted.

**Controls and counters.** A random-entry control returns 50.0% on hitting +1R before −1R, which is how the engine is known to be unbiased. A deliberately naive baseline scored profit factor 1.27, which is how 1.70 was known to be unremarkable. Entry attempts are counted alongside fills, which is how silent rejection became visible. Each is cheap, permanent, and does not depend on anyone being attentive at the right moment.

---

## Execution boundary

The agent never places an order. It reads, analyses, marks charts, and suggests; a human decides and executes every time.

This is not a limitation that was worked around — it is load-bearing. The research concluded that the strategy the agent was built to signal has negative expectancy. An agent with execution rights operating on its original instructions would have traded that conclusion into real losses for months before the evidence arrived. The boundary is what made the whole thing recoverable.

It also puts the agent's failures in the right category. A wrong analysis costs a human five minutes of reading and a rejected suggestion. A wrong analysis with execution rights costs money, and — more dangerously — produces a performance record that invites explanation rather than investigation.

---

## What this is not

No model training, fine-tuning or inference work. No serving infrastructure. No multi-agent orchestration. The agent is a general-purpose assistant given tools, memory, rules and a domain.

The interesting content is entirely in the surrounding structure: what happens when a capable generalist model is pointed at expert work for months, what its failures look like up close, and which checks catch them. That question does not require novel model work, and the answers turned out not to depend on it.

---

## Related

- [`FAILURE-MODES.md`](FAILURE-MODES.md) — nine wrong answers and the checks that caught them
- [`EVALUATION.md`](EVALUATION.md) — how output in this domain was graded
- [`RULEBOOK.md`](RULEBOOK.md) — the operating rules, including the self-amended section
- [`guardrail.js`](guardrail.js) — the executable definition
