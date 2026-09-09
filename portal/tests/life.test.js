import test from 'node:test';import assert from 'node:assert/strict';
import {validatePerson,validatePeople,lifeSummary} from '../src/life-model.js';
import {createBudgetRepository} from '../src/budget-repository.js';
const p={id:'person',revision:'one',name:'Me',age:32,horizon:80,asOf:'2026-09-10'};
test('year boxes honor custom horizon, newborn age, and ages beyond the horizon',()=>{
 assert.deepEqual(lifeSummary(p),{elapsed:32,remaining:48,boxes:80});assert.equal(lifeSummary({...p,age:0}).remaining,80);assert.deepEqual(lifeSummary({...p,age:90}),{elapsed:90,remaining:0,boxes:90});
 for(const extra of [{age:-1},{age:3.5},{horizon:0},{name:''},{asOf:'bad'}])assert.throws(()=>validatePerson({...p,...extra}));
 assert.throws(()=>validatePeople({version:1,entries:[p,p]}));
});
test('people reload, edit and delete through account storage',async()=>{
 let data={version:1,entries:[]};const make=()=>createBudgetRepository({read:async()=>({ledger:data,etag:'x'}),write:async value=>{data=value}},{entry:validatePerson,ledger:validatePeople});
 await make().commit({id:p.id,entry:p,expectedRevision:null});assert.equal((await make().load()).entries[0].age,32);
 await make().commit({id:p.id,entry:{...p,age:33,revision:'two'},expectedRevision:'one'});assert.equal(data.entries[0].age,33);
 await make().commit({id:p.id,entry:null,expectedRevision:'two'});assert.equal(data.entries.length,0);
});
