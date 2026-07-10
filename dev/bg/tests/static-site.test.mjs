import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("изгражда самостоятелен статичен сайт", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<html lang="bg">/i);
  assert.match(html, /<title>България в Данни · БвД — отворен публичен атлас<\/title>/i);
  assert.match(html, /\/dev\/bg\/assets\/[^"']+\.js/);
  assert.match(html, /\/dev\/bg\/assets\/[^"']+\.css/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.doesNotMatch(html, /vinext|cloudflare|chatgpt\.site|codex-preview/i);
  assert.doesNotMatch(html, /testdata\.egov\.bg/i);
  await access(new URL("../dist/data/dashboard.json", import.meta.url));
  await access(new URL("../dist/data/catalog-datasets.json", import.meta.url));
  await access(new URL("../dist/data/validation.json", import.meta.url));
  await access(new URL("../dist/data/manifest.json", import.meta.url));
  await access(new URL("../dist/data/road-visuals.json", import.meta.url));
});

test("публикуваният /dev/bg/ вход сочи към налични локални файлове", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const localReferences = [...html.matchAll(/(?:src|href)="\/dev\/bg\/([^"?#]+)[^"\s]*"/g)]
    .map((match) => match[1]);

  assert.ok(localReferences.some((path) => path.endsWith(".js")));
  assert.ok(localReferences.some((path) => path.endsWith(".css")));
  await Promise.all(localReferences.map((path) => access(new URL(`../${path}`, import.meta.url))));

  for (const dataFile of [
    "dashboard.json",
    "catalog-datasets.json",
    "validation.json",
    "manifest.json",
    "road-visuals.json",
  ]) {
    await access(new URL(`../data/${dataFile}`, import.meta.url));
  }

  const scriptPath = localReferences.find((path) => path.endsWith(".js"));
  const script = await readFile(new URL(`../${scriptPath}`, import.meta.url), "utf8");
  assert.match(script, /\/dev\/bg\//);
  assert.match(script, /data\/catalog-datasets\.json/);
  assert.match(script, /data\/road-visuals\.json/);
  assert.match(script, /Период за/);
  assert.match(script, /type:[`"']date[`"']/);
  assert.doesNotMatch(script, /testdata\.egov\.bg/i);
});
