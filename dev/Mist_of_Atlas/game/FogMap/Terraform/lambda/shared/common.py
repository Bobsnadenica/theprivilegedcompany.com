import base64, json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import boto3
from .config import ADMIN_GROUPS

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
sqs = boto3.client("sqs")

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)

def utc_now(): return datetime.now(timezone.utc)
def utc_now_iso(): return utc_now().isoformat().replace("+00:00", "Z")
def epoch_seconds_after(seconds): return int((utc_now() + timedelta(seconds=seconds)).timestamp())

def get_claims(event): return (event.get("identity") or {}).get("claims", {}) or {}
def get_user_id(event):
    ident = event.get("identity") or {}
    return ident.get("sub") or get_claims(event).get("sub")

def require_authenticated_user(event):
    user_id = get_user_id(event)
    if not user_id: raise Exception("Authenticated user id not found.")
    return user_id

def get_groups(event):
    groups = get_claims(event).get("cognito:groups") or get_claims(event).get("groups") or []
    if isinstance(groups, str): return {groups}
    return set(groups)

def require_admin(event):
    user_id = require_authenticated_user(event)
    if not get_groups(event).intersection(ADMIN_GROUPS): raise Exception("Admin or moderator permissions are required.")
    return user_id

def get_display_name(event):
    claims = get_claims(event)
    return claims.get("custom:display_name") or claims.get("name") or claims.get("email") or claims.get("cognito:username") or "Explorer"

def get_profile_icon(event):
    claims = get_claims(event)
    return claims.get("custom:profile_icon") or "🛡️"

def encode_next_token(payload):
    if not payload: return None
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")

def decode_next_token(token):
    if not token: return None
    return json.loads(base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8"))
