import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const navigationSource = source('../js/explosion.js');
const hubSource = source('../js/front_page_map.js');
const workerSource = source('../service-worker.js');

function element(text = '') {
  const classes = new Set();
  return {
    textContent: text, value: '', hidden: false, dataset: {}, events: {}, attributes: {},
    classList: {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle(name, on = !classes.has(name)) { if(on) classes.add(name); else classes.delete(name); }},
    addEventListener(name, listener) { this.events[name] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    hasAttribute(name) { return name in this.attributes; },
    focus() { this.focused = true; }, querySelectorAll() { return []; },
  };
}
function navigation({href = 'https://example.com/dev/converter/', target = '', download = false, reduced = false, noWrapper = false} = {}) {
  const wrapper = element(); const link = element();
  Object.assign(link, {href, target}); if(download) link.attributes.download = '';
  const pending = new Map(); const assigned = []; const lifecycle = {};
  let timer = 0;
  const context = {URL, document:{getElementById: () => noWrapper ? null : wrapper, querySelectorAll:()=>[link]},
    location:{href:'https://example.com/dev/',origin:'https://example.com',pathname:'/dev/',search:'',assign:url=>assigned.push(url)},
    matchMedia:()=>({matches:reduced}), window:{addEventListener:(name,fn)=>lifecycle[name]=fn},
    setTimeout:fn=>{pending.set(++timer,fn);return timer;},clearTimeout:id=>pending.delete(id)};
  vm.runInNewContext(navigationSource,context);
  return {wrapper,link,pending,assigned,lifecycle,click(overrides={}) {
    const event={button:0,preventDefault(){this.defaultPrevented=true;},...overrides};link.events.click(event);return event;
  }, flush(){for(const fn of pending.values())fn();pending.clear();}};
}
test('navigation preserves modifier, non-primary, target, download and external actions', () => {
  for(const modifiers of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]) {
    const nav=navigation();const event=nav.click(modifiers);assert.equal(nav.pending.size,0);assert.equal(nav.wrapper.classList.contains('explode'),false);assert.equal(Boolean(event.defaultPrevented),Boolean(modifiers.defaultPrevented));
  }
  for(const options of [{target:'_blank'},{download:true},{href:'https://other.example/'},{href:'mailto:hello@example.com'},{href:'https://example.com/dev/#games'},{noWrapper:true}]) {
    const nav=navigation(options);assert.equal(nav.click().defaultPrevented,undefined);assert.equal(nav.pending.size,0);
  }
});
test('reduced motion keeps native navigation and normal navigation runs only once', () => {
  const reduced=navigation({reduced:true});assert.equal(reduced.click().defaultPrevented,undefined);assert.equal(reduced.pending.size,0);
  const nav=navigation();assert.equal(nav.click().defaultPrevented,true);assert.equal(nav.wrapper.classList.contains('explode'),true);
  nav.click();assert.equal(nav.pending.size,1);nav.flush();assert.deepEqual(nav.assigned,['https://example.com/dev/converter/']);
});
test('back/forward pageshow clears fade state and pending navigation', () => {
  const nav=navigation();nav.click();nav.lifecycle.pageshow();nav.flush();assert.equal(nav.wrapper.classList.contains('explode'),false);assert.deepEqual(nav.assigned,[]);
});

function hub({search='',stored={},blocked=false}={}) {
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const english=element('Games');english.dataset.bg='Игри';
  const makeCard=(en,bg)=>{const card=element(en);const child=element(en);child.dataset.bg=bg;card.querySelectorAll=()=>[child];return {card,child};};
  const first=makeCard('Learn AI with a useful tool','Учи AI с полезен инструмент');
  const second=makeCard('Play a browser game','Играй игра в браузъра');
  const cards=[first.card,second.card];
  const sections=cards.map(card=>{const section=element();section.querySelectorAll=()=>[card];return section;});
  const translated=[english,first.child,second.child];const writes=[];const registrations=[];const loaded=[];const network=[];const urls=[];
  const root=element();
  const document={documentElement:root,hidden:false,getElementById:node,querySelectorAll:selector=>selector==='[data-bg]'?translated:selector==='.portal-tile'?cards:selector==='.portal-section'?sections:[],addEventListener(){},createElement:()=>element(),head:{append:(...items)=>loaded.push(...items)}};
  const context={document,window:{addEventListener(){}},URL,URLSearchParams,location:{href:`https://example.com/dev/${search}`,search},history:{replaceState:(_,__,url)=>urls.push(String(url))},
    localStorage:{getItem(key){if(blocked)throw new Error('denied');return stored[key]||null;},setItem(key,value){if(blocked)throw new Error('denied');writes.push([key,value]);},removeItem(){if(blocked)throw new Error('denied');}},
    navigator:{serviceWorker:{register:url=>{registrations.push(url);return Promise.resolve();}}},fetch:(...args)=>{network.push(args);throw new Error('Unexpected network');},setTimeout,clearTimeout,AbortController};
  vm.runInNewContext(hubSource,context);
  return {nodes,node,root,english,cards,sections,writes,registrations,loaded,network,urls};
}
test('hub starts and switches EN/BG even when storage is denied', () => {
  const page=hub({search:'?lang=bg',blocked:true});
  assert.equal(page.root.lang,'bg');assert.equal(page.english.textContent,'Игри');
  assert.match(page.node('search-status').textContent,/2 от 2/);
  page.node('language').value='en';page.node('language').events.change();
  assert.equal(page.root.lang,'en');assert.equal(page.english.textContent,'Games');assert.match(page.urls[0],/lang=en/);
  page.node('theme-toggle').events.click();assert.equal(page.root.classList.contains('dark'),false);assert.equal(page.node('theme-toggle').attributes['aria-pressed'],'false');
  assert.equal(page.network.length,0);assert.equal(page.loaded.length,0);
});
test('hub search matches both languages, all words, sections and no-results state', () => {
  const page=hub({stored:{'tpc-language':'bg',theme:'light'}});
  const search=page.node('project-search');search.value='useful AI';search.events.input();
  assert.deepEqual(page.cards.map(card=>card.hidden),[false,true]);assert.deepEqual(page.sections.map(section=>section.hidden),[false,true]);
  search.value='игра браузъра';search.events.input();assert.deepEqual(page.cards.map(card=>card.hidden),[true,false]);
  search.value='<script>alert(1)</script>';search.events.input();assert.equal(page.node('no-results').hidden,false);assert.equal(page.node('clear-search').hidden,false);
  search.events.keydown({key:'Escape'});assert.equal(search.value,'');assert.equal(search.focused,true);assert.equal(page.node('no-results').hidden,true);assert.equal(page.node('clear-search').hidden,true);
  assert.deepEqual(page.cards.map(card=>card.hidden),[false,false]);assert.equal(page.root.classList.contains('dark'),false);
});

function worker({networkResponse=new Response('fresh'),networkError=false,openError=false,cached=null,putError=false}={}) {
  const listeners={};const puts=[];const additions=[];const deletions=[];const fetches=[];const cacheKeys=['tpc-dev-portal-v7','tpc-dev-portal-v8','other-project-cache'];let claimed=false;let skipped=false;
  const cache={addAll:async urls=>additions.push(...urls),put:async(url,response)=>{if(putError)throw new Error('full');puts.push([url,await response.text()]);},match:async()=>cached?.clone()};
  const context={URL,Response,self:{registration:{scope:'https://example.com/dev/'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;}}},
    caches:{open:async()=>{if(openError)throw new Error('storage denied');return cache;},keys:async()=>cacheKeys,delete:async key=>deletions.push(key)},
    fetch:async request=>{fetches.push(request.url);if(networkError)throw new Error('offline');return networkResponse;}};
  vm.runInNewContext(workerSource,context);
  return {puts,additions,deletions,fetches,async lifecycle(name){const jobs=[];listeners[name]({waitUntil:job=>jobs.push(job)});await Promise.all(jobs);return {claimed,skipped};},
    async request(url,method='GET') {const jobs=[];let response;listeners.fetch({request:new Request(url,{method}),waitUntil:job=>jobs.push(job),respondWith:job=>response=job});if(!response)return undefined;const result=await response;await Promise.all(jobs);return result;}};
}
test('worker install owns only explicit hub files and activation preserves other apps', async () => {
  const sw=worker();assert.equal((await sw.lifecycle('install')).skipped,true);
  assert.ok(sw.additions.includes('https://example.com/dev/index.html'));assert.ok(sw.additions.every(url=>!url.includes('/password_game/')));
  assert.equal((await sw.lifecycle('activate')).claimed,true);assert.deepEqual(sw.deletions,['tpc-dev-portal-v7']);
});
test('worker leaves project routes, cross-origin requests and writes untouched',async()=>{
  const sw=worker();for(const [url,method] of [['https://example.com/dev/password_game/index.html','GET'],['https://example.com/dev/cena/products.json','GET'],['https://other.example/dev/index.html','GET'],['https://example.com/dev/index.html','POST']]) assert.equal(await sw.request(url,method),undefined);
  assert.equal(sw.fetches.length,0);assert.equal(sw.puts.length,0);
});
test('worker caches successful canonical hub responses but never HTTP errors',async()=>{
  const success=worker();assert.equal((await success.request('https://example.com/dev/index.html?lang=bg')).status,200);assert.deepEqual(success.puts,[['https://example.com/dev/index.html','fresh']]);assert.equal(success.fetches[0],'https://example.com/dev/index.html?lang=bg');
  const failed=worker({networkResponse:new Response('not found',{status:404}),cached:new Response('old')});assert.equal((await failed.request('https://example.com/dev/index.html')).status,404);assert.equal(failed.puts.length,0);
});
test('worker serves explicit offline cache or truthful 503 without fallback to another app',async()=>{
  const cached=worker({networkError:true,cached:new Response('cached hub')});assert.equal(await(await cached.request('https://example.com/dev/index.html')).text(),'cached hub');
  const absent=worker({networkError:true});assert.equal((await absent.request('https://example.com/dev/index.html')).status,503);
});
test('worker cache-write or cache-open failure cannot break online navigation',async()=>{
  const full=worker({putError:true});assert.equal((await full.request('https://example.com/dev/index.html')).status,200);
  const denied=worker({openError:true});assert.equal((await denied.request('https://example.com/dev/index.html')).status,200);
});
test('manifest icon dimensions match the real existing PNG',()=>{
  const manifest=JSON.parse(source('../manifest.json'));
  for(const icon of manifest.icons.filter(icon=>icon.type==='image/png')) {
    const data=readFileSync(new URL(`../${icon.src}`,import.meta.url));
    assert.equal(data.subarray(1,4).toString(),'PNG');
    const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
    assert.equal(icon.sizes,`${width}x${height}`);assert.equal(width,height,'Use a square launcher icon');
  }
});
