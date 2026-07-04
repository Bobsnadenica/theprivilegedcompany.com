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
  // the ID token's lifetime); after that the user signs in again.
  const credentials = async () => {
    const { Credentials } = await identityClient.send(
      new GetCredentialsForIdentityCommand({ IdentityId, Logins: logins })
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
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix() })
  );
  return (out.Contents || [])
    .filter((o) => o.Key !== prefix()) // drop the folder placeholder, if any
    .map((o) => ({
      key: o.Key,
      name: o.Key.slice(prefix().length),
      size: o.Size,
      lastModified: o.LastModified,
    }))
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
}

export async function uploadFile(file) {
  const key = `${prefix()}${file.name}`;
  // Read the file into a byte array. Passing a File/Blob directly makes the
  // SDK's checksum middleware call body.getReader() (browser Blobs have no
  // getReader), which throws before the request is sent. A Uint8Array is
  // hashed directly, no streaming.
  const body = new Uint8Array(await file.arrayBuffer());
  await s3.send(
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
