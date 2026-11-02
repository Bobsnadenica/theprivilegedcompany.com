'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BUCKET_NAME = 'theprivilegedcompany-bucket';
process.env.PREFIX = 'prikazki/';
process.env.MANIFEST_KEY = 'prikazki/manifest.json';

const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { audioTypeFor, buildManifest, createHandler } = require('../index');

test('recognizes common audio types case-insensitively', () => {
  assert.equal(audioTypeFor('prikazki/Story.MP3'), 'audio/mpeg');
  assert.equal(audioTypeFor('prikazki/story.m4a'), 'audio/mp4');
  assert.equal(audioTypeFor('prikazki/readme.txt'), undefined);
});

test('builds a naturally sorted manifest from all S3 pages and excludes the manifest itself', async () => {
  const calls = [];
  const client = {
    async send(command) {
      calls.push(command);
      if (command instanceof ListObjectsV2Command) {
        if (!command.input.ContinuationToken) return {
          Contents: [
            { Key: 'prikazki/Story 10.mp3', Size: 10 },
            { Key: 'prikazki/manifest.json', Size: 50 },
            { Key: 'prikazki/readme.txt', Size: 20 },
          ],
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        };
        return { Contents: [{ Key: 'prikazki/Story 2.mp3', Size: 12 }], IsTruncated: false };
      }
      if (command instanceof PutObjectCommand) return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };

  const manifest = await buildManifest(client, new Date('2026-11-02T12:00:00Z'));
  assert.deepEqual(manifest.files.map(file => file.name), ['Story 2.mp3', 'Story 10.mp3']);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatedAt, '2026-11-02T12:00:00.000Z');
  assert.equal(calls.filter(call => call instanceof ListObjectsV2Command).length, 2);
  const put = calls.find(call => call instanceof PutObjectCommand);
  assert.equal(put.input.Key, 'prikazki/manifest.json');
  assert.equal(put.input.ContentType, 'application/json; charset=utf-8');
});

test('serves the saved manifest without reading audio bytes', async () => {
  let requested;
  const client = {
    async send(command) {
      requested = command;
      return { Body: { transformToString: async () => '{"version":1,"files":[]}' } };
    },
  };
  const handler = createHandler({ client });
  const response = await handler({ rawPath: '/manifest', requestContext: { http: { method: 'GET' } } });
  assert.ok(requested instanceof GetObjectCommand);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { version: 1, files: [] });
});

test('playback redirects only to a short-lived URL for a manifest-listed file', async () => {
  const manifest = JSON.stringify({ files: [{
    key: 'prikazki/story.mp3', name: 'story.mp3', contentType: 'audio/mpeg',
  }] });
  let signed;
  const client = { async send(command) {
    assert.ok(command instanceof GetObjectCommand);
    return { Body: { transformToString: async () => manifest } };
  } };
  const handler = createHandler({
    client,
    signUrl: async (_client, command, options) => {
      signed = { command, options };
      return 'https://example.test/private-audio?signature=temporary';
    },
  });

  const denied = await handler({
    rawPath: '/play', requestContext: { http: { method: 'GET' } },
    queryStringParameters: { key: 'prikazki/other.mp3' },
  });
  assert.equal(denied.statusCode, 404);
  assert.equal(signed, undefined);

  const allowed = await handler({
    rawPath: '/play', requestContext: { http: { method: 'GET' } },
    queryStringParameters: { key: 'prikazki/story.mp3' },
  });
  assert.equal(allowed.statusCode, 302);
  assert.equal(allowed.headers.Location, 'https://example.test/private-audio?signature=temporary');
  assert.equal(signed.options.expiresIn, 43200);
  assert.equal(signed.command.input.Key, 'prikazki/story.mp3');
});

test('S3 events rebuild for audio keys and ignore the generated JSON manifest', async () => {
  let listed = 0;
  const client = { async send(command) {
    if (command instanceof ListObjectsV2Command) { listed += 1; return { Contents: [] }; }
    if (command instanceof PutObjectCommand) return {};
    throw new Error(`Unexpected command ${command.constructor.name}`);
  } };
  const handler = createHandler({ client });
  const event = key => ({
    Records: [{ eventSource: 'aws:s3', s3: { object: { key: encodeURIComponent(key) } } }],
  });

  await handler(event('prikazki/story.mp3'));
  await handler(event('prikazki/manifest.json'));
  assert.equal(listed, 1);
  assert.deepEqual(await handler({ Event: 's3:TestEvent' }), { accepted: true });
});
