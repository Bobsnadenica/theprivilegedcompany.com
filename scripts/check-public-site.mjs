// Run with node scripts/check-public-site.mjs. No browser or network required.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

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
    document: { body: { dataset: {}, classList: classes }, querySelectorAll: () => [], getElementById: () => null },
    window: { matchMedia: () => ({ matches: false }), scrollTo() {} },
    transitionMask: { classList: classes }, dynamicView: view, hubView: { style: {} },
    setTimeout: resolve => timers.push(resolve),
    fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    assetVersion: 'test', AbortSignal, updateSeo: key => { seo = key; }, console: { error() {} },
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

// Exact route matching must reject nested aliases and prototype property names.
const resolveRoute = vm.runInNewContext(
    source.slice(source.indexOf('const getRouteKey ='), source.indexOf('/**\n * SPA Router')) + '; pathname => { window.location.pathname = pathname; return getRouteKey(); };',
    { window: { location: {} }, routes: { '': {}, contact: {} }, notFoundKey: '404' }
);
for (const path of ['/', '/index.html']) assert.equal(resolveRoute(path), '');
for (const path of ['/contact', '/contact/', '/contact/index.html']) assert.equal(resolveRoute(path), 'contact');
for (const path of ['/wrong/contact', '/index.html/contact', '/toString', '/__proto__', '//contact']) assert.equal(resolveRoute(path), '404');

// A current failed route renders a recoverable error with a page heading.
const currentFailure = navigate('contact');
await uncover();
pending[4].reject(new Error('offline'));
await currentFailure;
assert.match(view.innerHTML, /<h1>Connection interrupted\./);
assert.match(view.innerHTML, /id="route-retry"/);

// Interception preserves native modified clicks, downloads, hash links and mailto.
const clickHandlers = [];
let routed = 0;
let pushed = 0;
vm.runInNewContext(source.slice(source.indexOf("document.addEventListener('click', e => {", source.indexOf('* Event Interceptor')), source.indexOf("window.addEventListener('popstate'")), {
    document: { addEventListener: (_, handler) => clickHandlers.push(handler) }, URL,
    window: { location: { origin: 'https://example.test', href: 'https://example.test/' } },
    history: { pushState() { pushed++; } }, router() { routed++; }
});
const link = { href: 'https://example.test/contact', target: '', hasAttribute: () => false };
const click = overrides => {
    let prevented = false;
    clickHandlers[0]({ button: 0, target: { closest: () => link }, preventDefault() { prevented = true; }, ...overrides });
    return prevented;
};
assert.equal(click({}), true);
assert.equal(routed, 1);
assert.equal(pushed, 1);
for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'defaultPrevented']) assert.equal(click({ [modifier]: true }), false);
assert.equal(click({ button: 1 }), false);
link.target = '_blank'; assert.equal(click({}), false); link.target = '';
link.hasAttribute = () => true; assert.equal(click({}), false); link.hasAttribute = () => false;
link.href = 'https://example.test/#app-root'; assert.equal(click({}), false);
link.href = 'mailto:contactus@example.test';
clickHandlers[1]({ target: { closest: () => link } });
assert.equal(link.target, '');
link.href = 'https://external.test/';
clickHandlers[1]({ target: { closest: () => link } });
assert.equal(link.rel, 'noopener noreferrer');
console.log('Navigation QA passed: exact routes, offline fallback, modifier keys, downloads, hashes, safe external links.');

// Exercise the actual form handler. All delivery is mocked; no real messages leave this process.
const formSource = source.slice(source.indexOf('const initContactForm ='), source.indexOf('/**\n * Architecture Canvas'));
const formHarness = () => {
    let handler;
    let deliveries = 0;
    let finish;
    let fail;
    let resets = 0;
    let focused;
    const button = { disabled: true };
    const data = new Map(Object.entries({ name: 'QA Test', email: 'qa@example.test', phone: '', details: 'Test brief', requestType: 'Other' }));
    const elements = Object.fromEntries(Object.entries({ name: 120, email: 254, phone: 80, details: 20000 }).map(([key, maxLength]) => [key, { required: key !== 'phone', maxLength, focus() { focused = key; } }]));
    const form = {
        elements, checkValidity: () => true, reportValidity() {},
        addEventListener: (_, callback) => { handler = callback; },
        querySelector: () => button, reset() { resets++; }
    };
    const status = { textContent: '', classList: { add() {} } };
    const location = { pathname: '/contact', search: '', href: '' };
    vm.runInNewContext(formSource + '; initContactForm();', {
        document: { getElementById: id => ({ 'contact-form': form, 'contact-form-status': status }[id] || null) },
        getSelectedServiceName: () => '', FormData: class { get(key) { return data.get(key); } },
        t: text => text, currentLanguage: 'en', window: { location }, console: { warn() {} },
        putBriefInInbox: () => { deliveries++; return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); }
    });
    assert.equal(button.disabled, false, 'Enable submission only after binding the handler');
    return { data, status, button, location, submit: () => handler({ preventDefault() {} }), resolve: () => finish(), reject: () => fail(new Error('timeout')), get deliveries() { return deliveries; }, get resets() { return resets; }, get focused() { return focused; } };
};
const invalid = formHarness();
invalid.data.set('name', '   '); await invalid.submit();
assert.equal(invalid.deliveries, 0); assert.equal(invalid.focused, 'name');
invalid.data.set('name', 'QA'); invalid.data.set('details', 'x'.repeat(20001)); await invalid.submit();
assert.equal(invalid.deliveries, 0); assert.equal(invalid.focused, 'details');
const success = formHarness();
const sending = success.submit();
await success.submit();
assert.equal(success.deliveries, 1); assert.equal(success.button.disabled, true);
success.resolve(); await sending;
assert.equal(success.resets, 1); assert.equal(success.button.disabled, false);
assert.match(success.status.textContent, /^Brief sent/);
const failure = formHarness();
const failedSend = failure.submit(); failure.reject(); await failedSend;
assert.equal(failure.resets, 0); assert.equal(failure.button.disabled, false);
assert.match(failure.location.href, /^mailto:contactus@theprivilegedcompany\.com\?subject=/);
assert.match(failure.status.textContent, /please send it from your email app/);
const honeypot = formHarness(); honeypot.data.set('_honey', 'spam'); await honeypot.submit(); assert.equal(honeypot.deliveries, 0);
console.log('Contact QA passed: whitespace, length limits, duplicate submissions, success/reset, failure/preserved input, honeypot.');

// Guest credential requests and the signed upload share a bounded timeout.
const deliverySource = source.slice(source.indexOf('const inboxConfig ='), source.indexOf('const serviceRequestTypes ='));
const requests = [];
let deadline;
const boundedSignal = new AbortController().signal;
const send = vm.runInNewContext(deliverySource + '; putBriefInInbox;', {
    TextEncoder, crypto: webcrypto,
    AbortSignal: { timeout(ms) { deadline = ms; return boundedSignal; } },
    fetch: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => requests.length === 1 ? { IdentityId: 'test-identity' } : { Credentials: { AccessKeyId: 'TEST', SecretKey: 'test-only', SessionToken: 'test-only' } } };
    }
});
await send({ name: 'QA', details: 'Network is mocked' });
assert.equal(deadline, 20000);
assert.equal(requests.length, 3);
assert.ok(requests.every(request => request.options.signal === boundedSignal));
assert.equal(requests[2].options.method, 'PUT');
assert.match(requests[2].url, /inbox\/new\/[^/]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/);
assert.match(requests[2].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);

// Every published shell must enforce its policy before any script and match its hashes.
for (const route of ['', 'manifest/', 'who-are-we/', 'data-engine/', 'b2b/', 'personal-it/', 'architecture/', 'privacy/', 'terms/', 'faq/', 'contact/', '404.html']) {
    const file = route === '404.html' ? route : `${route}index.html`;
    const html = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    assert.ok(policy, file);
    assert.ok(policy.index < html.indexOf('<script'), file);
    assert.doesNotMatch(policy[1].match(/script-src[^;]*/)[0], /unsafe-inline/);
    assert.doesNotMatch(policy[1], /frame-ancestors/);
    for (const [, attributes, code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=/i.test(attributes)) continue;
        assert.ok(policy[1].includes(`'sha256-${createHash('sha256').update(code).digest('base64')}'`), `${file}: stale script hash`);
    }
}
console.log('Security checks passed: bounded uploads, UUID object keys, CSP placement and script hashes on all 12 shells.');

// Motion preference changes and hidden tabs must not create extra animation loops.
const lifecycleEvents = new Map();
const scheduledFrames = new Map();
let frameId = 0;
let reduced = false;
let resizeCallback;
const lifecycleDocument = { hidden: false, documentElement: {}, addEventListener: (type, callback) => lifecycleEvents.set(type, callback) };
const LifecycleWeb = vm.runInNewContext(source.slice(source.indexOf('class QuantumWeb'), source.indexOf('/**\n * Telemetry Log Engine')) + '; QuantumWeb;', {
    document: lifecycleDocument,
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: (type, callback) => lifecycleEvents.set(type, callback), matchMedia: query => ({ matches: query.includes('reduced-motion') && reduced, addEventListener: (_, callback) => lifecycleEvents.set('motion', callback) }) },
    navigator: { hardwareConcurrency: 8, deviceMemory: 8 }, performance: { now: () => 2000 },
    requestAnimationFrame: callback => { scheduledFrames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => scheduledFrames.delete(id),
    setTimeout: callback => { resizeCallback = callback; }, clearTimeout() {}
});
let painted = 0;
LifecycleWeb.prototype.readTheme = () => {};
const realInit = LifecycleWeb.prototype.init;
LifecycleWeb.prototype.init = function () { realInit.call(this); this.particles = []; };
lifecycleDocument.getElementById = () => ({ style: {}, dataset: {}, getContext: () => ({ setTransform() {}, fillRect() { painted++; } }) });
new LifecycleWeb('canvas');
assert.equal(scheduledFrames.size, 1);
lifecycleDocument.hidden = true; lifecycleEvents.get('visibilitychange')(); assert.equal(scheduledFrames.size, 0);
lifecycleDocument.hidden = false; lifecycleEvents.get('visibilitychange')(); assert.equal(scheduledFrames.size, 1);
reduced = true; lifecycleEvents.get('motion')(); assert.equal(scheduledFrames.size, 0);
const beforeResize = painted;
lifecycleEvents.get('resize')(); resizeCallback(); assert.equal(painted, beforeResize + 1);
reduced = false; lifecycleEvents.get('motion')(); assert.equal(scheduledFrames.size, 1);
console.log('Motion lifecycle passed: hidden-tab cancellation, one resumed loop, live preference change, static resize redraw.');

const contactMarkup = await readFile(new URL('../views/contact.html', import.meta.url), 'utf8');
assert.match(contactMarkup, /<form[^>]*method="post"/);
assert.match(contactMarkup, /<button[^>]*type="submit"[^>]*disabled/);

// Check palette contrast separately from the browser's layout checks.
const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(pair => parseInt(pair, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
for (const theme of [':root', ':root[data-theme="light"]']) {
    const block = css.slice(css.indexOf(theme + ' {')).split('}')[0];
    const tokens = Object.fromEntries([...block.matchAll(/(--c-[a-z-]+):\s*(#[a-f0-9]{6})/g)].map(([, key, value]) => [key, value]));
    const pairs = ['--c-fg', '--c-muted', '--c-accent', '--c-accent-strong'].flatMap(fg => ['--c-bg', '--c-surface'].map(bg => [fg, bg]));
    pairs.push(['--c-on-accent', '--c-accent'], ['--c-on-accent', '--c-accent-strong']);
    for (const [fg, bg] of pairs) {
        const a = luminance(tokens[fg]), b = luminance(tokens[bg]);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= 4.5, `${theme}: ${fg}/${bg} contrast ${ratio.toFixed(2)}`);
    }
}
console.log('Form privacy defaults and 20 core palette contrast pairs passed (at least 4.5:1).');
