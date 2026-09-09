#!/usr/bin/env node
// Local preparation only. Private inputs/output belong outside the repository.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDomainTerms } from '../src/domain-migration.js';

const [sourcePath, overridesPath, outputPath, ...extra] = process.argv.slice(2);
if (!sourcePath || !overridesPath || !outputPath || extra.length) throw new Error('Usage: node portal/scripts/prepare-domain-terms.mjs PRIVATE_LEDGER PRIVATE_OVERRIDES PRIVATE_OUTPUT');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
for (const path of [sourcePath, overridesPath, outputPath]) {
  if (resolve(path) === root || resolve(path).startsWith(root + sep)) throw new Error('Keep private migration files outside the repository.');
}
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
const result = migrateDomainTerms(source, overrides);
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('Prepared private migration. Expiry dates and record IDs are unchanged. No account data was uploaded.');
