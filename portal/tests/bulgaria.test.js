import test from 'node:test';import assert from 'node:assert/strict';
import {PLACES,validateVisit,validateVisits} from '../src/bulgaria-model.js';
import {createBudgetRepository} from '../src/budget-repository.js';
const visit={id:'sofia',revision:'first',date:'2026-09-09'};
test('starter places have unique IDs and visits reject invalid dates or unknown places',()=>{
 assert.equal(PLACES.length,12);assert.equal(new Set(PLACES.map(p=>p.id)).size,12);
 assert.throws(()=>validateVisit({...visit,id:'unknown'}));assert.throws(()=>validateVisit({...visit,date:'2026-02-30'}));assert.throws(()=>validateVisits({version:1,entries:[visit,visit]}));
});
test('check-ins survive fresh sessions, merge distinct places and undo safely',async()=>{
 let data={version:1,entries:[]},version=0;
 const storage={read:async()=>({ledger:structuredClone(data),etag:String(version)}),write:async(next,etag)=>{if(etag!==String(version))throw {$metadata:{httpStatusCode:412}};data=structuredClone(next);version++}};
 const repo=()=>createBudgetRepository(storage,{entry:validateVisit,ledger:validateVisits});
 await Promise.all([repo().commit({id:'sofia',entry:visit,expectedRevision:null}),repo().commit({id:'varna',entry:{...visit,id:'varna'},expectedRevision:null})]);
 assert.equal((await repo().load()).entries.length,2);
 await repo().commit({id:'sofia',entry:null,expectedRevision:'first'});assert.deepEqual(data.entries.map(e=>e.id),['varna']);
});
