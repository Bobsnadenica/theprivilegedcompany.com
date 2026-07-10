#!/usr/bin/env python3
"""Download daily prices and build the static Asset Intel analysis payload."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "analysis.json"


@dataclass(frozen=True)
class Asset:
    id: str
    query_symbol: str
    symbol: str
    name: str
    asset_type: str
    exchange: str
    sector: str
    market_cap: int | None = None


FALLBACK_ASSETS = [
    Asset("bitcoin", "BTC-USD", "BTC", "Bitcoin", "crypto", "Crypto", "Digital asset"),
    Asset("ethereum", "ETH-USD", "ETH", "Ethereum", "crypto", "Crypto", "Digital asset"),
    Asset("berkshire-hathaway", "BRK-B", "BRK.B", "Berkshire Hathaway", "stock", "NYSE", "Financials"),
    Asset("jpmorgan", "JPM", "JPM", "JPMorgan Chase", "stock", "NYSE", "Financials"),
    Asset("walmart", "WMT", "WMT", "Walmart", "stock", "NYSE", "Consumer staples"),
    Asset("eli-lilly", "LLY", "LLY", "Eli Lilly", "stock", "NYSE", "Health care"),
    Asset("visa", "V", "V", "Visa", "stock", "NYSE", "Financials"),
    Asset("mastercard", "MA", "MA", "Mastercard", "stock", "NYSE", "Financials"),
    Asset("exxon-mobil", "XOM", "XOM", "Exxon Mobil", "stock", "NYSE", "Energy"),
    Asset("johnson-johnson", "JNJ", "JNJ", "Johnson & Johnson", "stock", "NYSE", "Health care"),
    Asset("oracle", "ORCL", "ORCL", "Oracle", "stock", "NYSE", "Technology"),
    Asset("home-depot", "HD", "HD", "Home Depot", "stock", "NYSE", "Consumer discretionary"),
    Asset("procter-gamble", "PG", "PG", "Procter & Gamble", "stock", "NYSE", "Consumer staples"),
    Asset("abbvie", "ABBV", "ABBV", "AbbVie", "stock", "NYSE", "Health care"),
    Asset("coca-cola", "KO", "KO", "Coca-Cola", "stock", "NYSE", "Consumer staples"),
    Asset("bank-of-america", "BAC", "BAC", "Bank of America", "stock", "NYSE", "Financials"),
    Asset("salesforce", "CRM", "CRM", "Salesforce", "stock", "NYSE", "Technology"),
    Asset("chevron", "CVX", "CVX", "Chevron", "stock", "NYSE", "Energy"),
    Asset("thermo-fisher", "TMO", "TMO", "Thermo Fisher Scientific", "stock", "NYSE", "Health care"),
    Asset("ibm", "IBM", "IBM", "IBM", "stock", "NYSE", "Technology"),
    Asset("ge-aerospace", "GE", "GE", "GE Aerospace", "stock", "NYSE", "Industrials"),
    Asset("caterpillar", "CAT", "CAT", "Caterpillar", "stock", "NYSE", "Industrials"),
]

CRYPTO_ASSETS = FALLBACK_ASSETS[:2]
FALLBACK_STOCKS = FALLBACK_ASSETS[2:]

SECTOR_BY_SYMBOL = {
    "TSM": "Technology",
    "BRK-B": "Financials",
    "LLY": "Health care",
    "JPM": "Financials",
    "V": "Financials",
    "JNJ": "Health care",
    "XOM": "Energy",
    "MA": "Financials",
    "CAT": "Industrials",
    "ABBV": "Health care",
    "BAC": "Financials",
    "ORCL": "Technology",
    "UNH": "Health care",
    "GE": "Industrials",
    "KO": "Consumer staples",
    "MS": "Financials",
    "CVX": "Energy",
    "PG": "Consumer staples",
    "HD": "Consumer discretionary",
    "HSBC": "Financials",
    "GS": "Financials",
    "MRK": "Health care",
    "WMT": "Consumer staples",
    "CRM": "Technology",
    "TMO": "Health care",
    "IBM": "Technology",
}

COMPANY_NAME_BY_SYMBOL = {
    "TSM": "Taiwan Semiconductor Manufacturing",
    "BRK-B": "Berkshire Hathaway",
    "LLY": "Eli Lilly",
    "JPM": "JPMorgan Chase",
    "V": "Visa",
    "JNJ": "Johnson & Johnson",
    "XOM": "Exxon Mobil",
    "MA": "Mastercard",
    "CAT": "Caterpillar",
    "ABBV": "AbbVie",
    "BAC": "Bank of America",
    "ORCL": "Oracle",
    "UNH": "UnitedHealth Group",
    "GE": "GE Aerospace",
    "KO": "Coca-Cola",
    "MS": "Morgan Stanley",
    "CVX": "Chevron",
    "PG": "Procter & Gamble",
    "HD": "Home Depot",
    "HSBC": "HSBC Holdings",
    "GS": "Goldman Sachs",
    "MRK": "Merck",
}


def previous_snapshot_stocks(limit: int = 20) -> list[Asset]:
    """Keep the last known valid universe when the remote screener is unavailable."""
    if not OUTPUT_PATH.exists():
        return []
    try:
        payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        stocks = [item for item in payload.get("assets", []) if item.get("type") == "stock"]
        if len(stocks) != limit:
            return []
        return [
            Asset(
                id=str(item["id"]),
                query_symbol=str(item["query_symbol"]),
                symbol=str(item["symbol"]),
                name=str(item["name"]),
                asset_type="stock",
                exchange="NYSE",
                sector=str(item.get("sector") or "Large cap"),
                market_cap=int(item["market_cap"]) if item.get("market_cap") else None,
            )
            for item in stocks
        ]
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return []


def select_top_nyse_stocks(limit: int = 20) -> tuple[list[Asset], str]:
    """Select the largest NYSE listings by live screener market capitalization."""
    last_error: Exception | None = None
    try:
        query = yf.EquityQuery("and", [
            yf.EquityQuery("eq", ["exchange", "NYQ"]),
            yf.EquityQuery("gte", ["intradaymarketcap", 1_000_000_000]),
            yf.EquityQuery("gte", ["intradayprice", 1]),
        ])
        response: dict[str, Any] | None = None
        for attempt in range(3):
            try:
                response = yf.screen(
                    query,
                    size=60,
                    sortField="intradaymarketcap",
                    sortAsc=False,
                )
                if response.get("quotes"):
                    break
            except Exception as exc:  # pragma: no cover - depends on remote service
                last_error = exc
            time.sleep(2 ** attempt)
        if not response or not response.get("quotes"):
            raise RuntimeError(f"NYSE screener returned no quotes: {last_error}")

        selected: list[Asset] = []
        for quote in response.get("quotes", []):
            symbol = str(quote.get("symbol") or "").upper()
            market_cap = quote.get("marketCap") or quote.get("intradaymarketcap")
            if not symbol or not market_cap or quote.get("quoteType") != "EQUITY":
                continue
            if symbol == "BRK-A" or "-P" in symbol:
                continue

            name = COMPANY_NAME_BY_SYMBOL.get(symbol) or (
                quote.get("displayName")
                or quote.get("longName")
                or quote.get("shortName")
                or symbol
            )
            selected.append(Asset(
                id=symbol.lower().replace("-", "-class-"),
                query_symbol=symbol,
                symbol=symbol.replace("-", "."),
                name=str(name),
                asset_type="stock",
                exchange="NYSE",
                sector=SECTOR_BY_SYMBOL.get(symbol, "Large cap"),
                market_cap=int(market_cap),
            ))
            if len(selected) == limit:
                break

        if len(selected) != limit:
            raise RuntimeError(f"screener returned only {len(selected)} eligible listings")
        return selected, "dynamic_market_cap"
    except Exception as exc:  # pragma: no cover - depends on remote service
        previous = previous_snapshot_stocks(limit)
        if previous:
            print(f"NYSE screener unavailable; preserving the previous universe: {exc}", file=sys.stderr)
            return previous, "fallback_previous_snapshot"
        print(f"NYSE screener unavailable; using the curated fallback universe: {exc}", file=sys.stderr)
        return list(FALLBACK_STOCKS[:limit]), "fallback_curated"


def finite(value: float, digits: int = 4) -> float:
    """Return a rounded, JSON-safe float."""
    if not math.isfinite(float(value)):
        return 0.0
    return round(float(value), digits)


def pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return (current / previous - 1.0) * 100.0


def trailing_return(closes: pd.Series, sessions: int) -> float:
    if len(closes) <= sessions:
        return pct_change(float(closes.iloc[-1]), float(closes.iloc[0]))
    return pct_change(float(closes.iloc[-1]), float(closes.iloc[-sessions - 1]))


def rsi(closes: pd.Series, period: int = 14) -> float:
    delta = closes.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = -delta.clip(upper=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    average_gain = float(gain.iloc[-1])
    average_loss = float(loss.iloc[-1])
    if not math.isfinite(average_gain) or not math.isfinite(average_loss):
        return 50.0
    if average_gain == 0 and average_loss == 0:
        return 50.0
    if average_loss == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + average_gain / average_loss))


def compare(value: float, reference: float, threshold: float) -> int:
    if reference == 0:
        return 0
    difference = value / reference - 1.0
    if difference > threshold:
        return 1
    if difference < -threshold:
        return -1
    return 0


def momentum_score(value: float, threshold: float) -> int:
    if value > threshold:
        return 1
    if value < -threshold:
        return -1
    return 0


def summarize_components(parts: list[tuple[int, str, str, str]], overall_score: int) -> str:
    positives = [positive for score, positive, _, _ in parts if score > 0]
    negatives = [negative for score, _, negative, _ in parts if score < 0]
    neutrals = [neutral for score, _, _, neutral in parts if score == 0]
    if overall_score > 0:
        selected = (positives + negatives + neutrals)[:2]
    elif overall_score < 0:
        selected = (negatives + positives + neutrals)[:2]
    else:
        selected = (positives[:1] + negatives[:1] + neutrals)[:2]
    return "; ".join(selected) + "."


def make_signal(parts: list[tuple[int, str, str, str]]) -> dict[str, Any]:
    score = sum(part[0] for part in parts)
    alignment = score / max(len(parts), 1)
    label = "BUY" if alignment >= 0.35 else "SELL" if alignment <= -0.35 else "HOLD"
    strength = round(min(95, 50 + abs(alignment) * 45))
    return {
        "label": label,
        "score": score,
        "max_score": len(parts),
        "alignment": finite(alignment, 3),
        "strength": strength,
        "summary": summarize_components(parts, score),
    }


def extract_close(frame: pd.DataFrame, ticker: str) -> pd.Series:
    if frame.empty:
        return pd.Series(dtype="float64")

    if isinstance(frame.columns, pd.MultiIndex):
        first_level = frame.columns.get_level_values(0)
        second_level = frame.columns.get_level_values(1)
        if ticker in first_level:
            close = frame[ticker]["Close"]
        elif ticker in second_level:
            close = frame["Close"][ticker]
        else:
            return pd.Series(dtype="float64")
    elif "Close" in frame.columns:
        close = frame["Close"]
    else:
        return pd.Series(dtype="float64")

    return pd.to_numeric(close, errors="coerce").dropna().sort_index()


def download_history(tickers: list[str]) -> dict[str, pd.Series]:
    last_error: Exception | None = None
    bulk = pd.DataFrame()
    for attempt in range(3):
        try:
            bulk = yf.download(
                tickers=tickers,
                period="2y",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                actions=False,
                repair=False,
                threads=True,
                progress=False,
                timeout=30,
            )
            if not bulk.empty:
                break
        except Exception as exc:  # pragma: no cover - depends on remote service
            last_error = exc
        time.sleep(2 ** attempt)

    histories: dict[str, pd.Series] = {}
    missing: list[str] = []
    for ticker in tickers:
        closes = extract_close(bulk, ticker)
        if len(closes) >= 40:
            histories[ticker] = closes
        else:
            missing.append(ticker)

    for ticker in missing:
        for attempt in range(3):
            try:
                individual = yf.download(
                    tickers=ticker,
                    period="2y",
                    interval="1d",
                    auto_adjust=True,
                    actions=False,
                    repair=False,
                    threads=False,
                    progress=False,
                    timeout=30,
                    multi_level_index=False,
                )
                closes = extract_close(individual, ticker)
                if len(closes) >= 40:
                    histories[ticker] = closes
                    break
            except Exception as exc:  # pragma: no cover - depends on remote service
                last_error = exc
            time.sleep(2 ** attempt)

    still_missing = [ticker for ticker in tickers if ticker not in histories]
    if still_missing:
        detail = f" Last error: {last_error}" if last_error else ""
        raise RuntimeError(f"Missing usable history for: {', '.join(still_missing)}.{detail}")
    return histories


def analyze_asset(asset: Asset, closes: pd.Series) -> dict[str, Any]:
    last = float(closes.iloc[-1])
    previous = float(closes.iloc[-2])
    sma20 = float(closes.tail(20).mean())
    sma50 = float(closes.tail(50).mean())
    sma200 = float(closes.tail(200).mean())
    return_5d = trailing_return(closes, 5)
    return_1m = trailing_return(closes, 21)
    return_1y = trailing_return(closes, 252)
    rsi14 = rsi(closes)
    daily_returns = closes.pct_change().dropna().tail(20)
    volatility_20d = float(daily_returns.std(ddof=0) * math.sqrt(252) * 100.0)

    ema12 = closes.ewm(span=12, adjust=False).mean()
    ema26 = closes.ewm(span=26, adjust=False).mean()
    macd_line_series = ema12 - ema26
    macd_signal_series = macd_line_series.ewm(span=9, adjust=False).mean()
    macd_line = float(macd_line_series.iloc[-1])
    macd_signal = float(macd_signal_series.iloc[-1])
    macd_histogram = macd_line - macd_signal
    macd_histogram_pct = (macd_histogram / last) * 100.0 if last else 0.0
    macd_vote = momentum_score(macd_histogram_pct, 0.02)
    macd_state = "BULLISH" if macd_vote > 0 else "BEARISH" if macd_vote < 0 else "NEUTRAL"

    std20 = float(closes.tail(20).std(ddof=0))
    bollinger_upper = sma20 + 2 * std20
    bollinger_lower = sma20 - 2 * std20
    band_width = bollinger_upper - bollinger_lower
    bollinger_percent_b = ((last - bollinger_lower) / band_width) * 100.0 if band_width else 50.0
    if bollinger_percent_b > 100:
        bollinger_state = "ABOVE BAND"
    elif bollinger_percent_b >= 55:
        bollinger_state = "UPPER HALF"
    elif bollinger_percent_b >= 45:
        bollinger_state = "MID BAND"
    elif bollinger_percent_b >= 0:
        bollinger_state = "LOWER HALF"
    else:
        bollinger_state = "BELOW BAND"
    bollinger_vote = 1 if 55 <= bollinger_percent_b <= 100 else -1 if 0 <= bollinger_percent_b < 45 else 0

    regime_vote = 1 if last > sma50 > sma200 else -1 if last < sma50 < sma200 else 0
    regime = "BULLISH" if regime_vote > 0 else "BEARISH" if regime_vote < 0 else "MIXED"
    volatility_medium = 50.0 if asset.asset_type == "crypto" else 25.0
    volatility_high = 80.0 if asset.asset_type == "crypto" else 45.0
    volatility_risk = "LOW" if volatility_20d < volatility_medium else "HIGH" if volatility_20d >= volatility_high else "MEDIUM"

    year_window = closes.tail(253)
    year_high = float(year_window.max())
    distance_from_year_high = pct_change(last, year_high)
    rolling_peak = year_window.cummax()
    max_drawdown_1y = float(((year_window / rolling_peak) - 1.0).min() * 100.0)
    high_proximity_vote = 1 if distance_from_year_high >= -10 else -1 if distance_from_year_high <= -25 else 0

    one_day = make_signal([
        (
            compare(last, sma20, 0.003),
            "price is above its 20-day average",
            "price is below its 20-day average",
            "price is near its 20-day average",
        ),
        (
            momentum_score(return_5d, 0.5),
            f"five-session momentum is {return_5d:+.1f}%",
            f"five-session momentum is {return_5d:+.1f}%",
            "five-session momentum is flat",
        ),
        (
            1 if 55 <= rsi14 <= 72 else -1 if rsi14 < 42 else 0,
            f"RSI {rsi14:.1f} confirms positive momentum",
            f"RSI {rsi14:.1f} shows weak momentum",
            f"RSI {rsi14:.1f} is neutral",
        ),
        (
            macd_vote,
            "MACD momentum is bullish",
            "MACD momentum is bearish",
            "MACD momentum is neutral",
        ),
        (
            bollinger_vote,
            "price holds in the upper Bollinger range",
            "price sits in the lower Bollinger range",
            "Bollinger position is neutral or extended",
        ),
    ])

    one_month = make_signal([
        (
            compare(last, sma50, 0.01),
            "price is above its 50-day average",
            "price is below its 50-day average",
            "price is near its 50-day average",
        ),
        (
            compare(sma20, sma50, 0.005),
            "the 20-day trend leads the 50-day trend",
            "the 20-day trend trails the 50-day trend",
            "medium-term averages are converging",
        ),
        (
            momentum_score(return_1m, 3.0),
            f"one-month return is {return_1m:+.1f}%",
            f"one-month return is {return_1m:+.1f}%",
            "one-month return is range-bound",
        ),
        (
            macd_vote,
            "MACD momentum is bullish",
            "MACD momentum is bearish",
            "MACD momentum is neutral",
        ),
        (
            regime_vote,
            "moving averages form a bullish regime",
            "moving averages form a bearish regime",
            "the trend regime is mixed",
        ),
    ])

    one_year = make_signal([
        (
            compare(last, sma200, 0.02),
            "price is above its 200-day average",
            "price is below its 200-day average",
            "price is near its 200-day average",
        ),
        (
            compare(sma50, sma200, 0.02),
            "the 50-day trend leads the 200-day trend",
            "the 50-day trend trails the 200-day trend",
            "long-term averages are converging",
        ),
        (
            momentum_score(return_1y, 8.0),
            f"one-year return is {return_1y:+.1f}%",
            f"one-year return is {return_1y:+.1f}%",
            "one-year return is range-bound",
        ),
        (
            regime_vote,
            "moving averages form a bullish regime",
            "moving averages form a bearish regime",
            "the trend regime is mixed",
        ),
        (
            high_proximity_vote,
            "price remains near its one-year high",
            "price is more than 25% below its one-year high",
            "price is mid-range versus its one-year high",
        ),
    ])

    price_date = closes.index[-1]
    if hasattr(price_date, "date"):
        price_date = price_date.date().isoformat()
    else:
        price_date = str(price_date)
    price_age_days = max(0, (datetime.now(timezone.utc).date() - date.fromisoformat(price_date)).days)

    return {
        "id": asset.id,
        "query_symbol": asset.query_symbol,
        "symbol": asset.symbol,
        "name": asset.name,
        "type": asset.asset_type,
        "exchange": asset.exchange,
        "sector": asset.sector,
        "market_cap": asset.market_cap,
        "currency": "USD",
        "price": finite(last),
        "change": finite(last - previous),
        "change_pct": finite(pct_change(last, previous)),
        "price_as_of": price_date,
        "price_age_days": price_age_days,
        "history_points": len(closes),
        "metrics": {
            "rsi14": finite(rsi14),
            "sma20": finite(sma20),
            "sma50": finite(sma50),
            "sma200": finite(sma200),
            "return_5d": finite(return_5d),
            "return_1m": finite(return_1m),
            "return_1y": finite(return_1y),
            "volatility_20d": finite(volatility_20d),
            "distance_sma200": finite(pct_change(last, sma200)),
            "distance_year_high": finite(distance_from_year_high),
            "max_drawdown_1y": finite(max_drawdown_1y),
            "macd_line": finite(macd_line),
            "macd_signal": finite(macd_signal),
            "macd_histogram": finite(macd_histogram),
            "macd_histogram_pct": finite(macd_histogram_pct),
            "bollinger_upper": finite(bollinger_upper),
            "bollinger_lower": finite(bollinger_lower),
            "bollinger_percent_b": finite(bollinger_percent_b),
        },
        "indicators": {
            "trend_regime": regime,
            "macd": macd_state,
            "bollinger": bollinger_state,
            "volatility_risk": volatility_risk,
        },
        "signals": {
            "one_day": one_day,
            "one_month": one_month,
            "one_year": one_year,
        },
    }


def assert_fresh_prices(analyzed: list[dict[str, Any]]) -> None:
    stale_assets = [
        asset["symbol"]
        for asset in analyzed
        if asset["price_age_days"] > (3 if asset["type"] == "crypto" else 7)
    ]
    if stale_assets:
        raise RuntimeError(f"Refusing to publish stale prices for: {', '.join(stale_assets)}")


def build_payload() -> dict[str, Any]:
    stock_assets, universe_selection = select_top_nyse_stocks()
    assets = [*CRYPTO_ASSETS, *stock_assets]
    histories = download_history([asset.query_symbol for asset in assets])
    analyzed = [analyze_asset(asset, histories[asset.query_symbol]) for asset in assets]
    assert_fresh_prices(analyzed)
    latest_price_date = max(asset["price_as_of"] for asset in analyzed)
    minimum_history = min(asset["history_points"] for asset in analyzed)
    maximum_price_age = max(asset["price_age_days"] for asset in analyzed)
    return {
        "schema_version": 2,
        "methodology_version": "trend-momentum-macd-v2",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest_price_date": latest_price_date,
        "source": "Yahoo Finance via yfinance",
        "universe_selection": universe_selection,
        "universe_note": "Bitcoin, Ethereum, and the 20 largest eligible NYSE listings by current screener market capitalization.",
        "data_health": {
            "status": "healthy",
            "asset_count": len(analyzed),
            "expected_asset_count": 22,
            "minimum_history_points": minimum_history,
            "maximum_price_age_days": maximum_price_age,
            "missing_assets": [],
        },
        "assets": analyzed,
    }


def write_payload(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="Output JSON path")
    parser.add_argument("--check", action="store_true", help="Analyze without writing the JSON file")
    args = parser.parse_args()

    payload = build_payload()
    if not args.check:
        write_payload(payload, args.output)
        print(f"Wrote {len(payload['assets'])} assets to {args.output}")
    else:
        print(f"Validated {len(payload['assets'])} assets; latest prices: {payload['latest_price_date']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Market refresh failed: {exc}", file=sys.stderr)
        raise
