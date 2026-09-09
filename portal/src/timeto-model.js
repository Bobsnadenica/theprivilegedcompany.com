import { validDate, localDate, CURRENCIES } from './budget-model.js';
import { dayNumber, calendarDate } from './calendar.js';
export function validateTimer(e) {
  if (!e || !/^[a-zA-Z0-9-]{1,80}$/.test(e.id) || typeof e.revision !== 'string' || !e.revision || e.revision.length > 80 || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 100 || typeof e.group !== 'string' || !e.group.trim() || e.group.length > 60 || !['once','monthly','yearly','never'].includes(e.recurrence) || (e.recurrence !== 'never' && !validDate(e.date)) || typeof e.note !== 'string' || e.note.length > 1000 || !(e.amount === null || (Number.isSafeInteger(e.amount) && e.amount > 0 && e.amount <= 99999999999)) || !CURRENCIES.includes(e.currency)) throw new Error('Invalid countdown. Your saved data has not changed.');
  if (e.kind !== undefined && !['countdown', 'domain'].includes(e.kind)) throw new Error('Choose a valid countdown type.');
  if (e.termYears !== undefined && (!Number.isInteger(e.termYears) || e.termYears < 1 || e.termYears > 10)) throw new Error('Domain registration must be from 1 to 10 years.');
  if (e.kind === 'domain' && e.recurrence !== 'once') throw new Error('Domain expiry must be a fixed date.');
  return e;
}
// Old imported domain groups remain readable without rewriting account records.
export const isDomain = entry => entry.kind === 'domain' || (entry.kind === undefined && /\bdomains?\b/i.test(entry.group) && entry.recurrence === 'once');
export function domainProgress(entry, today = localDate()) {
  if (!isDomain(entry)) return null;
  const [year, month, day] = entry.date.split('-').map(Number);
  const start = calendarDate(year - (entry.termYears ?? 1), month - 1, day);
  const cycleDays = dayNumber(entry.date) - dayNumber(start);
  const remaining = Math.max(0, dayNumber(entry.date) - dayNumber(today));
  return { start, end: entry.date, remaining, cycleDays, percent: Math.max(0, Math.min(100, remaining / cycleDays * 100)) };
}
export function validateTimers(value) {
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.entries)) throw new Error('Cannot read saved countdowns.');
  const ids=new Set();for(const e of value.entries){validateTimer(e);if(ids.has(e.id))throw new Error('Duplicate countdown.');ids.add(e.id)}
  return value.entries.some(e=>e.kind!==undefined||e.termYears!==undefined)?{...value,version:2}:value;
}
const utc = date => Date.parse(`${date}T12:00:00Z`);
const dateInMonth = (year, month, day) => {
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(day,last),12)).toISOString().slice(0,10);
};
export function nextDue(entry, today=localDate()) {
  if(entry.recurrence==='never')return null;
  if(entry.recurrence==='once' || entry.date>=today)return entry.date;
  const [y,m,d]=entry.date.split('-').map(Number), [ty,tm]=today.split('-').map(Number);
  if(entry.recurrence==='monthly'){
    const current=dateInMonth(ty,tm-1,d);
    return current>=today?current:dateInMonth(ty,tm,d);
  }
  const current=dateInMonth(ty,m-1,d);return current>=today?current:dateInMonth(ty+1,m-1,d);
}
export function daysLeft(entry,today=localDate()) {const due=nextDue(entry,today);return due===null?null:Math.round((utc(due)-utc(today))/86400000)}

// Fraction of days remaining in the recurring billing cycle. No payment status inferred.
export function paymentProgress(entry,today=localDate()) {
 if(!['monthly','yearly'].includes(entry.recurrence))return null;
 const due=nextDue(entry,today),[year,month]=due.split('-').map(Number),[startYear,startMonth,day]=entry.date.split('-').map(Number);
 const previous=entry.recurrence==='monthly'?dateInMonth(year,month-2,day):dateInMonth(year-1,startMonth-1,day);
 const cycleDays=Math.round((utc(due)-utc(previous))/86400000),remaining=Math.max(0,Math.round((utc(due)-utc(today))/86400000));
 return {remaining,cycleDays,percent:Math.max(0,Math.min(100,remaining/cycleDays*100))};
}
