import {validDate} from './budget-model.js';
import {CATALOGUE_IDS} from './data/bulgaria-ids.js';
export const PLACES = [
 {id:'sofia',name:'Sofia',bg:'София',lon:23.3219,lat:42.6977},
 {id:'plovdiv',name:'Plovdiv',bg:'Пловдив',lon:24.7453,lat:42.1354},
 {id:'varna',name:'Varna',bg:'Варна',lon:27.9147,lat:43.2141},
 {id:'burgas',name:'Burgas',bg:'Бургас',lon:27.4626,lat:42.5048},
 {id:'veliko-tarnovo',name:'Veliko Tarnovo',bg:'Велико Търново',lon:25.6297,lat:43.0757},
 {id:'ruse',name:'Ruse',bg:'Русе',lon:25.9538,lat:43.8356},
 {id:'pleven',name:'Pleven',bg:'Плевен',lon:24.6167,lat:43.417},
 {id:'vidin',name:'Vidin',bg:'Видин',lon:22.867,lat:43.996},
 {id:'blagoevgrad',name:'Blagoevgrad',bg:'Благоевград',lon:23.0943,lat:42.0209},
 {id:'smolyan',name:'Smolyan',bg:'Смолян',lon:24.712,lat:41.5774},
 {id:'kardzhali',name:'Kardzhali',bg:'Кърджали',lon:25.3739,lat:41.642},
 {id:'stara-zagora',name:'Stara Zagora',bg:'Стара Загора',lon:25.6345,lat:42.4258},
];
export function validateVisit(e){if(!e||(!PLACES.some(p=>p.id===e.id)&&!CATALOGUE_IDS.has(e.id))||typeof e.revision!=='string'||!e.revision||e.revision.length>80||!validDate(e.date))throw new Error('Invalid check-in. Saved progress has not changed.');return e}
export function validateVisits(data){if(!data||![1,2].includes(data.version)||!Array.isArray(data.entries))throw new Error('Cannot read your saved map.');const ids=new Set();for(const e of data.entries){validateVisit(e);if(ids.has(e.id))throw new Error('Duplicate check-in.');ids.add(e.id)}return data.entries.some(e=>CATALOGUE_IDS.has(e.id))?{...data,version:2}:data}
export function validateCatalogue(data){
 if(data?.version!==1||!Array.isArray(data.places)||data.places.length!==CATALOGUE_IDS.size)throw new Error('The place catalogue is incomplete. Please refresh.');
 const ids=new Set();
 for(const p of data.places){
  if(!CATALOGUE_IDS.has(p.id)||ids.has(p.id)||!['name','bg','number','region','category','description'].every(key=>typeof p[key]==='string'&&p[key].trim())||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<41||p.lat>44.5||p.lon<22||p.lon>29||!p.source?.startsWith('https://www.btsbg.org/100nto/'))throw new Error('The place catalogue has invalid data. Please refresh.');
  ids.add(p.id);
 }
 return data;
}
export function filterPlaces(places,{query='',region='',category='',state='all',visits=new Set()}={}){
 const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 return places.filter(p=>(!region||p.region===region)&&(!category||p.category===category)&&(state==='all'||(state==='visited')===visits.has(p.id))&&words.every(word=>`${p.name} ${p.bg} ${p.number} ${p.region} ${p.regionBg} ${p.location} ${p.locationBg}`.toLocaleLowerCase().includes(word)));
}
