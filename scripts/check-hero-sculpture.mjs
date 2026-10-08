import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the actual animation module with a controlled clock and browser lifecycle.
const source = await readFile(new URL('../hero-sculpture.js', import.meta.url), 'utf8');
const frames = new Map();
let frameId = 0;
let paints = 0;
function element() {
    return {
        dataset: {}, hidden: false, textContent: '', events: {}, attributes: {},
        classList: { values: new Set(), add(name) { this.values.add(name); }, contains(name) { return this.values.has(name); } },
        addEventListener(name, fn) { this.events[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; },
        getBoundingClientRect: () => ({ width: 520, height: 520, left: 0, top: 0, bottom: 520 }),
    };
}
const selectors = ['.sculpture-stage'];
const nodes = Object.fromEntries(selectors.map(selector => [selector, element()]));
const context2d = Object.fromEntries(['setTransform', 'moveTo', 'lineTo', 'arc', 'ellipse'].map(name =>
    [name, (...values) => assert.ok(values.every(Number.isFinite), `${name} receives finite coordinates`)]));
Object.assign(context2d, { clearRect() { paints++; }, beginPath() {}, closePath() {}, stroke() {}, fill() {} });
const canvas = { getContext: () => context2d };
const root = Object.assign(element(), { querySelector: selector => selector === 'canvas' ? canvas : nodes[selector] });
const destination = { getBoundingClientRect: () => ({ width: 700, height: 90, top: 1600, bottom: 1690 }) };
const document = Object.assign(element(), { hidden: false, documentElement: element(), getElementById: id => id === 'home-services-title' ? destination : root });
const lightWaves = [];
const journeys = [];
document.dispatchEvent = event => (event.type === 'sculpturechange' ? lightWaves : journeys).push(event);
const motion = Object.assign(element(), { matches: false });
let intersection;
const browser = {
    document, navigator: { hardwareConcurrency: 8 }, devicePixelRatio: 3,
    innerWidth: 1440, innerHeight: 720, addEventListener: (name, callback) => { browser[name] = callback; },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    matchMedia: query => query.includes('reduced-motion') ? motion : { matches: false },
    getComputedStyle: () => ({ getPropertyValue: () => '200, 160, 80' }),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
};
browser.window = browser;
const context = vm.createContext(browser);
vm.runInContext(source.replaceAll('export ', '') + '\nthis.api = { sculpturePoint, scatterPoint, initHeroSculpture };', context);
const { sculpturePoint, scatterPoint, initHeroSculpture } = context.api;
for (let i = 0; i < 400; i++) {
    const point = scatterPoint(i, 400);
    assert.ok(point.every(Number.isFinite) && Math.hypot(...point) <= 1.04, 'Released particles stay within the stage');
}

for (let form = 0; form < 3; form++) {
    for (let i = 0; i <= 48; i++) {
        const v = i / 48 * Math.PI * 2;
        const first = sculpturePoint(form, 0, v);
        const last = sculpturePoint(form, Math.PI * 2, v);
        assert.ok(first.every((value, axis) => Math.abs(value - last[axis]) < 1e-8), 'No broken longitudinal seams');
        for (let j = 0; j <= 48; j++) {
            const point = sculpturePoint(form, j / 48 * Math.PI * 2, v);
            assert.ok(point.every(Number.isFinite) && Math.hypot(...point) < 1.2, 'Every form stays finite and bounded');
        }
    }
}

const sculpture = initHeroSculpture();
const advance = timestamp => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(callback => callback(timestamp));
};
assert.equal(frames.size, 0, 'An unobserved sculpture does no animation work');
assert.equal(canvas.width, 780, 'High-DPI rendering is capped at 1.5x');
assert.equal(sculpture.facets.length, 768, 'The ribbon surface has a fixed rendering budget');
assert.ok(sculpture.facets.every(face => ['a', 'b', 'c', 'd'].every(key => face[key] >= 0 && face[key] + 2 < sculpture.vertices.length)));
assert.equal(initHeroSculpture(), undefined, 'Repeated initialization does not duplicate listeners or loops');
intersection([{ isIntersecting: true }]);
assert.equal(frames.size, 1);
for (let i = 0; i < 5; i++) sculpture.syncMotion();
assert.equal(frames.size, 1, 'Lifecycle changes keep exactly one frame queued');
nodes['.sculpture-stage'].events.pointermove({ pointerType: 'mouse', clientX: 900, clientY: -10 });
assert.equal(sculpture.pointer.x, 1);
assert.equal(sculpture.pointer.y, -1);
advance(0);
const before = paints;
advance(16);
assert.equal(paints, before, 'Slow rotation avoids unnecessary 60Hz paints');
advance(34);
assert.equal(paints, before + 1);
assert.ok(sculpture.viewPointer.x > 0 && sculpture.viewPointer.x < 1, 'The object eases toward the pointer without jumping');
nodes['.sculpture-stage'].events.pointerleave();

sculpture.setForm(1);
assert.equal(lightWaves.length, 1);
assert.equal(lightWaves[0].type, 'sculpturechange');
assert.equal(lightWaves[0].detail.x, 260);
assert.equal(lightWaves[0].detail.y, 260);
advance(50);
advance(114);
assert.ok(sculpture.morph > 0 && sculpture.morph < 1, 'Reshape interpolates instead of jumping');
const intermediate = Array.from(sculpture.vertices);
sculpture.setForm(2);
assert.deepEqual(Array.from(sculpture.from), intermediate, 'Rapid reshapes start at the currently displayed geometry');
assert.equal(root.dataset.form, '2');
for (const invalid of [-1, 3, 1.5, '1', NaN, null, 2]) sculpture.setForm(invalid);
assert.equal(root.dataset.form, '2', 'Invalid or unchanged choices do not reset the active form');
assert.equal(frames.size, 1);

// A phone must reveal the object before unwinding it; scrolling remains reversible.
const originalBounds = nodes['.sculpture-stage'].getBoundingClientRect;
nodes['.sculpture-stage'].getBoundingClientRect = () => ({ width: 520, height: 520, left: 0, top: -200, bottom: 320 });
browser.scroll();
assert.ok(sculpture.unravel > 0 && sculpture.unravel < 1);
assert.equal(journeys.at(-1).detail.progress, sculpture.unravel);
advance(180);
assert.ok(Array.from(sculpture.projected).every(Number.isFinite), 'The unfolding geometry stays finite');
assert.equal(frames.size, 1, 'Scrolling does not queue a second animation loop');
nodes['.sculpture-stage'].getBoundingClientRect = originalBounds;
browser.scroll();
assert.equal(sculpture.unravel, 0, 'Scrolling back restores the full sculpture');
assert.equal(journeys.at(-1).detail, null);
nodes['.sculpture-stage'].getBoundingClientRect = () => ({ width: 360, height: 300, left: 16, top: 700, bottom: 1000 });
browser.scroll();
assert.equal(sculpture.unravel, 0, 'An unreached phone sculpture does not unfold offscreen');
nodes['.sculpture-stage'].getBoundingClientRect = () => ({ width: 0, height: 0, left: 0, top: 0, bottom: 0 });
browser.scroll();
assert.equal(journeys.at(-1).detail, null, 'Hiding the homepage clears the trail on other routes');
nodes['.sculpture-stage'].getBoundingClientRect = originalBounds;

motion.matches = true;
motion.events.change();
assert.equal(frames.size, 0);
assert.equal(root.dataset.motion, 'reduced');
assert.equal(journeys.at(-1).detail, null, 'Reduced motion clears the connecting trail');
assert.equal(sculpture.viewPointer.x, 0);
assert.equal(sculpture.viewPointer.y, 0);
const waveCount = lightWaves.length;
sculpture.setForm(1);
assert.equal(lightWaves.length, waveCount, 'Reduced motion does not send an animated background wave');
assert.equal(frames.size, 0, 'Reduced-motion users can still choose every form without animation');
assert.deepEqual(Array.from(sculpture.vertices), Array.from(sculpture.geometry[1]));
assert.ok(sculpture.facets.every(face => Number.isFinite(face.depth) && face.light >= 0 && face.light <= 1), 'Surface lighting stays finite on the selected form');
motion.matches = false;
motion.events.change();
assert.equal(frames.size, 1);

document.hidden = true;
document.events.visibilitychange();
assert.equal(frames.size, 0, 'Hidden tabs stop work');
assert.equal(journeys.at(-1).detail, null);
document.hidden = false;
document.events.visibilitychange();
assert.equal(frames.size, 1);
intersection([{ isIntersecting: false }]);
const offscreenPaints = paints;
document.events.themechange();
assert.equal(frames.size, 0, 'Offscreen and other routes stop work');
assert.equal(paints, offscreenPaints);
intersection([{ isIntersecting: true }]);
assert.equal(frames.size, 1, 'Returning to the sculpture resumes one loop');

advance(200);
for (let time = 264; time <= 3000; time += 64) advance(time);
assert.ok(sculpture.energy < .001, 'Arrival settles into a calm, fully connected sculpture');
nodes['.sculpture-stage'].events.click();
assert.equal(root.dataset.effect, 'spark');
for (let time = 3064; time <= 4600; time += 64) advance(time);
assert.ok(sculpture.energy > .9, 'Spark opens the geometry into a particle cloud');
const pulseAge = sculpture.sparkAge;
nodes['.sculpture-stage'].events.click();
assert.equal(sculpture.sparkAge, pulseAge, 'Repeated taps do not restart or stack a running burst');
assert.equal(frames.size, 1);
for (let time = 4664; time <= 6900; time += 64) advance(time);
assert.ok(sculpture.energy < .001, 'The burst reforms automatically');
assert.equal(sculpture.facets.length, 768);
assert.ok(sculpture.facets.every(face => Number.isFinite(face.depth) && Number.isFinite(face.light)));
nodes['.sculpture-stage'].events.click();
motion.matches = true;
motion.events.change();
assert.equal(frames.size, 0);
assert.equal(sculpture.energy, 0, 'Changing the motion preference cancels a burst immediately');
nodes['.sculpture-stage'].events.click();
assert.equal(sculpture.energy, 0, 'No animated burst bypasses reduced motion');

root.classList.values.clear();
canvas.getContext = () => null;
assert.equal(initHeroSculpture(), undefined, 'Unavailable Canvas leaves the static fallback intact');
canvas.getContext = () => context2d;
browser.navigator.hardwareConcurrency = 4;
motion.matches = false;
const compact = initHeroSculpture();
assert.equal(compact.facets.length, 160, 'Modest hardware uses a smaller ribbon surface');
assert.equal(canvas.width, 650, 'Compact rendering stays at 1.25x resolution');
intersection([{ isIntersecting: true }]);
for (const form of [1, 2, 0]) {
    compact.setForm(form);
    motion.matches = true;
    motion.events.change();
    assert.ok(compact.facets.every(face => Number.isFinite(face.depth) && face.light >= 0 && face.light <= 1));
    motion.matches = false;
    motion.events.change();
}
assert.equal(frames.size, 1, 'Compact rendering preserves one animation loop');
intersection([{ isIntersecting: false }]);
assert.equal(frames.size, 0);
console.log('PASS: sculpture geometry, bounded ribbon lighting, reversible scroll unfolding, phone handoff, route cleanup, interpolation, arrival, particle burst, lifecycle, reduced motion, DPI cap and fallback');
