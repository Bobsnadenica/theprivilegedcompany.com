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

// Cursor coordinates must update in the pointer event, with no animation queue.
const pointerEvents = new Map();
const cursorClasses = new Set();
const dot = { style: {} };
const ring = { style: {} };
let enhancedPointer = true;
vm.runInNewContext(
    source.slice(source.indexOf('const initCursor ='), source.indexOf('/**\n * Magnetic Elements')) + '; initCursor();',
    {
        cursor: dot, follower: ring, canUseEnhancedPointer: () => enhancedPointer,
        window: { addEventListener: (type, handler) => pointerEvents.set(type, handler) },
        document: {
            documentElement: { addEventListener: (type, handler) => pointerEvents.set(type, handler) },
            body: { classList: {
                add: value => cursorClasses.add(value),
                remove: (...values) => values.forEach(value => cursorClasses.delete(value)),
                toggle: (value, enabled) => enabled ? cursorClasses.add(value) : cursorClasses.delete(value)
            } }
        }
    }
);
const pointer = { pointerType: 'mouse', clientX: 420, clientY: 210, target: { closest: () => true } };
pointerEvents.get('pointermove')(pointer);
assert.equal(dot.style.transform, 'translate3d(420px, 210px, 0)');
assert.equal(ring.style.transform, dot.style.transform);
assert.ok(cursorClasses.has('cursor-hover'));
pointerEvents.get('blur')();
assert.ok(!cursorClasses.has('has-custom-cursor'));
enhancedPointer = false;
pointerEvents.get('pointermove')(pointer);
assert.ok(!cursorClasses.has('has-custom-cursor'));

// Rich mode must draw every 60 Hz frame, rather than dropping alternate frames.
const animationQueue = [];
const Web = vm.runInNewContext(
    source.slice(source.indexOf('class QuantumWeb'), source.indexOf('/**\n * Telemetry Log Engine')) + '; QuantumWeb;',
    {
        requestAnimationFrame: callback => animationQueue.push(callback),
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
        navigator: { hardwareConcurrency: 8, deviceMemory: 8 }
    }
);
const web = Object.create(Web.prototype);
let frames = 0;
Object.assign(web, {
    isVisible: true, isReducedMotion: false, isCompact: false, lastFrame: 0,
    canvas: { style: {}, dataset: {} },
    ctx: { fillRect: () => frames++, setTransform() {} }, mouse: { x: null, vx: 0, vy: 0 },
    ripples: [], particles: []
});
web.init();
web.particles = [];
for (let frame = 1; frame <= 60; frame++) web.animate(frame * 1000 / 60);
assert.equal(frames, 60);
animationQueue.length = 0;
web.isReducedMotion = true;
web.animate(2000);
assert.equal(animationQueue.length, 0);
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
assert.doesNotMatch(css.match(/#cursor(?:-follower)?\s*\{[^}]*\}/g).join(''), /transition:\s*[^;]*transform/);
console.log('Motion checks passed: immediate cursor, pointer fallback, 60 Hz cadence, static reduced motion.');
