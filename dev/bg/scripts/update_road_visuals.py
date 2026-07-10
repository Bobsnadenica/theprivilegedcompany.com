#!/usr/bin/env python3
"""Изтегля и нормализира географските данни за ПТП за статичната карта."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import struct
import time
import urllib.error
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_PORTAL = "https://data.egov.bg"
DEFAULT_DATASET_UUID = "4b948dd7-c9ef-4239-b2de-9b8e1c312467"
DEFAULT_BOUNDARY_URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
UUID_RE = re.compile(rb"/data/resourceView/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.I)
REQUIRED_COLUMNS = {
    "Брой загинали",
    "Брой ранени",
    "Вид на ПТП",
    "Година",
    "Област",
    "Географска ширина",
    "Географска дължина",
    "Тежки ПТП",
    "Дата и час на ПТП",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def request_bytes(url: str, *, data: bytes | None = None, content_type: str | None = None) -> bytes:
    headers = {
        "Accept": "application/json" if data else "application/zip, application/octet-stream;q=0.9, */*;q=0.1",
        "User-Agent": "BulgariaOpenDataAtlas/1.0 (+local static data refresh)",
    }
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            if attempt == 3:
                break
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Неуспешно изтегляне от {url}: {last_error}")


def load_resource_rows(path: Path | None, portal_base: str, resource_uuid: str) -> tuple[list[str], Iterable[list[Any]]]:
    if path:
        raw = path.read_bytes()
        if path.suffix.lower() == ".csv":
            reader = csv.reader(io.StringIO(raw.decode("utf-8-sig")))
            rows = list(reader)
            if not rows:
                raise RuntimeError("CSV ресурсът е празен")
            return rows[0], rows[1:]
        document = json.loads(raw)
    else:
        endpoint = f"{portal_base.rstrip('/')}/api/getResourceData"
        payload = json.dumps({"resource_uri": resource_uuid}).encode("utf-8")
        document = json.loads(request_bytes(endpoint, data=payload, content_type="application/json"))

    if not document.get("success") or not isinstance(document.get("data"), list) or not document["data"]:
        raise RuntimeError("API ресурсът за ПТП не съдържа валидна таблична структура")
    return [str(value or "") for value in document["data"][0]], document["data"][1:]


def discover_resource_uuid(portal_base: str, dataset_uuid: str) -> str:
    dataset_url = f"{portal_base.rstrip('/')}/data/view/{dataset_uuid}"
    matches = UUID_RE.findall(request_bytes(dataset_url))
    if not matches:
        raise RuntimeError(f"Страницата на набора не съдържа текущ ресурс: {dataset_url}")
    return matches[0].decode("ascii").lower()


def parse_dbf_records(raw: bytes) -> list[dict[str, str]]:
    if len(raw) < 33:
        raise RuntimeError("Невалиден DBF файл в архива Natural Earth")
    record_count = struct.unpack_from("<I", raw, 4)[0]
    header_length, record_length = struct.unpack_from("<HH", raw, 8)
    fields: list[tuple[str, int]] = []
    offset = 32
    while offset + 32 <= header_length and raw[offset] != 0x0D:
        descriptor = raw[offset : offset + 32]
        name = descriptor[:11].split(b"\x00", 1)[0].decode("ascii", errors="ignore")
        fields.append((name, descriptor[16]))
        offset += 32

    records = []
    for index in range(record_count):
        start = header_length + index * record_length
        record = raw[start : start + record_length]
        if len(record) != record_length or record[:1] == b"*":
            records.append({})
            continue
        cursor = 1
        values: dict[str, str] = {}
        for name, length in fields:
            values[name] = record[cursor : cursor + length].decode("utf-8", errors="replace").strip()
            cursor += length
        records.append(values)
    return records


def parse_polygon_record(content: bytes) -> list[list[list[float]]]:
    if len(content) < 44:
        return []
    shape_type = struct.unpack_from("<i", content, 0)[0]
    if shape_type not in {5, 15, 25}:
        return []
    part_count, point_count = struct.unpack_from("<ii", content, 36)
    part_offset = 44
    point_offset = part_offset + part_count * 4
    part_starts = list(struct.unpack_from(f"<{part_count}i", content, part_offset))
    part_starts.append(point_count)
    points = [list(struct.unpack_from("<dd", content, point_offset + index * 16)) for index in range(point_count)]
    return [points[part_starts[index] : part_starts[index + 1]] for index in range(part_count)]


def parse_shp_record(raw: bytes, selected_index: int) -> list[list[list[float]]]:
    if len(raw) < 100:
        raise RuntimeError("Невалиден SHP файл в архива Natural Earth")
    cursor = 100
    index = 0
    while cursor + 8 <= len(raw):
        _, length_words = struct.unpack_from(">ii", raw, cursor)
        content_start = cursor + 8
        content_end = content_start + length_words * 2
        if index == selected_index:
            return parse_polygon_record(raw[content_start:content_end])
        cursor = content_end
        index += 1
    raise RuntimeError("Не е открит географският запис за България")


def distance_to_segment(point: list[float], start: list[float], end: list[float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    ratio = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy))


def simplify_ring(points: list[list[float]], tolerance: float = 0.006) -> list[list[float]]:
    if len(points) < 4:
        return points
    closed = points[0] == points[-1]
    source = points[:-1] if closed else points

    def simplify(start: int, end: int, keep: set[int]) -> None:
        largest = 0.0
        selected = -1
        for position in range(start + 1, end):
            distance = distance_to_segment(source[position], source[start], source[end])
            if distance > largest:
                largest, selected = distance, position
        if selected >= 0 and largest > tolerance:
            keep.add(selected)
            simplify(start, selected, keep)
            simplify(selected, end, keep)

    if len(source) < 3:
        return points
    keep = {0, len(source) - 1}
    simplify(0, len(source) - 1, keep)
    result = [[round(source[index][0], 5), round(source[index][1], 5)] for index in sorted(keep)]
    if closed and result[0] != result[-1]:
        result.append(result[0])
    return result


def load_bulgaria_boundary(archive_path: Path | None, boundary_url: str) -> tuple[list[list[list[float]]], list[float], str]:
    archive_bytes = archive_path.read_bytes() if archive_path else request_bytes(boundary_url)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        names = archive.namelist()
        shp_name = next(name for name in names if name.endswith(".shp"))
        dbf_name = next(name for name in names if name.endswith(".dbf"))
        version_name = next((name for name in names if name.endswith(".VERSION.txt")), None)
        records = parse_dbf_records(archive.read(dbf_name))
        selected = next((index for index, row in enumerate(records) if row.get("ADM0_A3") == "BGR" or row.get("SOV_A3") == "BGR"), None)
        if selected is None:
            raise RuntimeError("Natural Earth не съдържа запис с код BGR")
        polygons = [simplify_ring(ring) for ring in parse_shp_record(archive.read(shp_name), selected) if len(ring) >= 4]
        version = archive.read(version_name).decode("ascii", errors="ignore").strip() if version_name else "неуказана"

    coordinates = [point for ring in polygons for point in ring]
    if not coordinates:
        raise RuntimeError("Контурът на България е празен")
    bounds = [
        round(min(point[0] for point in coordinates), 5),
        round(min(point[1] for point in coordinates), 5),
        round(max(point[0] for point in coordinates), 5),
        round(max(point[1] for point in coordinates), 5),
    ]
    return polygons, bounds, version


def integer(value: Any) -> int:
    try:
        return int(float(str(value or "0").replace(",", ".")))
    except ValueError:
        return 0


def decimal(value: Any) -> float | None:
    try:
        result = float(str(value).strip().replace(",", "."))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def normalize_rows(headers: list[str], rows: Iterable[list[Any]], bounds: list[float]) -> tuple[list[list[Any]], dict[str, Any], list[str], list[str]]:
    missing = REQUIRED_COLUMNS - set(headers)
    if missing:
        raise RuntimeError(f"Ресурсът за ПТП е без задължителни колони: {', '.join(sorted(missing))}")
    columns = {name: headers.index(name) for name in REQUIRED_COLUMNS}
    materialized = list(rows)
    regions = sorted({str(row[columns["Област"]] or "Неуказана").strip().title() for row in materialized})
    crash_types = sorted({str(row[columns["Вид на ПТП"]] or "Неуказан вид").strip() for row in materialized})
    region_index = {value: index for index, value in enumerate(regions)}
    type_index = {value: index for index, value in enumerate(crash_types)}

    events: list[list[Any]] = []
    years: Counter[int] = Counter()
    fatalities = injured = severe_count = missing_coordinates = outside_bounds = 0
    dates: list[str] = []
    min_lon, min_lat, max_lon, max_lat = bounds
    for row in materialized:
        if len(row) < len(headers):
            missing_coordinates += 1
            continue
        lat = decimal(row[columns["Географска ширина"]])
        lon = decimal(row[columns["Географска дължина"]])
        if lat is None or lon is None:
            missing_coordinates += 1
            continue
        if not (min_lon - 0.08 <= lon <= max_lon + 0.08 and min_lat - 0.08 <= lat <= max_lat + 0.08):
            outside_bounds += 1
            continue
        year = integer(row[columns["Година"]])
        killed = integer(row[columns["Брой загинали"]])
        hurt = integer(row[columns["Брой ранени"]])
        severe = 1 if integer(row[columns["Тежки ПТП"]]) > 0 else 0
        region = str(row[columns["Област"]] or "Неуказана").strip().title()
        crash_type = str(row[columns["Вид на ПТП"]] or "Неуказан вид").strip()
        occurred_at = str(row[columns["Дата и час на ПТП"]] or "").strip()
        day = occurred_at[:10]
        if day:
            dates.append(day)
        years[year] += 1
        fatalities += killed
        injured += hurt
        severe_count += severe
        events.append([
            round(lon, 5),
            round(lat, 5),
            year,
            killed,
            hurt,
            severe,
            region_index[region],
            type_index[crash_type],
            day,
        ])

    summary = {
        "total_rows": len(materialized),
        "mapped_rows": len(events),
        "unmapped_rows": len(materialized) - len(events),
        "missing_coordinates": missing_coordinates,
        "outside_bulgaria_bounds": outside_bounds,
        "years": [{"year": year, "events": years[year]} for year in sorted(years)],
        "date_from": min(dates) if dates else None,
        "date_to": max(dates) if dates else None,
        "fatalities": fatalities,
        "injured": injured,
        "severe_crashes": severe_count,
    }
    return events, summary, regions, crash_types


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--portal-base", default=DEFAULT_PORTAL)
    parser.add_argument("--dataset-uuid", default=DEFAULT_DATASET_UUID)
    parser.add_argument("--resource-uuid", help="По избор; без него текущият ресурс се открива от страницата на набора")
    parser.add_argument("--resource-input", type=Path, help="Локален JSON/CSV ресурс за възпроизводим тест")
    parser.add_argument("--boundary-url", default=DEFAULT_BOUNDARY_URL)
    parser.add_argument("--boundary-archive", type=Path, help="Локален архив Natural Earth за възпроизводим тест")
    args = parser.parse_args()

    if args.resource_input:
        resource_uuid = args.resource_uuid or "локален-вход-за-проверка"
    else:
        resource_uuid = args.resource_uuid or discover_resource_uuid(args.portal_base, args.dataset_uuid)
    headers, rows = load_resource_rows(args.resource_input, args.portal_base, resource_uuid)
    polygons, bounds, boundary_version = load_bulgaria_boundary(args.boundary_archive, args.boundary_url)
    events, summary, regions, crash_types = normalize_rows(headers, rows, bounds)
    if len(events) < 1_000:
        raise RuntimeError(f"Недостатъчно валидни точки за картата: {len(events)}")

    portal = args.portal_base.rstrip("/")
    document = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "title": "Пътнотранспортни произшествия в България",
        "source": {
            "publisher": "Министерство на вътрешните работи",
            "dataset_title": "Актуални данни за ПТП в периода от 01.01.2024 до момента",
            "dataset_uuid": args.dataset_uuid,
            "resource_uuid": resource_uuid,
            "dataset_url": f"{portal}/data/view/{args.dataset_uuid}",
            "api_url": f"{portal}/api/getResourceData",
        },
        "boundary": {
            "source": "Natural Earth — Admin 0 Countries, 1:10m",
            "source_url": "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/",
            "license": "Public domain",
            "version": boundary_version,
            "bounds": bounds,
            "polygons": polygons,
        },
        "fields": ["lon", "lat", "year", "fatalities", "injured", "severe", "region_index", "crash_type_index", "date"],
        "dictionaries": {"regions": regions, "crash_types": crash_types},
        "summary": summary,
        "events": events,
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"Записани са {summary['mapped_rows']} географски точки от {summary['total_rows']} реда "
        f"({summary['date_from']} – {summary['date_to']}) в {output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
