from boto3.dynamodb.conditions import Key
from shared.common import dynamodb, require_authenticated_user
from shared.config import CLOUDFRONT_DOMAIN, LANDMARKS_TABLE
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)

def handler(event, context):
    require_authenticated_user(event); landmark_id = event.get("arguments", {}).get("landmarkId")
    items = landmarks_table.query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"LANDMARK#{landmark_id}") & Key("gsi1sk").eq("DETAIL"), Limit=1).get("Items", [])
    if not items: raise Exception("Landmark not found.")
    item = items[0]
    if item.get("status") != "APPROVED" or not item.get("approvedObjectKey"): raise Exception("Approved landmark image not found.")
    return {"landmarkId":landmark_id,"viewUrl":f"https://{CLOUDFRONT_DOMAIN}/{item['approvedObjectKey']}","expiresAt":"9999-12-31T23:59:59Z"}
