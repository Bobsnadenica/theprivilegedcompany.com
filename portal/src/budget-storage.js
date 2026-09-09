import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Immutable scope: pending requests remain bound to the account that started them.
export function budgetStorageAdapter(client, bucket, key) {
  return {
    async read() {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: 'no-store' }));
        if (!out.ETag) throw new Error('Cannot verify the saved data version. Please refresh before saving.');
        return { ledger: JSON.parse(await out.Body.transformToString()), etag: out.ETag };
      } catch (error) {
        if (error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async write(ledger, etag) {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key,
        Body: new TextEncoder().encode(JSON.stringify(ledger)),
        ContentType: 'application/json', CacheControl: 'no-store',
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }));
    },
  };
}
