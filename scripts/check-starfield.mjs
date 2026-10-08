// Run with node scripts/check-starfield.mjs. Uses the actual renderer and a controlled clock.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('class QuantumWeb'), source.indexOf('/**\n * Telemetry Log Engine'));
function scene({ width = 1440, height = 1000, cores = 8, saveData = false, reduced = false, context = true } = {}) {
    const events = new Map(), frames = new Map();
    let frame = 0, paints = 0;
    const ctx = Object.fromEntries(['setTransform', 'arc', 'ellipse', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'fillRect'].map(method => [method, (...args) => {
        assert.ok(args.every(Number.isFinite), `${method}: all coordinates remain finite`);
    }]));
    Object.assign(ctx, { clearRect() { paints++; }, beginPath() {}, stroke() {}, fill() {} });
    ctx.drawImage = (_, ...coordinates) => assert.ok(coordinates.every(Number.isFinite));
    ctx.createRadialGradient = (...args) => {
        assert.ok(args.every(Number.isFinite));
        return { addColorStop(offset) { assert.ok(offset >= 0 && offset <= 1); } };
    };
    ctx.createLinearGradient = ctx.createRadialGradient;
    const canvas = { dataset: {}, style: {}, getContext: () => context ? ctx : null };
    const doc = { hidden: false, documentElement: { dataset: {} }, getElementById: () => canvas,
        createElement: () => ({ getContext: () => ctx }),
        addEventListener: (name, fn) => events.set(name, fn) };
    const media = { matches: reduced, addEventListener: (_, fn) => events.set('motion', fn) };
    const sandbox = {
        document: doc, navigator: { hardwareConcurrency: cores, connection: { saveData } },
        window: { innerWidth: width, innerHeight: height, devicePixelRatio: 3,
            addEventListener: (name, fn) => events.set(name, fn),
            matchMedia: query => query.includes('reduced-motion') ? media : { matches: false } },
        getComputedStyle: () => ({ getPropertyValue: () => '216, 174, 105' }),
        requestAnimationFrame: callback => { frames.set(++frame, callback); return frame; },
        cancelAnimationFrame: id => frames.delete(id), performance: { now: () => 10000 },
        setTimeout() {}, clearTimeout() {}
    };
    const field = vm.runInNewContext(renderer + '; new QuantumWeb("bg-canvas");', sandbox);
    const advance = timestamp => {
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach(callback => callback(timestamp));
    };
    return { field, canvas, doc, events, media, frames, advance, get paints() { return paints; } };
}

const desktop = scene();
assert.equal(desktop.field.particles.length, 1100);
assert.equal(desktop.canvas.width, 2160);
assert.equal(new Set(desktop.field.particles.map(star => star.layer)).size, 3);
assert.equal(desktop.frames.size, 1);
const cachedGlow = desktop.field.starGlow;
assert.equal(cachedGlow.width, 64);
assert.equal(cachedGlow.height, 64);
for (const options of [{ width: 390, height: 844 }, { cores: 4 }, { saveData: true }]) {
    const sample = scene(options);
    assert.ok(sample.field.particles.length <= (options.width ? 240 : 480));
    assert.equal(sample.field.dpr, 1.25);
    assert.equal(sample.field.frameInterval, 33);
}

// Particle travel must not speed up on high-refresh displays or slow down on phones.
const travel = hz => {
    const sample = scene();
    const star = sample.field.particles[0];
    Object.assign(star, { x: 200, y: 200, depth: .8 });
    sample.field.particles = [star];
    for (let i = 1; i <= hz; i++) sample.advance(i * 1000 / hz);
    return [star.x, star.y];
};
const sixty = travel(60);
for (const hz of [30, 120]) assert.ok(travel(hz).every((value, axis) => Math.abs(value - sixty[axis]) < 1e-6));

desktop.events.get('pointermove')({ pointerType: 'mouse', clientX: 1300, clientY: 900 });
for (let i = 1; i <= 90; i++) desktop.advance(i * 1000 / 60);
assert.equal(desktop.field.starGlow, cachedGlow, 'Star glow is reused between frames');
assert.ok(desktop.field.offset.x > 0 && desktop.field.offset.x < 22);
assert.ok(desktop.field.offset.y > 0 && desktop.field.offset.y < 17);
for (let i = 0; i < 20; i++) desktop.events.get('pointerdown')({ clientX: 720, clientY: 500 });
assert.equal(desktop.field.ripples.length, 3, 'Repeated clicks cannot accumulate effects');
assert.equal(desktop.field.gravityEnergy, 1, 'Repeated clicks cap gravity energy');
desktop.events.get('blur')();
assert.equal(desktop.field.mouse.x, null);
for (let i = 91; i <= 390; i++) desktop.advance(i * 1000 / 60);
assert.equal(desktop.field.ripples.length, 0);
assert.ok(Math.abs(desktop.field.offset.x) < .001);
assert.equal(desktop.frames.size, 1);

desktop.media.matches = true; desktop.events.get('motion')();
assert.equal(desktop.frames.size, 0);
assert.ok(desktop.field.particles.length <= 220);
const still = JSON.stringify(desktop.field.particles);
desktop.events.get('pointermove')({ pointerType: 'mouse', clientX: 200, clientY: 400 });
desktop.events.get('pointerdown')({ clientX: 200, clientY: 400 });
desktop.events.get('themechange')();
assert.equal(JSON.stringify(desktop.field.particles), still, 'Reduced motion freezes positions and pointer effects');
assert.equal(desktop.field.ripples.length, 0);
desktop.media.matches = false; desktop.events.get('motion')();
assert.equal(desktop.frames.size, 1);
desktop.doc.hidden = true; desktop.events.get('visibilitychange')();
assert.equal(desktop.frames.size, 0);
const before = JSON.stringify(desktop.field.particles);
desktop.doc.hidden = false; desktop.events.get('visibilitychange')();
assert.equal(JSON.stringify(desktop.field.particles), before, 'Returning to the tab does not fast-forward the scene');
assert.equal(desktop.frames.size, 1);
assert.equal(scene({ context: false }).frames.size, 0, 'Unavailable Canvas keeps the CSS background usable');

const gravity = scene();
const orbiting = gravity.field.particles[0];
Object.assign(orbiting, { x: 920, y: 500, depth: .8 });
gravity.field.particles = [orbiting];
gravity.events.get('pointermove')({ pointerType: 'mouse', clientX: 720, clientY: 500 });
for (let i = 1; i <= 40; i++) gravity.advance(i * 1000 / 60);
assert.ok(Math.hypot(orbiting.x - 720, orbiting.y - 500) < 160, 'Nearby stars travel inward');
assert.ok(orbiting.y > 520, 'Infall visibly curves around the pointer');
assert.equal(gravity.canvas.dataset.gravity, 'active');
for (let i = 41; i <= 240; i++) gravity.advance(i * 1000 / 60);
assert.ok(gravity.field.captured > 0, 'Stars are swallowed at the dark core');
assert.equal(gravity.field.particles.length, 1, 'Swallowed particles recycle without growing the population');
assert.ok(Number.isFinite(orbiting.x) && Number.isFinite(orbiting.y));
gravity.events.get('pointermove')({ pointerType: 'mouse', clientX: 4, clientY: 4 });
for (let i = 241; i <= 320; i++) gravity.advance(i * 1000 / 60);
assert.equal(gravity.frames.size, 1, 'Rapid pointer changes keep one animation loop');
gravity.events.get('blur')(); gravity.advance(5400);
assert.equal(gravity.canvas.dataset.gravity, 'idle');
const phone = scene({ width: 390, height: 844 });
phone.events.get('pointermove')({ pointerType: 'touch', clientX: 150, clientY: 350 });
phone.advance(40);
assert.equal(phone.canvas.dataset.gravity, 'idle', 'Phone scrolling does not activate a persistent gravity well');

const calm = scene(), pulse = scene();
for (const sample of [calm, pulse]) {
    const star = sample.field.particles[0];
    Object.assign(star, { x: 920, y: 500, depth: .8 });
    sample.field.particles = [star];
    sample.events.get('pointermove')({ pointerType: 'mouse', clientX: 720, clientY: 500 });
}
const click = { pointerType: 'mouse', button: 0, clientX: 720, clientY: 500 };
for (const ignored of [{ ...click, target: { closest: () => ({}) } }, { ...click, button: 2 }, { ...click, pointerType: 'touch' }]) {
    pulse.events.get('pointerdown')(ignored);
    assert.equal(pulse.field.gravityEnergy, 0, 'Controls, secondary clicks and touch scrolling do not trigger a pulse');
    assert.equal(pulse.field.ripples.length, 0);
}
pulse.events.get('pointerdown')(click);
for (let i = 1; i <= 30; i++) { calm.advance(i * 1000 / 60); pulse.advance(i * 1000 / 60); }
const distance = sample => Math.hypot(sample.field.particles[0].x - 720, sample.field.particles[0].y - 500);
assert.ok(distance(pulse) < distance(calm) - 8, 'Click briefly strengthens the inward pull');
assert.ok(pulse.field.gravityEnergy > 0 && pulse.field.gravityEnergy < .25);
for (let i = 31; i <= 200; i++) pulse.advance(i * 1000 / 60);
assert.equal(pulse.field.gravityEnergy, 0, 'The gravity pulse returns to the calm baseline');
assert.equal(pulse.field.ripples.length, 0);
assert.equal(pulse.field.particles.length, 1);
assert.equal(pulse.frames.size, 1);
const connected = scene();
connected.events.get('sculpturechange')({ detail: { x: 1000, y: 400 } });
assert.equal(connected.field.ripples.length, 1, 'A new sculpture form sends one light wave through the background');
assert.equal(connected.field.gravityEnergy, 0, 'Shape changes do not move or activate the cursor');
for (const detail of [{ x: NaN, y: 400 }, { x: 100, y: -1 }, { x: 1500, y: 400 }, {}]) {
    connected.events.get('sculpturechange')({ detail });
}
assert.equal(connected.field.ripples.length, 1, 'Invalid or offscreen origins are ignored');
connected.doc.hidden = true; connected.events.get('visibilitychange')();
connected.events.get('sculpturechange')({ detail: { x: 500, y: 400 } });
assert.equal(connected.field.ripples.length, 1, 'Hidden pages do not queue extra waves');
connected.media.matches = true; connected.events.get('motion')();
connected.events.get('sculpturechange')({ detail: { x: 500, y: 400 } });
assert.equal(connected.field.ripples.length, 0, 'Reduced motion keeps the background composed and still');

const flowing = scene();
flowing.events.get('sculpturejourney')({ detail: { x: 1100, y: 300, endY: 1200, progress: .8 } });
for (let i = 1; i < 90; i++) flowing.advance(i * 1000 / 60);
assert.equal(flowing.frames.size, 1, 'The scroll trail shares the existing frame loop');
assert.equal(flowing.field.particles.length, 1100, 'Flowing threads add no particles');
for (const detail of [null, {}, { x: 500, y: 300, endY: NaN, progress: .5 }, { x: 500, y: 300, endY: 100, progress: .5 }, { x: 500, y: 0, endY: 1000, progress: 2 }]) {
    flowing.events.get('sculpturejourney')({ detail });
    assert.equal(flowing.field.journey, null, 'Absent or malformed paths cannot leave a stale trail');
}
flowing.media.matches = true; flowing.events.get('motion')();
flowing.events.get('sculpturejourney')({ detail: { x: 1100, y: 300, endY: 1200, progress: .8 } });
assert.equal(flowing.frames.size, 0, 'A trail event cannot bypass reduced motion');
console.log('PASS: star layers, bounded rendering and lensing, refresh-independent drift, inward spirals, capture/recycling, bounded click pulse, shared scroll trails, control exclusion, reduced motion, phone fallback and hidden-tab lifecycle.');
