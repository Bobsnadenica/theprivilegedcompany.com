import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { convertAmount, validateReference } from './currency.mjs';
import { parseLinksDocument } from '../Archive/assets/js/links-parser.mjs';

const require = createRequire(import.meta.url);
const { normalizeLists, normalizeCards, validPrice } = require('../cena/data-safety.js');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
let count = 0;
const test = async (name, run) => { await run(); count++; console.log(`PASS ${name}`); };

await test('currency: offline fixed conversions, zero and same-currency USD', () => {
  assert.equal(convertAmount(1, 'EUR', 'BGN'), 1.95583);
  assert.equal(convertAmount(1.95583, 'BGN', 'EUR'), 1);
  assert.equal(convertAmount(0, 'EUR', 'USD', 1.1), 0);
  assert.equal(convertAmount(100, 'USD', 'USD'), 100);
  assert.equal(convertAmount(110, 'USD', 'EUR', 1.1).toFixed(2), '100.00');
});
await test('currency: rejects invalid amounts/rates and discloses old references', () => {
  for (const value of [-1, NaN, Infinity, 1e13]) assert.throws(() => convertAmount(value, 'EUR', 'BGN'));
  assert.throws(() => convertAmount(100, 'USD', 'EUR'));
  assert.throws(() => validateReference({base:'USD',rates:{USD:1},date:'2026-01-01'}));
  assert.throws(() => validateReference({base:'EUR',rates:{USD:-1},date:'2026-01-01'}));
  assert.equal(validateReference({base:'EUR',rates:{USD:1.1},date:'2000-01-01'}).stale, true);
});
await test('archive: malformed escapes and Cyrillic categories remain usable', () => {
  const result = parseLinksDocument('Книги:\nhttps://example.com/%E0%A4%A\nНаука:\nhttps://example.org/');
  assert.equal(result.summary.totalLinks, 2);
  assert.notEqual(result.categories[0].id, result.categories[1].id);
  assert.match(result.categories[0].links[0].note, /%E0/);
});
await test('archive: refuses executable links and embedded credentials', () => {
  assert.throws(() => parseLinksDocument('javascript:alert(1)'));
  assert.throws(() => parseLinksDocument('https://someone:secret@example.com/'));
});
await test('Spesti: corrupt storage, duplicate lists and hostile keys are bounded', () => {
  assert.equal(normalizeLists({lists:{length:1}}), null);
  const normalized = normalizeLists({activeId:'missing', lists:[
    {id:'list1',name:'Groceries',items:['x','x','__proto__','z'],quantities:{x:10000,z:-2}},
    {id:'list1',items:[]}, {id:'__proto__'}, {id:'list2',items:{bad:true}}
  ]});
  assert.equal(normalized.activeId,'list1');
  assert.equal(normalized.lists.length,2);
  assert.deepEqual(normalized.lists[0].items,['x','z']);
  assert.equal(normalized.lists[0].quantities.x,999);
  assert.equal(normalized.lists[0].quantities.z,undefined);
  assert.deepEqual(normalized.lists[1].items,[]);
  assert.deepEqual(normalizeCards({},['store']),[]);
  assert.deepEqual(normalizeCards([null,{storeId:'store',number:1}],['store']),[]);
  for(const price of [0,-1,NaN,Infinity,'1.20']) assert.equal(validPrice(price),false);
  assert.equal(validPrice(1.20),true);
});

function node() { return { textContent:'',value:'',dataset:{},className:'',disabled:false,open:false,hidden:false,classList:{add(){},remove(){}},querySelector(){return node();},querySelectorAll(){return [];},addEventListener(){},replaceChildren(){},close(){this.open=false;} }; }
function environment() {
  const nodes = new Map();
  const byId = id => { if(!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); };
  const window = {setTimeout,clearTimeout};
  return {nodes,window,document:{querySelector:byId,getElementById:byId,addEventListener(){}}, URL,AbortController,setTimeout,clearTimeout,console,Intl};
}
await test('short links: rejects unsafe destinations and off-domain service responses', () => {
  const html=read('../shorturl/index.html');
  const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const env=environment();
  env.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  const ctx=vm.createContext(env);vm.runInContext(script,ctx);
  assert.equal(vm.runInContext('getKey()',ctx),'');
  vm.runInContext('saveKey()',ctx);
  for (const value of ['javascript:alert(1)','data:text/html,x','https://u:p@example.com/']) {
    ctx.value=value; assert.throws(()=>vm.runInContext('safeDestination(value)',ctx));
  }
  ctx.value='https://go.theprivilegedcompany.com/abc';
  assert.equal(vm.runInContext('safeShortUrl(value)',ctx),ctx.value);
  ctx.value='https://go.theprivilegedcompany.com.attacker.example/abc';
  assert.throws(()=>vm.runInContext('safeShortUrl(value)',ctx));
});
await test('market dashboard: unloaded controls, unsafe data and HTML text', () => {
  const ctx=vm.createContext(environment());
  vm.runInContext(read('../Trading/app.js').replace(/\nloadDashboard\(\);\s*$/,''),ctx);
  vm.runInContext('renderAssets(); renderAll();',ctx);
  const payload=JSON.parse(read('../Trading/data/analysis.json')); payload.generated_at=new Date().toISOString();
  ctx.payload=payload;vm.runInContext('validatePayload(payload)',ctx);
  payload.assets[0].signals.one_day.strength='<img src=x>';
  assert.throws(()=>vm.runInContext('validatePayload(payload)',ctx));
  payload.assets[0].signals.one_day.strength=80;
  payload.assets[0].metrics.rsi14=null;
  assert.throws(()=>vm.runInContext('validatePayload(payload)',ctx));
  assert.match(vm.runInContext('metricCard("test", "<img src=x>")',ctx), /&lt;img/);
});
await test('Privacy Mirror: blocked storage and late media permissions after clearing', async () => {
  const env=environment(); let resolveMedia; let stopped=false;
  env.navigator={mediaDevices:{getUserMedia:()=>new Promise(resolve=>{resolveMedia=resolve;})}};
  Object.defineProperty(env.window,'localStorage',{get(){throw new Error('denied');}});
  const ctx=vm.createContext(env);vm.runInContext(read('../whoami/whoami.js'),ctx);
  assert.equal(vm.runInContext('storageWorks("localStorage")',ctx),false);
  vm.runInContext('state.report={local:{},grantedData:{}}',ctx);
  const pending=vm.runInContext('requestMedia("camera", null)',ctx);
  vm.runInContext('state.report=null',ctx);
  resolveMedia({getVideoTracks:()=>[{getSettings:()=>({})}],getTracks:()=>[{stop(){stopped=true;}}]});
  await pending;
  assert.equal(stopped,true);
  assert.equal(vm.runInContext('state.report',ctx),null);
});
await test('Privacy Mirror: late network response cannot restore a cleared report', async () => {
  const env=environment();env.navigator={}; const ctx=vm.createContext(env);
  vm.runInContext(read('../whoami/whoami.js'),ctx);
  vm.runInContext('state.report={local:{},meta:{},grantedData:{}}; lookupPublicIp=()=>Promise.resolve({ip:"example"}); testWebSocket=()=>Promise.resolve({}); discoverWebRtcAddresses=()=>Promise.resolve({});',ctx);
  const pending=vm.runInContext('runNetworkScan(null)',ctx);
  vm.runInContext('state.report=null',ctx);
  await pending;
  assert.equal(vm.runInContext('state.report',ctx),null);
  assert.equal(vm.runInContext('state.busy',ctx),false);
});
console.log(`Validated ${count} utility regression groups.`);
