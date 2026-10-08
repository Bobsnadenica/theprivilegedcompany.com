import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(file) {
  const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
  const elements = new Map(), intervals = new Map(), timeouts = new Map(); let id = 0;
  const node = () => ({ textContent:'',innerText:'',innerHTML:'',checked:false,style:{},children:[],classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(child){this.children.push(child);},prepend(child){this.children.unshift(child);},remove(){},get lastElementChild(){return this.children.at(-1);}});
  const el = name => { if(!elements.has(name))elements.set(name,node()); return elements.get(name); };
  const context = vm.createContext({ console, document:{getElementById:el,createElement:node}, setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:key=>intervals.delete(key),setTimeout:fn=>{timeouts.set(++id,fn);return id;},clearTimeout:key=>timeouts.delete(key) });
  scripts.forEach(script=>vm.runInContext(script,context));
  return {el,run:code=>vm.runInContext(code,context),intervals,tick(){[...intervals.values()].forEach(fn=>fn());},flush(){const next=[...timeouts.values()];timeouts.clear();next.forEach(fn=>fn());}};
}
test('CI/CD only reports deployment after the deploy stage actually ran',()=>{
  const game=harness('cicd.html');game.run("addNode('build');runPipeline()");game.tick();game.tick();
  assert.match(game.el('log').innerText,/Add a deploy stage/);
  game.run("reset();addNode('build');addNode('test');addNode('deploy');runPipeline()");for(let i=0;i<4;i++)game.tick();
  assert.match(game.el('log').innerText,/Demo complete/);
});
test('reset cancels a running pipeline and failed ordering does not report success',()=>{
  const game=harness('cicd.html');game.run("addNode('build');runPipeline();reset()");game.tick();
  assert.equal(game.el('log').innerText,'> Pipeline reset.');assert.equal(game.intervals.size,0);
  game.run("addNode('deploy');runPipeline()");game.tick();assert.match(game.el('log').innerText,/DANGER/);
});
test('IAM explicit deny overrides a broad allow; Write is independently testable',()=>{
  const game=harness('iam.html');game.el('permAdmin').checked=true;game.el('permDenyDelete').checked=true;
  game.run("attemptAction('delete')");game.flush();assert.equal(game.el('statusMsg').innerText,'ACCESS DENIED');
  game.el('permAdmin').checked=false;game.el('permWrite').checked=true;
  game.run("attemptAction('write')");game.flush();assert.equal(game.el('statusMsg').innerText,'ACCESS GRANTED');
  game.run("attemptAction('read')");game.flush();assert.equal(game.el('statusMsg').innerText,'ACCESS DENIED');
});
test('GraphQL mock returns only selected fields and rejects invalid or unsupported input',()=>{
  const game=harness('graphql.html');const query=value=>{game.el('queryInput').value=value;game.run('fetchData()');return JSON.parse(game.el('output').textContent);};
  assert.deepEqual(query('query { user(id: 1) { name age } }'),{data:{user:{name:'Alice',age:29}}});
  assert.deepEqual(query('{ user(id: 1) { posts { title } } }'),{data:{user:{posts:[{title:'Hello World'}]}}});
  for(const value of ['name','{user(id: 1){username}}','{user(id: 2){name}}','<img onerror=alert(1)>','{user(id: 1){}}'])assert.ok(query(value).errors);
});
