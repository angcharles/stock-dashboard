# ARM Dashboard

Investor dashboards, EN / 中文, light / dark:

- **Arm Holdings (ARM)** — `index.html` → https://angcharles.github.io/arm-dashboard/
- **Tesla (TSLA)** — `tesla/index.html` → https://angcharles.github.io/arm-dashboard/tesla/

Each page covers price, revenue mix, financials, watch list, calendar and sources.

## How the live price works
- A GitHub Action (`.github/workflows/deploy.yml`) runs every 10 minutes during US market hours, fetches each symbol's quote and daily closes from Yahoo Finance (`scripts/fetch-quote.mjs SYMBOL OUTDIR RANGE`), and redeploys the site. No commits are made.
  - ARM → `data/quote.json`, `data/history.json`
  - TSLA → `tesla/data/quote.json`, `tesla/data/history.json` (2 years of closes, so the 50-day average covers the full 1-year chart)
- Each page reloads its quote every minute, so the price, change, market cap, YTD and chart update without a refresh.
- The TradingView box under the price is tick-by-tick real time.
- Fundamentals (revenue, guidance, watch list) are as of Oct 9, 2026 and are edited in each page's HTML.

Note: GitHub pauses scheduled workflows in a repo with no activity for 60 days. Re-enable it from the Actions tab if that happens.

## Publish on GitHub Pages
1. Create a public repo named `arm-dashboard`.
2. Upload everything in this repo.
3. Settings → Pages → Source: **GitHub Actions**.
4. Sites appear at `https://angcharles.github.io/arm-dashboard/` and `/tesla/`.

For information only, not investment advice. Not affiliated with Arm Holdings plc or Tesla, Inc.
