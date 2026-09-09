import {validDate} from './budget-model.js';
export function validatePerson(e){
 if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(e.id)||typeof e.revision!=='string'||!e.revision||e.revision.length>80||typeof e.name!=='string'||!e.name.trim()||e.name.length>80||!Number.isInteger(e.age)||e.age<0||e.age>130||!Number.isInteger(e.horizon)||e.horizon<1||e.horizon>150||!validDate(e.asOf))throw new Error('Enter a name, an age from 0 to 130 and a planning age from 1 to 150.');return e;
}
export function validatePeople(data){if(!data||data.version!==1||!Array.isArray(data.entries))throw new Error('Cannot read saved people.');const ids=new Set();for(const e of data.entries){validatePerson(e);if(ids.has(e.id))throw new Error('Duplicate person.');ids.add(e.id)}return data}
export function lifeSummary(e){validatePerson(e);return {elapsed:e.age,remaining:Math.max(0,e.horizon-e.age),boxes:Math.max(e.age,e.horizon)}};
