from time import time
from shared.common import utc_now_iso
from shared.config import SHARED_TILE_CACHE_TTL_SECONDS, SHARED_TILE_EDGE_CACHE_SECONDS
from shared.discovery_cache import get_or_build_cached_json
from shared.geo import in_bounds, tile_ids_for_bounds
from shared.presence import collect_visible_presence
from shared.shared_tiles import build_shared_tile_snapshot, shared_tile_cache_key

VIEWPORT_CACHE = {}
VIEWPORT_CACHE_TTL_SECONDS = 3
VIEWPORT_CACHE_MAX_ENTRIES = 64


def _cache_key(world_id, tile_ids):
    return f"{world_id}|{'|'.join(tile_ids)}"


def _prune_cache(now_epoch):
    expired = [
        key
        for key, entry in VIEWPORT_CACHE.items()
        if entry["expiresAtEpoch"] <= now_epoch
    ]
    for key in expired:
        VIEWPORT_CACHE.pop(key, None)

    while len(VIEWPORT_CACHE) > VIEWPORT_CACHE_MAX_ENTRIES:
        oldest_key = min(
            VIEWPORT_CACHE,
            key=lambda key: VIEWPORT_CACHE[key]["expiresAtEpoch"],
        )
        VIEWPORT_CACHE.pop(oldest_key, None)


def handler(event, context):
    args = event.get("arguments") or {}
    world_id = (args.get("worldId") or "global").strip().lower()
    min_lat = float(args["minLat"])
    max_lat = float(args["maxLat"])
    min_lon = float(args["minLon"])
    max_lon = float(args["maxLon"])
    zoom = int(args["zoom"])

    tile_ids = tile_ids_for_bounds(min_lat, max_lat, min_lon, max_lon, zoom)[:150]
    now_epoch = int(time())
    cache_key = _cache_key(world_id, tile_ids)
    _prune_cache(now_epoch)

    cached = VIEWPORT_CACHE.get(cache_key)
    if cached and cached["expiresAtEpoch"] > now_epoch:
        return cached["payload"]

    cells_by_id = {}
    landmarks_by_id = {}

    for tile_id in tile_ids:
        tile_snapshot = get_or_build_cached_json(
            shared_tile_cache_key(world_id, tile_id),
            SHARED_TILE_CACHE_TTL_SECONDS,
            lambda world_id=world_id, tile_id=tile_id: build_shared_tile_snapshot(
                world_id,
                tile_id,
            ),
            cache_control_seconds=SHARED_TILE_EDGE_CACHE_SECONDS,
            memory_cache_ttl_seconds=VIEWPORT_CACHE_TTL_SECONDS,
        )

        for item in tile_snapshot.get("cells", []):
            lat = float(item["lat"])
            lon = float(item["lon"])
            if in_bounds(lat, lon, min_lat, max_lat, min_lon, max_lon):
                cell_id = item["cellId"]
                existing = cells_by_id.get(cell_id)
                candidate = {
                    "cellId": cell_id,
                    "lat": lat,
                    "lon": lon,
                    "discovererCount": int(item.get("discovererCount", 1)),
                    "tileId": item.get("tileId", tile_id),
                    "lastDiscoveredAt": item.get("lastDiscoveredAt", utc_now_iso()),
                }
                if existing is None or candidate["lastDiscoveredAt"] > existing["lastDiscoveredAt"]:
                    cells_by_id[cell_id] = candidate

        for item in tile_snapshot.get("landmarks", []):
            lat = float(item["lat"])
            lon = float(item["lon"])
            if in_bounds(lat, lon, min_lat, max_lat, min_lon, max_lon):
                landmark_id = item["landmarkId"]
                existing = landmarks_by_id.get(landmark_id)
                candidate = {
                    "landmarkId": landmark_id,
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "category": item.get("category", ""),
                    "lat": lat,
                    "lon": lon,
                    "status": item.get("status", "APPROVED"),
                    "approvedObjectKey": item.get("approvedObjectKey"),
                    "createdAt": item.get("createdAt", utc_now_iso()),
                }
                if existing is None or candidate["createdAt"] > existing["createdAt"]:
                    landmarks_by_id[landmark_id] = candidate

    players = collect_visible_presence(
        world_id=world_id,
        tile_ids=tile_ids,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        now_epoch=now_epoch,
    )
    cells = sorted(
        cells_by_id.values(),
        key=lambda cell: cell["lastDiscoveredAt"],
        reverse=True,
    )
    landmarks = sorted(
        landmarks_by_id.values(),
        key=lambda landmark: landmark["createdAt"],
        reverse=True,
    )

    payload = {
        "worldId": world_id,
        "cells": cells,
        "players": players,
        "landmarks": landmarks,
        "generatedAt": utc_now_iso(),
    }

    VIEWPORT_CACHE[cache_key] = {
        "expiresAtEpoch": now_epoch + VIEWPORT_CACHE_TTL_SECONDS,
        "payload": payload,
    }
    _prune_cache(now_epoch)

    return payload
