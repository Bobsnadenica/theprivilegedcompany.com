import uuid
from datetime import timedelta
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from shared.common import dynamodb, require_authenticated_user, s3, utc_now, utc_now_iso
from shared.config import ALLOWED_UPLOAD_CONTENT_TYPES, LANDMARKS_TABLE, MAX_PENDING_PER_USER, MAX_UPLOADS_PER_DAY, MAX_UPLOAD_BYTES, PENDING_LANDMARK_BUCKET, UPLOAD_EXPIRATION_SECONDS
from shared.geo import tile_id_for_point
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)
POST_POLICY_MULTIPART_OVERHEAD_BYTES = 64 * 1024


def _validate_coordinates(lat, lon):
    if not (-90 <= lat <= 90):
        raise Exception("Latitude is out of range.")
    if not (-180 <= lon <= 180):
        raise Exception("Longitude is out of range.")


def _count_recent_user_landmarks(user_id, since_iso):
    resp = landmarks_table.query(IndexName="gsi3", KeyConditionExpression=Key("gsi3pk").eq(f"USER#{user_id}") & Key("gsi3sk").gte(since_iso), Limit=200)
    items = resp.get("Items", [])
    pending = sum(1 for i in items if i.get("status") in {"UPLOAD_PENDING","PENDING_REVIEW"})
    return len(items), pending

def handler(event, context):
    args = event.get("arguments") or {}; user_id = require_authenticated_user(event)
    content_type = args["contentType"].strip().lower()
    if content_type not in ALLOWED_UPLOAD_CONTENT_TYPES: raise Exception("Only JPEG, PNG and WEBP uploads are allowed.")
    byte_length = int(args["byteLength"])
    if byte_length <= 0 or byte_length > MAX_UPLOAD_BYTES: raise Exception(f"Landmark uploads are limited to {MAX_UPLOAD_BYTES} bytes.")
    title = args["title"].strip(); category = args["category"].strip()
    description = (args.get("description") or "").strip()
    if len(title) < 3 or len(title) > 80: raise Exception("Title must be between 3 and 80 characters.")
    if len(category) < 2 or len(category) > 40: raise Exception("Category must be between 2 and 40 characters.")
    if len(description) > 500: raise Exception("Description must be 500 characters or fewer.")
    world_id = (args.get("worldId") or "global").strip().lower(); lat = Decimal(str(args["lat"])); lon = Decimal(str(args["lon"])); map_zoom = int(args.get("mapZoom") or 17)
    _validate_coordinates(float(lat), float(lon))
    now = utc_now(); since_iso = (now - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    uploads_last_day, pending = _count_recent_user_landmarks(user_id, since_iso)
    if uploads_last_day >= MAX_UPLOADS_PER_DAY: raise Exception("Daily landmark upload limit reached.")
    if pending >= MAX_PENDING_PER_USER: raise Exception("Too many pending landmarks awaiting moderation.")
    landmark_id = str(uuid.uuid4()); upload_token = str(uuid.uuid4()); ext = "jpg" if content_type=="image/jpeg" else ("png" if content_type=="image/png" else "webp")
    object_key = f"{user_id}/{landmark_id}/original.{ext}"; tile_id = tile_id_for_point(float(lat), float(lon), map_zoom); now_iso = utc_now_iso()
    landmarks_table.put_item(Item={"pk":f"WORLD#{world_id}#TILE#{tile_id}","sk":f"LANDMARK#{landmark_id}","gsi1pk":f"LANDMARK#{landmark_id}","gsi1sk":"DETAIL","gsi2pk":"STATUS#UPLOAD_PENDING","gsi2sk":f"{now_iso}#{landmark_id}","gsi3pk":f"USER#{user_id}","gsi3sk":f"{now_iso}#{landmark_id}","landmarkId":landmark_id,"uploadToken":upload_token,"worldId":world_id,"tileId":tile_id,"userId":user_id,"title":title,"description":description,"category":category,"lat":lat,"lon":lon,"originalFilename":args["filename"],"contentType":content_type,"byteLength":byte_length,"pendingObjectKey":object_key,"status":"UPLOAD_PENDING","createdAt":now_iso,"updatedAt":now_iso}, ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)")
    post = s3.generate_presigned_post(
        Bucket=PENDING_LANDMARK_BUCKET,
        Key=object_key,
        Fields={
            "Content-Type": content_type,
            "x-amz-meta-user-id": user_id,
            "x-amz-meta-landmark-id": landmark_id,
            "success_action_status": "201",
        },
        Conditions=[
            {"Content-Type": content_type},
            {"x-amz-meta-user-id": user_id},
            {"x-amz-meta-landmark-id": landmark_id},
            {"success_action_status": "201"},
            ["content-length-range", 1, MAX_UPLOAD_BYTES + POST_POLICY_MULTIPART_OVERHEAD_BYTES],
        ],
        ExpiresIn=UPLOAD_EXPIRATION_SECONDS,
    )
    return {"landmarkId":landmark_id,"uploadToken":upload_token,"objectKey":object_key,"uploadUrl":post["url"],"uploadFieldsJson":post["fields"],"expiresAt":(now + timedelta(seconds=UPLOAD_EXPIRATION_SECONDS)).isoformat().replace("+00:00", "Z"),"maxBytes":MAX_UPLOAD_BYTES}
