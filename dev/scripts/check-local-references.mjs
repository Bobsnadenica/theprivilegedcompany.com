#!/usr/bin/env node
// Audit the project hub and Tech Tools without crawling or contacting external sites.
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const targets = [path.join(root, 'dev/index.html')];
async function collect(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    if (['node_modules','.git'].includes(entry.name)) continue;
    const full=path.join(directory,entry.name);
    if(entry.isDirectory()) await collect(full);
    else if(entry.name.endsWith('.html')) targets.push(full);
  }
}
await collect(path.join(root,'dev/Tech Tools'));
let checked=0;const missing=[];
for(const file of targets) {
  const html=(await readFile(file,'utf8')).replace(/<!--[\s\S]*?-->/g,'');
  for(const match of html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    const reference=match[2].trim().replaceAll('&amp;','&');
    if(!reference || reference.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference) || /[{}<>]/.test(reference)) continue;
    let pathname;try { pathname=decodeURIComponent(reference.split(/[?#]/)[0]); }catch { missing.push({file:path.relative(root,file),reference,reason:'invalid URL escaping'});continue; }
    if(!pathname) continue;
    const resolved=pathname.startsWith('/')?path.resolve(root,`.${pathname}`):path.resolve(path.dirname(file),pathname);
    if(resolved !== root && !resolved.startsWith(root+path.sep)) { missing.push({file:path.relative(root,file),reference,reason:'outside repository'});continue; }
    checked++;
    try {
      const entry=await stat(resolved);
      if(entry.isDirectory()) {
        // Static directory URLs are valid when they contain their own index.
        const index=await stat(path.join(resolved,'index.html'));
        if(!index.isFile()) throw new Error('missing index');
      }
    }catch { missing.push({file:path.relative(root,file),reference,reason:'missing local target'}); }
  }
}
if(missing.length) {
  console.error(JSON.stringify({files:targets.length,checked,missing},null,2));
  process.exitCode=1;
}else console.log(`Validated ${checked} local references across ${targets.length} project-hub and Tech Tools HTML files.`);
