export const FIXED_RATES = Object.freeze({ EUR: 1, BGN: 1.95583 });

export function convertAmount(amount, from, to, usdRate) {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) throw new Error('Enter an amount between 0 and 1 trillion.');
  if (![from, to].every(code => ['EUR', 'BGN', 'USD'].includes(code))) throw new Error('Choose a supported currency.');
  if (from === to) return amount;
  const rates = { ...FIXED_RATES, USD: usdRate };
  if (![rates[from], rates[to]].every(rate => Number.isFinite(rate) && rate > 0)) throw new Error('A valid USD reference rate is required.');
  return amount / rates[from] * rates[to];
}

export function validateReference(data) {
  if (!data || data.base !== 'EUR' || !Number.isFinite(data.rates?.USD) || data.rates.USD <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error('The reference-rate response is invalid.');
  const timestamp = Date.parse(`${data.date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 86400000) throw new Error('The reference-rate date is invalid.');
  return { rate: data.rates.USD, date: data.date, stale: Date.now() - timestamp > 7 * 86400000 };
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('currency-form');
  const result = document.getElementById('result');
  const dateLabel = document.getElementById('rate-date');
  const button = document.getElementById('convert-button');
  let requestId = 0;
  let activeController;
  // Editing clears old results, so a delayed response cannot describe new inputs.
  form.addEventListener('input', () => {
    requestId++;
    activeController?.abort();
    button.disabled = false;
    button.textContent = 'Convert';
    result.textContent = 'Choose Convert to update the result.';
    dateLabel.textContent = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const amount = Number(document.getElementById('amount').value);
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const id = ++requestId;
    let timeout;
    button.disabled = true;
    button.textContent = 'Converting…';
    result.textContent = 'Calculating…';
    dateLabel.textContent = '';
    try {
      let reference;
      if (from !== to && [from, to].includes('USD')) {
        activeController = new AbortController();
        timeout = setTimeout(() => activeController.abort(), 8000);
        const response = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', { signal: activeController.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('The reference-rate service is unavailable. Try again shortly.');
        reference = validateReference(await response.json());
      }
      if (id !== requestId) return;
      const value = convertAmount(amount, from, to, reference?.rate);
      const format = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      result.textContent = `${format.format(amount)} ${from} = ${format.format(value)} ${to}`;
      dateLabel.textContent = reference ? `Reference date: ${reference.date}${reference.stale ? ' · More than 7 days old; check a current quote.' : ''}` : from === to ? 'Same currency; no exchange rate needed.' : 'Official fixed conversion: 1 EUR = 1.95583 BGN. Works offline.';
    } catch (error) {
      if (id === requestId) result.textContent = error.name === 'AbortError' ? 'The rate request timed out. Please try again.' : error instanceof TypeError ? 'Rates could not be reached. Check your connection and try again.' : error.message;
    } finally {
      clearTimeout(timeout);
      if (id === requestId) { button.disabled = false; button.textContent = 'Convert'; }
    }
  });
}
