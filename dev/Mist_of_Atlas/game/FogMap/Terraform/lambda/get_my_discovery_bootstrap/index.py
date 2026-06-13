import os

from boto3.dynamodb.conditions import Key

from shared.atlas_tiles import item_cells, unpack_packed_sort_key
from shared.common import dynamodb
from shared.config import USER_BOOTSTRAP_CACHE_PREFIX, USER_BOOTSTRAP_CACHE_TTL_SECONDS
from shared.discovery_cache import cache_object_key, get_or_build_cached_json

USER_DISCOVERIES_TABLE = os.environ["USER_DISCOVERIES_TABLE"]
CELL_DEGREES = 0.00018

table = dynamodb.Table(USER_DISCOVERIES_TABLE)


def _user_id_from_event(event):
    identity = event.get("identity") or {}
    claims = identity.get("claims") or {}
    return identity.get("sub") or claims.get("sub")


def _world_id_from_event(event):
    args = event.get("arguments") or {}
    return (args.get("worldId") or "global").strip().lower()


def _item_world_id(item):
    explicit_world_id = str(item.get("worldId") or "").strip().lower()
    if explicit_world_id:
        return explicit_world_id

    sk_world_id, _ = unpack_packed_sort_key(item.get("sk"))
    return (sk_world_id or "global").strip().lower()


def _build_user_bootstrap(user_id, world_id):
    items = []
    last_evaluated_key = None

    while True:
        query_args = {
            "KeyConditionExpression": Key("pk").eq(f"USER#{user_id}"),
        }
        if last_evaluated_key:
            query_args["ExclusiveStartKey"] = last_evaluated_key

        response = table.query(**query_args)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")

        if not last_evaluated_key:
            break

    cells_by_id = {}
    for item in items:
        if _item_world_id(item) != world_id:
            continue
        for cell in item_cells(item, default_cell_degrees=CELL_DEGREES):
            cells_by_id[cell["cellId"]] = cell

    return {
        "userId": user_id,
        "worldId": world_id,
        "cells": sorted(cells_by_id.values(), key=lambda cell: cell["cellId"]),
    }


def handler(event, context):
    user_id = _user_id_from_event(event)
    if not user_id:
        raise Exception("Unauthorized")
    world_id = _world_id_from_event(event)

    cached = get_or_build_cached_json(
        cache_object_key(USER_BOOTSTRAP_CACHE_PREFIX, world_id, user_id),
        USER_BOOTSTRAP_CACHE_TTL_SECONDS,
        lambda user_id=user_id, world_id=world_id: _build_user_bootstrap(
            user_id,
            world_id,
        ),
    )
    return {"cells": cached.get("cells", [])}
