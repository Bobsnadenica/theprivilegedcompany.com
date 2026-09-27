import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Please install Node.js 22 or newer: https://nodejs.org/\nИнсталирайте Node.js 22 или по-нова версия.');
  process.exit(1);
}
const lockHash = createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
const marker = 'node_modules/.liars-deck-ready';
if (!existsSync(marker) || readFileSync(marker, 'utf8') !== lockHash) {
  console.log('First launch: installing free dependencies. Internet needed.\nПърво стартиране: инсталиране на зависимости. Нужен е интернет.');
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', '.npm-cache'],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.status !== 0) process.exit(install.status || 1);
  writeFileSync(marker, lockHash);
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024–65535.');
const addresses = [...new Set(Object.values(networkInterfaces()).flat().filter(address =>
  address && address.family === 'IPv4' && !address.internal &&
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
).map(address => address.address))];
const local = `http://localhost:${port}`;
const network = addresses.map(address => `http://${address}:${port}`);
process.env.NODE_ENV = 'production';
process.env.HOST = addresses.length ? '0.0.0.0' : '127.0.0.1';
process.env.PORT = String(port);
process.env.CLIENT_ORIGIN = [local, `http://127.0.0.1:${port}`, ...network].join(',');
console.log(`\nLiar's Deck / Тесте на блъфа\n\nHost / Домакин: ${local}\n`);
for (const url of network) console.log(`Friends on your Wi-Fi / Приятели в същата Wi-Fi мрежа: ${url}`);
console.log('\nOpen an address, create a room, and share its code.\nОтворете адрес, създайте стая и споделете кода.\nKeep this window open. Ctrl+C stops the game server.\nОставете този прозорец отворен. Ctrl+C спира сървъра.\n');
await import('./packages/server/dist/index.js');
