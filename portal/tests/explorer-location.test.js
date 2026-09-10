import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validLocation,distanceKm,formatDistance,sortPlaces,googlePlaceUrl,locationError} from '../src/explorer-location.js';
test('distance uses kilometres, accepts zero coordinates and handles antipodes',()=>{
 const a={lat:0,lon:0};assert.equal(validLocation(a),true);assert.equal(distanceKm(a,a),0);
 assert.ok(Math.abs(distanceKm(a,{lat:0,lon:1})-111.195)<.001);
 assert.ok(Math.abs(distanceKm(a,{lat:0,lon:180})-20015.114)<.001);
 assert.equal(distanceKm({lat:91,lon:0},a),null);assert.equal(distanceKm(null,a),null);
 assert.equal(validLocation({lat:'42',lon:23}),false);
 assert.equal(formatDistance(.24),'240 m');assert.equal(formatDistance(2.34),'2.3 km');assert.equal(formatDistance(null),'');
});
test('nearest sorting is stable, does not mutate the catalogue and needs a valid location',()=>{
 const p=[{id:'far',lat:0,lon:2},{id:'near',lat:0,lon:1},{id:'same',lat:0,lon:1}];
 assert.deepEqual(sortPlaces(p,'nearest',{lat:0,lon:0}).map(x=>x.id),['near','same','far']);
 assert.deepEqual(p.map(x=>x.id),['far','near','same']);assert.deepEqual(sortPlaces(p,'nearest',null),p);
});
test('directions use named sites without sending the browser location in the URL',()=>{
 const p={bg:'Рилски манастир',name:'Rila Monastery',region:'Kyustendil'};
 const search=new URL(googlePlaceUrl(p)),directions=new URL(googlePlaceUrl(p,true));
 assert.equal(search.hostname,'www.google.com');assert.match(search.searchParams.get('query'),/Рилски/);
 assert.equal(directions.pathname,'/maps/dir/');assert.equal(directions.searchParams.has('origin'),false);
 assert.match(locationError({code:1}),/declined/);assert.match(locationError({code:3}),/too long/);
});
test('public place media has catalogue IDs, source links, license and photographer attribution',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('../src/data/bulgaria-catalogue.json',import.meta.url)));
 const details=JSON.parse(readFileSync(new URL('../src/data/bulgaria-place-details.json',import.meta.url)));
 const ids=new Set(catalogue.places.map(x=>x.id));assert.equal(details.version,1);
 for(const [id,entry] of Object.entries(details.places)){
  assert.ok(ids.has(id));assert.match(entry.source,/^https:\/\/www.wikidata.org\/wiki\/Q\d+$/);
  if(entry.photo){const p=entry.photo;assert.ok(p.author&&p.license&&p.alt);assert.ok(['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(p.url).hostname));assert.equal(new URL(p.page).hostname,'commons.wikimedia.org');assert.equal(new URL(p.licenseUrl).hostname,'creativecommons.org');}
 }
});
