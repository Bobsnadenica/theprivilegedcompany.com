// Run with node scripts/check-aipost-guide.mjs. No dependencies or network needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../dev/aipost247/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Check all inline code, including the lazy galleries.
const languageCode = script.slice(0, script.indexOf('// Копиране'));

function checkPage(href, saved, storageBlocked = false) {
    const node = (innerHTML, attributes = {}) => ({
        innerHTML, attributes, dataset: {},
        getAttribute(key) { return this.attributes[key]; },
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener() {}
    });
    const heading = node('Свържете страницата', { 'data-en': 'Connect your Page' });
    const meta = node('', { content: 'Ръководство', 'data-en-content': 'Setup guide' });
    const group = node('', { 'aria-label': 'Език', 'data-en-aria-label': 'Language' });
    const buttons = ['en', 'bg'].map(language => Object.assign(node(''), { dataset: { language } }));
    const release = { textContent: 'Версия 2.0.0 · обновена 2026-10-01' };
    const back = { href: 'https://www.theprivilegedcompany.com/' };
    const document = {
        documentElement: {},
        querySelectorAll: selector => ({ '[data-en]': [heading], '[data-en-content]': [meta], '[data-en-aria-label]': [group], '[data-language]': buttons })[selector],
        getElementById: () => release, querySelector: () => back,
        dispatchEvent() {}
    };
    let written, replaced;
    const context = vm.createContext({ document, URL, Event,
        window: { location: { href }, history: { replaceState: (_, __, url) => { replaced = url.href; } }, addEventListener() {} },
        localStorage: {
            getItem() { if (storageBlocked) throw new Error('Storage blocked'); return saved; },
            setItem(_, value) { if (storageBlocked) throw new Error('Storage blocked'); written = value; }
        }
    });
    vm.runInContext(languageCode, context);
    return { context, document, heading, meta, group, buttons, release, back,
        written: () => written, replaced: () => replaced };
}

// A shareable language link wins over a saved choice. Switching keeps unrelated URL data.
const page = checkPage('https://example.com/guide?lang=en&utm_source=facebook#step-7', 'bg');
assert.equal(page.document.documentElement.lang, 'en');
assert.equal(page.heading.innerHTML, 'Connect your Page');
assert.equal(page.meta.attributes.content, 'Setup guide');
assert.equal(page.group.attributes['aria-label'], 'Language');
assert.equal(page.release.textContent, 'Version 2.0.0 · updated 2026-10-01');
vm.runInContext("setGuideLanguage('bg', true)", page.context);
assert.equal(page.heading.innerHTML, 'Свържете страницата');
assert.equal(page.group.attributes['aria-label'], 'Език');
assert.equal(page.buttons[1].attributes['aria-pressed'], 'true');
assert.equal(page.buttons[0].attributes['aria-pressed'], 'false');
assert.equal(page.written(), 'bg');
assert.equal(page.replaced(), 'https://example.com/guide?lang=bg&utm_source=facebook#step-7');
assert.equal(page.back.href, 'https://www.theprivilegedcompany.com/?lang=bg');
vm.runInContext("setGuideLanguage('en', true); setGuideLanguage('invalid', true)", page.context);
assert.equal(page.document.documentElement.lang, 'en');
assert.equal(page.heading.innerHTML, 'Connect your Page');

// Saved preferences, invalid values, and blocked storage must all leave a usable page.
assert.equal(checkPage('https://example.com/guide', 'bg').document.documentElement.lang, 'bg');
assert.equal(checkPage('https://example.com/guide?lang=other', 'en').document.documentElement.lang, 'en');
assert.equal(checkPage('https://example.com/guide', 'invalid').document.documentElement.lang, 'en');
const blocked = checkPage('https://example.com/guide', null, true);
assert.equal(blocked.document.documentElement.lang, 'en');
vm.runInContext("setGuideLanguage('bg', true)", blocked.context);
assert.equal(blocked.document.documentElement.lang, 'bg');
assert.equal(blocked.replaced(), 'https://example.com/guide?lang=bg');

// Every published screenshot must have an English caption; the ZIP version remains stampable.
const assets = new URL('../dev/aipost247/assets/', import.meta.url);
const images = JSON.parse(await readFile(new URL('images.json', assets), 'utf8'));
const captions = await readFile(new URL('how_to.en.txt', assets), 'utf8');
for (const image of images) assert.ok(captions.split('\n').some(line => line.startsWith(`${image.src} - `)), `Missing English caption: ${image.src}`);
assert.match(html, /<div class="dl-ver" id="dl-ver">Версия [^<]+<\/div>/);
console.log('AIPost247 guide checks passed: language precedence, round trips, metadata, storage fallback, URL preservation, captions, and release stamping.');
