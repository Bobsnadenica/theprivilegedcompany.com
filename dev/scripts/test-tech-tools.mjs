import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=name=>[...readFileSync(new URL(`../Tech Tools/${name}`,import.meta.url),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const assignedHTML=[];
class Element {
  constructor(text=''){this.text=text;this.style={};this.value='';this.dataset={};this.events={};this.childNodes=[];const set=new Set();this.classList={add:name=>set.add(name),remove:name=>set.delete(name),contains:name=>set.has(name),toggle(name,on=!set.has(name)){if(on)set.add(name);else set.delete(name);}};}
  get textContent(){return this.text+this.childNodes.map(child=>child.textContent).join('');}
  set textContent(value){this.text=String(value);this.childNodes=[];}
  get innerHTML(){return escape(this.text)+this.childNodes.map(child=>`<div>${child.innerHTML}</div>`).join('');}
  set innerHTML(value){assignedHTML.push(value);this.childNodes=[];this.text='';}
  replaceChildren(...children){this.childNodes=children;this.text='';}
  append(...children){this.childNodes.push(...children);}
  appendChild(child){this.append(child);}
  addEventListener(name,fn){this.events[name]=fn;}
  focus(){this.focused=true;}
  querySelectorAll(){return [];}
}
function base(){const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};const timers=[];return {nodes,node,timers,context:{document:{getElementById:node,querySelector:node,querySelectorAll:()=>[],createElement:()=>new Element()},matchMedia:()=>({matches:true}),setTimeout:fn=>timers.push(fn),fetch(){throw new Error('These demos must stay local');}}};}
test('REST demo treats hostile JSON as text, uses exact routes and blocks duplicate sends',()=>{
  const env=base();env.node('reqMethod').value='GET';const ctx=vm.createContext(env.context);vm.runInContext(script('rest-api.html'),ctx);
  const send=(method,path,body='')=>{env.node('reqMethod').value=method;env.node('reqPath').value=path;env.node('reqBody').value=body;vm.runInContext('sendRequest()',ctx);};
  const before=assignedHTML.length;
  send('POST','/users',JSON.stringify({name:'<img src=x onerror=alert(1)>',role:'<script>alert(1)</script>'}));
  vm.runInContext('sendRequest()',ctx);assert.equal(env.timers.length,1);env.timers.shift()();
  assert.match(env.node('resStatus').innerText,/201/);assert.equal(vm.runInContext('db.length',ctx),3);assert.match(env.node('dbVisual').textContent,/<img src=x/);assert.equal(assignedHTML.length,before);
  send('GET','/users/1junk');env.timers.shift()();assert.match(env.node('resStatus').innerText,/404/);
  send('GET','/users/1');env.timers.shift()();assert.match(env.node('resStatus').innerText,/200/);
  send('POST','/users','[]');env.timers.shift()();assert.match(env.node('resStatus').innerText,/400/);assert.equal(vm.runInContext('db.length',ctx),3);
  send('DELETE','/users/1/anything');env.timers.shift()();assert.match(env.node('resStatus').innerText,/404/);assert.equal(vm.runInContext('db.length',ctx),3);
});
test('network-layer demo keeps typed markup literal through encapsulation',()=>{
  const env=base();env.node('userMsg').value='<img src=x onerror=alert(1)><script>alert(1)</script>';
  const ctx=vm.createContext(env.context);vm.runInContext(script('network_layers.html'),ctx);const before=assignedHTML.length;
  vm.runInContext('startEncapsulation()',ctx);const data=env.node('packetStage').childNodes[0];assert.equal(data.textContent,env.node('userMsg').value);
  let steps=0;while(env.timers.length){assert.ok(steps++<20);env.timers.shift()();}
  assert.equal(env.node('startBtn').disabled,false);assert.equal(env.node('.info-title').textContent,'Transmission Complete');
  assert.ok(assignedHTML.slice(before).every(html=>!html.includes('<img')&&!html.includes('<script')),'Typed text must never be assigned as HTML');
});
test('Tech Tools multiword search and hints remain local with safe no-results text',async()=>{
  const env=base();const card=(title,description,tags)=>{const item=new Element();item.dataset.tags=tags;const values={h3:new Element(title),p:new Element(description)};item.querySelector=selector=>values[selector];return item;};
  const cards=[card('DNS','Resolve internet domain names','network records'),card('Linux','File system and shells','commands permissions')];
  const sections=cards.map(item=>{const section=new Element();const badge=new Element();section.querySelector=()=>badge;section.querySelectorAll=()=>[item];return section;});
  env.context.document.querySelectorAll=selector=>selector==='.topic-card'?cards:selector==='.category-section'?sections:[];
  env.context.document.addEventListener=(_,fn)=>fn();env.node('searchInput').closest=()=>env.node('search-container');
  vm.runInNewContext(script('index.html'),env.context);
  const search=env.node('searchInput');search.value='domain network';search.events.input();assert.equal(cards[0].classList.contains('hidden'),false);assert.equal(cards[1].classList.contains('hidden'),true);assert.match(env.node('searchStatus').textContent,/1 topic found/);
  const before=assignedHTML.length;search.value='<img src=x>';search.events.input();assert.equal(env.node('no-results').classList.contains('hidden'),false);assert.match(env.node('searchStatus').textContent,/<img src=x>/);assert.equal(assignedHTML.length,before);
  await search.events.keydown({key:'Enter',preventDefault(){}});assert.match(env.node('ai-content-body').textContent,/stays in your browser/);
  await search.events.keydown({key:'Escape'});assert.equal(search.value,'');assert.equal(search.focused,true);assert.ok(cards.every(card=>!card.classList.contains('hidden')));
});
