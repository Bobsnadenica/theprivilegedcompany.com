from decimal import Decimal

from botocore.exceptions import ClientError

from shared.atlas_tiles import (
    merge_tile_cells,
    packed_item_sort_key,
    packed_shared_sort_key,
)
from shared.common import (
    dynamodb,
    epoch_seconds_after,
    get_display_name,
    get_profile_icon,
    require_authenticated_user,
    utc_now_iso,
)
from shared.config import (
    PLAYER_PRESENCE_TABLE,
    PRESENCE_TTL_SECONDS,
    SHARED_CELLS_TABLE,
    USER_BOOTSTRAP_CACHE_PREFIX,
    USER_DISCOVERIES_TABLE,
)
from shared.discovery_cache import (
    cache_object_key,
    invalidate_cached_json_keys,
)
from shared.geo import tile_id_for_point
from shared.tile_rebuild_queue import enqueue_shared_tile_rebuilds

CELL_DEGREES = 0.00018
MAX_SYNC_CELLS = 500
MAX_MERGE_RETRIES = 6

user_discoveries_table = dynamodb.Table(USER_DISCOVERIES_TABLE)
shared_cells_table = dynamodb.Table(SHARED_CELLS_TABLE)
presence_table = dynamodb.Table(PLAYER_PRESENCE_TABLE)


def _validate_coordinates(lat, lon):
    if not (-90 <= lat <= 90):
        raise Exception("Latitude is out of range.")
    if not (-180 <= lon <= 180):
        raise Exception("Longitude is out of range.")


def _merge_with_retry(table, key, world_id, tile_id, cell_ids, now_iso):
    for _ in range(MAX_MERGE_RETRIES):
        current = table.get_item(Key=key).get("Item")
        merged_item, added_count, expected_version = merge_tile_cells(
            current,
            tile_id,
            world_id,
            CELL_DEGREES,
            cell_ids,
            now_iso,
        )
        if added_count == 0 or merged_item is None:
            return 0

        merged_item["pk"] = key["pk"]
        merged_item["sk"] = key["sk"]

        try:
            if current is None:
                table.put_item(
                    Item=merged_item,
                    ConditionExpression="attribute_not_exists(#version)",
                    ExpressionAttributeNames={"#version": "version"},
                )
            else:
                table.put_item(
                    Item=merged_item,
                    ConditionExpression="#version = :expectedVersion",
                    ExpressionAttributeNames={"#version": "version"},
                    ExpressionAttributeValues={":expectedVersion": expected_version},
                )
            return added_count
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

    raise Exception(f"Failed to merge packed atlas tile after {MAX_MERGE_RETRIES} retries.")


def handler(event, context):
    args = event.get("arguments") or {}
    user_id = require_authenticated_user(event)
    now_iso = utc_now_iso()
    world_id = (args.get("worldId") or "global").strip().lower()
    map_zoom = int(args.get("mapZoom") or 17)
    display_name = ((args.get("displayName") or "").strip() or get_display_name(event))[:80]
    profile_icon = ((args.get("profileIcon") or "").strip() or get_profile_icon(event))[:8]

    cells = args.get("cellsJson") or []
    if isinstance(cells, str):
        import json

        cells = json.loads(cells)
    if not isinstance(cells, list):
        raise Exception("cellsJson must be a JSON array or parsed list.")

    accepted = 0
    new_personal = 0
    updated_shared = 0
    updated_tile_ids = set()
    personal_tile_cells = {}
    shared_tile_cells = {}

    for cell in cells[:MAX_SYNC_CELLS]:
        accepted += 1
        cell_id = str(cell["cellId"])
        lat = float(cell["lat"])
        lon = float(cell["lon"])
        _validate_coordinates(lat, lon)
        tile_id = cell.get("tileId") or tile_id_for_point(lat, lon, map_zoom)
        personal_tile_cells.setdefault(tile_id, set()).add(cell_id)
        shared_tile_cells.setdefault(tile_id, set()).add(cell_id)

    for tile_id, tile_cell_ids in personal_tile_cells.items():
        new_personal += _merge_with_retry(
            user_discoveries_table,
            {
                "pk": f"USER#{user_id}",
                "sk": packed_item_sort_key(world_id, tile_id),
            },
            world_id,
            tile_id,
            tile_cell_ids,
            now_iso,
        )

    for tile_id, tile_cell_ids in shared_tile_cells.items():
        added_shared = _merge_with_retry(
            shared_cells_table,
            {
                "pk": f"WORLD#{world_id}#TILE#{tile_id}",
                "sk": packed_shared_sort_key(),
            },
            world_id,
            tile_id,
            tile_cell_ids,
            now_iso,
        )
        updated_shared += added_shared
        if added_shared > 0:
            updated_tile_ids.add(tile_id)

    if new_personal:
        invalidate_cached_json_keys(
            [cache_object_key(USER_BOOTSTRAP_CACHE_PREFIX, world_id, user_id)]
        )

    if updated_tile_ids:
        enqueue_shared_tile_rebuilds(world_id, updated_tile_ids, reason="discovery-sync")

    if args.get("currentLat") is not None and args.get("currentLon") is not None:
        current_lat = Decimal(str(args["currentLat"]))
        current_lon = Decimal(str(args["currentLon"]))
        _validate_coordinates(float(current_lat), float(current_lon))
        tile_id = tile_id_for_point(float(current_lat), float(current_lon), map_zoom)
        presence_table.put_item(
            Item={
                "pk": f"WORLD#{world_id}#TILE#{tile_id}",
                "sk": f"USER#{user_id}",
                "userId": user_id,
                "displayName": display_name,
                "profileIcon": profile_icon,
                "lat": current_lat,
                "lon": current_lon,
                "tileId": tile_id,
                "worldId": world_id,
                "lastSeenAt": now_iso,
                "ttl": epoch_seconds_after(PRESENCE_TTL_SECONDS),
            }
        )

    return {
        "acceptedCellCount": accepted,
        "newPersonalCellCount": new_personal,
        "updatedSharedCellCount": updated_shared,
        "trackingActive": True,
        "timestamp": now_iso,
    }
