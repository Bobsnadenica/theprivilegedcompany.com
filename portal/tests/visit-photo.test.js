import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVisitPhoto} from '../src/visit-photo.js';
import {validateVisits,validateVisit,photoVisit} from '../src/bulgaria-model.js';
import {visitPhotoStorageAdapter} from '../src/visit-photo-storage.js';
import {createBudgetRepository} from '../src/budget-repository.js';
import {commitPhotoVisit} from '../src/visit-save.js';
import {recommendPlaces} from '../src/explorer-location.js';
const photo={id:'11111111-1111-4111-8111-111111111111',type:'image/jpeg',bytes:3,width:3,height:1,sha256:'a'.repeat(64)};
const entry={id:'bts-333',revision:'visit-1',date:'2026-09-10',photo};
const blob=new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'});
const draft=()=>({change:{id:entry.id,expectedRevision:null,entry:structuredClone(entry)},upload:{photo,blob},uploaded:false});
function store(){let data={version:2,metadata:{preserve:true},entries:[{id:'sofia',revision:'city',date:'2025-05-01'}]},version=1;return {read:async()=>({ledger:structuredClone(data),etag:String(version)}),write:async(next,etag)=>{if(etag!==String(version))throw {$metadata:{httpStatusCode:412}};data=structuredClone(next);version++}}}
const repository=s=>createBudgetRepository(s,{entry:validateVisit,ledger:validateVisits});
test('photo check-ins require evidence while older records and metadata stay readable',()=>{
 assert.throws(()=>photoVisit({...entry,photo:undefined}),/Add a photo/);
 const older={id:'sofia',revision:'old',date:'2025-02-01',note:'Keep me'};
 const ledger=validateVisits({version:2,metadata:{keep:true},entries:[older,entry]});
 assert.equal(ledger.version,3);assert.equal(ledger.entries[0],older);assert.equal(ledger.metadata.keep,true);
 assert.equal(validateVisits({version:3,entries:[older]}).version,3);
 assert.throws(()=>validateVisitPhoto({...photo,id:'../../another-account'}));assert.throws(()=>validateVisitPhoto({...photo,type:'image/svg+xml'}));assert.throws(()=>validateVisitPhoto({...photo,bytes:9000000}));assert.throws(()=>validateVisitPhoto({...photo,width:4000}));
});
test('private photo requests use a captured account path, immutable upload and no-store reads',async()=>{
 const calls=[];const client={send:async command=>{calls.push(command);return {ContentType:'image/jpeg',ContentLength:3,Body:{transformToByteArray:async()=>new Uint8Array([1,2,3])}}}};
 const a=visitPhotoStorageAdapter(client,'fixture','users/account-a/'),b=visitPhotoStorageAdapter(client,'fixture','users/account-b/');
 await a.upload(photo,blob);await b.read(photo);await a.remove(photo);
 assert.equal(calls[0].input.Key,`users/account-a/.bulgaria/photos/${photo.id}.jpg`);assert.equal(calls[0].input.IfNoneMatch,'*');assert.equal(calls[0].input.CacheControl,'no-store');assert.equal(calls[0].input.Metadata.sha256,photo.sha256);
 assert.equal(calls[1].input.Key,`users/account-b/.bulgaria/photos/${photo.id}.jpg`);assert.equal(calls[1].input.ResponseCacheControl,'no-store');assert.equal(calls[2].input.Key,calls[0].input.Key);
});
test('retry confirms an existing immutable photo instead of overwriting it',async()=>{
 let hash=photo.sha256;const calls=[];
 const adapter=visitPhotoStorageAdapter({send:async c=>{calls.push(c.constructor.name);if(c.constructor.name==='PutObjectCommand')throw {$metadata:{httpStatusCode:412}};return {ContentLength:3,ContentType:'image/jpeg',Metadata:{sha256:hash}}}},'fixture','users/account/');
 await adapter.upload(photo,blob);assert.deepEqual(calls,['PutObjectCommand','HeadObjectCommand']);
 hash='b'.repeat(64);await assert.rejects(adapter.upload(photo,blob),/could not be confirmed/);
});
test('failed photo upload never creates a visited record',async()=>{
 const s=store(),repo=repository(s);let commits=0;const d=draft();
 await assert.rejects(commitPhotoVisit({commit:()=>{commits++}}, {upload:async()=>{throw Error('offline')}},d),/offline/);
 assert.equal(commits,0);assert.equal(d.uploaded,false);assert.equal((await repo.load()).entries.length,1);
});
test('photo succeeds before ledger; a failed ledger save retains photo and retries without uploading again',async()=>{
 const s=store(),realWrite=s.write;let fail=true;const order=[];s.write=async(...args)=>{order.push('ledger');if(fail)throw Error('offline');return realWrite(...args)};
 const repo=repository(s),d=draft(),photos={upload:async()=>order.push('photo')};
 await assert.rejects(commitPhotoVisit(repo,photos,d),/offline/);assert.equal(d.uploaded,true);assert.equal(d.upload.blob,blob);
 fail=false;const result=await commitPhotoVisit(repo,photos,d);assert.deepEqual(order,['photo','ledger','ledger']);assert.equal(result.version,3);assert.equal(result.entries.length,2);assert.equal(result.metadata.preserve,true);
});
test('lost successful ledger response is idempotent with the same photo and visit revision',async()=>{
 const s=store(),write=s.write;let lose=true;s.write=async(...args)=>{await write(...args);if(lose){lose=false;throw Error('response lost')}};
 let uploads=0;const repo=repository(s),d=draft(),photos={upload:async()=>uploads++};
 await assert.rejects(commitPhotoVisit(repo,photos,d),/response lost/);const saved=await commitPhotoVisit(repo,photos,d);
 assert.equal(uploads,1);assert.equal(saved.entries.filter(e=>e.id===entry.id).length,1);assert.deepEqual(saved.entries.find(e=>e.id===entry.id).photo,photo);
});
test('photo records survive concurrent additions and stale undo cannot remove an updated visit',async()=>{
 const s=store(),a=repository(s),b=repository(s);const other={...entry,id:'bts-452',revision:'visit-2',photo:{...photo,id:'22222222-2222-4222-8222-222222222222'}};
 await Promise.all([a.commit({id:entry.id,expectedRevision:null,entry}),b.commit({id:other.id,expectedRevision:null,entry:other})]);
 const saved=await repository(s).load();assert.equal(saved.entries.length,3);
 await a.commit({id:entry.id,expectedRevision:'visit-1',entry:{...entry,revision:'new'}});
 await assert.rejects(b.commit({id:entry.id,expectedRevision:'visit-1',entry:null}),/another device/);
 assert.ok((await repository(s).load()).entries.find(e=>e.id===entry.id).photo);
});
test('nearby recommendations use only unvisited places ordered by distance',()=>{
 const p=[{id:'far',lat:0,lon:4},{id:'visited',lat:0,lon:.1},{id:'near',lat:0,lon:1},{id:'middle',lat:0,lon:2}];
 assert.deepEqual(recommendPlaces(p,new Set(['visited']),{lat:0,lon:0},2).map(p=>p.id),['near','middle']);
 assert.deepEqual(recommendPlaces(p,new Set(),null),[]);assert.deepEqual(recommendPlaces(p,new Set(p.map(p=>p.id)),{lat:0,lon:0}),[]);
});
