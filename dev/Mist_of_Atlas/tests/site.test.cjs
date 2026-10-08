const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function worker() {
  const handlers = new Map();
  const removed = [];
  const context = {
    URL, Request,
    self: {
      location: new URL('https://example.com/dev/Mist_of_Atlas/sw.js'),
      addEventListener: (name, callback) => handlers.set(name, callback),
      clients: { claim() {} },
      skipWaiting() {},
    },
    caches: {
      keys: async () => ['mist-of-atlas-v8', 'mist-of-atlas-v9', 'mist-of-atlas-v10', 'password-game-v3'],
      delete: async name => { removed.push(name); return true; },
    },
  };
  vm.runInNewContext(readFileSync(require.resolve('../sw.js'), 'utf8'), context);
  return { handlers, removed };
}

test('activating an update preserves other projects caches', async () => {
  const { handlers, removed } = worker();
  let finished;
  handlers.get('activate')({ waitUntil(promise) { finished = promise; } });
  await finished;
  assert.deepEqual(removed, ['mist-of-atlas-v8', 'mist-of-atlas-v9']);
});

test('worker ignores other project files, external map tiles and writes', () => {
  const { handlers } = worker();
  for (const [url, method] of [
    ['https://example.com/dev/password_game/index.html', 'GET'],
    ['https://tile.openstreetmap.org/1/1/1.png', 'GET'],
    ['https://example.com/dev/Mist_of_Atlas/index.html', 'POST'],
  ]) {
    handlers.get('fetch')({ request: { url, method }, respondWith() { assert.fail('Unrelated request intercepted'); } });
  }
});

test('location has one explicit user action and the preview is labelled illustrative', () => {
  const script = readFileSync(require.resolve('../script.js'), 'utf8');
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.doesNotMatch(script, /navigator\.permissions|requestUserLocation\(true\)/);
  assert.match(script, /useLocationBtn\.addEventListener\("click"/);
  assert.match(html, /Illustrative demo/);
  assert.match(html, /Sample routes and statistics/);
});
