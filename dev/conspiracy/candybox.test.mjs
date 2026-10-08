import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./candybox.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
function game(storage){
 const elements=new Map();const el=name=>{if(!elements.has(name))elements.set(name,{textContent:'',style:{},replaceChildren(...nodes){this.children=nodes;}});return elements.get(name);};
 const context=vm.createContext({console,Date,Math,Number,JSON,Object,Array,Error,localStorage:storage,document:{getElementById:el,createElement:()=>({textContent:''}),addEventListener(){}},setInterval:()=>1,clearInterval(){},confirm:()=>false,location:{reload(){}}});
 vm.runInContext(script,context);return {run:code=>vm.runInContext(code,context),el};
}
test('blocked storage and corrupt JSON preserve the running game',()=>{
 for(const storage of [{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},{getItem(){return '{'},setItem(){}}]){
  const current=game(storage);current.run('state.candies=123;load();save();');assert.equal(current.run('state.candies'),123);
 }
});
test('loading a save ends stale fights and renders imported inventory as text',()=>{
 const valid={candies:12,gold:3,lollipops:0,farm:0,hp:10,hpMax:20,power:0,lollipopCost:10,inventory:['<img src=x onerror=alert(1)>'],weapon:'fists',inFight:true,foeTimer:42,foe:null};
 const current=game({getItem:()=>JSON.stringify(valid),setItem(){}});current.run('load()');
 assert.equal(current.run('state.inFight'),false);assert.equal(current.run('state.foeTimer'),null);
 assert.equal(current.el('inventory').children[0].textContent,'• <img src=x onerror=alert(1)>');
});
test('autosave excludes transient fight and timer state',()=>{
 let saved;const current=game({setItem:(_key,value)=>{saved=JSON.parse(value)}});current.run('state.inFight=true;state.foeTimer=42;save(true)');
 assert.equal(Object.hasOwn(saved,'inFight'),false);assert.equal(Object.hasOwn(saved,'foeTimer'),false);assert.equal(Object.hasOwn(saved,'foe'),false);
});
