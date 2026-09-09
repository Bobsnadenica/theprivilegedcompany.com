import {validDate} from './budget-model.js';
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
export function validateVisit(e){if(!e||!PLACES.some(p=>p.id===e.id)||typeof e.revision!=='string'||!e.revision||e.revision.length>80||!validDate(e.date))throw new Error('Invalid check-in. Saved progress has not changed.');return e}
export function validateVisits(data){if(!data||data.version!==1||!Array.isArray(data.entries))throw new Error('Cannot read your saved map.');const ids=new Set();for(const e of data.entries){validateVisit(e);if(ids.has(e.id))throw new Error('Duplicate check-in.');ids.add(e.id)}return data}
