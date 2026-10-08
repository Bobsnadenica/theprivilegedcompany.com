import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const data = JSON.parse(fs.readFileSync(new URL('./questions.json', import.meta.url)));
function harness() {
  const elements = new Map(), timers = new Map(); let sequence = 0;
  const element = name => {
    if (!elements.has(name)) elements.set(name, { textContent:'', style:{}, dataset:{}, disabled:true, attributes:{}, listeners:{}, classList:{ toggle(){}, add(){}, remove(){} }, setAttribute(k,v){this.attributes[k]=v;}, removeAttribute(k){delete this.attributes[k];}, addEventListener(k,v){this.listeners[k]=v;}, focus(){} });
    return elements.get(name);
  };
  let resolveFetch;
  const response = new Promise(resolve => { resolveFetch = resolve; });
  const context = vm.createContext({ console, URL, URLSearchParams, Math, Set,
    location:{search:'',href:'https://example.com/dev/isitgay/'},history:{replaceState(){}},
    matchMedia:()=>({matches:true}), fetch:()=>response,
    window:{innerWidth:390,addEventListener(){}},
    document:{documentElement:{lang:''},body:{style:{}},getElementById:element,querySelector:element},
    setTimeout:callback=>{timers.set(++sequence,callback);return sequence;},clearTimeout:id=>timers.delete(id)
  });
  vm.runInContext(script, context);
  return { context, element, async ready(){ resolveFetch({ok:true,json:async()=>data}); await new Promise(resolve=>setImmediate(resolve)); }, run(code){return vm.runInContext(code,context);}, flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());} };
}
test('early inputs cannot corrupt the score before questions load', async()=>{
  const game=harness(); game.run("answer('left')");
  assert.equal(game.run('totalPoints'),0);
  assert.equal(game.element('answer-no').disabled,true);
  await game.ready();assert.equal(game.element('answer-no').disabled,false);
});
test('one answer counts once and changing language preserves the current question',async()=>{
  const game=harness();await game.ready();
  const index=game.run('currentIndex'); game.run("answer('left'); answer('left'); setLanguage('bg')");
  assert.equal(game.run('totalPoints'),100);assert.equal(game.run('answeredQuestions'),1);
  assert.equal(game.run('currentIndex'),index);assert.equal(game.element('question').textContent,data.questions_bg[index].text);
  game.flush();assert.equal(game.element('answer-no').disabled,false);
});
test('the eighth no ends the game; restart clears state and old timers',async()=>{
  const game=harness();await game.ready();
  for(let i=0;i<8;i++){game.run("answer('left')");game.flush();}
  assert.equal(game.run('gayFinaleStarted'),true);assert.equal(game.run('totalPoints'),800);
  game.run("answer('left')");assert.equal(game.run('totalPoints'),800);
  game.element('restart').listeners.click();
  assert.equal(game.run('totalPoints'),0);assert.equal(game.run('gayFinaleStarted'),false);
  assert.equal(game.element('answer-no').disabled,false);
});
