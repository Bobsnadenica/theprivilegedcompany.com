import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sampledFrames } from '../scroll-studio.js';
const frames = new Set();
for (let i=0; i<=1500; i++) {
    const {left,right,blend}=sampledFrames(3*i/1500);
    assert.ok(right-left<=1 && right>=left && blend>=0 && blend<=1);
    frames.add(left);
}
assert.equal(frames.size,144);
assert.equal(sampledFrames(-.1).left,0);
assert.equal(sampledFrames(3.1).right,143);
for (const layout of ['wide','tall']) {
    for(let sheet=0;sheet<12;sheet++){
        const file=await readFile(new URL('../assets/field/'+layout+'-'+sheet+'.webp',import.meta.url));
        assert.equal(file.toString('ascii',8,12),'WEBP');
    }
}
console.log('PASS: 144 consecutive camera frames, interpolation and all 24 WebP sheets.');
