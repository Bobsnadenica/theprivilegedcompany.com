import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDue,daysLeft,validateTimer,validateTimers} from '../src/timeto-model.js';
import {createBudgetRepository} from '../src/budget-repository.js';
const timer=(extra={})=>({id:'timer',revision:'one',title:'Renewal',group:'Personal',date:'2026-01-31',recurrence:'monthly',amount:null,currency:'EUR',note:'',...extra});
test('recurring countdowns clamp month ends and leap years without date drift',()=>{
 assert.equal(nextDue(timer(),'2026-02-01'),'2026-02-28');assert.equal(nextDue(timer(),'2026-03-01'),'2026-03-31');
 assert.equal(nextDue(timer({date:'2024-02-29',recurrence:'yearly'}),'2025-01-01'),'2025-02-28');
 assert.equal(nextDue(timer({date:'2027-02-01',recurrence:'yearly'}),'2026-09-09'),'2027-02-01');
 assert.equal(daysLeft(timer({recurrence:'once',date:'2026-09-08'}),'2026-09-09'),-1);
 assert.equal(daysLeft(timer({date:'2026-09-09',recurrence:'once'}),'2026-09-09'),0);
 assert.equal(nextDue(timer({recurrence:'never',date:''})),null);
});
test('countdowns validate and preserve private migration metadata through edits',async()=>{
 assert.throws(()=>validateTimer(timer({date:'2026-02-30'})));assert.throws(()=>validateTimer(timer({amount:-1})));assert.throws(()=>validateTimers({version:1,entries:[timer(),timer()]}));
 let value={version:1,entries:[timer()],migration:{sourceText:'private fixture'}};
 const repo=createBudgetRepository({read:async()=>({ledger:value,etag:'one'}),write:async data=>{value=data}},{entry:validateTimer,ledger:validateTimers});
 await repo.commit({id:'timer',expectedRevision:'one',entry:timer({revision:'two',title:'Updated'})});
 assert.equal((await repo.load()).migration.sourceText,'private fixture');assert.equal(value.entries[0].title,'Updated');
 await repo.commit({id:'timer',expectedRevision:'two',entry:null});assert.equal(value.entries.length,0);
});
