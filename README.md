# Stock Dashboard

Investor dashboards, EN / 中文, light / dark:

- **Arm Holdings (ARM)** — `arm/index.html` → https://angcharles.github.io/stock-dashboard/arm/
- **Tesla (TSLA)** — `tesla/index.html` → https://angcharles.github.io/stock-dashboard/tesla/
- **Sandisk (SNDK)** — `sndk/index.html` → https://angcharles.github.io/stock-dashboard/sndk/
- **Intel (INTC)** — `intc/index.html` → https://angcharles.github.io/stock-dashboard/intc/
- **SpaceX (SPCX)** — `spcx/index.html` → https://angcharles.github.io/stock-dashboard/spcx/
- **Micron (MU)** — `mu/index.html` → https://angcharles.github.io/stock-dashboard/mu/
- **Lumentum (LITE)** — `lite/index.html` → https://angcharles.github.io/stock-dashboard/lite/
- **Coherent (COHR)** — `cohr/index.html` → https://angcharles.github.io/stock-dashboard/cohr/
- **Alphabet (GOOGL)** — `googl/index.html` → https://angcharles.github.io/stock-dashboard/googl/
- **Meta (META)** — `meta/index.html` → https://angcharles.github.io/stock-dashboard/meta/

Each page covers price, revenue mix, financials, free cash flow, watch list, calendar and sources. The root `index.html` (https://angcharles.github.io/stock-dashboard/) lists every stock with its latest price.

## How the live price works
- A GitHub Action (`.github/workflows/deploy.yml`) runs every 10 minutes during US market hours, fetches each symbol's quote and daily closes from Yahoo Finance (`scripts/fetch-quote.mjs SYMBOL OUTDIR RANGE`), and redeploys the site. No commits are made.
  - ARM → `arm/data/quote.json`, `arm/data/history.json`
  - TSLA → `tesla/data/quote.json`, `tesla/data/history.json` (2 years of closes, so the 50-day average covers the full 1-year chart)
  - SNDK → `sndk/data/quote.json`, `sndk/data/history.json` (all closes since the Feb 2025 listing)
  - INTC → `intc/data/quote.json`, `intc/data/history.json` (2 years of closes)
- Each page reloads its quote every minute, so the price, change, market cap, YTD and chart update without a refresh.
- The TradingView box under the price is tick-by-tick real time.
- Fundamentals (revenue, guidance, watch list) are as of Oct 9, 2026 and are edited in each page's HTML.

## News feed
- `scripts/fetch-news.mjs` pulls the last 30 days of headlines for every stock from Google News RSS and Yahoo Finance RSS and writes `data/news.json` (newest first, up to 80 per stock, duplicates removed). The Action runs it every hour, every day, plus on every price refresh.
- `assets/news.js` shows the feed on the main page (with filter chips per stock) and on each stock page (that stock only). To add a stock, add it to `STOCKS` in the script and to `data-tickers` on the main page.

## Free cash flow section
- `assets/fcf.js` renders the "Free cash flow, by quarter" section (chart, quarterly table, estimates, cash in/out analysis, cash bridge) into `<section id="cashflow">` on each page, in EN / 中文.
- Each stock's numbers and text live in `<stock>/fcf-data.js` (`hist` = reported quarters, `est` = estimates, as [quarter, ended, operating CF, capex, FCF] in US$M). After each earnings report, move the reported quarter from `est` to `hist` and roll the estimates forward.

Note: GitHub pauses scheduled workflows in a repo with no activity for 60 days. Re-enable it from the Actions tab if that happens.

## Publish on GitHub Pages
1. Create a public repo named `stock-dashboard`.
2. Upload everything in this repo.
3. Settings → Pages → Source: **GitHub Actions**.
4. Sites appear at `https://angcharles.github.io/stock-dashboard/` plus `/arm/`, `/tesla/`, `/sndk/` and `/intc/`.

For information only, not investment advice. Not affiliated with Arm Holdings plc, Tesla, Inc., Sandisk Corporation or Intel Corporation.

## Adding a stock
Newer pages (SPCX, MU, LITE, COHR, GOOGL, META) are generated: edit `specs/<stock>.json` and run `python3 scripts/make-stock-page.py specs/<stock>.json`. Shared code is in `assets/stock-page.js` and `assets/stock.css`; price cells (52-week range, moving averages, RSI, drawdown) are computed from the live price history. For a new stock, copy a spec, generate the page, then add the fetch and copy lines to `.github/workflows/deploy.yml`, a card to the root `index.html`, and an entry to `STOCKS` in `scripts/fetch-news.mjs`.

Older pages: Copy a stock folder (e.g. `intc/`), edit its `index.html` and seed `data/`, add a fetch line and copy lines to `.github/workflows/deploy.yml`, and add a card to the root `index.html`.
