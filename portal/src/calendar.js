// Date-only arithmetic in UTC avoids daylight-saving changes in calendar days.
export const dayNumber = date => Date.parse(`${date}T12:00:00Z`) / 86400000;
export const dateFromDay = day => new Date(day * 86400000).toISOString().slice(0, 10);
export function calendarDate(year, month, day = 1) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last), 12)).toISOString().slice(0, 10);
}
export const friendlyDate = date => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
