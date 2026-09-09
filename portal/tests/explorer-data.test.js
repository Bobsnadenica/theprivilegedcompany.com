import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalogue, validateVisits, validateVisit, filterPlaces } from '../src/bulgaria-model.js';
import { createBudgetRepository } from '../src/budget-repository.js';
import { loadPublicJson } from '../src/public-data.js';
const catalogue=JSON.parse(await readFile(new URL('../src/data/bulgaria-catalogue.json',import.meta.url)));
const geography=JSON.parse(await readFile(new URL('../src/data/bulgaria-geography.json',import.meta.url)));

test('catalogue includes every reviewed programme reference without duplicate physical places',()=>{
  validateCatalogue(catalogue);
  assert.equal(catalogue.places.length,250);
  const references=catalogue.places.flatMap(p=>[p,...p.aliases||[]]);
  assert.equal(references.length,catalogue.sourceEntries);assert.equal(references.length,252);
  assert.equal(new Set(references.map(p=>p.id)).size,252);
  assert.equal(new Set(references.map(p=>p.source)).size,252);
  assert.equal(new Set(catalogue.places.map(p=>p.region)).size,28);
  for(const p of catalogue.places){assert.match(p.bg,/[А-Яа-я]/);assert.match(p.name,/[A-Za-z]/);assert(p.coordinateSource.startsWith('https://'));}
  assert.throws(()=>validateCatalogue({...catalogue,places:catalogue.places.slice(1)}));
  assert.throws(()=>validateCatalogue({...catalogue,places:catalogue.places.map((p,i)=>i===0?{...p,lat:0}:p)}));
});

test('reviewed outliers use the named landmark rather than an unrelated map centre',()=>{
  const place = name=>catalogue.places.find(p=>p.name.includes(name));
  assert(place('Buynovo').lat<42);assert(place('Buynovo').lon>24);
  assert(place('Etropole Clock').lat>42.8);assert(place('Etropole Clock').lon>23.9);
  assert(place('Raysko Praskalo').lat>42.7);
  assert(place('Heraclea').lat<41.5);
  assert(place('Biserna').lon>26.8);
});

test('Bulgarian/English search, official numbers, categories, region and visit status combine',()=>{
  const rila=catalogue.places.find(p=>p.name.includes('Rila Monastery'));
  assert(rila);
  assert(filterPlaces(catalogue.places,{query:'рилски манастир'}).some(p=>p.id===rila.id));
  assert(filterPlaces(catalogue.places,{query:'RILA MONASTERY'}).some(p=>p.id===rila.id));
  assert(filterPlaces(catalogue.places,{query:rila.number}).some(p=>p.id===rila.id));
  const visits=new Set([rila.id]);
  assert.deepEqual(filterPlaces(catalogue.places,{state:'visited',region:rila.region,category:rila.category,visits}).map(p=>p.id),[rila.id]);
  assert(!filterPlaces(catalogue.places,{state:'unvisited',visits}).some(p=>p.id===rila.id));
});

test('landmark check-in and undo preserve legacy city history and ledger metadata',async()=>{
  const city={id:'sofia',revision:'city-one',date:'2025-01-01'};
  let data={version:1,entries:[city],metadata:{history:'retain'}};
  const repo=createBudgetRepository({read:async()=>({ledger:data,etag:'one'}),write:async next=>{data=next}},{entry:validateVisit,ledger:validateVisits});
  const entry={id:catalogue.places[0].id,revision:'new',date:'2026-09-10'};
  await repo.commit({id:entry.id,entry,expectedRevision:null});assert.equal(data.version,2);assert.deepEqual(data.entries[0],city);
  await repo.commit({id:entry.id,entry:null,expectedRevision:'new'});assert.deepEqual(data.entries,[city]);assert.equal(data.metadata.history,'retain');
});

test('bundled geography contains regional boundaries, neighbouring land, rivers and cities',()=>{
  assert.equal(geography.regions.features.length,28);
  assert(geography.countries.features.length>=5);assert(geography.rivers.features.length>0);assert(geography.cities.features.length>10);
  for(const feature of geography.regions.features)assert(feature.properties.bg&&feature.geometry.coordinates.length);
});

function publicCache(){
  const saved=new Map();let fetches=0;
  return {saved,get fetches(){return fetches},storage:{open:async()=>({match:async key=>saved.get(key)?.clone(),put:async(key,response)=>{saved.set(key,response.clone())},delete:async key=>saved.delete(key.url||key),keys:async()=>[...saved.keys()].map(url=>({url}))})},fetcher:async()=>{fetches++;return Response.json({version:1});}};
}
const validate=value=>{if(value.version!==1)throw Error('Invalid');return value};
test('public cache avoids repeat requests, uses versioned URLs, and prunes obsolete assets',async()=>{
  const cache=publicCache(),load=url=>loadPublicJson(url,'public',validate,cache);
  await load('https://local.test/data-v1.json');await load('https://local.test/data-v1.json');assert.equal(cache.fetches,1);
  await load('https://local.test/data-v2.json');assert.equal(cache.fetches,2);assert.equal(cache.saved.size,1);
});
test('invalid, unavailable or full public caches fall back to fetching without hiding errors',async()=>{
  const cache=publicCache(),url='https://local.test/data.json';cache.saved.set(url,Response.json({version:99}));
  await loadPublicJson(url,'public',validate,cache);assert.equal(cache.fetches,1);
  for(const storage of [undefined,{open:async()=>{throw Error('Denied')}},{open:async()=>({match:async()=>null,put:async()=>{throw Error('Full')}})}]){
    assert.deepEqual(await loadPublicJson(url,'public',validate,{storage,fetcher:async()=>Response.json({version:1})}),{version:1});
  }
  await assert.rejects(loadPublicJson(url,'public',validate,{storage:undefined,fetcher:async()=>new Response('',{status:503})}),/Could not load/);
});
