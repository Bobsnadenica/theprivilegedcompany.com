const { randomUUID } = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand
} = require("@aws-sdk/lib-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const ses = new SESv2Client({});

const env = {
  usersTable: process.env.USERS_TABLE,
  consultantsTable: process.env.CONSULTANTS_TABLE,
  bookingsTable: process.env.BOOKINGS_TABLE,
  cvBucket: process.env.CV_BUCKET,
  allowedOrigin: process.env.ALLOWED_ORIGIN || "https://www.bobsnadenica.com",
  sesFromEmail: process.env.SES_FROM_EMAIL || "",
  appUrl: process.env.APP_URL || "https://www.bobsnadenica.com/career/"
};

const CONSULTANT_PROFILE_THEMES = new Set(["violet", "sky", "rose", "mint", "amber"]);
const USER_ROLES = new Set(["client", "consultant"]);
const CONSULTANT_PROFILE_TYPES = new Set(["consultant", "mentor"]);
const PLAN_TIERS = new Set(["free", "pro"]);
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_USER_DOCUMENTS = 10;
const CONSULTANT_PROFILE_STATUSES = new Set(["pending", "approved", "rejected"]);
const VISIBLE_CONSULTANT_STATUSES = new Set(["approved", "active"]);
const ADMIN_GROUP = "admin";

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      // Defense-in-depth headers. Even though API responses are JSON consumed
      // by fetch(), an attacker who tricks a victim into pasting a URL into
      // the browser or who finds an HTML-injection sink would otherwise rely
      // on these being unset. Cheap to set, defends multiple sinks.
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function badRequest(message) {
  return response(400, { message });
}

function forbidden(message) {
  return response(403, { message });
}

function notFound(message) {
  return response(404, { message });
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), {
      statusCode: 400
    });
  }
}

function getClaims(event) {
  return event.requestContext?.authorizer?.jwt?.claims || null;
}

function requireAuth(event) {
  const claims = getClaims(event);

  if (!claims || !claims.sub) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return claims;
}

function getClaimGroups(claims) {
  const raw = claims?.["cognito:groups"];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  return String(raw)
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAdmin(claims) {
  return getClaimGroups(claims).includes(ADMIN_GROUP);
}

function requireAdmin(event) {
  const claims = requireAuth(event);

  if (!isAdmin(claims)) {
    throw Object.assign(new Error("Admin access required."), { statusCode: 403 });
  }

  return claims;
}

async function getUserBySub(userId) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: env.usersTable,
      Key: { userId },
      ConsistentRead: true
    })
  );

  return result.Item || null;
}

async function getConsultantBySlug(slug) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.consultantsTable,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: {
        ":slug": slug
      },
      Limit: 1
    })
  );

  return result.Items?.[0] || null;
}

async function getConsultantByOwner(ownerUserId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.consultantsTable,
      IndexName: "owner-index",
      KeyConditionExpression: "ownerUserId = :ownerUserId",
      ExpressionAttributeValues: {
        ":ownerUserId": ownerUserId
      },
      Limit: 1
    })
  );

  return result.Items?.[0] || null;
}

function normalizeStringList(value, fallback = [], limit = 24, maxLength = 120) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().slice(0, maxLength))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function normalizeText(value, fallback = "", maxLength = 1200) {
  if (typeof value === "undefined" || value === null) {
    return fallback;
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizeBoundedNumber(value, fallback, { min = 0, max = 1000, integer = false } = {}) {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  const bounded = Math.min(max, Math.max(min, number));
  return integer ? Math.round(bounded) : Math.round(bounded * 100) / 100;
}

function normalizeUserRole(value, fallback = "client") {
  const role = String(value || "").trim().toLowerCase();
  return USER_ROLES.has(role) ? role : fallback;
}

function normalizePlanTier(value, fallback = "free") {
  const plan = String(value || "").trim().toLowerCase();
  return PLAN_TIERS.has(plan) ? plan : fallback;
}

function normalizeConsultantProfileType(value, fallback = "consultant") {
  const profileType = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_TYPES.has(profileType) ? profileType : fallback;
}

function normalizeConsultantTheme(value, fallback = "") {
  if (typeof value === "undefined") {
    return fallback;
  }

  if (value === null || value === "") {
    return "";
  }

  const theme = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_THEMES.has(theme) ? theme : fallback;
}

const MAX_AVAILABILITY_SLOTS = 400;

function normalizeAvailabilitySlots(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => !Number.isNaN(new Date(item).getTime()))
    )
  )
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .slice(0, MAX_AVAILABILITY_SLOTS);
}

function getNextAvailableSlot(value, fallback = "") {
  const availability = normalizeAvailabilitySlots(value, []);
  const cutoff = Date.now() - 5 * 60 * 1000;

  return (
    availability.find((item) => new Date(item).getTime() >= cutoff) ||
    availability[0] ||
    fallback
  );
}

function formatBookingDateTimeBg(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || "");
  }
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/Sofia"
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

async function sendEmail({ to, subject, text }) {
  if (!env.sesFromEmail) {
    console.log("[email] skipped (SES_FROM_EMAIL not set)", { to, subject });
    return;
  }
  if (!to) {
    return;
  }
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.sesFromEmail,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } }
          }
        }
      })
    );
  } catch (error) {
    console.error("[email] send failed", { to, subject, error: error?.message || error });
  }
}

async function sendBookingCreatedEmails({ consultantOwner, consultant, client, booking }) {
  const when = formatBookingDateTimeBg(booking.scheduledAt);
  const noteLine = booking.note ? `\n\nБележка от потребителя:\n${booking.note}` : "";

  const tasks = [];

  if (consultantOwner?.email) {
    tasks.push(
      sendEmail({
        to: consultantOwner.email,
        subject: `Нова резервация от ${client.name || client.email}`,
        text:
          `Здравей, ${consultantOwner.name || consultant.name},\n\n` +
          `${client.name || client.email} (${client.email}) резервира консултация с теб.\n\n` +
          `Час: ${when}\n` +
          `Продължителност: ${consultant.sessionLengthMinutes || 60} минути\n` +
          `Статус: потвърдена (можеш да я откажеш от таблото си, ако не можеш да я поемеш)${noteLine}\n\n` +
          `Виж резервациите си в таблото: ${env.appUrl}#/dashboard`
      })
    );
  }

  if (client?.email) {
    tasks.push(
      sendEmail({
        to: client.email,
        subject: `Резервацията ти с ${consultant.name} е потвърдена`,
        text:
          `Здравей, ${client.name || ""},\n\n` +
          `Резервацията ти с ${consultant.name} е потвърдена.\n\n` +
          `Час: ${when}\n` +
          `Продължителност: ${consultant.sessionLengthMinutes || 60} минути\n` +
          `Формат: ${(consultant.sessionModes || []).join(", ") || "Онлайн"}\n\n` +
          `Ако консултантът не може да поеме часа, ще получиш отделно известие.\n\n` +
          `Виж резервациите си в таблото: ${env.appUrl}#/dashboard`
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendBookingReminderEmails({ consultantOwner, consultant, client, booking }) {
  const when = formatBookingDateTimeBg(booking.scheduledAt);
  const tasks = [];

  if (client?.email) {
    tasks.push(
      sendEmail({
        to: client.email,
        subject: `Напомняне: консултация с ${booking.consultantName || consultant?.name || ""} утре`,
        text:
          `Здравей, ${client.name || ""},\n\n` +
          `Напомняме ти за резервираната консултация:\n\n` +
          `Час: ${when}\n` +
          `Консултант: ${booking.consultantName || consultant?.name || ""}\n` +
          (consultant?.sessionModes?.length
            ? `Формат: ${consultant.sessionModes.join(", ")}\n`
            : "") +
          `\nАко не можеш да присъстваш, моля откажи резервацията от таблото:\n` +
          `${env.appUrl}#/dashboard`
      })
    );
  }

  if (consultantOwner?.email) {
    tasks.push(
      sendEmail({
        to: consultantOwner.email,
        subject: `Напомняне: консултация с ${booking.clientName || "потребител"} утре`,
        text:
          `Здравей, ${consultantOwner.name || consultant?.name || ""},\n\n` +
          `Напомняме ти за резервираната консултация:\n\n` +
          `Час: ${when}\n` +
          `Потребител: ${booking.clientName || ""} (${booking.clientEmail || ""})\n` +
          (booking.note ? `\nБележка: ${booking.note}\n` : "") +
          `\nТабло: ${env.appUrl}#/dashboard`
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function sendDueReminders() {
  const now = Date.now();
  const windowStart = now + 22 * 60 * 60 * 1000;
  const windowEnd = now + 26 * 60 * 60 * 1000;

  const result = await dynamo.send(
    new ScanCommand({
      TableName: env.bookingsTable,
      FilterExpression:
        "#s = :confirmed AND attribute_not_exists(reminderSentAt) AND scheduledAt BETWEEN :start AND :end",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":confirmed": "confirmed",
        ":start": new Date(windowStart).toISOString(),
        ":end": new Date(windowEnd).toISOString()
      }
    })
  );

  const due = result.Items || [];
  if (!due.length) {
    console.log("[reminders] no bookings due");
    return { processed: 0 };
  }

  let processed = 0;
  for (const booking of due) {
    try {
      const consultantResult = await dynamo.send(
        new GetCommand({
          TableName: env.consultantsTable,
          Key: { consultantId: booking.consultantId }
        })
      );
      const consultant = consultantResult.Item || null;
      const consultantOwner = consultant?.ownerUserId
        ? await getUserBySub(consultant.ownerUserId)
        : null;
      const client = await getUserBySub(booking.clientId);

      await sendBookingReminderEmails({
        consultantOwner,
        consultant,
        client: client || { email: booking.clientEmail, name: booking.clientName },
        booking
      });

      await dynamo.send(
        new UpdateCommand({
          TableName: env.bookingsTable,
          Key: { bookingId: booking.bookingId },
          UpdateExpression: "SET reminderSentAt = :now",
          ConditionExpression: "attribute_not_exists(reminderSentAt)",
          ExpressionAttributeValues: { ":now": new Date().toISOString() }
        })
      );
      processed += 1;
    } catch (error) {
      console.error("[reminders] booking failed", {
        bookingId: booking.bookingId,
        error: error?.message || error
      });
    }
  }

  console.log(`[reminders] processed ${processed} of ${due.length}`);
  return { processed };
}

async function sendBookingCancelledEmail({ recipient, consultantName, scheduledAt, cancelledBy }) {
  if (!recipient?.email) return;
  const when = formatBookingDateTimeBg(scheduledAt);
  const subject =
    cancelledBy === "consultant"
      ? `Консултантът отказа резервацията ти`
      : `Резервацията беше отказана`;
  const text =
    cancelledBy === "consultant"
      ? `Здравей, ${recipient.name || ""},\n\n` +
        `${consultantName} не може да поеме резервацията за ${when}.\n\n` +
        `Можеш да избереш друг свободен час от профила или да опиташ с друг консултант.\n\n` +
        `Каталог: ${env.appUrl}#/consultants`
      : `Здравей, ${recipient.name || ""},\n\n` +
        `Потребителят отказа резервацията за ${when}.\n\n` +
        `Часът е свободен отново и може да бъде резервиран от друг потребител.\n\n` +
        `Табло: ${env.appUrl}#/dashboard`;

  await sendEmail({ to: recipient.email, subject, text });
}

function sanitizeFileName(fileName) {
  const normalized = String(fileName || "upload")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "upload";
}

function normalizeUploadKind(value) {
  const kind = String(value || "cv").trim().toLowerCase();

  if (
    kind === "cv" ||
    kind === "document" ||
    kind === "avatar" ||
    kind === "hero" ||
    kind === "user-avatar"
  ) {
    return kind;
  }

  return null;
}

function assertOwnedStorageKey(value, fallback, allowedPrefixes, label = "storage key") {
  if (typeof value === "undefined") {
    return fallback || "";
  }

  if (value === null || value === "") {
    return "";
  }

  const storageKey = String(value || "").trim();
  const isOwned = allowedPrefixes.some((prefix) => storageKey.startsWith(prefix));

  if (!storageKey || !isOwned) {
    throw Object.assign(new Error(`Invalid ${label}.`), { statusCode: 400 });
  }

  return storageKey;
}

function normalizeCvDocument(value, fallback, userId) {
  if (typeof value === "undefined") {
    return fallback ?? null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value) || !value.storageKey) {
    throw Object.assign(new Error("Invalid CV document."), { statusCode: 400 });
  }

  const storageKey = assertOwnedStorageKey(
    value.storageKey,
    "",
    [`profiles/${userId}/documents/`],
    "CV storage key"
  );

  return {
    fileName: sanitizeFileName(value.fileName || fallback?.fileName || "cv"),
    storageKey,
    uploadedAt:
      normalizeText(value.uploadedAt, fallback?.uploadedAt || "", 40) ||
      new Date().toISOString()
  };
}

function normalizeUserDocuments(value, fallback, userId) {
  if (typeof value === "undefined") {
    return Array.isArray(fallback) ? fallback : [];
  }

  if (!Array.isArray(value)) {
    throw Object.assign(new Error("documents must be a list."), { statusCode: 400 });
  }

  const fallbackByKey = new Map(
    (Array.isArray(fallback) ? fallback : []).map((item) => [item.storageKey, item])
  );

  const seenKeys = new Set();
  const sanitized = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !item.storageKey) {
      throw Object.assign(new Error("Invalid document entry."), { statusCode: 400 });
    }
    const storageKey = assertOwnedStorageKey(
      item.storageKey,
      "",
      [`profiles/${userId}/documents/`],
      "document storage key"
    );
    if (seenKeys.has(storageKey)) {
      continue;
    }
    seenKeys.add(storageKey);
    const previous = fallbackByKey.get(storageKey);
    sanitized.push({
      fileName: sanitizeFileName(item.fileName || previous?.fileName || "document"),
      storageKey,
      uploadedAt:
        normalizeText(item.uploadedAt, previous?.uploadedAt || "", 40) ||
        previous?.uploadedAt ||
        new Date().toISOString()
    });
  }

  if (sanitized.length > MAX_USER_DOCUMENTS) {
    throw Object.assign(
      new Error(`Можеш да качиш до ${MAX_USER_DOCUMENTS} документа.`),
      { statusCode: 400 }
    );
  }

  return sanitized;
}

function normalizeSlug(value, fallback = "") {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback || "";
}

function validateUploadRequest({ kind, contentType, fileSize }) {
  const safeContentType = String(contentType || "").trim().toLowerCase();
  const safeFileSize = Number(fileSize || 0);

  if (!safeContentType) {
    return "contentType is required.";
  }

  if (!Number.isFinite(safeFileSize) || safeFileSize <= 0) {
    return "fileSize must be a positive number.";
  }

  if (kind === "cv") {
    if (!ALLOWED_DOCUMENT_TYPES.has(safeContentType) || safeContentType === "text/plain") {
      return "Unsupported CV file type.";
    }

    if (safeFileSize > 8 * 1024 * 1024) {
      return "CV files must be 8 MB or smaller.";
    }

    return null;
  }

  if (kind === "document") {
    if (!ALLOWED_DOCUMENT_TYPES.has(safeContentType)) {
      return "Unsupported document type.";
    }

    if (safeFileSize > MAX_DOCUMENT_BYTES) {
      return "Documents must be 10 MB or smaller.";
    }

    return null;
  }

  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(safeContentType)) {
    return "Profile media must be a JPEG, PNG, or WebP image.";
  }

  if (safeFileSize > 5 * 1024 * 1024) {
    return "Profile images must be 5 MB or smaller.";
  }

  return null;
}

async function getSignedObjectUrl(storageKey) {
  if (!storageKey) {
    return "";
  }

  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.cvBucket,
      Key: storageKey
    }),
    { expiresIn: 3600 }
  );
}

async function deleteS3Object(storageKey) {
  if (!storageKey) return;
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.cvBucket,
        Key: storageKey
      })
    );
  } catch (error) {
    console.error("[s3] delete failed", { storageKey, error: error?.message || error });
  }
}

async function deleteOrphanedStorageKeys(previous, next) {
  const nextKeys = new Set();
  for (const key of next) {
    if (key) nextKeys.add(key);
  }
  const orphans = [];
  for (const key of previous) {
    if (key && !nextKeys.has(key)) orphans.push(key);
  }
  await Promise.allSettled(orphans.map((key) => deleteS3Object(key)));
}

// Fields that exist on the DynamoDB consultant item but must never leak to
// unauthenticated/public callers. Removed from listConsultants + getConsultant
// responses. Admin and owner endpoints get the full object.
const PUBLIC_CONSULTANT_HIDDEN_FIELDS = [
  "ownerUserId",
  "bookedSlots",
  "statusUpdatedAt",
  "statusUpdatedBy",
  "statusUpdatedByEmail",
  "statusSelfApproved",
  "avatarStorageKey",
  "heroStorageKey"
];

function stripSensitiveConsultantFields(consultant) {
  if (!consultant) return consultant;
  const cleaned = { ...consultant };
  for (const key of PUBLIC_CONSULTANT_HIDDEN_FIELDS) {
    delete cleaned[key];
  }
  return cleaned;
}

async function decorateConsultantMedia(consultant) {
  if (!consultant) {
    return consultant;
  }

  const availability = normalizeAvailabilitySlots(consultant.availability || [], []);
  const languages = normalizeStringList(consultant.languages, []);
  const specializations = normalizeStringList(consultant.specializations, []);
  const sessionModes = normalizeStringList(consultant.sessionModes, ["Онлайн"]);
  const tags = normalizeStringList(consultant.tags, []);
  const idealFor = normalizeStringList(consultant.idealFor, []);
  const consultationTopics = normalizeStringList(consultant.consultationTopics, []);
  const experienceHighlights = normalizeStringList(consultant.experienceHighlights, []);
  const educationHighlights = normalizeStringList(consultant.educationHighlights, []);
  const [avatarUrl, heroUrl] = await Promise.all([
    consultant.avatarStorageKey
      ? getSignedObjectUrl(consultant.avatarStorageKey)
      : Promise.resolve(""),
    consultant.heroStorageKey
      ? getSignedObjectUrl(consultant.heroStorageKey)
      : Promise.resolve("")
  ]);

  return {
    ...consultant,
    bio: consultant.bio || "",
    experienceSummary: consultant.experienceSummary || "",
    experienceHighlights,
    educationHighlights,
    theme: normalizeConsultantTheme(consultant.theme),
    languages,
    specializations,
    sessionModes,
    tags,
    idealFor,
    consultationTopics,
    workApproach: consultant.workApproach || "",
    availability,
    nextAvailable: getNextAvailableSlot(availability, consultant.nextAvailable || ""),
    avatarUrl: avatarUrl || consultant.avatarUrl,
    heroUrl: heroUrl || consultant.heroUrl
  };
}

async function decorateUserMedia(user) {
  if (!user) {
    return user;
  }

  const [avatarUrl, cvDownloadUrl, documents] = await Promise.all([
    user.avatarStorageKey ? getSignedObjectUrl(user.avatarStorageKey) : Promise.resolve(""),
    user.cvDocument?.storageKey
      ? getSignedObjectUrl(user.cvDocument.storageKey)
      : Promise.resolve(""),
    Promise.all(
      (Array.isArray(user.documents) ? user.documents : []).map(async (item) => ({
        ...item,
        downloadUrl: item.storageKey ? await getSignedObjectUrl(item.storageKey) : ""
      }))
    )
  ]);

  return {
    ...user,
    headline: user.headline || "",
    bio: user.bio || "",
    experienceSummary: user.experienceSummary || "",
    experienceHighlights: normalizeStringList(user.experienceHighlights, []),
    educationHighlights: normalizeStringList(user.educationHighlights, []),
    skills: normalizeStringList(user.skills, []),
    interests: normalizeStringList(user.interests, []),
    keywords: normalizeStringList(user.keywords, []),
    preferredSessionModes: normalizeStringList(user.preferredSessionModes, []),
    avatarUrl: avatarUrl || user.avatarUrl || "",
    cvDocument: user.cvDocument
      ? { ...user.cvDocument, downloadUrl: cvDownloadUrl }
      : null,
    documents
  };
}

function getConsultantPlanFields(plan) {
  return {
    subscriptionStatus: "active",
    membershipTier: plan === "pro" ? "enhanced" : "standard"
  };
}

const INITIAL_CONSULTANT_VISIBILITY = {
  isPublic: false,
  profileStatus: "pending"
};

function isVisibleConsultant(consultant) {
  if (!consultant) return false;
  if (consultant.isPublic === false) return false;
  const status = consultant.profileStatus || "approved";
  return VISIBLE_CONSULTANT_STATUSES.has(status);
}

function normalizeConsultantStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return CONSULTANT_PROFILE_STATUSES.has(status) ? status : null;
}

function createConsultantDraft({
  userId,
  name,
  email,
  plan,
  profileType,
  city,
  headline,
  avatarUrl
}) {
  const baseName = String(name || email || "consultant").trim();
  const slug = normalizeSlug(baseName);

  return {
    consultantId: `consultant-${randomUUID()}`,
    ownerUserId: userId,
    profileType: normalizeConsultantProfileType(profileType),
    slug: slug || `consultant-${Date.now()}`,
    name: baseName || "Нов профил",
    headline: String(headline || "").trim() || "Кариерен консултант",
    bio: "",
    experienceSummary: "",
    experienceHighlights: [],
    educationHighlights: [],
    city: String(city || "").trim(),
    languages: [],
    specializations: [],
    experienceYears: 0,
    priceBgn: 0,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 0,
    reviewCount: 0,
    nextAvailable: "",
    avatarUrl: String(avatarUrl || "").trim(),
    heroUrl: "",
    theme: "",
    tags: [],
    availability: [],
    idealFor: [],
    consultationTopics: [],
    workApproach: "",
    sessionLengthMinutes: 60,
    ...INITIAL_CONSULTANT_VISIBILITY,
    ...getConsultantPlanFields(plan || "free")
  };
}

async function listConsultants(event) {
  const query = String(event.queryStringParameters?.query || "")
    .trim()
    .toLowerCase();
  const city = String(event.queryStringParameters?.city || "")
    .trim()
    .toLowerCase();

  const result = await dynamo.send(
    new ScanCommand({
      TableName: env.consultantsTable
    })
  );

  const items = (result.Items || []).filter((item) => {
    if (!isVisibleConsultant(item)) {
      return false;
    }

    const matchesQuery =
      !query ||
      item.name?.toLowerCase().includes(query) ||
      item.headline?.toLowerCase().includes(query) ||
      item.experienceSummary?.toLowerCase().includes(query) ||
      (item.specializations || []).join(" ").toLowerCase().includes(query) ||
      (item.tags || []).join(" ").toLowerCase().includes(query) ||
      (item.experienceHighlights || []).join(" ").toLowerCase().includes(query) ||
      (item.educationHighlights || []).join(" ").toLowerCase().includes(query) ||
      (item.consultationTopics || []).join(" ").toLowerCase().includes(query) ||
      (item.idealFor || []).join(" ").toLowerCase().includes(query);
    const matchesCity = !city || item.city?.toLowerCase().includes(city);
    return matchesQuery && matchesCity;
  });

  const orderedItems = [...items].sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    if ((right.reviewCount || 0) !== (left.reviewCount || 0)) {
      return (right.reviewCount || 0) - (left.reviewCount || 0);
    }

    if ((right.rating || 0) !== (left.rating || 0)) {
      return (right.rating || 0) - (left.rating || 0);
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "bg");
  });

  const decoratedItems = await Promise.all(
    orderedItems.map((item) => decorateConsultantMedia(item))
  );

  return response(200, decoratedItems.map(stripSensitiveConsultantFields), {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
  });
}

async function getConsultant(event) {
  const slug = event.pathParameters?.slug;

  if (!slug) {
    return badRequest("Consultant slug is required.");
  }

  const consultant = await getConsultantBySlug(slug);

  if (!isVisibleConsultant(consultant)) {
    return notFound("Consultant profile not found.");
  }

  return response(
    200,
    stripSensitiveConsultantFields(await decorateConsultantMedia(consultant)),
    {
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600"
    }
  );
}

async function bootstrapUser(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const now = new Date().toISOString();

  const existing = await getUserBySub(claims.sub);
  const currentPlan = normalizePlanTier(existing?.plan, "free");
  const currentRole = normalizeUserRole(existing?.role, "client");
  const requestedRole = existing
    ? currentRole
    : normalizeUserRole(body.role, currentRole);
  const requestedConsultantProfileType =
    typeof body.consultantProfileType === "undefined"
      ? null
      : normalizeConsultantProfileType(body.consultantProfileType, "consultant");
  const nextUser = {
    userId: claims.sub,
    email: claims.email || normalizeText(body.email, "", 320),
    name: normalizeText(body.name || claims.name, existing?.name || "", 120),
    role: requestedRole,
    plan: currentPlan,
    avatarUrl: normalizeText(
      body.avatarUrl ?? claims.picture,
      existing?.avatarUrl ?? "",
      2000
    ),
    avatarStorageKey: existing?.avatarStorageKey || "",
    city: normalizeText(body.city, existing?.city ?? "", 120),
    occupation: normalizeText(body.occupation, existing?.occupation ?? "", 140),
    age: existing?.age ?? null,
    headline: normalizeText(body.headline, existing?.headline ?? "", 180),
    bio: existing?.bio || "",
    experienceSummary: existing?.experienceSummary || "",
    experienceHighlights: existing?.experienceHighlights || [],
    educationHighlights: existing?.educationHighlights || [],
    skills: existing?.skills || [],
    interests: existing?.interests || [],
    keywords: existing?.keywords || [],
    goals: existing?.goals || "",
    preferredSessionModes: existing?.preferredSessionModes || [],
    cvDocument: existing?.cvDocument || null,
    documents: Array.isArray(existing?.documents) ? existing.documents : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const planFields = getConsultantPlanFields(nextUser.plan);

  await dynamo.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: nextUser
    })
  );

  if (nextUser.role === "consultant") {
    const existingConsultant = await getConsultantByOwner(claims.sub);

    if (!existingConsultant) {
      await dynamo.send(
        new PutCommand({
          TableName: env.consultantsTable,
          Item: createConsultantDraft({
            userId: claims.sub,
            name: nextUser.name,
            email: claims.email || body.email || "",
            plan: nextUser.plan,
            profileType: requestedConsultantProfileType || "consultant",
            city: nextUser.city,
            headline: nextUser.headline,
            avatarUrl: nextUser.avatarUrl
          })
        })
      );
    } else {
      await dynamo.send(
        new PutCommand({
          TableName: env.consultantsTable,
          Item: {
            ...existingConsultant,
            profileType:
              requestedConsultantProfileType ||
              existingConsultant.profileType ||
              "consultant",
            avatarUrl:
              body.avatarUrl ??
              existingConsultant.avatarUrl ??
              nextUser.avatarUrl ??
              "",
            ...planFields
          }
        })
      );
    }
  }

  return response(200, await decorateUserMedia(nextUser));
}

async function getMeProfile(event) {
  const claims = requireAuth(event);
  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found. Call /auth/bootstrap first.");
  }

  return response(200, await decorateUserMedia(user));
}

async function updateMeProfile(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const current = await getUserBySub(claims.sub);

  if (!current) {
    return notFound("Profile not found.");
  }

  const nextUser = {
    ...current,
    name: normalizeText(body.name, current.name, 120),
    avatarUrl: normalizeText(body.avatarUrl, current.avatarUrl ?? "", 2000),
    avatarStorageKey: assertOwnedStorageKey(
      body.avatarStorageKey,
      current.avatarStorageKey,
      [`profiles/${claims.sub}/avatar/`],
      "avatar storage key"
    ),
    city: normalizeText(body.city, current.city, 120),
    occupation: normalizeText(body.occupation, current.occupation ?? "", 140),
    age:
      body.age === null
        ? null
        : normalizeBoundedNumber(body.age, current.age ?? null, {
            min: 13,
            max: 120,
            integer: true
          }),
    headline: normalizeText(body.headline, current.headline, 180),
    bio: normalizeText(body.bio, current.bio, 2400),
    experienceSummary: normalizeText(
      body.experienceSummary,
      current.experienceSummary ?? "",
      1200
    ),
    experienceHighlights: normalizeStringList(
      body.experienceHighlights,
      current.experienceHighlights ?? []
    ),
    educationHighlights: normalizeStringList(
      body.educationHighlights,
      current.educationHighlights ?? []
    ),
    skills: normalizeStringList(body.skills, current.skills ?? []),
    interests: normalizeStringList(body.interests, current.interests ?? []),
    keywords: normalizeStringList(body.keywords, current.keywords ?? []),
    goals: normalizeText(body.goals, current.goals ?? "", 1600),
    preferredSessionModes: normalizeStringList(
      body.preferredSessionModes,
      current.preferredSessionModes ?? []
    ),
    plan: normalizePlanTier(current.plan, "free"),
    cvDocument: normalizeCvDocument(body.cvDocument, current.cvDocument, claims.sub),
    documents: normalizeUserDocuments(body.documents, current.documents, claims.sub),
    updatedAt: new Date().toISOString()
  };

  await dynamo.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: nextUser
    })
  );

  try {
    const previousKeys = [
      current.cvDocument?.storageKey,
      ...(Array.isArray(current.documents) ? current.documents.map((d) => d.storageKey) : [])
    ].filter(Boolean);
    const nextKeys = [
      nextUser.cvDocument?.storageKey,
      ...(Array.isArray(nextUser.documents) ? nextUser.documents.map((d) => d.storageKey) : [])
    ].filter(Boolean);
    await deleteOrphanedStorageKeys(previousKeys, nextKeys);
  } catch (error) {
    console.error("[profile] orphan cleanup failed", error?.message || error);
  }

  return response(200, await decorateUserMedia(nextUser));
}

async function getMyConsultant(event) {
  const claims = requireAuth(event);
  const consultant = await getConsultantByOwner(claims.sub);

  if (!consultant) {
    return notFound("Consultant profile not found.");
  }

  return response(200, await decorateConsultantMedia(consultant));
}

async function updateMyConsultant(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);
  const user = await getUserBySub(claims.sub);

  if (!user || user.role !== "consultant") {
    return forbidden("Only consultant accounts can manage consultant profiles.");
  }

  const current = await getConsultantByOwner(claims.sub);
  const baseConsultant =
    current ||
    createConsultantDraft({
      userId: claims.sub,
      name: user.name,
      email: user.email,
      plan: user.plan,
      profileType: normalizeConsultantProfileType(body.profileType),
      city: user.city,
      headline: user.headline
    });

  const planFields = getConsultantPlanFields(user.plan);
  const preservedVisibility = {
    isPublic: baseConsultant.isPublic ?? INITIAL_CONSULTANT_VISIBILITY.isPublic,
    profileStatus:
      baseConsultant.profileStatus || INITIAL_CONSULTANT_VISIBILITY.profileStatus
  };
  const requestedTheme = normalizeConsultantTheme(body.theme, baseConsultant.theme || "");

  const normalizedSlug = body.slug ? normalizeSlug(body.slug, baseConsultant.slug) : null;

  if (normalizedSlug && current && normalizedSlug !== current.slug) {
    const existingSlug = await getConsultantBySlug(normalizedSlug);
    if (
      existingSlug &&
      (!current || existingSlug.consultantId !== current.consultantId)
    ) {
      return badRequest("This slug is already in use.");
    }
  }

  const { mapImageUrl, ...baseConsultantWithoutDeprecatedMedia } = baseConsultant;

  const nextConsultant = {
    ...baseConsultantWithoutDeprecatedMedia,
    profileType: normalizeConsultantProfileType(
      body.profileType,
      baseConsultant.profileType ?? "consultant"
    ),
    slug: normalizedSlug || baseConsultant.slug,
    name: normalizeText(body.name, baseConsultant.name, 120),
    headline: normalizeText(body.headline, baseConsultant.headline, 180),
    bio: normalizeText(body.bio, baseConsultant.bio, 2800),
    experienceSummary: normalizeText(
      body.experienceSummary,
      baseConsultant.experienceSummary ?? "",
      1400
    ),
    experienceHighlights: normalizeStringList(
      body.experienceHighlights,
      baseConsultant.experienceHighlights ?? []
    ),
    educationHighlights: normalizeStringList(
      body.educationHighlights,
      baseConsultant.educationHighlights ?? []
    ),
    city: normalizeText(body.city, baseConsultant.city, 120),
    experienceYears: normalizeBoundedNumber(
      body.experienceYears,
      baseConsultant.experienceYears ?? 0,
      { min: 0, max: 70, integer: true }
    ),
    priceBgn: normalizeBoundedNumber(body.priceBgn, baseConsultant.priceBgn ?? 0, {
      min: 0,
      max: 5000
    }),
    featured: baseConsultant.featured ?? false,
    rating: baseConsultant.rating ?? 0,
    reviewCount: baseConsultant.reviewCount ?? 0,
    theme: normalizePlanTier(user.plan, "free") === "pro" ? requestedTheme : "",
    avatarUrl: normalizeText(body.avatarUrl, baseConsultant.avatarUrl ?? "", 2000),
    heroUrl: normalizeText(body.heroUrl, baseConsultant.heroUrl ?? "", 2000),
    avatarStorageKey: assertOwnedStorageKey(
      body.avatarStorageKey,
      baseConsultant.avatarStorageKey,
      [`consultants/${claims.sub}/avatar/`],
      "consultant avatar storage key"
    ),
    heroStorageKey: assertOwnedStorageKey(
      body.heroStorageKey,
      baseConsultant.heroStorageKey,
      [`consultants/${claims.sub}/hero/`],
      "consultant banner storage key"
    ),
    languages: normalizeStringList(body.languages, baseConsultant.languages ?? []),
    specializations: normalizeStringList(
      body.specializations,
      baseConsultant.specializations ?? []
    ),
    sessionModes: normalizeStringList(
      body.sessionModes,
      baseConsultant.sessionModes ?? ["Онлайн"]
    ),
    tags: normalizeStringList(body.tags, baseConsultant.tags ?? []),
    idealFor: normalizeStringList(body.idealFor, baseConsultant.idealFor ?? []),
    consultationTopics: normalizeStringList(
      body.consultationTopics,
      baseConsultant.consultationTopics ?? []
    ),
    workApproach: normalizeText(
      body.workApproach,
      baseConsultant.workApproach ?? "",
      1800
    ),
    sessionLengthMinutes: normalizeBoundedNumber(
      body.sessionLengthMinutes,
      baseConsultant.sessionLengthMinutes ?? 60,
      { min: 15, max: 240, integer: true }
    ),
    availability: normalizeAvailabilitySlots(
      body.availability ?? baseConsultant.availability ?? [],
      []
    ),
    ...preservedVisibility,
    ...planFields
  };

  nextConsultant.nextAvailable = getNextAvailableSlot(
    nextConsultant.availability,
    baseConsultant.nextAvailable || ""
  );

  await dynamo.send(
    new PutCommand({
      TableName: env.consultantsTable,
      Item: nextConsultant
    })
  );

  return response(200, await decorateConsultantMedia(nextConsultant));
}

async function createUploadUrl(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);

  if (!body.fileName) {
    return badRequest("fileName is required.");
  }

  const kind = normalizeUploadKind(body.kind);

  if (!kind) {
    return badRequest("Invalid upload kind.");
  }

  const uploadValidationError = validateUploadRequest({
    kind,
    contentType: body.contentType,
    fileSize: body.fileSize
  });

  if (uploadValidationError) {
    return badRequest(uploadValidationError);
  }

  const safeFileName = sanitizeFileName(body.fileName);
  const storageKey =
    kind === "cv" || kind === "document"
      ? `profiles/${claims.sub}/documents/${Date.now()}-${safeFileName}`
      : kind === "user-avatar"
        ? `profiles/${claims.sub}/avatar/${Date.now()}-${safeFileName}`
      : `consultants/${claims.sub}/${kind}/${Date.now()}-${safeFileName}`;
  const command = new PutObjectCommand({
    Bucket: env.cvBucket,
    Key: storageKey,
    ContentType: body.contentType || "application/octet-stream"
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return response(200, {
    uploadUrl,
    storageKey,
    document: {
      fileName: body.fileName,
      storageKey,
      uploadedAt: new Date().toISOString()
    }
  });
}

async function createBooking(event) {
  const claims = requireAuth(event);
  const body = parseBody(event);

  if (!body.consultantId || !body.scheduledAt) {
    return badRequest("consultantId and scheduledAt are required.");
  }

  const scheduledDate = new Date(String(body.scheduledAt || ""));

  if (Number.isNaN(scheduledDate.getTime())) {
    return badRequest("scheduledAt must be a valid ISO date.");
  }

  if (scheduledDate.getTime() <= Date.now() + 5 * 60 * 1000) {
    return badRequest("The selected booking time must be in the future.");
  }

  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("User profile not found.");
  }

  if (user.role !== "client") {
    return forbidden("Only users can create consultation bookings.");
  }

  const consultantResult = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId: body.consultantId }
    })
  );
  const consultant = consultantResult.Item;

  if (!consultant) {
    return notFound("Consultant not found.");
  }

  if (!isVisibleConsultant(consultant)) {
    return badRequest("Consultant profile is not yet approved.");
  }

  if (consultant.ownerUserId === user.userId) {
    return badRequest("You cannot book your own consultant profile.");
  }

  const normalizedAvailability = normalizeAvailabilitySlots(consultant.availability || [], []);
  const normalizedScheduledAt = scheduledDate.toISOString();

  if (!normalizedAvailability.includes(normalizedScheduledAt)) {
    return badRequest("The selected slot is no longer available.");
  }

  const existingBookings = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "consultant-index",
      KeyConditionExpression: "consultantId = :consultantId",
      ExpressionAttributeValues: {
        ":consultantId": consultant.consultantId
      }
    })
  );

  const sessionLengthMinutes =
    Number(consultant.sessionLengthMinutes) > 0
      ? Number(consultant.sessionLengthMinutes)
      : 60;
  const sessionMs = sessionLengthMinutes * 60 * 1000;
  const newStart = scheduledDate.getTime();
  const newEnd = newStart + sessionMs;

  const hasConflictingBooking = (existingBookings.Items || []).some((item) => {
    if (item.status === "cancelled") return false;
    const existingStart = new Date(item.scheduledAt).getTime();
    if (Number.isNaN(existingStart)) return false;
    const existingEnd = existingStart + sessionMs;
    return newStart < existingEnd && existingStart < newEnd;
  });

  if (hasConflictingBooking) {
    return badRequest(
      "Този час се припокрива с друга активна резервация. Избери различен час."
    );
  }

  // Per-(client, consultant) rate limit: at most 5 active bookings against the
  // same consultant in any rolling 24h window. Defends against accidental
  // duplicate submits and intentional spam without locking out legit re-bookings.
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentBookings = (existingBookings.Items || []).filter((item) => {
    if (item.clientId !== user.userId) return false;
    if (item.status === "cancelled") return false;
    const createdAt = new Date(item.createdAt || 0).getTime();
    return createdAt >= last24h;
  });

  if (recentBookings.length >= 5) {
    return response(429, {
      message:
        "Достигна лимита от 5 активни резервации с този консултант за 24 часа. Опитай отново по-късно."
    });
  }

  const booking = {
    bookingId: `booking-${randomUUID()}`,
    consultantId: consultant.consultantId,
    consultantName: consultant.name,
    clientId: user.userId,
    clientName: user.name || "",
    clientEmail: user.email || "",
    scheduledAt: normalizedScheduledAt,
    status: "confirmed",
    note: String(body.note || "").trim().slice(0, 1200),
    createdAt: new Date().toISOString()
  };

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.consultantsTable,
              Key: { consultantId: consultant.consultantId },
              UpdateExpression:
                "SET bookedSlots = list_append(if_not_exists(bookedSlots, :emptySlots), :slotList)",
              ConditionExpression:
                "contains(availability, :scheduledAt) AND (attribute_not_exists(bookedSlots) OR NOT contains(bookedSlots, :scheduledAt))",
              ExpressionAttributeValues: {
                ":scheduledAt": normalizedScheduledAt,
                ":emptySlots": [],
                ":slotList": [normalizedScheduledAt]
              }
            }
          },
          {
            Put: {
              TableName: env.bookingsTable,
              Item: booking,
              ConditionExpression: "attribute_not_exists(bookingId)"
            }
          }
        ]
      })
    );
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      return badRequest("The selected slot already has an active booking request.");
    }

    throw error;
  }

  try {
    const consultantOwner = await getUserBySub(consultant.ownerUserId);
    await sendBookingCreatedEmails({
      consultantOwner,
      consultant,
      client: user,
      booking
    });
  } catch (error) {
    console.error("[booking] notification failure", error?.message || error);
  }

  return response(201, booking);
}

async function cancelBooking(event) {
  const claims = requireAuth(event);
  const bookingId = event.pathParameters?.bookingId;
  const body = parseBody(event);
  const requestedStatus = String(body.status || "").trim().toLowerCase();

  if (!bookingId) {
    return badRequest("bookingId is required.");
  }

  if (requestedStatus !== "cancelled") {
    return badRequest("Only cancellation is supported here.");
  }

  const bookingResult = await dynamo.send(
    new GetCommand({
      TableName: env.bookingsTable,
      Key: { bookingId }
    })
  );
  const booking = bookingResult.Item;

  if (!booking) {
    return notFound("Booking not found.");
  }

  const consultantResult = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId: booking.consultantId }
    })
  );
  const consultant = consultantResult.Item;
  const isOwnerConsultant = consultant?.ownerUserId === claims.sub;
  const isClient = booking.clientId === claims.sub;

  if (!isOwnerConsultant && !isClient) {
    return forbidden("Not allowed to cancel this booking.");
  }

  if (booking.status === "cancelled") {
    return response(200, booking);
  }

  const cancelledBy = isOwnerConsultant ? "consultant" : "client";
  const nextBookedSlots = Array.isArray(consultant?.bookedSlots)
    ? consultant.bookedSlots.filter((slot) => slot !== booking.scheduledAt)
    : [];

  const transactItems = [
    {
      Update: {
        TableName: env.bookingsTable,
        Key: { bookingId },
        UpdateExpression:
          "SET #s = :cancelled, cancelledAt = :now, cancelledBy = :actor",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":cancelled": "cancelled",
          ":now": new Date().toISOString(),
          ":actor": cancelledBy
        }
      }
    }
  ];

  if (consultant) {
    transactItems.push({
      Update: {
        TableName: env.consultantsTable,
        Key: { consultantId: booking.consultantId },
        UpdateExpression: "SET bookedSlots = :slots",
        ExpressionAttributeValues: { ":slots": nextBookedSlots }
      }
    });
  }

  await dynamo.send(new TransactWriteCommand({ TransactItems: transactItems }));

  const updated = {
    ...booking,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelledBy
  };

  try {
    if (cancelledBy === "consultant") {
      const client = await getUserBySub(booking.clientId);
      await sendBookingCancelledEmail({
        recipient: client || { email: booking.clientEmail, name: booking.clientName },
        consultantName: booking.consultantName || consultant?.name || "",
        scheduledAt: booking.scheduledAt,
        cancelledBy: "consultant"
      });
    } else if (consultant) {
      const consultantOwner = await getUserBySub(consultant.ownerUserId);
      await sendBookingCancelledEmail({
        recipient: consultantOwner,
        consultantName: booking.consultantName || consultant.name || "",
        scheduledAt: booking.scheduledAt,
        cancelledBy: "client"
      });
    }
  } catch (error) {
    console.error("[booking] cancellation email failure", error?.message || error);
  }

  return response(200, updated);
}

async function listBookings(event) {
  const claims = requireAuth(event);
  const user = await getUserBySub(claims.sub);

  if (!user) {
    return notFound("Profile not found.");
  }

  if (user.role === "consultant") {
    const consultant = await getConsultantByOwner(claims.sub);

    if (!consultant) {
      return response(200, []);
    }

    const result = await dynamo.send(
      new QueryCommand({
        TableName: env.bookingsTable,
        IndexName: "consultant-index",
        KeyConditionExpression: "consultantId = :consultantId",
        ExpressionAttributeValues: {
          ":consultantId": consultant.consultantId
        }
      })
    );

    return response(200, result.Items || []);
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: env.bookingsTable,
      IndexName: "client-index",
      KeyConditionExpression: "clientId = :clientId",
      ExpressionAttributeValues: {
        ":clientId": user.userId
      }
    })
  );

  return response(200, result.Items || []);
}

async function listConsultantsForAdmin(event) {
  requireAdmin(event);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: env.consultantsTable
    })
  );

  const consultants = result.Items || [];
  const ownerIds = Array.from(
    new Set(consultants.map((item) => item.ownerUserId).filter(Boolean))
  );

  const owners = new Map();
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const ownerRecord = await getUserBySub(ownerId);
      if (ownerRecord) {
        owners.set(ownerId, {
          email: ownerRecord.email || "",
          name: ownerRecord.name || ""
        });
      }
    })
  );

  const items = await Promise.all(
    consultants.map(async (item) => {
      const owner = owners.get(item.ownerUserId);
      const avatarUrl = item.avatarStorageKey
        ? await getSignedObjectUrl(item.avatarStorageKey)
        : item.avatarUrl || "";
      return {
        consultantId: item.consultantId,
        ownerUserId: item.ownerUserId,
        ownerEmail: owner?.email || "",
        ownerName: owner?.name || "",
        slug: item.slug,
        name: item.name,
        headline: item.headline || "",
        bio: item.bio || "",
        city: item.city || "",
        profileType: item.profileType,
        profileStatus: item.profileStatus || "approved",
        isPublic: item.isPublic !== false,
        membershipTier: item.membershipTier || "standard",
        avatarUrl,
        experienceYears: item.experienceYears || 0,
        languages: Array.isArray(item.languages) ? item.languages : [],
        sessionModes: Array.isArray(item.sessionModes) ? item.sessionModes : [],
        specializations: Array.isArray(item.specializations) ? item.specializations : [],
        consultationTopics: Array.isArray(item.consultationTopics)
          ? item.consultationTopics
          : [],
        availabilityCount: Array.isArray(item.availability) ? item.availability.length : 0,
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || "",
        statusUpdatedAt: item.statusUpdatedAt || "",
        statusUpdatedBy: item.statusUpdatedBy || "",
        statusUpdatedByEmail: item.statusUpdatedByEmail || "",
        statusSelfApproved: Boolean(item.statusSelfApproved)
      };
    })
  );

  items.sort((left, right) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    const leftRank = order[left.profileStatus] ?? 3;
    const rightRank = order[right.profileStatus] ?? 3;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(left.name || "").localeCompare(String(right.name || ""), "bg");
  });

  return response(200, items, { "Cache-Control": "no-store" });
}

async function getConsultantForAdmin(event) {
  requireAdmin(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  const result = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId }
    })
  );

  if (!result.Item) {
    return notFound("Consultant not found.");
  }

  const consultant = result.Item;
  const decorated = await decorateConsultantMedia(consultant);

  // Owner info + audit metadata — surface what the list endpoint shows so
  // the preview page has the same admin context as the card.
  const owner = consultant.ownerUserId
    ? await getUserBySub(consultant.ownerUserId)
    : null;

  return response(200, {
    ...decorated,
    ownerEmail: owner?.email || "",
    ownerName: owner?.name || "",
    profileStatus: consultant.profileStatus || "approved",
    isPublic: consultant.isPublic !== false,
    createdAt: consultant.createdAt || "",
    updatedAt: consultant.updatedAt || "",
    statusUpdatedAt: consultant.statusUpdatedAt || "",
    statusUpdatedBy: consultant.statusUpdatedBy || "",
    statusUpdatedByEmail: consultant.statusUpdatedByEmail || "",
    statusSelfApproved: Boolean(consultant.statusSelfApproved)
  }, { "Cache-Control": "no-store" });
}

async function setConsultantStatus(event) {
  const claims = requireAdmin(event);
  const body = parseBody(event);
  const consultantId = event.pathParameters?.consultantId;

  if (!consultantId) {
    return badRequest("consultantId is required.");
  }

  const status = normalizeConsultantStatus(body.status);

  if (!status) {
    return badRequest("status must be one of: pending, approved, rejected.");
  }

  const existing = await dynamo.send(
    new GetCommand({
      TableName: env.consultantsTable,
      Key: { consultantId }
    })
  );

  if (!existing.Item) {
    return notFound("Consultant not found.");
  }

  // Self-approval is allowed — single-admin teams need an escape hatch. We
  // record it as `selfApproved: true` so the audit trail makes the decision
  // visible to anyone reviewing later.
  const isSelfApproval = existing.Item.ownerUserId === claims.sub;
  const now = new Date().toISOString();
  const updated = {
    ...existing.Item,
    profileStatus: status,
    isPublic: status === "approved",
    statusUpdatedAt: now,
    statusUpdatedBy: claims.sub,
    statusUpdatedByEmail: claims.email || "",
    statusSelfApproved: isSelfApproval,
    updatedAt: now
  };

  await dynamo.send(
    new PutCommand({
      TableName: env.consultantsTable,
      Item: updated
    })
  );

  return response(200, {
    consultantId: updated.consultantId,
    profileStatus: updated.profileStatus,
    isPublic: updated.isPublic,
    statusUpdatedAt: updated.statusUpdatedAt,
    statusUpdatedBy: updated.statusUpdatedBy,
    statusUpdatedByEmail: updated.statusUpdatedByEmail,
    statusSelfApproved: updated.statusSelfApproved
  });
}

function health() {
  return response(200, { ok: true, service: "careerlane-api" }, {
    "Cache-Control": "no-store"
  });
}

exports.handler = async (event) => {
  try {
    if (
      event?.source === "aws.events" ||
      event?.["detail-type"] === "Scheduled Event"
    ) {
      return sendDueReminders();
    }

    if (event.requestContext?.http?.method === "OPTIONS") {
      return response(204, {});
    }

    const method = event.requestContext?.http?.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/health") return health();
    if (method === "GET" && path === "/consultants") return listConsultants(event);
    if (method === "GET" && path === "/consultants/me") return getMyConsultant(event);
    if (method === "PUT" && path === "/consultants/me") return updateMyConsultant(event);
    if (method === "GET" && /^\/consultants\/[^/]+$/.test(path)) return getConsultant(event);
    if (method === "POST" && path === "/auth/bootstrap") return bootstrapUser(event);
    if (method === "GET" && path === "/me/profile") return getMeProfile(event);
    if (method === "PUT" && path === "/me/profile") return updateMeProfile(event);
    if (method === "POST" && path === "/me/cv/upload-url") return createUploadUrl(event);
    if (method === "GET" && path === "/bookings") return listBookings(event);
    if (method === "POST" && path === "/bookings") return createBooking(event);

    const bookingStatusMatch = /^\/bookings\/([^/]+)\/status$/.exec(path);
    if (method === "PATCH" && bookingStatusMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), bookingId: bookingStatusMatch[1] };
      return cancelBooking(event);
    }

    if (method === "GET" && path === "/admin/consultants") return listConsultantsForAdmin(event);

    const adminStatusMatch = /^\/admin\/consultants\/([^/]+)\/status$/.exec(path);
    if (method === "PUT" && adminStatusMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminStatusMatch[1] };
      return setConsultantStatus(event);
    }

    const adminGetMatch = /^\/admin\/consultants\/([^/]+)$/.exec(path);
    if (method === "GET" && adminGetMatch) {
      event.pathParameters = { ...(event.pathParameters || {}), consultantId: adminGetMatch[1] };
      return getConsultantForAdmin(event);
    }

    return notFound("Route not found.");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error(error);
    }
    return response(statusCode, {
      message:
        statusCode >= 500
          ? "Unexpected server error."
          : error.message || "Unexpected server error."
    });
  }
};
