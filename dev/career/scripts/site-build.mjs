import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const distDir = path.join(projectDir, "dist");
const distAssetsDir = path.join(distDir, "assets");
const rootAssetsDir = path.join(projectDir, "assets");
const deployIndexPath = path.join(projectDir, "index.html");

async function cleanDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function copyIfExists(sourcePath, targetPath, options) {
  try {
    await cp(sourcePath, targetPath, options);
  } catch {}
}

async function copyBuildOutput({ keepDist }) {
  await cleanDir(rootAssetsDir);
  await cp(distAssetsDir, rootAssetsDir, { recursive: true });
  await cp(path.join(distDir, "index.html"), deployIndexPath);

  const filesToCopy = ["manifest.json", "sw.js", "favicon.svg"];
  const directoriesToCopy = ["demo-avatars"];

  for (const file of filesToCopy) {
    await copyIfExists(path.join(distDir, file), path.join(projectDir, file));
  }

  for (const dir of directoriesToCopy) {
    await rm(path.join(projectDir, dir), { recursive: true, force: true });
    await copyIfExists(path.join(distDir, dir), path.join(projectDir, dir), { recursive: true });
  }

  if (!keepDist) {
    await rm(distDir, { recursive: true, force: true });
  }
}

async function runBuild({ keepDist = false } = {}) {
  process.chdir(projectDir);
  await viteBuild();
  await copyBuildOutput({ keepDist });
}

const mode = process.argv[2];

if (mode === "prepare") {
  // Vite now reads from src/index.html, so local dev no longer rewrites deploy index.html.
} else if (mode === "build") {
  await runBuild();
} else if (mode === "preview") {
  await runBuild({ keepDist: true });
} else {
  throw new Error(`Unsupported mode: ${mode}`);
}
