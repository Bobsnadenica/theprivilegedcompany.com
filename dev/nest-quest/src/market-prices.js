import { convertQuotePrice, holdingQuoteSignature, holdingValue, remoteDecimal } from './wealth-model.js';
import { PRICE_ACCESS } from './price-access.js';

export const PRICE_FAILURES = Object.freeze([
  'providerRequired', 'priceIdentity', 'priceInvalid', 'priceCurrency',
  'priceFX', 'priceStale', 'priceTimeout', 'priceAborted', 'priceRateLimit',
  'priceNetwork', 'priceResponse',
]);
const CURRENCIES = ['USD', 'EUR', 'GBP', 'BGN'];
const DEADLINE_MS = 10000, MAX_BYTES = 262144, DAY_MS = 86400000, SCALE = 100000000n;
const COINLORE = 'https://api.coinlore.net/api/ticker/';
const FX = 'https://api.frankfurter.dev/v1/latest';
// Official irrevocable legacy conversion, not a live BGN exchange quote:
// https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260101~c830245e42.en.html
const LEV_NUMERATOR = 195583n, LEV_DENOMINATOR = 100000n;
const fail = key => { throw new Error(key); };
const errorKey = error => PRICE_FAILURES.includes(error?.message) ? error.message : 'priceNetwork';
const utcDate = date => date.toISOString().slice(0, 10);
const validDate = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && utcDate(new Date(`${value}T00:00:00Z`)) === value;
const atoms = value => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0')); };
const decimal = value => {
  const fraction = (value % SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return `${value / SCALE}${fraction ? `.${fraction}` : ''}`;
};
const instrumentKey = market => JSON.stringify([market.id, market.symbol, market.currency]);
const coinSymbol = value => typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,20}$/.test(value) ? value.toUpperCase() : null;

function deadline(signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('priceAborted'));
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('priceTimeout')), DEADLINE_MS);
  return { signal: controller.signal, close() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

async function readJSON(response) {
  if (!response || !response.ok) fail(response?.status === 429 ? 'priceRateLimit' : 'priceNetwork');
  const declared = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) fail('priceResponse');
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); fail('priceResponse'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    text = new TextDecoder().decode(bytes);
  } else {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('priceResponse');
  }
  try { return JSON.parse(text); } catch { fail('priceResponse'); }
}

async function request(url, options, fetcher, signal) {
  if (signal.aborted) throw signal.reason;
  let abort;
  const interrupted = new Promise((resolve, reject) => {
    abort = () => reject(signal.reason || new Error('priceAborted'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { ...options, signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        return readJSON(response);
      })(),
      interrupted,
    ]);
  } finally { signal.removeEventListener('abort', abort); }
}

function gatewayURL(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint) fail('providerRequired');
  const origin = globalThis.location?.origin || 'https://www.theprivilegedcompany.com';
  let url;
  try { url = new URL(endpoint, origin); } catch { fail('providerRequired'); }
  const relative = endpoint.startsWith('/') && !endpoint.startsWith('//');
  if (url.username || url.password || url.hash || url.search || (!relative && (!endpoint.startsWith('https://') || url.protocol !== 'https:'))
    || (relative && url.origin !== origin)) fail('providerRequired');
  return url.href;
}

function validMarket(holding) {
  const market = holding?.market;
  return market && CURRENCIES.includes(market.currency) && market.symbol === holding.symbol
    && typeof market.id === 'string' && /^[A-Za-z0-9._:/-]{1,64}$/.test(market.id)
    && typeof market.symbol === 'string' && /^[A-Z0-9._:/-]{1,20}$/.test(market.symbol)
    && ((market.provider === 'coinlore' && holding.kind === 'crypto' && market.currency === 'USD' && /^[1-9]\d{0,11}$/.test(market.id))
      || (market.provider === 'licensed' && holding.kind === 'stock'));
}

function sourceTime(value, date) {
  if (validDate(value)) {
    if (value > utcDate(date)) fail('priceInvalid');
    if (Date.parse(`${utcDate(date)}T00:00:00Z`) - Date.parse(`${value}T00:00:00Z`) > 7 * DAY_MS) fail('priceStale');
    return value;
  }
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !validDate(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail('priceInvalid');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > date.valueOf() + 300000) fail('priceInvalid');
  if (date.valueOf() - timestamp > 7 * DAY_MS) fail('priceStale');
  return value;
}

async function sources(holdings, sample, access, fetcher, clock, signal, failures) {
  const results = new Map(), groups = { coinlore: [], licensed: [] };
  for (const holding of holdings) {
    if (!holding?.market) { failures[holding.id] = 'providerRequired'; continue; }
    if (!validMarket(holding)) { failures[holding.id] = 'priceIdentity'; continue; }
    if (!sample && ((holding.market.provider === 'coinlore' && access.crypto !== true)
      || (holding.market.provider === 'licensed' && !access.stockEndpoint))) { failures[holding.id] = 'providerRequired'; continue; }
    groups[holding.market.provider].push(holding);
  }
  await Promise.all(Object.entries(groups).map(async ([provider, group]) => {
    if (!group.length) return;
    try {
      let rows;
      if (sample) {
        // Fictional fixture prices; the UI must label sample mode throughout.
        const example = { BTC: '40000', ETH: '1500', SOL: '80', ADA: '0.25', DOGE: '0.1' };
        rows = [...new Map(group.map(holding => [instrumentKey(holding.market), {
          id: holding.market.id, symbol: holding.market.symbol, currency: holding.market.currency,
          price: example[holding.market.symbol] || (provider === 'coinlore' ? '10' : '125'), marketAt: null,
        }])).values()];
      } else if (provider === 'coinlore') {
        const ids = [...new Set(group.map(holding => holding.market.id))];
        const url = new URL(COINLORE); url.searchParams.set('id', ids.join(','));
        const response = await request(url.href, { headers: { Accept: 'application/json' } }, fetcher, signal);
        if (!Array.isArray(response) || response.length > 100) fail('priceResponse');
        rows = response.map(row => ({ id: row?.id, symbol: coinSymbol(row?.symbol), currency: 'USD', price: row?.price_usd, marketAt: null }));
      } else {
        const instruments = [...new Map(group.map(holding => [instrumentKey(holding.market), {
          id: holding.market.id, symbol: holding.market.symbol, currency: holding.market.currency,
        }])).values()];
        const response = await request(gatewayURL(access.stockEndpoint), {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ instruments }),
        }, fetcher, signal);
        if (!response || !Array.isArray(response.quotes) || response.quotes.length > 100) fail('priceResponse');
        rows = response.quotes;
      }
      const fetched = clock();
      for (const holding of group) {
        try {
          const matches = rows.filter(row => row && instrumentKey(row) === instrumentKey(holding.market));
          if (matches.length !== 1) fail('priceIdentity');
          let price;
          try { price = remoteDecimal(matches[0].price); } catch { fail('priceInvalid'); }
          const marketAt = sample || provider === 'coinlore' ? null : sourceTime(matches[0].marketAt, fetched);
          results.set(holding.id, { price, currency: holding.market.currency, marketAt, fetchedAt: fetched.toISOString() });
        } catch (error) { failures[holding.id] = errorKey(error); }
      }
    } catch (error) { for (const holding of group) failures[holding.id] = errorKey(error); }
  }));
  return results;
}

async function exchangeRates(sourceCurrencies, target, sample, fetcher, clock, signal) {
  if (!sourceCurrencies.length) return () => ({ fxRate: '1', fxDate: utcDate(clock()) });
  const needed = new Set([...sourceCurrencies, target].map(currency => currency === 'BGN' ? 'EUR' : currency));
  needed.delete('USD');
  const onlyLegacy = [...sourceCurrencies].every(currency => currency === target || ['EUR', 'BGN'].includes(currency)) && ['EUR', 'BGN'].includes(target);
  const date = clock(), today = utcDate(date);
  let rates = {}, fxDate = today;
  if (!onlyLegacy && sourceCurrencies.some(currency => currency !== target)) {
    if (sample) rates = { EUR: '0.9', GBP: '0.8' };
    else {
      const url = new URL(FX); url.searchParams.set('base', 'USD'); url.searchParams.set('symbols', [...needed].sort().join(','));
      let response;
      try { response = await request(url.href, { headers: { Accept: 'application/json' } }, fetcher, signal); }
      catch (error) { throw new Error(['priceTimeout', 'priceAborted', 'priceRateLimit'].includes(errorKey(error)) ? errorKey(error) : 'priceFX'); }
      if (response?.base !== 'USD' || response.amount !== 1 || !validDate(response.date) || !response.rates || Array.isArray(response.rates)) fail('priceFX');
      if (response.date > today) fail('priceFX');
      if (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${response.date}T00:00:00Z`) > 7 * DAY_MS) fail('priceStale');
      rates = response.rates; fxDate = response.date;
    }
  }
  const perDollar = { USD: [1n, 1n] };
  for (const currency of needed) {
    try { perDollar[currency] = [atoms(remoteDecimal(onlyLegacy ? '1' : rates[currency])), SCALE]; }
    catch { fail('priceFX'); }
  }
  if (perDollar.EUR) perDollar.BGN = [perDollar.EUR[0] * LEV_NUMERATOR, perDollar.EUR[1] * LEV_DENOMINATOR];
  return (source, target) => {
    if (source === target) return { fxRate: '1', fxDate: today };
    const [sourceNum, sourceDen] = perDollar[source] || [], [targetNum, targetDen] = perDollar[target] || [];
    if (!sourceNum || !targetNum) fail('priceFX');
    const numerator = targetNum * sourceDen * SCALE, denominator = targetDen * sourceNum;
    let fxRate;
    try { fxRate = remoteDecimal(decimal((numerator + denominator / 2n) / denominator)); } catch { fail('priceFX'); }
    return { fxRate, fxDate };
  };
}

// The caller owns cooldowns and applying marks. This function never mutates a
// holding, cash, transactions, goals, or saved provider configuration.
export async function fetchHoldingPrices(holdings, currency, {
  signal, fetcher = globalThis.fetch, now = () => new Date(), access = PRICE_ACCESS, sample = false,
} = {}) {
  if (!Array.isArray(holdings) || holdings.length > 100) throw new Error('priceResponse');
  const updates = [], failures = {}, clock = () => {
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) fail('priceResponse');
    return date;
  };
  if (!CURRENCIES.includes(currency)) return { updates, failures: Object.fromEntries(holdings.map(holding => [holding.id, 'priceCurrency'])) };
  if (!holdings.length) return { updates, failures };
  // Bind quotes to the original snapshot even if a caller edits in place while
  // an HTTP response is pending. Only identity fields leave this local copy.
  holdings = structuredClone(holdings);
  const scope = deadline(signal);
  try {
    const prices = await sources(holdings, sample, access || PRICE_ACCESS, fetcher, clock, scope.signal, failures);
    const converting = holdings.filter(holding => prices.has(holding.id) && prices.get(holding.id).currency !== currency);
    let rateFor;
    try { rateFor = await exchangeRates(converting.map(holding => prices.get(holding.id).currency), currency, sample, fetcher, clock, scope.signal); }
    catch (error) { for (const holding of converting) failures[holding.id] = errorKey(error); }
    for (const holding of holdings) {
      if (Object.hasOwn(failures, holding.id) || !prices.has(holding.id)) continue;
      try {
        const source = prices.get(holding.id), fx = source.currency === currency ? { fxRate: '1', fxDate: utcDate(clock()) } : rateFor(source.currency, currency);
        const price = convertQuotePrice(source.price, fx.fxRate);
        holdingValue(holding.quantity ?? holding.openingQuantity, price);
        updates.push({ id: holding.id, expected: holdingQuoteSignature(holding), quote: {
          provider: holding.market.provider, price, sourcePrice: source.price, sourceCurrency: source.currency,
          marketAt: source.marketAt, fetchedAt: source.fetchedAt, ...fx,
        } });
      } catch (error) { failures[holding.id] = PRICE_FAILURES.includes(error?.message) ? error.message : 'priceInvalid'; }
    }
    return { updates, failures };
  } finally { scope.close(); }
}
