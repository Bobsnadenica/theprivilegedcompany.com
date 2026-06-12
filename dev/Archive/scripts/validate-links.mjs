import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLinksDocument } from "../assets/js/links-parser.mjs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const targetPath = resolve(currentDirectory, "..", process.argv[2] || "Links.txt");

try {
  const documentText = await readFile(targetPath, "utf8");
  const archive = parseLinksDocument(documentText);

  console.log(
    `Validated ${archive.summary.totalLinks} links across ${archive.summary.totalCategories} categories from ${targetPath}.`,
  );

  archive.categories.forEach((category) => {
    console.log(`- ${category.name}: ${category.links.length}`);
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Could not validate Links.txt.",
  );
  process.exitCode = 1;
}
