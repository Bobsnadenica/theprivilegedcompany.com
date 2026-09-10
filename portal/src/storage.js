import { visitPhotoStorageAdapter } from './visit-photo-storage.js';
import { budgetStorageAdapter } from './budget-storage.js';
import { getSession, idToken } from './cognito.js';
// Turns a Cognito login token into temporary AWS credentials and uses them to
// list / upload / download / delete objects under the caller's own S3 prefix.
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const cfg = window.__PORTAL_CONFIG__;

let s3 = null;
let userEmail = null;

// Exchange the ID token for an identity id + temporary AWS credentials.
// We call the Cognito Identity API directly (instead of the umbrella
// @aws-sdk/credential-providers, which drags Node-only SSO/login providers
// into the browser bundle).
export async function initStorage(idTokenJwt) {
  const loginKey = `cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`;
  const logins = { [loginKey]: idTokenJwt };

  // The folder is keyed by the email claim and must match the IAM principal tag
  // exactly, so take it straight from the token (never from typed input).
  userEmail = emailFromJwt(idTokenJwt);

  const identityClient = new CognitoIdentityClient({ region: cfg.region });

  // GetId gives us the identity id needed to fetch temporary credentials.
  const { IdentityId } = await identityClient.send(
    new GetIdCommand({ IdentityPoolId: cfg.identityPoolId, Logins: logins })
  );

  // Credential provider: the SDK re-invokes this when the creds expire (within
  // the session lifetime); getSession refreshes the ID token when needed.
  const ownerEmail = userEmail;
  const credentials = async () => {
    const current = await getSession();
    if (!current || emailFromJwt(idToken(current.session)) !== ownerEmail) throw new Error('Your session has ended. Please sign in again.');
    const currentLogins = { [loginKey]: idToken(current.session) };
    const { Credentials } = await identityClient.send(
      new GetCredentialsForIdentityCommand({ IdentityId, Logins: currentLogins })
    );
    return {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretKey,
      sessionToken: Credentials.SessionToken,
      expiration: Credentials.Expiration,
    };
  };

  s3 = new S3Client({ region: cfg.region, credentials });

  return userEmail;
}

// Decode the email claim from the ID token (base64url JWT payload).
function emailFromJwt(jwt) {
  let b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(b64)).email;
}

function prefix() {
  return `users/${userEmail}/`;
}

export async function listFiles() {
  const client = s3;
  const userPrefix = prefix();
  const objects = [];
  let token;
  do {
    const out = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: userPrefix, ContinuationToken: token }));
    objects.push(...(out.Contents || []));
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return objects.filter(o => o.Key !== userPrefix && !o.Key.startsWith(`${userPrefix}.budget/`) && !o.Key.startsWith(`${userPrefix}.timeto/`) && !o.Key.startsWith(`${userPrefix}.bulgaria/`) && !o.Key.startsWith(`${userPrefix}.life/`))
    .map(o => ({ key: o.Key, name: o.Key.slice(userPrefix.length), size: o.Size, lastModified: o.LastModified }))
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

export async function uploadFile(file) {
  if (file.name.includes('/') || file.name.includes('\\')) throw new Error('File names cannot contain path separators.');
  const client = s3;
  const key = `${prefix()}${file.name}`;
  // Read the file into a byte array. Passing a File/Blob directly makes the
  // SDK's checksum middleware call body.getReader() (browser Blobs have no
  // getReader), which throws before the request is sent. A Uint8Array is
  // hashed directly, no streaming.
  const body = new Uint8Array(await file.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: file.type || 'application/octet-stream',
    })
  );
  return key;
}

// Private bucket → hand back a short-lived signed URL for download.
export async function downloadUrl(key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: 300 }
  );
}

export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

// --- Contact-form inbox (admin only) ---------------------------------------
// The public contact form drops briefs into inbox/new/*. Only the admin's
// credentials can list/read them (enforced by IAM, gated on the email principal
// tag); for anyone else these calls throw AccessDenied and the UI stays hidden.
const INBOX_NEW = 'inbox/new/';
const INBOX_DONE = 'inbox/done/';

export async function listInbox() {
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: INBOX_NEW })
  );
  return (out.Contents || [])
    .filter((o) => o.Key !== INBOX_NEW && o.Key.endsWith('.json'))
    .map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified }))
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

export async function readInbox(key) {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key })
  );
  return JSON.parse(await out.Body.transformToString());
}

// "Mark done": copy the brief to inbox/done/ (kept for your records) and remove
// it from inbox/new/ so it drops out of the notifications list.
export async function archiveInbox(key) {
  const dest = INBOX_DONE + key.slice(INBOX_NEW.length);
  await s3.send(
    new CopyObjectCommand({
      Bucket: cfg.bucket,
      CopySource: `${cfg.bucket}/${key}`,
      Key: dest,
    })
  );
  await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

// --- Budget ledger: same IAM-protected user space, hidden from file browsing.
const BUDGET_PATH = '.budget/ledger-v1.json';
export function resetStorage() { s3 = null; userEmail = null; }
function budgetScope() {
  if (!s3 || !userEmail) throw new Error('Please sign in again to access your budget.');
  return { client: s3, key: `${prefix()}${BUDGET_PATH}` };
}
// Capture the signed-in client and key once. A pending save can never switch users.
export function createBudgetStorage() {
  const { client, key } = budgetScope();
  return budgetStorageAdapter(client, cfg.bucket, key);
}

export function createTimeToStorage() {
  if (!s3 || !userEmail) throw new Error('Please sign in again.');
  return budgetStorageAdapter(s3, cfg.bucket, `${prefix()}.timeto/ledger-v1.json`);
}

export function createBulgariaStorage() {
  if (!s3 || !userEmail) throw new Error('Please sign in again.');
  return budgetStorageAdapter(s3, cfg.bucket, `${prefix()}.bulgaria/ledger-v1.json`);
}

export function createLifeStorage() {
  if (!s3 || !userEmail) throw new Error('Please sign in again.');
  return budgetStorageAdapter(s3, cfg.bucket, `${prefix()}.life/ledger-v1.json`);
}

export function createVisitPhotoStorage() {
  if (!s3 || !userEmail) throw new Error('Please sign in again.');
  return visitPhotoStorageAdapter(s3,cfg.bucket,prefix());
}
