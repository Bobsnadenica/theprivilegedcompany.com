import json
from uuid import uuid4

from .common import sqs, utc_now_iso
from .config import SHARED_TILE_REBUILD_QUEUE_URL

MAX_BATCH_SIZE = 10


def enqueue_shared_tile_rebuilds(world_id, tile_ids, reason="update"):
    unique_tile_ids = sorted({str(tile_id) for tile_id in tile_ids if str(tile_id).strip()})
    if not unique_tile_ids or not SHARED_TILE_REBUILD_QUEUE_URL:
        return 0

    sent = 0
    for start in range(0, len(unique_tile_ids), MAX_BATCH_SIZE):
        batch = unique_tile_ids[start : start + MAX_BATCH_SIZE]
        entries = []
        for tile_id in batch:
            entries.append(
                {
                    "Id": uuid4().hex,
                    "MessageBody": json.dumps(
                        {
                            "worldId": world_id,
                            "tileId": tile_id,
                            "reason": reason,
                            "enqueuedAt": utc_now_iso(),
                        },
                        separators=(",", ":"),
                    ),
                }
            )
        response = sqs.send_message_batch(
            QueueUrl=SHARED_TILE_REBUILD_QUEUE_URL,
            Entries=entries,
        )
        failures = response.get("Failed", [])
        if failures:
            raise Exception(f"Failed to enqueue shared tile rebuilds: {failures}")
        sent += len(response.get("Successful", []))

    return sent
