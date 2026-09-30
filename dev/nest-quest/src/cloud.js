import { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSession, idToken, signIn, signOut, completeNewPassword } from '../../../portal/src/cognito.js';
import { createCloudRepository } from './repository.js';
export { signIn, signOut, completeNewPassword, getSession };

export async function connectAccount(auth) {
  const cfg = window.__PORTAL_CONFIG__;
  if (!cfg?.userPoolId || !cfg.identityPoolId || !cfg.bucket) throw new Error('cloudUnavailable');
  const owner = auth.session.getIdToken().payload;
  if (typeof owner.email !== 'string' || !owner.sub || /[\/\\]/.test(owner.email)) throw new Error('cloudUnavailable');
  const loginKey = `cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`;
  const identity = new CognitoIdentityClient({ region: cfg.region });
  const { IdentityId } = await identity.send(new GetIdCommand({ IdentityPoolId: cfg.identityPoolId, Logins: { [loginKey]: idToken(auth.session) } }));
  let active = true;
  const client = new S3Client({ region: cfg.region, credentials: async () => {
    const current = await getSession();
    if (!active || !current || current.session.getIdToken().payload.sub !== owner.sub) throw new Error('sessionEnded');
    const { Credentials: c } = await identity.send(new GetCredentialsForIdentityCommand({ IdentityId, Logins: { [loginKey]: idToken(current.session) } }));
    return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretKey, sessionToken: c.SessionToken, expiration: c.Expiration };
  } });
  // Bound once to a token-derived owner. No file listing and no portal-budget reads.
  const scope = { Bucket: cfg.bucket, Key: `users/${owner.email}/.nestquest/save-v1.json` };
  const adapter = {
    async read() {
      const response = await client.send(new GetObjectCommand({ ...scope, ResponseCacheControl: 'no-store' })).catch(error => {
        if (error.name === 'NoSuchKey') return null;
        throw error;
      });
      if (!response) return null;
      if (response.ContentLength > 2000000) throw new Error('invalidSave');
      const body = await response.Body.transformToString();
      if (body.length > 2000000) throw new Error('invalidSave');
      return { ledger: JSON.parse(body), etag: response.ETag };
    },
    async write(state, etag) {
      if (!active) throw new Error('sessionEnded');
      const response = await client.send(new PutObjectCommand({ ...scope, Body: new TextEncoder().encode(JSON.stringify(state)),
        ContentType: 'application/json', CacheControl: 'no-store', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }));
      return response.ETag;
    },
    async remove() { if (!active) throw new Error('sessionEnded'); await client.send(new DeleteObjectCommand(scope)); },
  };
  return { email: owner.email, userId: owner.sub, repository: createCloudRepository(adapter), close() { active = false; client.destroy(); } };
}
