from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from shared.common import dynamodb, require_authenticated_user, s3, utc_now_iso
from shared.config import LANDMARKS_TABLE, PENDING_LANDMARK_BUCKET
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)

def handler(event, context):
    args = event.get("arguments") or {}; user_id = require_authenticated_user(event); landmark_id = args["landmarkId"]; upload_token = args["uploadToken"]
    items = landmarks_table.query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"LANDMARK#{landmark_id}") & Key("gsi1sk").eq("DETAIL"), Limit=1).get("Items", [])
    if not items: raise Exception("Landmark not found.")
    item = items[0]
    if item["userId"] != user_id: raise Exception("You can only finalize your own landmark upload.")
    if item["uploadToken"] != upload_token: raise Exception("Invalid upload token.")
    if item.get("status") != "UPLOAD_PENDING": raise Exception("Landmark upload is not awaiting finalization.")
    try: upload_object = s3.head_object(Bucket=PENDING_LANDMARK_BUCKET, Key=item["pendingObjectKey"])
    except ClientError: raise Exception("Pending upload object not found in S3.")
    if int(upload_object.get("ContentLength", 0)) != int(item["byteLength"]): raise Exception("Uploaded object size does not match the ticketed byte length.")
    now_iso = utc_now_iso()
    landmarks_table.update_item(Key={"pk":item["pk"],"sk":item["sk"]}, UpdateExpression="SET #status = :status, updatedAt = :updatedAt, gsi2pk = :gsi2pk, gsi2sk = :gsi2sk", ExpressionAttributeNames={"#status":"status"}, ExpressionAttributeValues={":status":"PENDING_REVIEW",":updatedAt":now_iso,":gsi2pk":"STATUS#PENDING_REVIEW",":gsi2sk":f"{now_iso}#{landmark_id}"})
    return {"landmarkId":landmark_id,"status":"PENDING_REVIEW","message":"Upload received and queued for approval."}
