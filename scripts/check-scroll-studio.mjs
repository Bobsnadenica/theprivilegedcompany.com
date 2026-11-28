import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../scroll-studio.js', import.meta.url), 'utf8');
const listeners = {};
const variables = new Map();
const frames = new Map();
let intersection, nextFrame = 0, top = 100;
const stage = { offsetHeight: 500, style: { setProperty(key, value) { variables.set(key, Number(value)); } } };
const journey = { offsetHeight: 1500, querySelector: () => stage, getBoundingClientRect: () => ({top}) };
const motion = {matches: false, addEventListener(_, fn) { listeners.motion = fn; }};
const context = {
    document: { hidden: false, querySelector: () => journey, addEventListener() {} },
    matchMedia: () => motion, getComputedStyle: () => ({top: '100px'}),
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(type, fn) { listeners[type] = fn; },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} },
    ResizeObserver: class { observe() {} }
};
vm.runInNewContext(source.replace('export ', '') + '\ninitScrollStudio()', context);
function flush() { for (const fn of frames.values()) fn(); frames.clear(); }
intersection([{isIntersecting: true}]); flush();
assert.equal(variables.get('--opening'), 0);
top = -400; listeners.scroll(); listeners.scroll(); assert.equal(frames.size, 1); flush();
assert.equal(variables.get('--opening'), 1);
top = -900; listeners.scroll(); flush(); assert.equal(variables.get('--opening'), 0);
top = -400; listeners.scroll(); flush(); assert.equal(variables.get('--opening'), 1);
listeners.scroll(); intersection([{isIntersecting: false}]); assert.equal(frames.size, 0);
intersection([{isIntersecting: true}]); motion.matches = true; listeners.motion(); flush();
listeners.scroll(); assert.equal(frames.size, 0);
console.log('PASS: optics open, reassemble and reverse; offscreen cancellation and static reduced motion');
