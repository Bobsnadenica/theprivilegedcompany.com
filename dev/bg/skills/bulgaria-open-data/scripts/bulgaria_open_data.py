#!/usr/bin/env python3
"""Изтегляне и инвентаризация на данни от Портала за отворени данни."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


CATEGORIES = {
    1: "Селско стопанство, риболов и аквакултури, горско стопанство и храни",
    2: "Образование, култура и спорт",
    3: "Околна среда",
    4: "Енергетика",
    5: "Транспорт",
    6: "Наука и технологии",
    7: "Икономика и финанси",
    8: "Население и социални условия",
    9: "Правителство и публичен сектор",
    10: "Здравеопазване",
    11: "Региони и градове",
    12: "Правосъдие, правна система и обществена безопасност",
    13: "Международни въпроси",
    14: "Некатегоризирани",
}

USER_AGENT = "BulgariaOpenDataAtlas/2.0 (+local reproducible snapshot)"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class PortalClient:
    """Малък клиент с retry и ограничение под официалните 60 заявки/минута."""

    def __init__(self, base: str, retries: int, timeout: int, delay: float):
        self.base = base.rstrip("/")
        self.retries = retries
        self.timeout = timeout
        self.delay = delay
        self.last_request_at = 0.0
        self.pacing_lock = threading.Lock()

    def _begin_request(self) -> None:
        with self.pacing_lock:
            remaining = self.delay - (time.monotonic() - self.last_request_at)
            if remaining > 0:
                time.sleep(remaining)
            self.last_request_at = time.monotonic()

    def post(self, method: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base}/api/{method}"
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        last_error: Exception | None = None
        for attempt in range(self.retries):
            self._begin_request()
            try:
                request = Request(
                    url,
                    data=payload,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": USER_AGENT,
                    },
                    method="POST",
                )
                with urlopen(request, timeout=self.timeout) as response:
                    result = json.load(response)
                if not isinstance(result, dict) or result.get("success") is False:
                    raise RuntimeError(f"Неуспешен API отговор от {url}: {result}")
                return result
            except (HTTPError, URLError, TimeoutError, ConnectionError, OSError, json.JSONDecodeError, RuntimeError) as error:
                last_error = error
                if attempt + 1 < self.retries:
                    time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"Заявката се провали след {self.retries} опита: {url}: {last_error}")

    def get_bytes(self, url: str) -> bytes:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            self._begin_request()
            try:
                request = Request(url, headers={"Accept": "*/*", "User-Agent": USER_AGENT})
                with urlopen(request, timeout=self.timeout) as response:
                    payload = response.read()
                if not payload:
                    raise RuntimeError("Порталът върна празен файл")
                return payload
            except (HTTPError, URLError, TimeoutError, ConnectionError, OSError, RuntimeError) as error:
                last_error = error
                if attempt + 1 < self.retries:
                    time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"Изтеглянето се провали след {self.retries} опита: {url}: {last_error}")


def paginated(
    client: PortalClient,
    method: str,
    result_key: str,
    criteria: dict[str, Any],
    page_size: int,
    max_pages: int | None,
    workers: int,
) -> tuple[int, list[dict[str, Any]]]:
    first = client.post(
        method,
        {"records_per_page": page_size, "page_number": 1, "criteria": criteria},
    )
    total = int(first.get("total_records", 0))
    rows = list(first.get(result_key, []))
    pages = math.ceil(total / page_size) if total else 1
    if max_pages is not None:
        pages = min(pages, max_pages)
    print(f"{method}: страница 1/{pages}, {len(rows)}/{total} записа", file=sys.stderr)
    def fetch_page(page: int) -> dict[str, Any]:
        return client.post(method, {"records_per_page": page_size, "page_number": page, "criteria": criteria})

    page_numbers = range(2, pages + 1)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        responses = executor.map(fetch_page, page_numbers)
        for page, response in zip(page_numbers, responses, strict=True):
            batch = response.get(result_key, [])
            if not isinstance(batch, list):
                raise RuntimeError(f"Липсва масивът {result_key} на страница {page}")
            rows.extend(batch)
            if page == pages or page % 10 == 0:
                print(f"{method}: страница {page}/{pages}, {len(rows)}/{total} записа", file=sys.stderr)
    return total, rows


def clean_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split())


def normalize_resource(raw: dict[str, Any], dataset: dict[str, Any], base: str) -> dict[str, Any] | None:
    resource_uuid = str(raw.get("uri") or "")
    if not resource_uuid:
        return None
    formats = sorted({str(value).upper() for value in dataset.get("formats", []) if value})
    return {
        "id": raw.get("id"),
        "uuid": resource_uuid,
        "dataset_identifier": dataset["uri"],
        "title": clean_text(raw.get("name")),
        "type_id": raw.get("resource_type"),
        "format_id": raw.get("file_format"),
        "formats": formats,
        "external_url": raw.get("resource_url"),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "portal_url": f"{base}/data/resourceView/{resource_uuid}",
        "download_urls": {
            format_name.lower(): f"{base}/resource/download/{resource_uuid}/{format_name.lower()}"
            for format_name in formats
            if format_name.lower() in {"csv", "json", "xml"}
        },
    }


def normalize_dataset(raw: dict[str, Any], base: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    dataset_identifier = str(raw.get("uri") or "")
    category_id = raw.get("category_id")
    if category_id not in CATEGORIES:
        category_id = 14
    resource_values = raw.get("resource") or {}
    if isinstance(resource_values, dict):
        resource_values = list(resource_values.values())
    resources = [
        normalized
        for item in resource_values
        if isinstance(item, dict)
        if (normalized := normalize_resource(item, raw, base)) is not None
    ]
    dataset = {
        "id": raw.get("id"),
        "identifier": dataset_identifier,
        "identifier_type": "uuid" if UUID_RE.fullmatch(dataset_identifier) else "legacy",
        "title": clean_text(raw.get("name")),
        "description": clean_text(raw.get("descript")),
        "locale": raw.get("locale") or "bg",
        "category_id": category_id,
        "organisation_id": raw.get("org_id"),
        "license_id": raw.get("terms_of_use_id"),
        "version": raw.get("version"),
        "source": raw.get("source"),
        "update_policy": clean_text(raw.get("sla")),
        "formats": sorted({str(value).upper() for value in raw.get("formats", []) if value}),
        "tags": sorted({clean_text(item.get("name")) for item in raw.get("tags", []) if item.get("name")}),
        "resource_count": len(resources),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "portal_url": f"{base}/data/view/{quote(dataset_identifier, safe='')}",
    }
    return dataset, resources


def normalize_organisation(raw: dict[str, Any], base: str) -> dict[str, Any]:
    organisation_identifier = str(raw.get("uri") or "")
    return {
        "id": raw.get("id"),
        "identifier": organisation_identifier,
        "name": clean_text(raw.get("name")),
        "description": clean_text(raw.get("description")),
        "parent_id": raw.get("parent_org_id"),
        "type_id": raw.get("type"),
        "datasets_count": raw.get("datasets_count"),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "portal_url": f"{base}/organisation/profile/{quote(organisation_identifier, safe='')}",
    }


def command_snapshot(args: argparse.Namespace) -> int:
    if not 1 <= args.page_size <= 100:
        raise ValueError("--page-size трябва да е между 1 и 100")
    if not 1 <= args.workers <= 8:
        raise ValueError("--workers трябва да е между 1 и 8")
    output = Path(args.output_dir)
    client = PortalClient(args.base, args.retries, args.timeout, args.delay)
    retrieved_at = utc_now()
    total_datasets, raw_datasets = paginated(
        client,
        "listDatasets",
        "datasets",
        {"locale": "bg", "status": 2, "visibility": 1},
        args.page_size,
        args.max_pages,
        args.workers,
    )
    total_organisations, raw_organisations = paginated(
        client,
        "listOrganisations",
        "organisations",
        {"locale": "bg", "active": 1, "approved": 1},
        args.page_size,
        args.max_organisation_pages,
        args.workers,
    )

    datasets: list[dict[str, Any]] = []
    resources: list[dict[str, Any]] = []
    for raw in raw_datasets:
        dataset, dataset_resources = normalize_dataset(raw, client.base)
        datasets.append(dataset)
        resources.extend(dataset_resources)
    organisations = [normalize_organisation(raw, client.base) for raw in raw_organisations]
    category_counts = Counter(dataset["category_id"] for dataset in datasets)
    categories = [
        {"id": category_id, "name": name, "dataset_count": category_counts[category_id]}
        for category_id, name in CATEGORIES.items()
    ]
    complete = args.max_pages is None and args.max_organisation_pages is None

    common = {"source": client.base, "retrieved_at": retrieved_at}
    write_json(
        output / "portal-summary.json",
        {
            **common,
            "api": f"{client.base}/api",
            "complete": complete,
            "datasets": total_datasets,
            "captured_datasets": len(datasets),
            "organisations": total_organisations,
            "captured_organisations": len(organisations),
            "resources": len(resources),
            "themes": len(CATEGORIES),
        },
    )
    write_json(output / "categories.json", {**common, "categories": categories})
    write_json(output / "datasets.json", {**common, "total_records": total_datasets, "datasets": datasets})
    write_json(
        output / "organisations.json",
        {**common, "total_records": total_organisations, "organisations": organisations},
    )
    write_json(output / "resources.json", {**common, "total_records": len(resources), "resources": resources})
    return 0


def command_resources(args: argparse.Namespace) -> int:
    client = PortalClient(args.base, args.retries, args.timeout, args.delay)
    response = client.post(
        "listResources",
        {"records_per_page": 100, "page_number": 1, "criteria": {"dataset_uri": args.dataset_identifier, "locale": "bg"}},
    )
    sys.stdout.write(json.dumps(response, ensure_ascii=False, indent=2) + "\n")
    return 0


def command_download(args: argparse.Namespace) -> int:
    client = PortalClient(args.base, args.retries, args.timeout, args.delay)
    url = f"{client.base}/resource/download/{args.resource_uuid}/{args.format}"
    payload = client.get_bytes(url)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    result = {
        "resource_uuid": args.resource_uuid,
        "format": args.format,
        "url": url,
        "output": str(output.resolve()),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "retrieved_at": utc_now(),
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return 0


def add_network_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--base", default="https://data.egov.bg")
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--delay", type=float, default=1.05, help="Минимална пауза между API заявки")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot = subparsers.add_parser("snapshot", help="Пълна нормализирана моментна снимка на публичния каталог")
    snapshot.add_argument("--output-dir", required=True)
    snapshot.add_argument("--page-size", type=int, default=100)
    snapshot.add_argument("--workers", type=int, default=4, help="Паралелни заявки; стартовете остават под лимита от 60/минута")
    snapshot.add_argument("--max-pages", type=int, help="Само за тест; прави моментната снимка непълна")
    snapshot.add_argument("--max-organisation-pages", type=int, help="Само за тест; прави моментната снимка непълна")
    add_network_options(snapshot)
    snapshot.set_defaults(func=command_snapshot)

    resources = subparsers.add_parser("resources", help="Метаданни за ресурсите към набор")
    resources.add_argument("dataset_identifier")
    add_network_options(resources)
    resources.set_defaults(func=command_resources)

    download = subparsers.add_parser("download", help="Изтегляне на един публикуван ресурс")
    download.add_argument("resource_uuid")
    download.add_argument("--format", choices=("csv", "json", "xml"), default="csv")
    download.add_argument("--output", required=True)
    add_network_options(download)
    download.set_defaults(func=command_download)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except (RuntimeError, ValueError) as error:
        print(f"грешка: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
