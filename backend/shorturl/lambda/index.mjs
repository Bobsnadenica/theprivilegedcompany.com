import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.TABLE_NAME;
const DOMAIN_URL = process.env.DOMAIN_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;
const CREATE_KEY = process.env.CREATE_KEY;

const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_LENGTH = 6;
const CUSTOM_SLUG_RE = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED_SLUGS = new Set(["api"]);
const MAX_URL_LENGTH = 2048;
const MAX_TTL_DAYS = 365;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const notFoundPage = () => ({
  statusCode: 404,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link not found</title><style>body{font-family:system-ui,sans-serif;background:#07090d;color:#f8fafc;min-height:100vh;display:grid;place-items:center;margin:0}main{text-align:center;padding:2rem}h1{letter-spacing:-0.03em}a{color:#7cc7ff}</style></head><body><main><h1>Link not found</h1><p>This short link doesn't exist or has expired.</p><p><a href="${FRONTEND_URL}">Create a short link</a></p></main></body></html>`,
});

function keyIsValid(event) {
  const provided = event.headers?.["x-create-key"];
  if (!provided || !CREATE_KEY) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(CREATE_KEY).digest();
  return timingSafeEqual(a, b);
}

function validateUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Missing url" };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL_LENGTH) return { error: `URL longer than ${MAX_URL_LENGTH} characters` };

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "Not a valid absolute URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http and https URLs are allowed" };
  }

  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" || host === "0.0.0.0" || host === "::1" ||
    host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa") ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd]/.test(host) || /^fe80:/.test(host);
  if (privateHost) return { error: "URL points at a private or local address" };
  if (`https://${host}` === DOMAIN_URL || `http://${host}` === DOMAIN_URL) {
    return { error: "Cannot shorten a link to the shortener itself" };
  }

  return { url: url.href };
}

function generateSlug() {
  // Rejection sampling keeps the base62 distribution unbiased.
  const out = [];
  while (out.length < SLUG_LENGTH) {
    for (const byte of randomBytes(SLUG_LENGTH * 2)) {
      if (byte < 248) {
        out.push(SLUG_ALPHABET[byte % 62]);
        if (out.length === SLUG_LENGTH) break;
      }
    }
  }
  return out.join("");
}

function isExpired(item) {
  return item.expiresAt && item.expiresAt * 1000 < Date.now();
}

async function handleRedirect(slug) {
  if (!slug || slug === "favicon.ico" || slug === "robots.txt") return notFoundPage();

  const { Item } = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { slug } }));
  if (!Item || isExpired(Item)) return notFoundPage();

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { slug },
    UpdateExpression: "ADD clicks :one SET lastClickAt = :now",
    ExpressionAttributeValues: { ":one": 1, ":now": new Date().toISOString() },
  }));

  // 302 + no-store so every hit reaches us and the click count stays honest.
  return {
    statusCode: 302,
    headers: {
      Location: Item.longUrl,
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
    },
  };
}

async function handleCreate(event) {
  if (!keyIsValid(event)) return json(401, { error: "Invalid or missing create key" });

  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body;
    body = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const checked = validateUrl(body.url);
  if (checked.error) return json(400, { error: checked.error });

  let expiresAt;
  if (body.ttlDays !== undefined && body.ttlDays !== null && body.ttlDays !== "") {
    const days = Number(body.ttlDays);
    if (!Number.isFinite(days) || days < 1 || days > MAX_TTL_DAYS) {
      return json(400, { error: `ttlDays must be between 1 and ${MAX_TTL_DAYS}` });
    }
    expiresAt = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  }

  const customSlug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null;
  if (customSlug) {
    if (!CUSTOM_SLUG_RE.test(customSlug)) {
      return json(400, { error: "Custom slug must be 3-32 characters: letters, digits, - or _" });
    }
    if (RESERVED_SLUGS.has(customSlug.toLowerCase())) {
      return json(400, { error: "That slug is reserved" });
    }
  }

  const attempts = customSlug ? 1 : 5;
  for (let i = 0; i < attempts; i++) {
    const slug = customSlug ?? generateSlug();
    const item = {
      slug,
      longUrl: checked.url,
      createdAt: new Date().toISOString(),
      clicks: 0,
      ...(expiresAt ? { expiresAt } : {}),
    };
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(slug)",
      }));
      return json(201, { ...item, shortUrl: `${DOMAIN_URL}/${slug}` });
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
      if (customSlug) return json(409, { error: "That slug is already taken" });
    }
  }
  return json(503, { error: "Could not allocate a slug, please retry" });
}

async function handleStats(event, slug) {
  if (!keyIsValid(event)) return json(401, { error: "Invalid or missing create key" });

  const { Item } = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { slug } }));
  if (!Item || isExpired(Item)) return json(404, { error: "No such link" });

  return json(200, { ...Item, shortUrl: `${DOMAIN_URL}/${Item.slug}` });
}

export const handler = async (event) => {
  try {
    const routeKey = event.routeKey;
    const slug = event.pathParameters?.slug;

    switch (routeKey) {
      case "GET /":
        return { statusCode: 302, headers: { Location: FRONTEND_URL, "Cache-Control": "no-store" } };
      case "POST /api/links":
        return await handleCreate(event);
      case "GET /api/links/{slug}/stats":
        return await handleStats(event, slug);
      case "GET /{slug}":
        return await handleRedirect(slug);
      default:
        return notFoundPage();
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    return json(500, { error: "Internal error" });
  }
};
