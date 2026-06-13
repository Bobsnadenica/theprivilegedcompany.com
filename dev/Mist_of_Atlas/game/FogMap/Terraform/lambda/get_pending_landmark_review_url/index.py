from datetime import timedelta
from boto3.dynamodb.conditions import Key
from shared.common import dynamodb, require_admin, s3, utc_now
from shared.config import LANDMARKS_TABLE, PENDING_LANDMARK_BUCKET
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)

def handler(event, context):
    require_admin(event); landmark_id = event.get("arguments", {}).get("landmarkId")
    items = landmarks_table.query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"LANDMARK#{landmark_id}") & Key("gsi1sk").eq("DETAIL"), Limit=1).get("Items", [])
    if not items: raise Exception("Landmark not found.")
    item = items[0]
    if item.get("status") not in {"UPLOAD_PENDING","PENDING_REVIEW"}: raise Exception("Landmark is not pending review.")
    exp = 900
    return {"landmarkId":item["landmarkId"],"viewUrl":s3.generate_presigned_url(ClientMethod="get_object", Params={"Bucket":PENDING_LANDMARK_BUCKET,"Key":item["pendingObjectKey"]}, ExpiresIn=exp),"expiresAt":(utc_now() + timedelta(seconds=exp)).isoformat().replace("+00:00","Z")}
