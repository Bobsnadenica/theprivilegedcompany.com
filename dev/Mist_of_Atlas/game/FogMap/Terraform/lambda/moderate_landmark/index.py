from boto3.dynamodb.conditions import Key
from shared.common import dynamodb, require_admin, s3, utc_now_iso
from shared.config import APPROVED_LANDMARK_BUCKET, LANDMARKS_TABLE, PENDING_LANDMARK_BUCKET
from shared.tile_rebuild_queue import enqueue_shared_tile_rebuilds
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)

def handler(event, context):
    require_admin(event)
    args = event.get("arguments") or {}; landmark_id = args["landmarkId"]; approve = bool(args["approve"]); notes = (args.get("moderationNotes") or "").strip()
    items = landmarks_table.query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"LANDMARK#{landmark_id}") & Key("gsi1sk").eq("DETAIL"), Limit=1).get("Items", [])
    if not items: raise Exception("Landmark not found.")
    item = items[0]; approved_key = None; status = "REJECTED"
    if approve:
        ext = item["pendingObjectKey"].split(".")[-1]; approved_key = f"{item['landmarkId']}/original.{ext}"
        s3.copy_object(Bucket=APPROVED_LANDMARK_BUCKET, CopySource={"Bucket":PENDING_LANDMARK_BUCKET,"Key":item["pendingObjectKey"]}, Key=approved_key, ContentType=item.get("contentType"), MetadataDirective="COPY")
        status = "APPROVED"
    s3.delete_object(Bucket=PENDING_LANDMARK_BUCKET, Key=item["pendingObjectKey"])
    now_iso = utc_now_iso()
    landmarks_table.update_item(Key={"pk":item["pk"],"sk":item["sk"]}, UpdateExpression="SET #status = :status, moderationNotes = :notes, moderatedAt = :moderatedAt, approvedObjectKey = :approvedObjectKey, updatedAt = :updatedAt, gsi2pk = :gsi2pk, gsi2sk = :gsi2sk", ExpressionAttributeNames={"#status":"status"}, ExpressionAttributeValues={":status":status,":notes":notes,":moderatedAt":now_iso,":approvedObjectKey":approved_key,":updatedAt":now_iso,":gsi2pk":f"STATUS#{status}",":gsi2sk":f"{now_iso}#{landmark_id}"})
    tile_id = item.get("tileId")
    world_id = (item.get("worldId") or "global").strip().lower()
    if tile_id:
        enqueue_shared_tile_rebuilds(world_id, [tile_id], reason=f"landmark-{status.lower()}")
    return {"landmarkId":landmark_id,"status":status,"approvedObjectKey":approved_key}
