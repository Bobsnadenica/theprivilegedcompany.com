from boto3.dynamodb.conditions import Key
from shared.common import decode_next_token, encode_next_token, dynamodb, require_admin
from shared.config import LANDMARKS_TABLE
landmarks_table = dynamodb.Table(LANDMARKS_TABLE)

def handler(event, context):
    require_admin(event)
    args = event.get("arguments") or {}
    limit = max(1, min(int(args.get("limit") or 25), 100))
    next_token = decode_next_token(args.get("nextToken"))
    query_args = {"IndexName":"gsi2","KeyConditionExpression":Key("gsi2pk").eq("STATUS#PENDING_REVIEW"),"Limit":limit}
    if next_token: query_args["ExclusiveStartKey"] = next_token
    resp = landmarks_table.query(**query_args)
    items = [{"landmarkId":i["landmarkId"],"title":i.get("title",""),"description":i.get("description",""),"category":i.get("category",""),"lat":float(i["lat"]),"lon":float(i["lon"]),"status":i.get("status","PENDING_REVIEW"),"pendingObjectKey":i["pendingObjectKey"],"createdAt":i["createdAt"],"userId":i["userId"]} for i in resp.get("Items", [])]
    return {"items":items,"nextToken":encode_next_token(resp.get("LastEvaluatedKey"))}
