import { build } from 'vite';
import { cp, rm } from 'node:fs/promises';
await build();
const root = new URL('../', import.meta.url);
for (const folder of ['assets', 'art']) await rm(new URL(folder, root), { recursive: true, force: true });
for (const file of ['index.html', 'play.html', 'privacy.html', 'assets', 'art']) {
  await cp(new URL(`dist/${file}`, root), new URL(file, root), { recursive: true });
}
