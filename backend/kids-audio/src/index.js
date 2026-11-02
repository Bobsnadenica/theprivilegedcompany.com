'use strict';

const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const bucket = process.env.BUCKET_NAME;
const prefix = process.env.PREFIX || 'prikazki/';
const manifestKey = process.env.MANIFEST_KEY || `${prefix}manifest.json`;
const archiveKey = `${prefix}Archive.zip`;
const presignedSeconds = Number(process.env.PRESIGNED_SECONDS || 43200);
const s3 = new S3Client({});

const audioTypes = new Map([
  ['.aac', 'audio/aac'], ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'],
  ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg'],
  ['.oga', 'audio/ogg'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'],
  ['.wav', 'audio/wav'], ['.weba', 'audio/webm'],
]);

function audioTypeFor(key) {
  const dot = key.lastIndexOf('.');
  return audioTypes.get(dot < 0 ? '' : key.slice(dot).toLowerCase());
}

async function buildManifest(client = s3, now = new Date()) {
  const files = [];
  let archive = null;
  let continuationToken;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const object of page.Contents || []) {
      const key = object.Key;
      if (key && key.toLowerCase() === archiveKey.toLowerCase() && object.Size > 0) {
        archive = { key, name: key.slice(prefix.length), size: object.Size };
        continue;
      }
      if (!key || key === manifestKey || !audioTypeFor(key) || !object.Size) continue;
      files.push({
        key,
        name: key.slice(prefix.length),
        size: object.Size,
        lastModified: object.LastModified?.toISOString() || null,
        contentType: audioTypeFor(key),
      });
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  files.sort((left, right) => left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  }));

  const manifest = { version: 1, generatedAt: now.toISOString(), files, archive };
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: manifestKey,
    Body: JSON.stringify(manifest),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store',
  }));
  return manifest;
}

async function readManifest(client = s3) {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
    return JSON.parse(await result.Body.transformToString());
  } catch (error) {
    if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) throw error;
    return buildManifest(client);
  }
}

function jsonResponse(statusCode, payload, cacheControl = 'no-store') {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify(payload),
  };
}

function requestPath(event) {
  return event.rawPath || event.requestContext?.http?.path || '/';
}

function createHandler({ client = s3, signUrl = getSignedUrl } = {}) {
  return async function handler(event) {
    if (event.Event === 's3:TestEvent') return { accepted: true };

    if (Array.isArray(event.Records)) {
      const changedKeys = event.Records
        .filter(record => record.eventSource === 'aws:s3')
        .map(record => decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')));
      const shouldRebuild = changedKeys.some(key => key.startsWith(prefix)
        && (audioTypeFor(key) || key.toLowerCase() === archiveKey.toLowerCase()));
      if (shouldRebuild) {
        await buildManifest(client);
      }
      return { rebuilt: shouldRebuild };
    }

    const method = event.requestContext?.http?.method || 'GET';
    if (method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed' });

    const path = requestPath(event).replace(/\/$/, '') || '/';
    if (path.endsWith('/manifest')) {
      const manifest = await readManifest(client);
      return jsonResponse(200, manifest, 'public, max-age=15');
    }

    if (path.endsWith('/play')) {
      const key = event.queryStringParameters?.key;
      if (!key || !key.startsWith(prefix)) return jsonResponse(400, { error: 'invalid_audio_key' });

      const manifest = await readManifest(client);
      const file = manifest.files.find(entry => entry.key === key);
      if (!file) return jsonResponse(404, { error: 'audio_not_found' });

      const url = await signUrl(client, new GetObjectCommand({
        Bucket: bucket,
        Key: file.key,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: 'inline',
      }), { expiresIn: presignedSeconds });

      return {
        statusCode: 302,
        headers: { Location: url, 'cache-control': 'no-store' },
        body: '',
      };
    }

    if (path.endsWith('/download-all')) {
      const manifest = await readManifest(client);
      if (!manifest.archive?.key || manifest.archive.key.toLowerCase() !== archiveKey.toLowerCase()) {
        return jsonResponse(404, { error: 'archive_not_found' });
      }

      const url = await signUrl(client, new GetObjectCommand({
        Bucket: bucket,
        Key: manifest.archive.key,
        ResponseContentType: 'application/zip',
        ResponseContentDisposition: 'attachment; filename="Archive.zip"',
      }), { expiresIn: presignedSeconds });

      return {
        statusCode: 302,
        headers: { Location: url, 'cache-control': 'no-store' },
        body: '',
      };
    }

    return jsonResponse(404, { error: 'not_found' });
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports.buildManifest = buildManifest;
exports.audioTypeFor = audioTypeFor;
