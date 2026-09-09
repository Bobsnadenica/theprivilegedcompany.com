import {validDate, localDate} from './budget-model.js';
import {dayNumber, dateFromDay, calendarDate} from './calendar.js';
export const isPeriod = e => ['startDate','endDate','unit'].some(key => Object.hasOwn(e, key));
export function validatePerson(e){
 if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(e.id)||typeof e.revision!=='string'||!e.revision||e.revision.length>80||typeof e.name!=='string'||!e.name.trim()||e.name.length>80)throw new Error('Enter a title of up to 80 characters.');
 if(isPeriod(e)){
  if(!validDate(e.startDate)||!validDate(e.endDate)||e.startDate>e.endDate||!['days','months','years'].includes(e.unit))throw new Error('Choose valid start and end dates, with the end on or after the start.');
 }else if(!Number.isInteger(e.age)||e.age<0||e.age>130||!Number.isInteger(e.horizon)||e.horizon<1||e.horizon>150||!validDate(e.asOf))throw new Error('Cannot read this saved age snapshot.');
 return e;
}
export function validatePeople(data){if(!data||![1,2].includes(data.version)||!Array.isArray(data.entries))throw new Error('Cannot read saved time periods.');const ids=new Set();for(const e of data.entries){validatePerson(e);if(ids.has(e.id))throw new Error('Duplicate time period.');ids.add(e.id)}return data.entries.some(isPeriod)?{...data,version:2}:data}
export function lifeSummary(e){validatePerson(e);return {elapsed:e.age,remaining:Math.max(0,e.horizon-e.age),boxes:Math.max(e.age,e.horizon)}};

export function periodSummary(e, today = localDate()) {
 validatePerson(e);
 const start=dayNumber(e.startDate),end=dayNumber(e.endDate),now=dayNumber(today),total=end-start+1;
 const elapsed=Math.max(0,Math.min(total,now-start));
 return {total,elapsed,remaining:total-elapsed,percent:elapsed/total*100,state:now<start?'future':now>end?'completed':'active',untilStart:Math.max(0,start-now)};
}

// At most one year of days, ten years of months, or a century of years is built.
export function periodGrid(e, today = localDate(), requestedYear) {
 validatePerson(e);
 const firstYear=Number(e.startDate.slice(0,4)),lastYear=Number(e.endDate.slice(0,4));
 const selected=Math.max(firstYear,Math.min(lastYear,requestedYear??Number(today.slice(0,4))));
 const span=e.unit==='days'?1:e.unit==='months'?10:100;
 const year=firstYear+Math.floor((selected-firstYear)/span)*span,endYear=Math.min(lastYear,year+span-1);
 const start=dayNumber(e.startDate),end=dayNumber(e.endDate),now=dayNumber(today),groups=[];
 const cell=(a,b)=>{const lo=Math.max(start,a),hi=Math.min(end,b);return {start:dateFromDay(lo),end:dateFromDay(hi),state:now>hi?'elapsed':now<lo?'ahead':'current',partial:lo!==a||hi!==b}};
 for(let y=year;y<=endYear;y++){
  if(e.unit==='years'){
   const lo=dayNumber(calendarDate(y,0)),hi=dayNumber(calendarDate(y,11,31));
   if(!groups.length||groups.at(-1).cells.length===10)groups.push({label:String(y),cells:[]});
   groups.at(-1).cells.push(cell(lo,hi));continue;
  }
  const yearly={label:String(y),cells:[]};
  for(let m=0;m<12;m++){
   const lo=dayNumber(calendarDate(y,m)),hi=dayNumber(calendarDate(y,m,31));
   if(hi<start||lo>end)continue;
   if(e.unit==='months')yearly.cells.push(cell(lo,hi));
   else{
    const month={label:new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(`${calendarDate(y,m)}T12:00:00Z`)),cells:[]};
    for(let d=Math.max(start,lo);d<=Math.min(end,hi);d++)month.cells.push(cell(d,d));
    groups.push(month);
   }
  }
  if(yearly.cells.length)groups.push(yearly);
 }
 return {year,endYear,previous:year>firstYear?year-span:null,next:endYear<lastYear?year+span:null,groups};
}
