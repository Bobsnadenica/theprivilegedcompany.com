import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("snapshot-ът е пълен и е преминал проверките", async () => {
  const [summary, categories, datasets, organisations, resources, road, report] = await Promise.all([
    readJson("../data/catalog/portal-summary.json"),
    readJson("../data/catalog/categories.json"),
    readJson("../data/catalog/datasets.json"),
    readJson("../data/catalog/organisations.json"),
    readJson("../data/catalog/resources.json"),
    readJson("../data/visuals/road.json"),
    readJson("../data/validation/report.json"),
  ]);

  assert.equal(summary.complete, true);
  assert.equal(summary.source, "https://data.egov.bg");
  assert.equal(summary.datasets, datasets.datasets.length);
  assert.equal(summary.organisations, organisations.organisations.length);
  assert.equal(summary.resources, resources.resources.length);
  assert.equal(categories.categories.length, 14);
  assert.equal(categories.categories.reduce((sum, item) => sum + item.dataset_count, 0), summary.datasets);
  assert.equal(report.status, "валиден");
  assert.equal(report.totals.errors, 0);
  assert.equal(road.summary.mapped_rows, road.events.length);
  assert.ok(road.summary.mapped_rows > 80_000);
  assert.equal(road.boundary.license, "Public domain");
  assert.ok(road.events.every((event) => event.length === 9));
  assert.ok(datasets.datasets.every((dataset) => dataset.portal_url.startsWith("https://data.egov.bg/data/view/")));
  assert.ok(resources.resources.every((resource) => resource.portal_url.startsWith("https://data.egov.bg/data/resourceView/")));
});

test("данните за интерфейса са на български и съгласувани", async () => {
  const [dashboard, catalogIndex, chartMap] = await Promise.all([
    readJson("../data/site/dashboard.json"),
    readJson("../data/site/catalog-index.json"),
    readJson("../data/site/chart-map.json"),
  ]);
  assert.equal(dashboard.language, "bg");
  assert.equal(dashboard.portal.source, "https://data.egov.bg");
  assert.equal(dashboard.categories.length, 14);
  assert.equal(Object.keys(dashboard.indicators.series).length, 8);
  assert.equal(dashboard.indicators.series.population.unit, "души");
  assert.equal(dashboard.validation.status, "валиден");
  assert.ok(dashboard.themes.transport.featured.length > 0);
  assert.ok(dashboard.themes.transport.top_organisations.length > 0);
  assert.ok(dashboard.themes.transport.format_breakdown.length > 0);
  assert.deepEqual(Object.keys(dashboard.themes).sort(), ["economy", "nature", "people", "public", "transport"]);
  const coveredCategoryIds = new Set(Object.values(dashboard.themes).flatMap((theme) => theme.category_ids));
  assert.equal(coveredCategoryIds.size, 14);
  assert.equal(Object.values(dashboard.themes).reduce((sum, theme) => sum + theme.dataset_count, 0), dashboard.portal.datasets);
  assert.ok(Object.values(dashboard.themes).every((theme) => theme.coverage.length === 3));
  assert.ok(Object.values(dashboard.themes).every((theme) => theme.updated_distribution.length > 0));
  assert.ok(Object.values(dashboard.themes).every((theme) => theme.coverage.every((row) => row.count <= theme.dataset_count)));
  assert.equal(dashboard.catalog_profile.coverage.length, 3);
  assert.equal(chartMap.charts.length, 4);
  assert.equal(catalogIndex.total_records, dashboard.portal.datasets);
  assert.ok(catalogIndex.datasets.every((dataset) => dataset.organisation));
});

test("всяка графика съвпада с оригиналния API отговор и CSV", async () => {
  const document = await readJson("../data/indicators/world-bank.json");
  for (const series of Object.values(document.series)) {
    const raw = await readFile(new URL(`../data/${series.raw_path}`, import.meta.url));
    assert.equal(createHash("sha256").update(raw).digest("hex"), series.raw_sha256);
    const [meta, rows] = JSON.parse(raw);
    assert.equal(meta.pages, 1);
    assert.equal(meta.total, rows.length);
    assert.ok(rows.every(row => row.countryiso3code === "BGR" && row.indicator.id === series.indicator));
    const source = rows.filter(row => row.value !== null).sort((a, b) => Number(a.date) - Number(b.date)).slice(-12);
    assert.deepEqual(series.data, source.map(row => ({ year: row.date, value: row.value, status: row.obs_status || "" })));
    assert.equal(new Set(series.data.map(row => row.year)).size, 12);
    assert.ok(series.data.every(row => Number.isFinite(row.value)));
    const csv = await readFile(new URL(`../data/${series.csv_path}`, import.meta.url), "utf8");
    const lines = csv.trim().split(/\r?\n/).slice(1);
    assert.equal(lines.length, 12);
    lines.forEach((line, index) => {
      const [year, value] = line.split(",");
      assert.equal(year, source[index].date);
      assert.equal(Number(value), source[index].value);
    });
    const metadata = await readFile(new URL(`../data/${series.metadata_path}`, import.meta.url));
    assert.equal(createHash("sha256").update(metadata).digest("hex"), series.metadata_sha256);
    await accessPublished(series.csv_path);
    await accessPublished(series.raw_path);
  }
  assert.equal(document.series.forest.unit, "% от сухоземната площ");
  assert.equal(document.series.inflation.change_unit, "п.п.");
  assert.equal(document.series.life.change_unit, "години");
});

async function accessPublished(path) {
  const [source, published] = await Promise.all([
    readFile(new URL(`../data/${path}`, import.meta.url)),
    readFile(new URL(`../dist/data/${path}`, import.meta.url)),
  ]);
  assert.deepEqual(published, source);
}
