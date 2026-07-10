#!/usr/bin/env python3
"""Deterministic checks for the technical signal calculations."""

from __future__ import annotations

import numpy as np
import pandas as pd

from update_market_data import Asset, analyze_asset, assert_fresh_prices, rsi


TEST_ASSET = Asset(
    id="test",
    query_symbol="TEST",
    symbol="TEST",
    name="Test Asset",
    asset_type="stock",
    exchange="NYSE",
    sector="Test",
    market_cap=1_000_000_000,
)


def series(values: np.ndarray) -> pd.Series:
    return pd.Series(values, index=pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(values), freq="D"))


def main() -> None:
    progress = np.linspace(0, 1, 320)
    rising = series(100 + (progress ** 2) * 120)
    falling = series(220 - (progress ** 2) * 120)
    flat = series(np.full(320, 150.0))

    rising_result = analyze_asset(TEST_ASSET, rising)
    falling_result = analyze_asset(TEST_ASSET, falling)
    flat_result = analyze_asset(TEST_ASSET, flat)

    assert rising_result["signals"]["one_day"]["label"] == "BUY"
    assert rising_result["signals"]["one_month"]["label"] == "BUY"
    assert rising_result["signals"]["one_year"]["label"] == "BUY"
    assert rising_result["indicators"]["trend_regime"] == "BULLISH"
    assert rising_result["indicators"]["macd"] == "BULLISH"

    assert falling_result["signals"]["one_day"]["label"] == "SELL"
    assert falling_result["signals"]["one_month"]["label"] == "SELL"
    assert falling_result["signals"]["one_year"]["label"] == "SELL"
    assert falling_result["indicators"]["trend_regime"] == "BEARISH"
    assert falling_result["indicators"]["macd"] == "BEARISH"

    assert flat_result["signals"]["one_day"]["label"] == "HOLD"
    assert flat_result["signals"]["one_month"]["label"] == "HOLD"
    assert flat_result["signals"]["one_year"]["label"] == "HOLD"
    assert flat_result["indicators"]["trend_regime"] == "MIXED"
    assert rsi(flat) == 50.0

    stale_result = dict(rising_result)
    stale_result["price_age_days"] = 8
    try:
        assert_fresh_prices([stale_result])
    except RuntimeError as exc:
        assert "TEST" in str(exc)
    else:
        raise AssertionError("stale prices must block publication")

    print("Validated rising, falling, and flat signal regimes")


if __name__ == "__main__":
    main()
