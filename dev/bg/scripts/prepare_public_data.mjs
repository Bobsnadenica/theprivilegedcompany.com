import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/data");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(resolve(root, "data/site/dashboard.json"), resolve(output, "dashboard.json")),
  cp(resolve(root, "data/site/catalog-index.json"), resolve(output, "catalog-datasets.json")),
  cp(resolve(root, "data/validation/report.json"), resolve(output, "validation.json")),
  cp(resolve(root, "data/manifest.json"), resolve(output, "manifest.json")),
  cp(resolve(root, "data/visuals/road.json"), resolve(output, "road-visuals.json")),
]);
