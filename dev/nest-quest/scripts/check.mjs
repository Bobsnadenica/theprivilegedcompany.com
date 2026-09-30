import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const name of ['index.html', 'play.html', 'privacy.html']) {
  const source = await readFile(new URL(name, root), 'utf8');
  assert.equal((source.match(/<h1\b/g) || []).length, 1, `${name}: one heading`);
  assert.match(source, /Content-Security-Policy/); assert.match(source, /viewport/);
  assert.doesNotMatch(source, /https:\/\/.*(?:unpkg|cdn\.jsdelivr|fonts\.googleapis)/);
  for (const match of source.matchAll(/(?:src|href)="(\/dev\/nest-quest\/[^"?#]+)"/g)) {
    const file = match[1].slice('/dev/nest-quest/'.length);
    const info = await stat(new URL(file, root)); assert.ok(info.isFile(), file);
  }
}
for (const name of ['ember-young.webp', 'ember-adventurer.webp', 'ember-guardian.webp', 'willowmere.webp', 'leaf.svg']) assert.ok((await stat(new URL(`art/${name}`, root))).size > 100);
const hub = await readFile(new URL('../index.html', root), 'utf8'); assert.match(hub, /nest-quest\/index\.html/);
const cloud = await readFile(new URL('src/cloud.js', root), 'utf8');
assert.match(cloud, /\.nestquest\/save-v1\.json/); assert.match(cloud, /IfMatch/); assert.match(cloud, /IfNoneMatch/);
assert.doesNotMatch(cloud, /ListObjects|\.budget\/ledger/);
console.log('Deployable pages, local assets, hub link, and isolated conditional cloud storage checks passed.');
