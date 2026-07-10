#!/usr/bin/env python3
"""Създава, валидира и атомично активира локалната моментна снимка на данните."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PORTAL_SCRIPT = ROOT / "skills/bulgaria-open-data/scripts/bulgaria_open_data.py"
INDICATOR_SCRIPT = ROOT / "scripts/update_country_indicators.py"
ROAD_SCRIPT = ROOT / "scripts/update_road_visuals.py"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

THEMES = {
    "transport": {"name": "Транспорт", "category_ids": [5]},
    "economy": {"name": "Икономика", "category_ids": [7]},
    "nature": {"name": "Природа", "category_ids": [1, 3, 4]},
    "people": {"name": "Хора", "category_ids": [2, 8, 10]},
    "public": {"name": "Публичен сектор", "category_ids": [6, 9, 11, 12, 13, 14]},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_check(identifier: str, name: str, passed: bool, details: str, severity: str = "грешка") -> dict[str, Any]:
    return {
        "id": identifier,
        "name": name,
        "status": "успешна" if passed else severity,
        "details": details,
    }


def migrate_identifier_shape(stage: Path) -> None:
    """Мигрира ранната локална схема, която погрешно наричаше всеки dataset URI UUID."""
    dataset_path = stage / "catalog/datasets.json"
    resource_path = stage / "catalog/resources.json"
    organisation_path = stage / "catalog/organisations.json"
    datasets_document = read_json(dataset_path)
    source = datasets_document["source"].rstrip("/")
    changed = False
    for row in datasets_document["datasets"]:
        if "uuid" in row and "identifier" not in row:
            row["identifier"] = row.pop("uuid")
            changed = True
        identifier = str(row.get("identifier") or "")
        row["identifier_type"] = "uuid" if UUID_RE.fullmatch(identifier) else "legacy"
        row["portal_url"] = f"{source}/data/view/{quote(identifier, safe='')}"
    if changed:
        write_json(dataset_path, datasets_document)

    resources_document = read_json(resource_path)
    resource_changed = False
    for row in resources_document["resources"]:
        if "dataset_uuid" in row and "dataset_identifier" not in row:
            row["dataset_identifier"] = row.pop("dataset_uuid")
            resource_changed = True
    if resource_changed:
        write_json(resource_path, resources_document)

    organisations_document = read_json(organisation_path)
    organisation_changed = False
    for row in organisations_document["organisations"]:
        if "uuid" in row and "identifier" not in row:
            row["identifier"] = row.pop("uuid")
            organisation_changed = True
        identifier = str(row.get("identifier") or "")
        row["portal_url"] = f"{source}/organisation/profile/{quote(identifier, safe='')}"
    if organisation_changed:
        write_json(organisation_path, organisations_document)


def validate_data(stage: Path) -> dict[str, Any]:
    migrate_identifier_shape(stage)
    summary = read_json(stage / "catalog/portal-summary.json")
    categories = read_json(stage / "catalog/categories.json")["categories"]
    datasets = read_json(stage / "catalog/datasets.json")["datasets"]
    organisations = read_json(stage / "catalog/organisations.json")["organisations"]
    resources = read_json(stage / "catalog/resources.json")["resources"]
    indicators = read_json(stage / "indicators/world-bank.json")
    road = read_json(stage / "visuals/road.json")
    checks: list[dict[str, Any]] = []

    checks.append(make_check(
        "portal-complete",
        "Пълен каталог",
        bool(summary.get("complete")) and summary.get("datasets") == len(datasets),
        f"API обявява {summary.get('datasets')} набора; записани са {len(datasets)}.",
    ))
    checks.append(make_check(
        "organisations-complete",
        "Пълен списък на организациите",
        summary.get("organisations") == len(organisations),
        f"API обявява {summary.get('organisations')} организации; записани са {len(organisations)}.",
    ))
    checks.append(make_check(
        "themes-complete",
        "Всички тематични категории",
        len(categories) == 14 and {row.get("id") for row in categories} == set(range(1, 15)),
        f"Налични са {len(categories)} от 14 категории.",
    ))
    category_sum = sum(int(row.get("dataset_count") or 0) for row in categories)
    checks.append(make_check(
        "category-reconciliation",
        "Съгласуване на тематичните бройки",
        category_sum == len(datasets),
        f"Сбор по категории: {category_sum}; общ брой набори: {len(datasets)}.",
    ))

    dataset_identifiers = [str(row.get("identifier") or "") for row in datasets]
    duplicate_datasets = len(dataset_identifiers) - len(set(dataset_identifiers))
    empty_identifiers = sum(not value for value in dataset_identifiers)
    legacy_identifiers = sum(row.get("identifier_type") == "legacy" for row in datasets)
    checks.append(make_check(
        "dataset-identifiers",
        "Уникални идентификатори на наборите",
        duplicate_datasets == 0 and empty_identifiers == 0,
        f"Дублирани: {duplicate_datasets}; празни: {empty_identifiers}.",
    ))
    checks.append(make_check(
        "dataset-legacy-identifiers",
        "Стари URI идентификатори",
        legacy_identifiers == 0,
        f"Записи с уникален legacy URI вместо UUID: {legacy_identifiers}.",
        "предупреждение",
    ))
    empty_titles = sum(not str(row.get("title") or "").strip() for row in datasets)
    checks.append(make_check(
        "dataset-titles",
        "Заглавия на наборите",
        empty_titles == 0,
        f"Набори без заглавие: {empty_titles}.",
        "предупреждение",
    ))

    resource_uuids = [str(row.get("uuid") or "") for row in resources]
    duplicate_resources = len(resource_uuids) - len(set(resource_uuids))
    invalid_resources = sum(not UUID_RE.fullmatch(value) for value in resource_uuids)
    dataset_set = set(dataset_identifiers)
    orphan_resources = sum(row.get("dataset_identifier") not in dataset_set for row in resources)
    checks.append(make_check(
        "resource-relations",
        "Ресурси и връзки към набори",
        duplicate_resources == 0 and invalid_resources == 0 and orphan_resources == 0,
        f"Ресурси: {len(resources)}; дублирани: {duplicate_resources}; невалидни UUID: {invalid_resources}; без набор: {orphan_resources}.",
    ))

    organisation_ids = [row.get("id") for row in organisations]
    duplicate_organisations = len(organisation_ids) - len(set(organisation_ids))
    mapped = set(organisation_ids)
    unmapped = sum(row.get("organisation_id") not in mapped for row in datasets)
    checks.append(make_check(
        "organisation-relations",
        "Уникални организации",
        duplicate_organisations == 0,
        f"Дублирани организации: {duplicate_organisations}.",
    ))
    checks.append(make_check(
        "organisation-coverage",
        "Покритие на връзките към организации",
        unmapped == 0,
        f"Набори без активна организация в моментната снимка: {unmapped}.",
        "предупреждение",
    ))

    expected_series = {"population", "gdp", "forest", "internet"}
    actual_series = set(indicators.get("series", {}))
    series_valid = actual_series == expected_series
    series_details: list[str] = []
    for key, series in indicators.get("series", {}).items():
        rows = series.get("data", [])
        years = [int(row["year"]) for row in rows if str(row.get("year", "")).isdigit()]
        values = [row.get("value") for row in rows]
        valid = len(rows) >= 10 and len(years) == len(rows) and years == sorted(years) and all(isinstance(value, (int, float)) for value in values)
        series_valid = series_valid and valid
        series_details.append(f"{key}: {len(rows)} наблюдения")
    checks.append(make_check(
        "indicator-series",
        "Индикатори на Световната банка",
        series_valid,
        "; ".join(series_details),
    ))

    road_events = road.get("events", [])
    road_summary = road.get("summary", {})
    road_bounds = road.get("boundary", {}).get("bounds", [])
    road_structure_valid = (
        road.get("schema_version") == 1
        and len(road_bounds) == 4
        and road_summary.get("mapped_rows") == len(road_events)
        and len(road_events) >= 1_000
        and all(isinstance(event, list) and len(event) == 9 for event in road_events)
    )
    checks.append(make_check(
        "road-map-structure",
        "Структура на картата за ПТП",
        road_structure_valid,
        f"Редове: {road_summary.get('total_rows')}; картографирани точки: {len(road_events)}; период: {road_summary.get('date_from')} – {road_summary.get('date_to')}.",
    ))
    road_coordinates_valid = False
    if len(road_bounds) == 4 and road_events:
        min_lon, min_lat, max_lon, max_lat = road_bounds
        road_coordinates_valid = all(
            min_lon - 0.08 <= event[0] <= max_lon + 0.08
            and min_lat - 0.08 <= event[1] <= max_lat + 0.08
            and 2024 <= event[2] <= datetime.now(timezone.utc).year
            for event in road_events
        )
    checks.append(make_check(
        "road-map-coordinates",
        "Координати и период на ПТП",
        road_coordinates_valid,
        f"Без координати: {road_summary.get('missing_coordinates')}; извън географските граници: {road_summary.get('outside_bulgaria_bounds')}.",
    ))

    errors = sum(check["status"] == "грешка" for check in checks)
    warnings = sum(check["status"] == "предупреждение" for check in checks)
    return {
        "generated_at": utc_now(),
        "status": "валиден" if errors == 0 else "невалиден",
        "scope": {
            "verified": "Пълнота и структура на каталожните метаданни, идентификатори, връзки, тематични бройки, числови серии и координати на ПТП, използвани във визуализациите.",
            "not_verified": "Съдържанието на всеки суров ресурс не се изтегля масово; то се проверява отделно при включване в конкретна визуализация.",
        },
        "totals": {"checks": len(checks), "errors": errors, "warnings": warnings},
        "checks": checks,
    }


def select_featured(datasets: list[dict[str, Any]], category_ids: set[int], limit: int = 4) -> list[dict[str, Any]]:
    candidates = [row for row in datasets if row.get("category_id") in category_ids]

    def score(row: dict[str, Any]) -> tuple[int, str, int]:
        completeness = int(bool(row.get("description"))) + int(int(row.get("resource_count") or 0) > 0)
        return completeness, str(row.get("updated_at") or ""), int(row.get("id") or 0)

    selected = sorted(candidates, key=score, reverse=True)[:limit]
    return [
        {
            "identifier": row["identifier"],
            "identifier_type": row["identifier_type"],
            "title": row["title"],
            "description": row["description"],
            "category_id": row["category_id"],
            "organisation_id": row["organisation_id"],
            "formats": row["formats"],
            "resource_count": row["resource_count"],
            "updated_at": row["updated_at"],
            "portal_url": row["portal_url"],
        }
        for row in selected
    ]


def build_metadata_profile(rows: list[dict[str, Any]], organisation_names: dict[int, str]) -> dict[str, Any]:
    total = len(rows)
    organisation_counts: Counter[str] = Counter(
        organisation_names.get(row.get("organisation_id"), "Неуказана организация") for row in rows
    )
    format_counts: Counter[str] = Counter()
    update_years: Counter[str] = Counter()
    for row in rows:
        format_counts.update({str(value).strip().upper() for value in row.get("formats", []) if str(value).strip()})
        raw_year = str(row.get("updated_at") or "")[:4]
        update_years[raw_year if raw_year.isdigit() else "Неуказана"] += 1

    def coverage(key: str, label: str, count: int) -> dict[str, Any]:
        return {
            "key": key,
            "label": label,
            "count": count,
            "percent": round((count / total) * 100, 1) if total else 0,
        }

    numeric_years = sorted((int(value) for value in update_years if value != "Неуказана"))
    year_range = range(numeric_years[0], numeric_years[-1] + 1) if numeric_years else []

    return {
        "top_organisations": [
            {"name": name, "datasets": count}
            for name, count in sorted(organisation_counts.items(), key=lambda item: (-item[1], item[0]))[:6]
        ],
        "format_breakdown": [
            {"format": name, "datasets": count}
            for name, count in sorted(format_counts.items(), key=lambda item: (-item[1], item[0]))[:6]
        ],
        "updated_distribution": [
            {"year": str(year), "datasets": update_years[str(year)]}
            for year in year_range
        ] + ([{"year": "Неуказана", "datasets": update_years["Неуказана"]}] if update_years.get("Неуказана") else []),
        "coverage": [
            coverage("description", "С описание", sum(bool(str(row.get("description") or "").strip()) for row in rows)),
            coverage("resources", "С публикуван ресурс", sum(int(row.get("resource_count") or 0) > 0 for row in rows)),
            coverage("formats", "С машинночетим формат", sum(bool(row.get("formats")) for row in rows)),
        ],
    }


def build_dashboard(stage: Path, report: dict[str, Any]) -> dict[str, Any]:
    summary = read_json(stage / "catalog/portal-summary.json")
    categories = read_json(stage / "catalog/categories.json")["categories"]
    datasets = read_json(stage / "catalog/datasets.json")["datasets"]
    organisations = read_json(stage / "catalog/organisations.json")["organisations"]
    indicators = read_json(stage / "indicators/world-bank.json")
    organisation_names = {row["id"]: row["name"] for row in organisations}
    category_counts = {row["id"]: row["dataset_count"] for row in categories}
    category_names = {row["id"]: row["name"] for row in categories}

    themes: dict[str, Any] = {}
    for key, config in THEMES.items():
        ids = set(config["category_ids"])
        featured = select_featured(datasets, ids)
        for dataset in featured:
            dataset["organisation"] = organisation_names.get(dataset.pop("organisation_id"), "Неуказана организация")
        theme_rows = [row for row in datasets if row.get("category_id") in ids]
        profile = build_metadata_profile(theme_rows, organisation_names)
        themes[key] = {
            "name": config["name"],
            "category_ids": sorted(ids),
            "dataset_count": sum(category_counts.get(category_id, 0) for category_id in ids),
            "resource_count": sum(int(row.get("resource_count") or 0) for row in theme_rows),
            "organisation_count": len({row.get("organisation_id") for row in theme_rows if row.get("organisation_id") is not None}),
            "category_breakdown": [
                {
                    "id": category_id,
                    "name": category_names[category_id],
                    "datasets": category_counts.get(category_id, 0),
                }
                for category_id in sorted(ids)
            ],
            **profile,
            "featured": featured,
        }

    return {
        "generated_at": utc_now(),
        "language": "bg",
        "portal": {
            "source": summary["source"],
            "retrieved_at": summary["retrieved_at"],
            "datasets": summary["captured_datasets"],
            "organisations": summary["captured_organisations"],
            "resources": summary["resources"],
            "themes": summary["themes"],
        },
        "categories": categories,
        "catalog_profile": build_metadata_profile(datasets, organisation_names),
        "indicators": indicators,
        "themes": themes,
        "validation": {
            "status": report["status"],
            "checks": report["totals"]["checks"],
            "warnings": report["totals"]["warnings"],
            "verified_scope": report["scope"]["verified"],
        },
    }


def build_chart_map() -> dict[str, Any]:
    return {
        "version": 1,
        "surface": "Статичен React dashboard",
        "palette_policy": "Един основен зелен тон, червен акцент и неутрални тонове; директни етикети без излишни легенди.",
        "charts": [
            {
                "section": "Начало и каталог",
                "question": "Как е разпределен целият каталог по 14 официални категории?",
                "family": "Сравнение и класация",
                "type": "Хоризонтални ленти",
                "fields": ["category.name", "category.dataset_count"],
                "source": "catalog/categories.json",
            },
            {
                "section": "Тематични раздели",
                "question": "Какви са съставът, актуалността и метаданните на всяка тематична група?",
                "family": "Състав, класация и качество",
                "type": "Хоризонтални/вертикални ленти и прогрес",
                "fields": ["category_breakdown", "updated_distribution", "top_organisations", "format_breakdown", "coverage"],
                "source": "catalog/datasets.json + catalog/organisations.json",
            },
            {
                "section": "Икономика, природа и хора",
                "question": "Как се променят проверените национални индикатори във времето?",
                "family": "Тенденция",
                "type": "Годишни ленти с нулева основа и точни стойности",
                "fields": ["year", "value", "unit"],
                "source": "indicators/world-bank.json",
            },
            {
                "section": "Транспорт",
                "question": "Къде и какви ПТП са регистрирани от 2024 г. насам?",
                "family": "Географско разпределение и класация",
                "type": "Canvas карта и хоризонтални ленти",
                "fields": ["lon", "lat", "year", "fatalities", "injured", "severe", "region", "crash_type"],
                "source": "visuals/road.json",
            },
        ],
    }


def build_catalog_index(stage: Path) -> dict[str, Any]:
    source = read_json(stage / "catalog/datasets.json")
    organisations = read_json(stage / "catalog/organisations.json")["organisations"]
    organisation_names = {row["id"]: row["name"] for row in organisations}
    fields = (
        "identifier",
        "identifier_type",
        "title",
        "description",
        "category_id",
        "formats",
        "tags",
        "resource_count",
        "updated_at",
        "portal_url",
    )
    datasets = []
    for row in source["datasets"]:
        item = {field: row[field] for field in fields}
        item["organisation"] = organisation_names.get(row.get("organisation_id"), "Неуказана организация")
        datasets.append(item)
    return {
        "source": source["source"],
        "retrieved_at": source["retrieved_at"],
        "total_records": len(datasets),
        "datasets": datasets,
    }


def schema_documents() -> dict[str, dict[str, Any]]:
    return {
        "dataset.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "Набор от данни — нормализирани метаданни",
            "type": "object",
            "required": ["identifier", "identifier_type", "title", "category_id", "organisation_id", "formats", "resource_count", "portal_url"],
            "properties": {
                "identifier": {"type": "string", "minLength": 1},
                "identifier_type": {"type": "string", "enum": ["uuid", "legacy"]},
                "title": {"type": "string", "minLength": 1},
                "description": {"type": "string"},
                "category_id": {"type": "integer", "minimum": 1, "maximum": 14},
                "organisation_id": {"type": ["integer", "null"]},
                "formats": {"type": "array", "items": {"type": "string"}},
                "resource_count": {"type": "integer", "minimum": 0},
                "portal_url": {"type": "string", "format": "uri"},
            },
        },
        "resource.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "Ресурс — нормализирани метаданни",
            "type": "object",
            "required": ["uuid", "dataset_identifier", "title", "formats", "portal_url"],
            "properties": {
                "uuid": {"type": "string", "format": "uuid"},
                "dataset_identifier": {"type": "string", "minLength": 1},
                "title": {"type": "string"},
                "formats": {"type": "array", "items": {"type": "string"}},
                "portal_url": {"type": "string", "format": "uri"},
            },
        },
        "indicator.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "Времева серия на индикатор",
            "type": "object",
            "required": ["indicator", "title", "unit", "source_url", "data"],
            "properties": {
                "indicator": {"type": "string"},
                "title": {"type": "string"},
                "unit": {"type": "string"},
                "source_url": {"type": "string", "format": "uri"},
                "data": {
                    "type": "array",
                    "minItems": 10,
                    "items": {
                        "type": "object",
                        "required": ["year", "value"],
                        "properties": {"year": {"type": "string"}, "value": {"type": "number"}},
                    },
                },
            },
        },
        "road-visual.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": "Нормализирани точки за картата на ПТП",
            "type": "object",
            "required": ["schema_version", "source", "boundary", "fields", "dictionaries", "summary", "events"],
            "properties": {
                "schema_version": {"const": 1},
                "events": {
                    "type": "array",
                    "minItems": 1000,
                    "items": {"type": "array", "minItems": 9, "maxItems": 9},
                },
            },
        },
    }


def write_readme(stage: Path) -> None:
    (stage / "README.md").write_text(
        """# Данни на атласа

Тази папка е единственият източник на данни за сайта. Съдържанието се обновява само при ръчно изпълнение на `./update.sh`.

## Структура

- `catalog/portal-summary.json` — общи бройки и среда на портала.
- `catalog/categories.json` — всички 14 тематични категории.
- `catalog/datasets.json` — всички публични български каталожни записи.
- `catalog/organisations.json` — активните и одобрени организации.
- `catalog/resources.json` — ресурсите, извлечени от каталожните записи.
- `indicators/world-bank.json` — четири проверени национални времеви серии.
- `visuals/road.json` — нормализирани координати на ПТП, контур на България, речници и контролни бройки за картата.
- `site/dashboard.json` — малък производен файл, използван от интерфейса.
- `site/catalog-index.json` — локален индекс за търсене с имената на издателите.
- `site/chart-map.json` — аналитична карта на визуализациите, въпросите, полетата и източниците им.
- `validation/report.json` — резултат от всички автоматични проверки.
- `schemas/` — машинночетими JSON Schema описания.
- `manifest.json` — хешове, размери, промени и произход на моментната снимка.

## Обхват на проверките

Проверяват се пълнотата на каталога, идентификаторите, връзките набор–ресурс–организация, тематичните бройки и всички числови серии, показани на сайта. За картата се проверяват още табличната схема, периодът, географските граници и точният брой визуализирани ПТП. Суровото съдържание на всеки останал портален ресурс не се изтегля масово; конкретен файл се сваля и проверява отделно, когато бъде включен в нова визуализация.
""",
        encoding="utf-8",
    )


def previous_dataset_ids(target: Path) -> set[str]:
    path = target / "catalog/datasets.json"
    if not path.exists():
        return set()
    try:
        return {str(row.get("identifier")) for row in read_json(path).get("datasets", []) if row.get("identifier")}
    except (OSError, json.JSONDecodeError):
        return set()


def write_manifest(stage: Path, target: Path) -> None:
    current_ids = {str(row.get("identifier")) for row in read_json(stage / "catalog/datasets.json")["datasets"]}
    old_ids = previous_dataset_ids(target)
    files = []
    for path in sorted(stage.rglob("*")):
        if path.is_file() and path.name != "manifest.json":
            files.append({
                "path": path.relative_to(stage).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })
    write_json(
        stage / "manifest.json",
        {
            "version": 3,
            "generated_at": utc_now(),
            "sources": [
                {"name": "Портал за отворени данни", "url": read_json(stage / "catalog/portal-summary.json")["source"]},
                {"name": "Световна банка — Отворени данни", "url": "https://api.worldbank.org/v2/country/BGR/indicator"},
                {"name": "МВР — актуални данни за ПТП", "url": read_json(stage / "visuals/road.json")["source"]["dataset_url"]},
                {"name": "Natural Earth — държавни граници", "url": read_json(stage / "visuals/road.json")["boundary"]["source_url"]},
            ],
            "changes": {
                "previous_snapshot_found": bool(old_ids),
                "added_datasets": len(current_ids - old_ids) if old_ids else None,
                "removed_datasets": len(old_ids - current_ids) if old_ids else None,
            },
            "files": files,
        },
    )


def promote(stage: Path, target: Path) -> None:
    backup = target.parent / f".{target.name}-backup"
    if backup.exists():
        shutil.rmtree(backup)
    try:
        if target.exists():
            os.replace(target, backup)
        os.replace(stage, target)
    except Exception:
        if not target.exists() and backup.exists():
            os.replace(backup, target)
        raise
    else:
        if backup.exists():
            shutil.rmtree(backup)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default=str(ROOT / "data"))
    parser.add_argument("--portal-base", default="https://testdata.egov.bg")
    parser.add_argument("--road-portal-base", default="https://data.egov.bg")
    parser.add_argument("--road-resource-uuid", help="По избор; иначе се открива автоматично от страницата на ПТП набора")
    parser.add_argument("--years", type=int, default=12)
    parser.add_argument("--delay", type=float, default=1.05)
    parser.add_argument("--max-pages", type=int, help="Само за тест; няма да бъде активиран като пълен snapshot")
    args = parser.parse_args()

    target = Path(args.target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{target.name}-staging-", dir=target.parent))
    promoted = False
    try:
        snapshot_command = [
            sys.executable,
            str(PORTAL_SCRIPT),
            "snapshot",
            "--base",
            args.portal_base,
            "--output-dir",
            str(stage / "catalog"),
            "--delay",
            str(args.delay),
        ]
        if args.max_pages is not None:
            snapshot_command.extend(["--max-pages", str(args.max_pages), "--max-organisation-pages", "1"])
        subprocess.run(
            [sys.executable, str(INDICATOR_SCRIPT), "--years", str(args.years), "--output", str(stage / "indicators/world-bank.json")],
            check=True,
        )
        subprocess.run(snapshot_command, check=True)
        road_command = [
            sys.executable,
            str(ROAD_SCRIPT),
            "--portal-base",
            args.road_portal_base,
            "--output",
            str(stage / "visuals/road.json"),
        ]
        if args.road_resource_uuid:
            road_command.extend(["--resource-uuid", args.road_resource_uuid])
        subprocess.run(road_command, check=True)
        for filename, schema in schema_documents().items():
            write_json(stage / "schemas" / filename, schema)
        write_readme(stage)
        report = validate_data(stage)
        write_json(stage / "validation/report.json", report)
        write_json(stage / "site/dashboard.json", build_dashboard(stage, report))
        write_json(stage / "site/catalog-index.json", build_catalog_index(stage))
        write_json(stage / "site/chart-map.json", build_chart_map())
        write_manifest(stage, target)
        if report["status"] != "валиден":
            for check in report["checks"]:
                if check["status"] != "успешна":
                    print(f"{check['status'].upper()}: {check['name']} — {check['details']}", file=sys.stderr)
            raise RuntimeError(f"Моментната снимка не премина проверките: {report['totals']}")
        if args.max_pages is not None:
            raise RuntimeError("Тестовата ограничена моментна снимка е проверена, но не може да бъде активирана")
        promote(stage, target)
        promoted = True
        print(f"Активирана е валидна моментна снимка в {target}")
        return 0
    finally:
        if stage.exists():
            if promoted:
                shutil.rmtree(stage)
            else:
                failed = target.parent / f".{target.name}-failed"
                if failed.exists():
                    shutil.rmtree(failed)
                os.replace(stage, failed)
                print(f"Неуспешната моментна снимка е запазена за диагностика: {failed}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
