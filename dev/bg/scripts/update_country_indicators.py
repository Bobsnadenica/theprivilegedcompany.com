#!/usr/bin/env python3
"""Обновява компактните серии на Световната банка за статичния атлас."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SERIES = {
    "population": ("SP.POP.TOTL", "Население, общо", "души"),
    "gdp": ("NY.GDP.MKTP.CD", "Брутен вътрешен продукт", "текущи щатски долари"),
    "forest": ("AG.LND.FRST.ZS", "Горски територии", "% от площта на страната"),
    "internet": ("IT.NET.USER.ZS", "Лица, използващи интернет", "% от населението"),
}


def fetch_json(url: str, retries: int = 3, timeout: int = 35):
    last_error = None
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": "BulgariaOpenDataAtlas/1.0"})
            with urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed after {retries} attempts: {url}: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--years", type=int, default=12)
    args = parser.parse_args()

    base = "https://api.worldbank.org/v2/country/BGR/indicator"
    output = {
        "source": base,
        "source_name": "Световна банка — Отворени данни",
        "country": "България",
        "country_code": "BGR",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "series": {},
    }

    for key, (indicator, title, unit) in SERIES.items():
        query = urlencode({"format": "json", "per_page": 100})
        payload = fetch_json(f"{base}/{indicator}?{query}")
        if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
            raise RuntimeError(f"Unexpected World Bank response for {indicator}")
        rows = [
            {"year": row["date"], "value": row["value"]}
            for row in payload[1]
            if row.get("value") is not None and str(row.get("date", "")).isdigit()
        ]
        rows.sort(key=lambda row: int(row["year"]))
        output["series"][key] = {
            "indicator": indicator,
            "title": title,
            "unit": unit,
            "source_url": f"https://data.worldbank.org/indicator/{indicator}?locations=BG",
            "data": rows[-args.years :],
        }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
