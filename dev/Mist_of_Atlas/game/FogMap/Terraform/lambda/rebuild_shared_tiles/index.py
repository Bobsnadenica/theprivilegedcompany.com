import json

from shared.shared_tiles import (
    rebuild_and_store_shared_tile_snapshot,
    rebuild_shared_region_manifest,
    region_id_for_shared_tile,
)


def _message_key(payload):
    world_id = (payload.get("worldId") or "global").strip().lower()
    tile_id = str(payload.get("tileId") or "").strip()
    if not tile_id:
        raise Exception("Shared tile rebuild message is missing tileId.")
    return world_id, tile_id


def handler(event, context):
    unique_tiles = set()
    for record in event.get("Records", []):
        payload = json.loads(record["body"])
        unique_tiles.add(_message_key(payload))

    rebuilt = 0
    dirty_regions = set()
    for world_id, tile_id in sorted(unique_tiles):
        rebuild_and_store_shared_tile_snapshot(world_id, tile_id)
        dirty_regions.add((world_id, region_id_for_shared_tile(tile_id)))
        rebuilt += 1

    rebuilt_regions = 0
    for world_id, region_id in sorted(dirty_regions):
        rebuild_shared_region_manifest(world_id, region_id)
        rebuilt_regions += 1

    return {
        "rebuiltTileCount": rebuilt,
        "rebuiltRegionCount": rebuilt_regions,
    }
