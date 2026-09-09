import { validDate, localDate, CURRENCIES } from './budget-model.js';
export function validateTimer(e) {
  if (!e || !/^[a-zA-Z0-9-]{1,80}$/.test(e.id) || typeof e.revision !== 'string' || !e.revision || e.revision.length > 80 || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 100 || typeof e.group !== 'string' || !e.group.trim() || e.group.length > 60 || !['once','monthly','yearly','never'].includes(e.recurrence) || (e.recurrence !== 'never' && !validDate(e.date)) || typeof e.note !== 'string' || e.note.length > 1000 || !(e.amount === null || (Number.isSafeInteger(e.amount) && e.amount > 0 && e.amount <= 99999999999)) || !CURRENCIES.includes(e.currency)) throw new Error('Invalid countdown. Your saved data has not changed.');
  return e;
}
export function validateTimers(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.entries)) throw new Error('Cannot read saved countdowns.');
  const ids=new Set();for(const e of value.entries){validateTimer(e);if(ids.has(e.id))throw new Error('Duplicate countdown.');ids.add(e.id)}return value;
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
