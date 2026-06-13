import json
from time import time

from botocore.exceptions import ClientError

from .common import DecimalEncoder, s3, utc_now_iso
from .config import DISCOVERY_CACHE_BUCKET

MEMORY_CACHE = {}
MEMORY_CACHE_MAX_ENTRIES = 256


def cache_object_key(prefix, *parts):
    clean_parts = [str(prefix).strip("/")]
    clean_parts.extend(
        str(part).strip("/") for part in parts if str(part).strip("/")
    )
    return "/".join(part for part in clean_parts if part) + ".json"


def _prune_memory_cache(now_epoch):
    expired = [
        key
        for key, entry in MEMORY_CACHE.items()
        if int(entry.get("memoryExpiresAtEpoch", entry.get("expiresAtEpoch", 0)))
        <= now_epoch
    ]
    for key in expired:
        MEMORY_CACHE.pop(key, None)

    while len(MEMORY_CACHE) > MEMORY_CACHE_MAX_ENTRIES:
        oldest_key = min(
            MEMORY_CACHE,
            key=lambda key: int(
                MEMORY_CACHE[key].get(
                    "memoryExpiresAtEpoch",
                    MEMORY_CACHE[key].get("expiresAtEpoch", 0),
                )
            ),
        )
        MEMORY_CACHE.pop(oldest_key, None)


def load_cached_json(object_key, now_epoch=None, memory_cache_ttl_seconds=None):
    now_epoch = int(now_epoch or time())
    _prune_memory_cache(now_epoch)

    cached = MEMORY_CACHE.get(object_key)
    if cached and int(
        cached.get("memoryExpiresAtEpoch", cached.get("expiresAtEpoch", 0))
    ) > now_epoch:
        return cached["payload"]

    try:
        response = s3.get_object(Bucket=DISCOVERY_CACHE_BUCKET, Key=object_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise

    payload = json.loads(response["Body"].read().decode("utf-8"))
    expires_at_epoch = int(payload.get("expiresAtEpoch", 0))
    if expires_at_epoch <= now_epoch:
        MEMORY_CACHE.pop(object_key, None)
        return None

    memory_expires_at_epoch = expires_at_epoch
    if memory_cache_ttl_seconds is not None:
        memory_expires_at_epoch = min(
            expires_at_epoch,
            now_epoch + max(1, int(memory_cache_ttl_seconds)),
        )

    MEMORY_CACHE[object_key] = {
        "expiresAtEpoch": expires_at_epoch,
        "memoryExpiresAtEpoch": memory_expires_at_epoch,
        "payload": payload,
    }
    _prune_memory_cache(now_epoch)
    return payload


def store_cached_json(
    object_key,
    payload,
    ttl_seconds,
    cache_control_seconds=None,
    memory_cache_ttl_seconds=None,
):
    now_epoch = int(time())
    ttl_seconds = max(1, int(ttl_seconds))
    cache_control_seconds = max(
        1,
        int(cache_control_seconds if cache_control_seconds is not None else ttl_seconds),
    )
    cached_payload = dict(payload)
    cached_payload["generatedAt"] = cached_payload.get("generatedAt") or utc_now_iso()
    cached_payload["expiresAtEpoch"] = now_epoch + ttl_seconds

    s3.put_object(
        Bucket=DISCOVERY_CACHE_BUCKET,
        Key=object_key,
        Body=json.dumps(
            cached_payload,
            cls=DecimalEncoder,
            separators=(",", ":"),
        ).encode("utf-8"),
        ContentType="application/json",
        CacheControl=f"max-age={cache_control_seconds}",
    )

    memory_expires_at_epoch = cached_payload["expiresAtEpoch"]
    if memory_cache_ttl_seconds is not None:
        memory_expires_at_epoch = min(
            cached_payload["expiresAtEpoch"],
            now_epoch + max(1, int(memory_cache_ttl_seconds)),
        )

    MEMORY_CACHE[object_key] = {
        "expiresAtEpoch": cached_payload["expiresAtEpoch"],
        "memoryExpiresAtEpoch": memory_expires_at_epoch,
        "payload": cached_payload,
    }
    _prune_memory_cache(now_epoch)
    return cached_payload


def get_or_build_cached_json(
    object_key,
    ttl_seconds,
    builder,
    cache_control_seconds=None,
    memory_cache_ttl_seconds=None,
):
    payload = load_cached_json(
        object_key,
        memory_cache_ttl_seconds=memory_cache_ttl_seconds,
    )
    if payload is not None:
        return payload
    return store_cached_json(
        object_key,
        builder(),
        ttl_seconds,
        cache_control_seconds=cache_control_seconds,
        memory_cache_ttl_seconds=memory_cache_ttl_seconds,
    )


def invalidate_cached_json_keys(object_keys):
    unique_keys = sorted({key for key in object_keys if key})
    if not unique_keys:
        return

    for key in unique_keys:
        MEMORY_CACHE.pop(key, None)

    for start in range(0, len(unique_keys), 1000):
        batch = unique_keys[start : start + 1000]
        s3.delete_objects(
            Bucket=DISCOVERY_CACHE_BUCKET,
            Delete={
                "Objects": [{"Key": key} for key in batch],
                "Quiet": True,
            },
        )
