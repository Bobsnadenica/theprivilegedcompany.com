export const CURRENCIES = ['EUR', 'USD', 'GBP', 'BGN'];
export const DEFAULT_CATEGORIES = {
  expense: ['Groceries', 'Dining out', 'Transport', 'Housing', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Travel', 'Other'],
  income: ['Salary', 'Freelance', 'Business', 'Gifts', 'Refunds', 'Other'],
};
export const emptyLedger = () => ({ version: 1, entries: [] });
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Parse decimal strings directly into cents. Never calculate money with floats.
export function parseAmount(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0) throw new Error('Amount must be greater than zero.');
  return cents;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function validateEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(entry.id)
    || typeof entry.revision !== 'string' || !entry.revision || entry.revision.length > 80
    || !['income', 'expense'].includes(entry.type) || !CURRENCIES.includes(entry.currency)
    || !Number.isSafeInteger(entry.amount) || entry.amount <= 0 || entry.amount > 99999999999
    || typeof entry.date !== 'string' || !validDate(entry.date)
    || typeof entry.category !== 'string' || !entry.category.trim() || entry.category.length > 48
    || typeof entry.note !== 'string' || entry.note.length > 240) throw new Error('This budget contains an invalid entry. Your saved data has not been changed.');
  return entry;
}
export function validateLedger(ledger) {
  if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.entries)) throw new Error('This budget format cannot be read. Your saved data has not been changed.');
  const ids = new Set();
  for (const entry of ledger.entries) {
    validateEntry(entry);
    if (ids.has(entry.id)) throw new Error('Duplicate budget entries detected. Your saved data has not been changed.');
    ids.add(entry.id);
  }
  return ledger;
}
export function categoriesFor(entries, type) {
  return [...new Set([...DEFAULT_CATEGORIES[type], ...entries.filter(e => e.type === type).map(e => e.category)])];
}
export function summarize(entries, month, currency) {
  const selected = entries.filter(e => e.currency === currency && (!month || e.date.startsWith(`${month}-`)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const totals = { income: 0, expense: 0 };
  const groups = { income: new Map(), expense: new Map() };
  for (const entry of selected) {
    totals[entry.type] += entry.amount;
    if (!Number.isSafeInteger(totals[entry.type])) throw new Error('The total exceeds the supported amount. Choose a shorter period.');
    groups[entry.type].set(entry.category, (groups[entry.type].get(entry.category) || 0) + entry.amount);
  }
  return { entries: selected, ...totals, balance: totals.income - totals.expense,
    groups: Object.fromEntries(Object.entries(groups).map(([type, group]) => [type, [...group].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))])) };
}
export const money = (cents, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
export function csv(entries) {
  // Prefix spreadsheet formulas in user-controlled text; quote every cell.
  const cell = value => {
    let text = String(value);
    if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [['Date', 'Type', 'Category', 'Amount', 'Currency', 'Note'], ...entries.map(e => [e.date, e.type, e.category, (e.amount / 100).toFixed(2), e.currency, e.note])].map(row => row.map(cell).join(',')).join('\r\n');
}
