import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.resolve(projectRoot, "packages/client/public/assets/cinematic");
const targetPath = path.join(targetDir, "sketchfab-9mm.glb");
const metadataPath = path.join(targetDir, "sketchfab-9mm.metadata.json");
const modelUid = "5124e7fe60fb4d3ab62460609d23f365";

await mkdir(targetDir, { recursive: true });

const sourcePath = process.argv[2];
if (sourcePath) {
  await installFromLocalPath(path.resolve(sourcePath));
  process.exit(0);
}

const token = process.env.SKETCHFAB_TOKEN;
if (!token) {
  console.log("No file path or SKETCHFAB_TOKEN provided.");
  console.log("Download the Sketchfab model as GLB, then run:");
  console.log("  npm run install:sketchfab-9mm -- /absolute/path/to/downloaded-file.glb");
  console.log("Or set SKETCHFAB_TOKEN and run:");
  console.log("  SKETCHFAB_TOKEN=... npm run install:sketchfab-9mm");
  process.exit(1);
}

await installFromSketchfabToken(token);

async function installFromLocalPath(source) {
  const info = await stat(source);
  if (!info.isFile()) {
    throw new Error(`Not a file: ${source}`);
  }

  if (source.toLowerCase().endsWith(".zip")) {
    await installGlbFromZip(source);
  } else {
    await copyFile(source, targetPath);
  }

  await writeMetadata();
  console.log(`Installed Sketchfab 9 mm model at ${path.relative(projectRoot, targetPath)}`);
}

async function installGlbFromZip(source) {
  const listing = spawnSync("unzip", ["-Z1", source], { encoding: "utf8" });
  if (listing.status !== 0) {
    throw new Error("Could not inspect zip archive. Install unzip or provide the downloaded .glb directly.");
  }
  const glbEntry = listing.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().endsWith(".glb"));

  if (!glbEntry) {
    throw new Error("The zip archive did not contain a .glb file. Download Sketchfab's GLB archive for this model.");
  }

  const extracted = spawnSync("unzip", ["-p", source, glbEntry], {
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024
  });
  if (extracted.status !== 0 || !extracted.stdout?.length) {
    throw new Error(`Could not extract ${glbEntry} from ${source}`);
  }
  await writeFile(targetPath, extracted.stdout);
}

async function installFromSketchfabToken(token) {
  const response = await fetch(`https://api.sketchfab.com/v3/models/${modelUid}/download`, {
    headers: { Authorization: `Token ${token}` }
  });
  if (!response.ok) {
    throw new Error(`Sketchfab download metadata request failed: ${response.status} ${response.statusText}`);
  }

  const metadata = await response.json();
  const archive = metadata.glb ?? metadata.gltf;
  if (!archive?.url) {
    throw new Error("Sketchfab did not return a GLB download URL for this model.");
  }

  const archiveResponse = await fetch(archive.url);
  if (!archiveResponse.ok) {
    throw new Error(`Sketchfab archive download failed: ${archiveResponse.status} ${archiveResponse.statusText}`);
  }

  const bytes = Buffer.from(await archiveResponse.arrayBuffer());
  const contentType = archiveResponse.headers.get("content-type") ?? "";
  if (contentType.includes("zip")) {
    const zipPath = path.join(targetDir, "sketchfab-9mm-download.zip");
    await writeFile(zipPath, bytes);
    await installGlbFromZip(zipPath);
  } else {
    await writeFile(targetPath, bytes);
  }

  await writeMetadata();
  console.log(`Installed Sketchfab 9 mm model at ${path.relative(projectRoot, targetPath)}`);
}

async function writeMetadata() {
  let byteLength = 0;
  try {
    byteLength = (await readFile(targetPath)).byteLength;
  } catch {
    byteLength = 0;
  }
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        title: "9 mm",
        source: "https://sketchfab.com/3d-models/9-mm-5124e7fe60fb4d3ab62460609d23f365",
        author: "Slava Zemlyanik (@reijin)",
        license: "Sketchfab Free Standard",
        noAi: true,
        installedFile: "sketchfab-9mm.glb",
        byteLength
      },
      null,
      2
    )}\n`
  );
}
