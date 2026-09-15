# Data

XAUUSD OHLCV from the [Dukascopy](https://www.dukascopy.com/) public historical feed, retrieved with
[`dukascopy-node`](https://github.com/Leo4815162342/dukascopy-node).

| File | Bars | Range | Committed |
|---|---|---|---|
| `xauusd_d1.json` | 7,324 daily | 2003-01-02 to 2026-07-24 | yes (784 KB) |
| `xauusd_m15_2021_sample.json` | 23,626 15-minute | 2021-01-03 to 2021-12-31 | yes (2.5 MB) |
| `xauusd_m15.json` | 131,469 15-minute | 2021-01-03 to 2026-07-24 | no (14 MB) |

Rebuild the full 15-minute series:

```bash
npm run fetch
```

Scripts resolve `xauusd_m15.json` first and fall back to the 2021 sample if it is absent, printing a
warning to stderr when they do. **Sample results are not the full-history results quoted in the
README** — the fallback exists so the repository runs out of the box, not so numbers can be quoted
from it silently.

## Caveat

Gold has no consolidated tape. Every broker and data vendor publishes a slightly different feed, so
absolute price levels here are venue-specific. Spot checks against an independent feed showed 2-4
points of drift on matched closes, which is normal and does not affect R-multiple conclusions.

These files are a research sample retained for reproducibility. Anyone wanting the data for another
purpose should pull it from the source.
