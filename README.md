# Token Launch Radar

Entry for make.fun bounty **token-radar-01**: build the best token launch radar.

A program (`main.ts`, Node 22, standard library only) reads a sealed DefiLlama snapshot (`/input/snapshot.json`, 14 Nov 2026, 758 protocols, watchlist of 40) and writes a ranked board plus a static dashboard. No network at runtime.

## What it does differently

- **Board = all 198 clean pre-token protocols**, not a TVL top-N cut. A protocol is ranked only when it records no token *and* is not a wrapped, staked or bridged product of a token that already trades — the watchlist's own exclusion rule (category, name words, exchange prefix, version marker) applied to the whole snapshot. That is the 40 watchlist slugs plus 158 early finds below the $50M floor.
- **Value model v2, calibrated from the snapshot itself.** The base multiple is the *median* market-cap / TVL across the live-token protocols in the same snapshot (0.214x here), not a hand-picked constant. Implied value = TVL x base x growth (1 + clamp(7d, -60%, +200%)) x maturity (0.55 + 0.60 x sqrt(age / 1460d)) x chain breadth (1 + 0.02 x chains, max 5). No protocol name is special-cased.
- **Live tokens are set aside, not ranked.** The 24 largest by market cap are shown apart, at the market's own value, as the calibration set.
- **Farm plans are derived, not slogans.** Eight steps per protocol from its category, chains, TVL tier and age, each stating its cost and its time, including a second-chain step, a hold window, a claim-safety check and a test exit.
- **Dashboard** (`dashboard/`): sortable board, search / category / chain / scope filters, a detail view for every protocol with the model recomputed in the page (so the page and `board.json` visibly agree), and a Live tab.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json` (via `vendor/makefun-board.ts`).

## Screenshots

- `1-board.jpg` — the board
- `2-detail.jpg` — a protocol's detail view (top-ranked protocol)
- `3-filtered.jpg` — a filtered view (Risk Curators, watchlist scope)

## Notes

- "Records no token" is what the snapshot says, not proof a protocol has none.
- Implied value is this entry's own claim, not a prediction that a token launches, and not financial advice.
- License: MIT (see `LICENSE`).
