import {PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {validateVisitPhoto} from './visit-photo.js';

// Capture the client and account prefix once; no operation reads mutable login state.
export function visitPhotoStorageAdapter(client,bucket,accountPrefix) {
  const key = photo => `${accountPrefix}.bulgaria/photos/${validateVisitPhoto(photo).id}.jpg`;
  return {
    async upload(photo,blob) {
      if (blob.size !== photo.bytes || blob.type !== photo.type) throw new Error('The selected photo changed. Choose it again.');
      const Key = key(photo);
      try {
        await client.send(new PutObjectCommand({Bucket:bucket,Key,Body:new Uint8Array(await blob.arrayBuffer()),ContentType:photo.type,CacheControl:'no-store',IfNoneMatch:'*',Metadata:{sha256:photo.sha256}}));
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 412) throw error;
        // A retry may follow a lost successful response. Never overwrite a different photo.
        const saved = await client.send(new HeadObjectCommand({Bucket:bucket,Key}));
        if (saved.ContentLength !== photo.bytes || saved.ContentType !== photo.type || saved.Metadata?.sha256 !== photo.sha256) throw new Error('That photo could not be confirmed. Choose it again.');
      }
    },
    async read(photo) {
      const out = await client.send(new GetObjectCommand({Bucket:bucket,Key:key(photo),ResponseCacheControl:'no-store'}));
      if (out.ContentType !== photo.type || out.ContentLength !== photo.bytes) throw new Error('This saved photo could not be loaded.');
      return new Blob([await out.Body.transformToByteArray()],{type:photo.type});
    },
    async remove(photo) { await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key(photo)})); },
  };
}
