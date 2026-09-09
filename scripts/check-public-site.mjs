// Run with node scripts/check-public-site.mjs. No browser or network required.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const routerSource = source.slice(source.indexOf('let navigationId = 0;'), source.indexOf('/**\n * Tab Switching Logic'));
const pending = [];
const timers = [];
let routeKey = 'manifest';
let seo;
const view = { style: {}, innerHTML: '' };
const classes = { add() {}, remove() {} };
const context = vm.createContext({
    getCurrentRoute: () => ({ key: routeKey, route: { view: routeKey + '.html' } }),
    document: { body: { dataset: {}, classList: classes }, querySelectorAll: () => [] },
    window: { matchMedia: () => ({ matches: false }), scrollTo() {} },
    transitionMask: { classList: classes }, dynamicView: view, hubView: { style: {} },
    setTimeout: resolve => timers.push(resolve),
    fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    assetVersion: 'test', updateSeo: key => { seo = key; }, console: { error() {} },
    applyTranslations() {}, initMagnetic() {}, ScrambleText: class {}, AnagramText: class {},
    initArchitectureCanvas() {}, initTabs() {}, initServiceCards() {}, initContactForm() {}
});
vm.runInContext(routerSource, context);
const navigate = key => { routeKey = key; return vm.runInContext('router()', context); };
const uncover = async () => { timers.shift()(); await Promise.resolve(); };
const respond = (request, html) => request.resolve({ ok: true, text: async () => html });

// An older fragment must never replace the latest route.
const old = navigate('manifest');
await uncover();
const latest = navigate('contact');
await uncover();
respond(pending[1], 'contact');
await latest;
respond(pending[0], 'stale services');
await old;
assert.equal(view.innerHTML, 'contact');
assert.equal(seo, 'contact');

// Navigating home while a fragment fails must not render its error.
const failed = navigate('manifest');
await uncover();
const home = navigate('');
await uncover();
await home;
pending[2].reject(new Error('late failure'));
await failed;
assert.equal(seo, '');
assert.equal(view.style.display, 'none');
assert.equal(view.innerHTML, 'contact');

// Rapid clicks during the mask should fetch only the final destination.
const skipped = navigate('manifest');
const winner = navigate('who-are-we');
await uncover();
await skipped;
assert.equal(pending.length, 3);
await uncover();
respond(pending[3], 'company');
await winner;
assert.equal(view.innerHTML, 'company');
assert.equal(seo, 'who-are-we');
console.log('Public router checks passed: stale response, stale error, rapid navigation.');
