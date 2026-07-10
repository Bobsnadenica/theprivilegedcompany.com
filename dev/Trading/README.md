# Asset Intel

A static GitHub Pages dashboard for Bitcoin, Ethereum, and the 20 largest eligible NYSE listings by current screener market capitalization. Each asset receives a technical **Buy**, **Hold**, or **Sell** signal for one day, one month, and one year.

## How updates work

The site itself is plain HTML, CSS, and JavaScript. It reads the checked-in `data/analysis.json` file, so it does not expose API keys or depend on a browser-side market API. In production it reads the latest file from the repository's raw URL, with the GitHub Pages copy as a fallback. That makes an automated data commit visible immediately even when GitHub does not start a second Pages build for a commit created with `GITHUB_TOKEN`.

The repository-level workflow at `.github/workflows/refresh-trading-dashboard.yml` runs when files under `dev/Trading/` are pushed to `main`, when started manually, and every day at 22:20 UTC. Daily scheduling keeps crypto current on weekends while NYSE assets retain their latest market close. It:

1. Screens NYSE listings and selects the top 20 eligible equities by current market capitalization. If the screener is unavailable, it preserves the last valid universe before falling back to the curated emergency list.
2. Downloads two years of daily adjusted prices.
3. Recalculates the weighted signal stack, MACD, Bollinger position, trend regime, drawdown, and volatility risk.
4. Rejects incomplete, stale, malformed, or incorrectly ordered output.
5. Runs deterministic rising/falling/flat-regime model tests.
6. Commits a changed `data/analysis.json` back to `main` only after all checks pass.

Because this folder lives inside the existing GitHub Pages project, the page remains available at `/dev/Trading/` under the parent site's domain.

## One-time GitHub settings

- GitHub Pages must continue publishing the parent repository's `main` branch/root site.
- Repository or organization policy must permit this workflow's requested `contents: write` permission.
- If `main` is protected against GitHub Actions pushes, use a GitHub App/PAT with the required scope or change the workflow to open a reviewed data-refresh pull request.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/update_market_data.py
python scripts/test_analysis.py
python scripts/test_signal_model.py
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Signal model

- **1 day:** 20-day trend, five-session momentum, 14-day RSI, MACD, and Bollinger position.
- **1 month:** 50-day trend, 20/50-day alignment, one-month return, MACD, and the moving-average regime.
- **1 year:** 200-day trend, 50/200-day alignment, one-year return, the moving-average regime, and distance from the one-year high.

At least 35% net positive alignment produces **Buy**, at least 35% net negative alignment produces **Sell**, and mixed evidence produces **Hold**. Signal strength measures indicator agreement; it is not a probability or backtested confidence score.

## Operational safeguards

- All Python dependencies are version-pinned.
- Remote screening and price downloads retry before failing.
- A failed refresh never overwrites the previous valid JSON file.
- The workflow retries the full refresh three times, validates the data and model, rebases safely, and only then pushes.
- The browser validates the schema and all 22 assets. A malformed raw-GitHub response falls back to the Pages copy.
- A visible warning appears when the last successful analysis is more than 72 hours old.

The remaining external dependency is Yahoo market data through `yfinance`, which has no uptime guarantee and is intended for research/educational use. For a commercial advisory product, replace it with a licensed market-data feed and have the methodology reviewed for regulatory compliance. The current model does not incorporate fundamentals, news, valuation, transaction costs, or personal risk tolerance.
