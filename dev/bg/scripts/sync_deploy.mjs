import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await cp(resolve(dist, "index.html"), resolve(root, "index.html"));

await rm(resolve(root, "assets"), { recursive: true, force: true });
await cp(resolve(dist, "assets"), resolve(root, "assets"), { recursive: true });

for (const asset of ["favicon.svg", "og.png"]) {
  await cp(resolve(dist, asset), resolve(root, asset));
}

await mkdir(resolve(root, "data"), { recursive: true });
for (const dataFile of [
  "dashboard.json",
  "catalog-datasets.json",
  "validation.json",
  "road-visuals.json",
]) {
  await cp(resolve(dist, "data", dataFile), resolve(root, "data", dataFile));
}

console.log("Synced the /dev/bg/ GitHub Pages build into the project directory.");
