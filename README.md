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
- **NVIDIA (NVDA)** — `nvda/index.html` → https://angcharles.github.io/stock-dashboard/nvda/
- **Zscaler (ZS)** — `zs/index.html` → https://angcharles.github.io/stock-dashboard/zs/
- **Bloom Energy (BE)** — `be/index.html` → https://angcharles.github.io/stock-dashboard/be/
- **Applied Optoelectronics (AAOI)** — `aaoi/index.html` → https://angcharles.github.io/stock-dashboard/aaoi/
- **AMD (AMD)** — `amd/index.html` → https://angcharles.github.io/stock-dashboard/amd/
- **MP Materials (MP)** — `mp/index.html` → https://angcharles.github.io/stock-dashboard/mp/
- **Amazon (AMZN)** — `amzn/index.html` → https://angcharles.github.io/stock-dashboard/amzn/
- **Microsoft (MSFT)** — `msft/index.html` → https://angcharles.github.io/stock-dashboard/msft/
- **Marvell (MRVL)** — `mrvl/index.html` → https://angcharles.github.io/stock-dashboard/mrvl/
- **SK hynix (SKHY)** — `skhy/index.html` → https://angcharles.github.io/stock-dashboard/skhy/
- **TSMC (TSM)** — `tsm/index.html` → https://angcharles.github.io/stock-dashboard/tsm/
- **Broadcom (AVGO)** — `avgo/index.html` → https://angcharles.github.io/stock-dashboard/avgo/
- **Rockwell Automation (ROK)** — `rok/index.html` → https://angcharles.github.io/stock-dashboard/rok/

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

## Technical analysis section
- `assets/technicals.js` adds a "Technical analysis" section (and a Technicals link in the page menu) to every stock page: interactive daily candlesticks with SMA 5/10/30/100, Parabolic SAR (0.02, 0.2) and the key levels, MACD (12, 26, 9) and RSI (14) panes, ranges 1M–2Y, and a live signal table with a bullish/bearish count. It draws from `data/history.json`, so it updates with each price refresh.
- The written read and support/resistance levels live in `<stock>/ta.json` (EN and 中文, dated). Refresh them by hand when the chart has moved enough to change the levels. SK hynix's `ta.json` has two series (Nasdaq ADS and the Seoul listing, `skhy/data/krx/history.json`), shown with a toggle.

## Top movers
- `assets/movers.js` ranks every stock by its latest daily % move and shows the top 6 beside the main page (under the stock cards on smaller screens) as candlestick charts with 5/10/30/100-day moving averages, Parabolic SAR and MACD (12, 26, 9), drawn with TradingView Lightweight Charts. Indicator and range buttons are remembered per browser.
- `scripts/fetch-quote.mjs` now saves daily open/high/low as well as close in `history.json`.

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
Newer pages (SPCX, MU, LITE, COHR, GOOGL, META, NVDA, ZS, BE, AAOI, AMD, MP, AMZN, MSFT, MRVL, SKHY, TSM, AVGO, ROK) are generated: edit `specs/<stock>.json` and run `python3 scripts/make-stock-page.py specs/<stock>.json`. Shared code is in `assets/stock-page.js` and `assets/stock.css`; price cells (52-week range, moving averages, RSI, drawdown) are computed from the live price history. For a new stock, copy a spec, generate the page, then write `<stock>/ta.json`, add the fetch line and the folder name in the copy loop of `.github/workflows/deploy.yml`, a card to the root `index.html`, an entry to `STOCKS` in `scripts/fetch-news.mjs` and `assets/movers.js`. TSMC and SK hynix figures are converted to US$ from NT$ and won at each quarter's rate (see the specs).

Older pages: Copy a stock folder (e.g. `intc/`), edit its `index.html` and seed `data/`, add a fetch line and copy lines to `.github/workflows/deploy.yml`, and add a card to the root `index.html`.
