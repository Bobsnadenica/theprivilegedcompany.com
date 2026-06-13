from datetime import datetime

from boto3.dynamodb.conditions import Key

from .common import dynamodb, utc_now_iso
from .config import PLAYER_PRESENCE_TABLE
from .geo import in_bounds

presence_table = dynamodb.Table(PLAYER_PRESENCE_TABLE)
PRESENCE_TILE_CACHE = {}
PRESENCE_TILE_CACHE_TTL_SECONDS = 3
PRESENCE_TILE_CACHE_MAX_ENTRIES = 256
ACTIVE_PRESENCE_MAX_AGE_SECONDS = 15


def _presence_cache_key(world_id, tile_id):
    return f"{world_id}|{tile_id}"


def _prune_presence_cache(now_epoch):
    expired = [
        key
        for key, entry in PRESENCE_TILE_CACHE.items()
        if entry["expiresAtEpoch"] <= now_epoch
    ]
    for key in expired:
        PRESENCE_TILE_CACHE.pop(key, None)

    while len(PRESENCE_TILE_CACHE) > PRESENCE_TILE_CACHE_MAX_ENTRIES:
        oldest_key = min(
            PRESENCE_TILE_CACHE,
            key=lambda key: PRESENCE_TILE_CACHE[key]["expiresAtEpoch"],
        )
        PRESENCE_TILE_CACHE.pop(oldest_key, None)


def _query_presence(world_id, tile_id):
    return presence_table.query(
        KeyConditionExpression=Key("pk").eq(f"WORLD#{world_id}#TILE#{tile_id}"),
        ProjectionExpression="userId, displayName, profileIcon, lat, lon, lastSeenAt, #ttl",
        ExpressionAttributeNames={"#ttl": "ttl"},
    ).get("Items", [])


def _cached_presence(world_id, tile_id, now_epoch):
    _prune_presence_cache(now_epoch)
    cache_key = _presence_cache_key(world_id, tile_id)
    cached = PRESENCE_TILE_CACHE.get(cache_key)
    if cached and cached["expiresAtEpoch"] > now_epoch:
        return cached["payload"]

    payload = _query_presence(world_id, tile_id)
    PRESENCE_TILE_CACHE[cache_key] = {
        "expiresAtEpoch": now_epoch + PRESENCE_TILE_CACHE_TTL_SECONDS,
        "payload": payload,
    }
    _prune_presence_cache(now_epoch)
    return payload


def _is_recent_presence(last_seen_at, now_epoch):
    if not last_seen_at:
        return False

    try:
        normalized = str(last_seen_at).replace("Z", "+00:00")
        seen_epoch = int(datetime.fromisoformat(normalized).timestamp())
    except ValueError:
        return False

    return seen_epoch >= (now_epoch - ACTIVE_PRESENCE_MAX_AGE_SECONDS)


def collect_visible_presence(
    *,
    world_id,
    tile_ids,
    min_lat,
    max_lat,
    min_lon,
    max_lon,
    now_epoch,
):
    players_by_user = {}

    for tile_id in tile_ids:
        for item in _cached_presence(world_id, tile_id, now_epoch):
            ttl = int(item.get("ttl", 0))
            if ttl and ttl <= now_epoch:
                continue

            lat = float(item["lat"])
            lon = float(item["lon"])
            if not in_bounds(lat, lon, min_lat, max_lat, min_lon, max_lon):
                continue

            candidate = {
                "userId": item["userId"],
                "displayName": item.get("displayName", "Explorer"),
                "profileIcon": item.get("profileIcon", "🛡️"),
                "lat": lat,
                "lon": lon,
                "lastSeenAt": item.get("lastSeenAt", utc_now_iso()),
            }
            if not _is_recent_presence(candidate["lastSeenAt"], now_epoch):
                continue

            existing = players_by_user.get(item["userId"])
            if existing is None or candidate["lastSeenAt"] > existing["lastSeenAt"]:
                players_by_user[item["userId"]] = candidate

    return sorted(
        players_by_user.values(),
        key=lambda player: player["lastSeenAt"],
        reverse=True,
    )
