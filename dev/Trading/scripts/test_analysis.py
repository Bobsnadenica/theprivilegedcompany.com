#!/usr/bin/env python3
"""Validate the generated dashboard data contract without external test tools."""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "analysis.json"
HORIZONS = {"one_day", "one_month", "one_year"}
SIGNALS = {"BUY", "HOLD", "SELL"}


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    assets = payload["assets"]
    assert payload["schema_version"] == 2
    assert payload["methodology_version"] == "trend-momentum-macd-v2"
    assert len(assets) == 22, f"expected 22 assets, found {len(assets)}"
    assert len({asset["id"] for asset in assets}) == 22, "asset ids must be unique"
    assert len({asset["query_symbol"] for asset in assets}) == 22, "query symbols must be unique"
    assert sum(asset["type"] == "crypto" for asset in assets) == 2
    assert sum(asset["type"] == "stock" for asset in assets) == 20
    assert payload["universe_selection"] in {"dynamic_market_cap", "fallback_previous_snapshot", "fallback_curated"}
    generated_at = datetime.fromisoformat(payload["generated_at"])
    assert generated_at.tzinfo is not None
    assert generated_at <= datetime.now(timezone.utc)
    health = payload["data_health"]
    assert health["status"] == "healthy"
    assert health["asset_count"] == health["expected_asset_count"] == 22
    assert health["minimum_history_points"] >= 40
    assert health["maximum_price_age_days"] <= 7
    assert health["missing_assets"] == []
    stocks = [asset for asset in assets if asset["type"] == "stock"]
    assert all(asset["exchange"] == "NYSE" for asset in stocks)
    if payload["universe_selection"] in {"dynamic_market_cap", "fallback_previous_snapshot"}:
        market_caps = [asset["market_cap"] for asset in stocks]
        assert all(isinstance(value, int) and value > 0 for value in market_caps)
        assert market_caps == sorted(market_caps, reverse=True), "NYSE stocks must remain market-cap ranked"

    for asset in assets:
        assert asset["price"] > 0, f"invalid price for {asset['symbol']}"
        assert math.isfinite(asset["change_pct"]), f"invalid change for {asset['symbol']}"
        price_age = (date.today() - date.fromisoformat(asset["price_as_of"])).days
        assert asset["price_age_days"] == max(0, price_age)
        assert asset["price_age_days"] <= (3 if asset["type"] == "crypto" else 7)
        assert set(asset["signals"]) == HORIZONS
        assert 0 <= asset["metrics"]["rsi14"] <= 100
        assert asset["indicators"]["trend_regime"] in {"BULLISH", "MIXED", "BEARISH"}
        assert asset["indicators"]["macd"] in {"BULLISH", "NEUTRAL", "BEARISH"}
        assert asset["indicators"]["bollinger"] in {"ABOVE BAND", "UPPER HALF", "MID BAND", "LOWER HALF", "BELOW BAND"}
        assert asset["indicators"]["volatility_risk"] in {"LOW", "MEDIUM", "HIGH"}
        for horizon in HORIZONS:
            signal = asset["signals"][horizon]
            assert signal["label"] in SIGNALS
            assert signal["max_score"] == 5
            assert -5 <= signal["score"] <= 5
            assert -1 <= signal["alignment"] <= 1
            assert 50 <= signal["strength"] <= 95
            assert signal["summary"].endswith(".")

    print(f"Validated {len(assets)} assets in {DATA_PATH}")


if __name__ == "__main__":
    main()
