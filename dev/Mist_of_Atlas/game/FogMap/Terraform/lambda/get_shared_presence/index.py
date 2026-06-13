from time import time

from shared.common import utc_now_iso
from shared.geo import tile_ids_for_bounds
from shared.presence import collect_visible_presence


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
    players = collect_visible_presence(
        world_id=world_id,
        tile_ids=tile_ids,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        now_epoch=now_epoch,
    )

    return {
        "worldId": world_id,
        "players": players,
        "generatedAt": utc_now_iso(),
    }
