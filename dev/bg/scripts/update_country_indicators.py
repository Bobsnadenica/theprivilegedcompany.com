#!/usr/bin/env python3
"""Обновява компактните серии на Световната банка за статичния атлас."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SERIES = {
    "population": ("SP.POP.TOTL", "Население", "души", "%", "Оценка на населението към средата на годината. Не е броят от преброяване или населението към 31 декември."),
    "gdp": ("NY.GDP.MKTP.CD", "БВП в текущи цени", "текущи щатски долари", "%", "Номинална стойност. Промяната отразява и цени и валутни курсове; за реалния растеж вижте отделния показател."),
    "growth": ("NY.GDP.MKTP.KD.ZG", "Реален растеж на БВП", "% спрямо предходната година", "п.п.", "Годишна промяна на БВП по постоянни цени. Отрицателна стойност означава спад спрямо предходната година."),
    "inflation": ("FP.CPI.TOTL.ZG", "Инфлация", "годишна промяна на потребителските цени, %", "п.п.", "Годишна промяна на индекса на потребителските цени. Това не е текущата месечна инфлация или хармонизираният индекс на ЕС."),
    "unemployment": ("SL.UEM.TOTL.ZS", "Безработица", "% от работната сила · моделна оценка на МОТ", "п.п.", "Моделна оценка на Международната организация на труда. Делът е от работната сила, не от цялото население; не е регистрираната безработица."),
    "life": ("SP.DYN.LE00.IN", "Продължителност на живота", "години · при раждане", "години", "Очаквана продължителност при запазване на наблюдаваните нива на смъртност. Не е средната възраст на населението."),
    "forest": ("AG.LND.FRST.ZS", "Горски територии", "% от сухоземната площ", "п.п.", "Дял от сухоземната площ по данни на ФАО. Вътрешните водни площи не участват в знаменателя."),
    "internet": ("IT.NET.USER.ZS", "Използване на интернет", "% от населението", "п.п.", "Лица, използвали интернет през последните три месеца, по данни на Международния съюз по далекосъобщения. Не е дял на домакинствата с достъп."),
}


def fetch_json(url: str, retries: int = 3, timeout: int = 35):
    last_error = None
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": "BulgariaOpenDataAtlas/1.0"})
            with urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw), raw
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
    if not 10 <= args.years <= 65:
        parser.error("--years must be between 10 and 65")
    output_path = Path(args.output)
    raw_dir = output_path.parent / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    base = "https://api.worldbank.org/v2/country/BGR/indicator"
    output = {
        "source": base,
        "source_name": "Световна банка — Отворени данни",
        "country": "България",
        "country_code": "BGR",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "license": "CC BY 4.0",
        "series": {},
    }

    for key, (indicator, title, unit, change_unit, note) in SERIES.items():
        query = urlencode({"format": "json", "per_page": 100})
        api_url = f"{base}/{indicator}?{query}"
        payload, raw = fetch_json(api_url)
        if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
            raise RuntimeError(f"Unexpected World Bank response for {indicator}")
        if payload[0].get("pages") != 1 or len(payload[1]) != payload[0].get("total"):
            raise RuntimeError(f"Incomplete World Bank response for {indicator}")
        if any(row.get("countryiso3code") != "BGR" or row.get("indicator", {}).get("id") != indicator for row in payload[1]):
            raise RuntimeError(f"Wrong country or indicator in {api_url}")
        rows = [
            {"year": row["date"], "value": row["value"], "status": row.get("obs_status", "")}
            for row in payload[1]
            if row.get("value") is not None and str(row.get("date", "")).isdigit()
        ]
        rows.sort(key=lambda row: int(row["year"]))
        if len(rows) < args.years or len({row['year'] for row in rows}) != len(rows):
            raise RuntimeError(f"Missing or duplicate annual observations for {indicator}")
        if any(not isinstance(row['value'], (int, float)) or not math.isfinite(row['value']) for row in rows):
            raise RuntimeError(f"Invalid numeric observation for {indicator}")
        metadata_url = f"https://api.worldbank.org/v2/indicator/{indicator}?format=json"
        metadata, metadata_raw = fetch_json(metadata_url)
        definition = next(row for row in metadata[1] if row["id"] == indicator)
        (raw_dir / f"{key}.json").write_bytes(raw)
        (raw_dir / f"{key}-metadata.json").write_bytes(metadata_raw)
        selected = rows[-args.years:]
        with (output_path.parent / f"{key}.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["year", "value", "unit", "indicator", "country", "status", "source"])
            writer.writerows([row['year'], row['value'], unit, indicator, "BGR", row['status'], api_url] for row in selected)
        output["series"][key] = {
            "indicator": indicator,
            "title": title,
            "unit": unit,
            "source_url": f"https://data.worldbank.org/indicator/{indicator}?locations=BG",
            "api_url": api_url,
            "metadata_url": metadata_url,
            "source_last_updated": payload[0].get("lastupdated"),
            "publisher": definition["sourceOrganization"],
            "definition": definition["sourceNote"],
            "note": note,
            "change_unit": change_unit,
            "raw_path": f"indicators/raw/{key}.json",
            "raw_sha256": hashlib.sha256(raw).hexdigest(),
            "metadata_path": f"indicators/raw/{key}-metadata.json",
            "metadata_sha256": hashlib.sha256(metadata_raw).hexdigest(),
            "csv_path": f"indicators/{key}.csv",
            "data": selected,
        }
        print(f"{indicator}: {selected[0]['year']}–{selected[-1]['year']}; latest {selected[-1]['value']}", flush=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
