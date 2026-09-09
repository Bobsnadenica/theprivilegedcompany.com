import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetRepository } from '../src/budget-repository.js';
import { domainProgress, daysLeft, nextDue, validateTimer, validateTimers } from '../src/timeto-model.js';
import { migrateDomainTerms } from '../src/domain-migration.js';
import { periodSummary, periodGrid, validatePeople, validatePerson } from '../src/life-model.js';

const period = extra => ({id:'period',revision:'one',name:'A project',startDate:'2024-02-28',endDate:'2024-03-02',unit:'days',...extra});
const domain = extra => ({id:'domain',revision:'one',title:'Domain',group:'Cloudflare domains',date:'2027-02-28',recurrence:'once',amount:null,currency:'EUR',note:'',...extra});
const budgetEntry = extra => ({id:'entry',revision:'one',type:'income',amount:100,currency:'EUR',category:'Salary',date:'2026-09-10',note:'',...extra});

test('domain terms use calendar years, clamp leap anniversaries, and never renew overdue items', () => {
  const e = domain({date:'2024-02-29'});
  assert.deepEqual(domainProgress(e,'2023-02-28'),{start:'2023-02-28',end:'2024-02-29',remaining:366,cycleDays:366,percent:100});
  assert.equal(domainProgress(e,'2024-02-29').percent,0);
  assert.equal(domainProgress(e,'2024-03-01').remaining,0);
  assert.equal(daysLeft(e,'2024-03-01'),-1);
  assert.equal(nextDue(e,'2030-01-01'),'2024-02-29');
  assert.equal(domainProgress(domain({termYears:10}),'2026-01-01').start,'2017-02-28');
  assert.equal(domainProgress(domain(),'1900-01-01').percent,100);
  assert.equal(domainProgress(domain({kind:'countdown'})),null);
  for (const value of [0,11,1.5,'10']) assert.throws(()=>validateTimer(domain({termYears:value})));
  assert.throws(()=>validateTimer(domain({kind:'domain',recurrence:'yearly'})));
});

test('private domain migration preserves expiry, IDs, legacy metadata and unchanged revisions; retry is stable', () => {
  const source={version:1,metadata:{source:'private fixture'},entries:[domain(),domain({id:'exception'}),domain({id:'payment',recurrence:'monthly',group:'Payments'})]};
  const copy=structuredClone(source);
  const migrated=migrateDomainTerms(source,{exception:10},()=> 'new');
  assert.deepEqual(source,copy);
  assert.equal(migrated.entries[0].termYears,1);assert.equal(migrated.entries[1].termYears,10);
  assert.equal(migrated.version,2);assert.deepEqual(migrated.metadata,source.metadata);
  assert.deepEqual(migrated.entries.map(e=>[e.id,e.date]),source.entries.map(e=>[e.id,e.date]));
  assert.equal(migrated.entries[2].revision,'one');assert.deepEqual(migrateDomainTerms(migrated,{},()=> 'unexpected'),migrated);
  assert.throws(()=>migrateDomainTerms(source,{missing:10}));assert.throws(()=>migrateDomainTerms(source,{payment:10}));
  assert.equal(validateTimers(source).version,1);
});

test('inclusive date periods handle leap days, future, current and completed states', () => {
  const e=period();
  assert.deepEqual(periodSummary(e,'2024-02-27'),{total:4,elapsed:0,remaining:4,percent:0,state:'future',untilStart:1});
  assert.equal(periodSummary(e,'2024-02-29').elapsed,1);
  assert.equal(periodSummary(e,'2024-03-02').state,'active');
  assert.equal(periodSummary(e,'2024-03-02').remaining,1);
  assert.equal(periodSummary(e,'2024-03-03').percent,100);
  assert.equal(periodSummary(e,'2024-03-03').state,'completed');
  assert.equal(periodSummary(period({endDate:'2024-02-28'}),'2024-02-28').total,1);
  assert.equal(periodSummary(period({startDate:'2026-03-28',endDate:'2026-03-30'}),'2026-03-29').total,3);
  assert.throws(()=>validatePerson(period({endDate:'2024-02-27'})));
  assert.throws(()=>validatePerson(period({startDate:'2025-02-29'})));
});

test('date grids use partial calendar months and years, and include the end date', () => {
  const e=period();
  const days=periodGrid(e,'2024-02-29');
  assert.deepEqual(days.groups.map(g=>g.cells.length),[2,2]);
  assert.deepEqual(days.groups.flatMap(g=>g.cells.map(c=>c.state)),['elapsed','current','ahead','ahead']);
  const months=periodGrid({...e,unit:'months'},'2024-03-02').groups[0].cells;
  assert.equal(months[0].start,'2024-02-28');assert.equal(months[0].end,'2024-02-29');
  assert.equal(months[1].end,'2024-03-02');assert(months.every(c=>c.partial));
  assert.equal(periodGrid({...e,unit:'years'},'2024-01-01').groups[0].cells[0].state,'ahead');
});

test('large grids paginate without allocating the complete date range', () => {
  const e=period({startDate:'1900-01-01',endDate:'9999-12-31'});
  const days=periodGrid(e,'2024-03-01');
  assert.equal(days.groups.flatMap(g=>g.cells).length,366);assert.equal(days.next,2025);assert.equal(days.previous,2023);
  for(const [unit,max] of [['months',120],['years',100]]) assert(periodGrid({...e,unit},'2024-03-01').groups.flatMap(g=>g.cells).length<=max);
  assert.equal(periodGrid(e,'2024-01-01',9999).next,null);
  assert.equal(periodGrid(e,'2024-01-01',1899).previous,null);
});

test('legacy age records coexist with date periods and retain unrelated fields', () => {
  const old={id:'old',revision:'old',name:'Family',age:40,horizon:85,asOf:'2026-09-10',custom:'keep'};
  const saved=validatePeople({version:1,entries:[old,period()],metadata:{keep:true}});
  assert.equal(saved.version,2);assert.deepEqual(saved.entries[0],old);assert.equal(saved.metadata.keep,true);
});

test('read cache lasts 60 seconds, returns copies, supports force refresh and is account scoped', async () => {
  let reads=0,clock=1000;const source={version:1,entries:[budgetEntry()]};
  const a=createBudgetRepository({read:async()=>{reads++;return{ledger:structuredClone(source),etag:'1'}},write:async()=>{}},{},{now:()=>clock});
  const first=await a.load();first.entries.length=0;
  assert.equal((await a.load()).entries.length,1);assert.equal(reads,1);
  clock+=59999;await a.load();assert.equal(reads,1);
  clock++;await a.load();assert.equal(reads,2);
  await a.load({force:true});assert.equal(reads,3);
  a.clear();await a.load();assert.equal(reads,4);
  const b=createBudgetRepository({read:async()=>({ledger:{version:1,entries:[]},etag:'1'}),write:async()=>{}});
  assert.equal((await b.load()).entries.length,0);
});

test('coalesced reads cannot repopulate a cache cleared on logout', async () => {
  let resolve,reads=0;const waiting=new Promise(r=>{resolve=r});
  const repo=createBudgetRepository({read:async()=>{reads++;await waiting;return{ledger:{version:1,entries:[]},etag:'1'}},write:async()=>{}});
  const a=repo.load(),b=repo.load();assert.equal(reads,1);repo.clear();resolve();await Promise.all([a,b]);
  await repo.load();assert.equal(reads,2);
});

test('writes always recheck S3, cache only confirmed saves, and preserve concurrent additions', async () => {
  let data={version:1,entries:[]},reads=0,fail=false;
  const repo=createBudgetRepository({read:async()=>{reads++;return{ledger:structuredClone(data),etag:'current'}},write:async next=>{if(fail)throw new Error('Offline');data=next}});
  await repo.load();data.entries.push(budgetEntry({id:'other'}));
  await repo.commit({id:'entry',entry:budgetEntry(),expectedRevision:null});
  assert.equal(reads,2);assert.equal((await repo.load()).entries.length,2);assert.equal(reads,2);
  fail=true;await assert.rejects(repo.commit({id:'entry',entry:budgetEntry({revision:'two',amount:900}),expectedRevision:'one'}),/Offline/);
  assert.equal((await repo.load()).entries.find(e=>e.id==='entry').amount,100);assert.equal(reads,4);
});
