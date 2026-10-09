# ARM Dashboard

Investor dashboard for Arm Holdings (Nasdaq: ARM): price, royalty vs. licensing revenue, guidance, financials, watch list. EN / 中文, light / dark.

## How the live price works
- A GitHub Action (`.github/workflows/deploy.yml`) runs every 10 minutes during US market hours, fetches ARM's quote and 1-year daily closes from Yahoo Finance (`scripts/fetch-quote.mjs`), and redeploys the site. No commits are made.
- The page reloads `data/quote.json` every minute, so the price, change, market cap, YTD and chart update without a refresh.
- The TradingView box under the price is tick-by-tick real time.
- Fundamentals (revenue, guidance, watch list) are as of Oct 9, 2026 and are edited in `index.html`.

Note: GitHub pauses scheduled workflows in a repo with no activity for 60 days. Re-enable it from the Actions tab if that happens.

## Publish on GitHub Pages
1. Create a public repo named `arm-dashboard`.
2. Upload `index.html`, `.nojekyll` and this README.
3. Settings → Pages → Source: **GitHub Actions**.
4. Site appears at `https://angcharles.github.io/arm-dashboard/`.

For information only, not investment advice. Not affiliated with Arm Holdings plc.
