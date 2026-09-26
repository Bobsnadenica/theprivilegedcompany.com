// Run with node scripts/check-public-site.mjs. No browser or network required.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

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

// Exercise the real form handler with native navigation and clipboard mocked.
const formSource = source.slice(source.indexOf('const initContactForm ='), source.indexOf('/**\n * Architecture Canvas'));
const translationSource = await readFile(new URL('../translations.js', import.meta.url), 'utf8');
const bgText = vm.runInNewContext(translationSource.replace(/export const /g, 'const ') + '; translations.bg.text;');
const formHarness = (campaignAttribution = null, language = 'en', clipboardBlocked = false) => {
    let handler, copyHandler, focused, copied, selected = false;
    const button = { disabled: true };
    const data = new Map(Object.entries({ name: 'QA Test', email: 'qa@example.test', phone: '', details: 'Test brief', requestType: 'Website or app build' }));
    const elements = Object.fromEntries(Object.entries({ name: 120, email: 254, phone: 80, details: 20000 }).map(([key, maxLength]) => [key, { required: key !== 'phone', maxLength, focus() { focused = key; } }]));
    const form = {
        elements, checkValidity: () => true, reportValidity() {},
        addEventListener: (_, callback) => { handler = callback; }, querySelector: () => button,
        reset() { assert.fail('Never discard an unsent enquiry'); }
    };
    const status = { textContent: '', classList: { add() {} } };
    const draftTools = { hidden: true };
    const draftText = { value: '', focus() { focused = 'draft'; }, select() { selected = true; } };
    const draftLink = { href: '' };
    const copyButton = { addEventListener: (_, callback) => { copyHandler = callback; } };
    const location = { pathname: '/contact', search: '?fbclid=private-click-id&email=private@example.test', href: '' };
    vm.runInNewContext(formSource + '; initContactForm();', {
        document: { getElementById: id => ({ 'contact-form': form, 'contact-form-status': status, 'contact-draft-tools': draftTools, 'contact-draft-text': draftText, 'contact-email-draft': draftLink, 'contact-copy': copyButton }[id] || null) },
        getSelectedServiceName: () => '', FormData: class { get(key) { return data.get(key); } },
        t: text => language === 'bg' ? (bgText[text] || text) : text,
        campaignAttribution, window: { location },
        navigator: { clipboard: { async writeText(value) { if (clipboardBlocked) throw new Error('blocked'); copied = value; } } },
        fetch() { assert.fail('The contact form must not send network requests'); }
    });
    assert.equal(button.disabled, false);
    return { data, status, button, location, draftTools, draftText, draftLink,
        submit: () => handler({ preventDefault() {} }), copy: () => copyHandler(),
        get focused() { return focused; }, get copied() { return copied; }, get selected() { return selected; } };
};
const invalid = formHarness();
invalid.data.set('name', '   '); invalid.submit();
assert.equal(invalid.location.href, ''); assert.equal(invalid.focused, 'name');
invalid.data.set('name', 'QA'); invalid.data.set('details', 'x'.repeat(20001)); invalid.submit();
assert.equal(invalid.location.href, ''); assert.equal(invalid.focused, 'details');
const draft = formHarness(); draft.submit();
const emailLink = new URL(draft.location.href);
assert.equal(emailLink.protocol, 'mailto:');
assert.equal(emailLink.pathname, 'contactus@theprivilegedcompany.com');
assert.equal(emailLink.searchParams.get('subject'), 'Website inquiry from QA Test');
assert.match(emailLink.searchParams.get('body'), /Details:\nTest brief/);
assert.equal(draft.draftLink.href, draft.location.href);
assert.equal(draft.draftTools.hidden, false);
assert.equal(draft.data.get('details'), 'Test brief');
assert.doesNotMatch(draft.draftText.value, /private-click-id|private@example/);
assert.doesNotMatch(draft.status.textContent, /Inquiry sent|Inquiry received/);
await draft.copy(); assert.equal(draft.copied, draft.draftText.value);
const longDraft = formHarness(null, 'bg', true);
longDraft.data.set('name', 'Тест');
longDraft.data.set('details', 'Проверка на дълго запитване. '.repeat(100));
longDraft.submit();
assert.equal(longDraft.location.href, '', 'Do not launch an oversized mailto URL');
assert.equal(new URL(longDraft.draftLink.href).searchParams.has('body'), false);
assert.match(longDraft.draftText.value, /Име: Тест/);
assert.ok(longDraft.draftText.value.endsWith(longDraft.data.get('details').trim()));
await longDraft.copy(); assert.equal(longDraft.selected, true); assert.equal(longDraft.focused, 'draft');
const honeypot = formHarness(); honeypot.data.set('_honey', 'spam'); honeypot.submit();
assert.equal(honeypot.location.href, ''); assert.equal(honeypot.draftTools.hidden, true);
assert.doesNotMatch(source, /putBriefInInbox|fetchGuestCredentials|amazonaws\.com|AWS4-HMAC/);
console.log('Email draft checks passed: validation, exact recipient, encoded content, preserved input, long Bulgarian enquiry, copy fallback, no upload or false delivery claim.');

// Only known public campaign labels may enter a draft; arbitrary query data is discarded.
const campaignFor = vm.runInNewContext(
    source.slice(source.indexOf('const getCampaignAttribution ='), source.indexOf('// ponytail: memory only')) + '; getCampaignAttribution;',
    { URLSearchParams }
);
for (const language of ['en', 'bg']) {
    const base = `?utm_source=facebook&utm_medium=organic_social&utm_campaign=company_launch_${language}`;
    for (const content of ['page_button', 'introduction_post']) {
        const campaign = campaignFor(`${base}&utm_content=${content}&fbclid=private-id&email=private@example.test`);
        assert.equal(JSON.stringify(campaign), JSON.stringify({ source: 'facebook', medium: 'organic_social', campaign: `company_launch_${language}`, content }));
        const tagged = formHarness(campaign, language); tagged.submit();
        assert.match(tagged.draftText.value, new RegExp(`facebook / organic_social / company_launch_${language} / ${content}`));
        assert.doesNotMatch(tagged.draftText.value, /private-id|private@example/);
    }
    assert.equal(campaignFor(`${base}&utm_content=private@example.test`).content, undefined);
    assert.equal(campaignFor(`${base}&utm_content=page_button&utm_content=introduction_post`).content, undefined);
    assert.equal(campaignFor(`${base}&utm_source=facebook`), null);
}
for (const search of ['', '?fbclid=private-id', '?utm_source=facebook&utm_medium=organic_social&utm_campaign=private@example.test', '?utm_source=other&utm_medium=organic_social&utm_campaign=company_launch_en']) {
    assert.equal(campaignFor(search), null);
}
console.log('Campaign checks passed: EN/BG labels, content allowlist, query privacy, email draft inclusion.');

// Explicit language links override a stored preference without accepting unsupported languages.
const initialLanguage = (search, stored, blocked = false) => vm.runInNewContext(
    source.slice(source.indexOf('const supportedLanguages ='), source.indexOf('const normalizeI18nKey =')) + '; currentLanguage;',
    { languageMeta: { en: {}, bg: {} }, URLSearchParams, window: { location: { search } }, localStorage: { getItem() { if (blocked) throw new Error('blocked'); return stored; } } }
);
assert.equal(initialLanguage('?lang=bg', 'en'), 'bg');
assert.equal(initialLanguage('?lang=en', 'bg'), 'en');
assert.equal(initialLanguage('?lang=unknown', 'bg'), 'bg');
assert.equal(initialLanguage('', 'unknown'), 'en');
assert.equal(initialLanguage('?lang=bg', null, true), 'bg');
assert.equal(initialLanguage('', null, true), 'en');
console.log('Language landing checks passed: explicit EN/BG links, stored preference, blocked storage, safe default.');

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
console.log('Security checks passed: CSP placement and script hashes on all 12 shells.');

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

// Switching language during a heading animation must restore translated source text.
let scrambleTick;
let cleared = false;
const heading = { dataset: {}, textContent: 'Build Anything' };
const scrambleContext = vm.createContext({
    currentLanguage: 'en', window: { matchMedia: () => ({ matches: false }) },
    document: { querySelectorAll: () => [] }, getSourceText: element => element.textContent,
    t: text => scrambleContext.currentLanguage === 'bg' ? 'Изграждаме всичко' : text,
    setInterval: callback => { scrambleTick = callback; return 1; }, clearInterval: () => { cleared = true; }
});
const Scramble = vm.runInContext(source.slice(source.indexOf('class ScrambleText'), source.indexOf('/**\n * Anagram Pulse Engine')) + '; ScrambleText;', scrambleContext);
new Scramble('h1').scramble(heading, heading.textContent);
scrambleTick();
scrambleContext.currentLanguage = 'bg';
scrambleTick();
assert.equal(heading.dataset.i18nSource, 'Build Anything');
assert.equal(heading.textContent, 'Изграждаме всичко');
assert.equal(heading.scrambling, false);
assert.ok(cleared);
console.log('Language animation check passed: source survives switching languages mid-animation.');

// Service cards expose real, encoded links without nested interactive wrappers.
const serviceCards = ['Licensed Market Intelligence', 'Learn Any Tech Topic'].map(name => ({
    dataset: {}, querySelector: selector => selector === 'h3' ? { textContent: name } : null,
    append(anchor) { this.anchor = anchor; }
}));
vm.runInNewContext(source.slice(source.indexOf('const initServiceCards ='), source.indexOf('const initContactForm =')) + '; initServiceCards();', {
    document: { querySelectorAll: () => serviceCards, createElement: tag => ({ tag, dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, toggleAttribute(key, enabled) { if (enabled) this.attributes[key] = ''; else delete this.attributes[key]; } }) },
    getSourceText: node => node.textContent, t: text => text, currentLanguage: 'en',
    serviceRequestTypes: { 'Licensed Market Intelligence': 'Data', 'Learn Any Tech Topic': 'Training' },
    serviceDestinations: { 'Learn Any Tech Topic': { href: 'dev/Tech%20Tools/index.html', label: 'Open Tool Suite' } }
});
assert.equal(serviceCards[0].anchor.tag, 'a');
assert.equal(serviceCards[0].anchor.href, '/contact?service=Licensed%20Market%20Intelligence');
assert.ok(Object.hasOwn(serviceCards[0].anchor.attributes, 'data-link'));
assert.equal(serviceCards[1].anchor.href, 'dev/Tech%20Tools/index.html');
assert.ok(!Object.hasOwn(serviceCards[1].anchor.attributes, 'data-link'));
console.log('Release checks passed: native service links.');

// A skip link must focus locally, never follow <base href="/"> and lose a draft.
let skip;
const skipEffects = [];
vm.runInNewContext(source.slice(source.indexOf("    document.querySelector('.skip-link')"), source.indexOf("    new QuantumWeb('bg-canvas')")), {
    document: {
        querySelector: () => ({ addEventListener: (_, handler) => { skip = handler; } }),
        getElementById: id => { assert.equal(id, 'app-root'); return {
            focus: () => skipEffects.push('focus'), scrollIntoView: () => skipEffects.push('scroll')
        }; }
    }
});
skip({ preventDefault: () => skipEffects.push('prevent navigation') });
assert.deepEqual(skipEffects, ['prevent navigation', 'focus', 'scroll']);
console.log('Skip-link check passed: focus content without navigating away.');
