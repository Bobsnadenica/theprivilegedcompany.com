import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHoldingPrices } from '../src/market-prices.js';
import { PRICE_ACCESS } from '../src/price-access.js';
import { holdingQuoteSignature, applyHoldingQuotes, createHolding, recordTrade, wealthSummary } from '../src/wealth-model.js';
import { createState, validateState } from '../src/model.js';

const TIME = '2026-10-03T12:00:00.000Z';
const now = () => new Date(TIME);
const permitted = { crypto: true, stockEndpoint: '/licensed-test/prices' };
const json = (data, options) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' }, ...options });
const btcRow = { id: '90', symbol: 'BTC', price_usd: '100' };
const ethRow = { id: '80', symbol: 'ETH', price_usd: '10' };
const fxRow = { amount: 1, base: 'USD', date: '2026-10-02', rates: { EUR: 0.9, GBP: 0.8 } };
function coin(patch = {}) {
  return { id: 'bitcoin-position', kind: 'crypto', name: 'My private BTC savings', symbol: 'BTC', openingQuantity: '1.25',
    quantity: '2.5', price: '50', valuedAt: '2026-10-01',
    market: { provider: 'coinlore', id: '90', symbol: 'BTC', currency: 'USD' }, ...patch };
}
function stock(currency = 'USD', patch = {}) {
  return { ...coin(), id: 'stock-position', kind: 'stock', name: 'My private Apple investment', symbol: 'AAPL',
    market: { provider: 'licensed', id: 'NASDAQ:AAPL', symbol: 'AAPL', currency }, ...patch };
}
const stockRow = (currency = 'USD', patch = {}) => ({ id: 'NASDAQ:AAPL', symbol: 'AAPL', currency, price: '100', marketAt: '2026-10-02T19:59:58Z', ...patch });
function fixture(responses) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (!responses.length) throw new Error('Unexpected request');
    const result = responses.shift();
    if (result instanceof Error) throw result;
    return typeof result === 'function' ? result(url, options) : json(result);
  };
  return { calls, fetcher };
}
const options = fetcher => ({ fetcher, now, access: permitted });

test('unapproved providers are disabled with zero network access and no mutations', async () => {
  assert.deepEqual(PRICE_ACCESS, { crypto: false, stockEndpoint: '' });
  const holdings = [coin(), stock()], before = structuredClone(holdings);
  let calls = 0;
  const result = await fetchHoldingPrices(holdings, 'EUR', { now, fetcher: () => { calls++; throw new Error(); } });
  assert.deepEqual(result, { updates: [], failures: { 'bitcoin-position': 'providerRequired', 'stock-position': 'providerRequired' } });
  assert.equal(calls, 0);
  assert.deepEqual(holdings, before);
});

test('batch requests contain public instrument identities only and preserve source provenance', async () => {
  const duplicate = coin({ id: 'second-private-position', quantity: '0.5', name: 'Wedding fund' });
  const { calls, fetcher } = fixture([[btcRow], fxRow]);
  const result = await fetchHoldingPrices([coin(), duplicate], 'EUR', options(fetcher));
  assert.deepEqual(result.failures, {});
  assert.equal(result.updates.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get('id'), '90');
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get('base'), 'USD');
  assert.equal(new URL(calls[1].url).searchParams.get('symbols'), 'EUR');
  for (const call of calls) {
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Authorization, undefined);
    assert.equal(call.options.body, undefined);
    assert.ok(!/private|Wedding|quantity|bitcoin-position|2\.5/.test(call.url));
  }
  assert.deepEqual(result.updates[0], {
    id: 'bitcoin-position', expected: holdingQuoteSignature(coin()),
    quote: { provider: 'coinlore', price: '90', sourcePrice: '100', sourceCurrency: 'USD', marketAt: null,
      fetchedAt: TIME, fxRate: '0.9', fxDate: '2026-10-02' },
  });
});

test('source same-currency prices need no FX request', async () => {
  const { calls, fetcher } = fixture([[btcRow]]);
  const result = await fetchHoldingPrices([coin()], 'USD', options(fetcher));
  assert.equal(calls.length, 1);
  assert.equal(result.updates[0].quote.price, '100');
  assert.equal(result.updates[0].quote.fxRate, '1');
  assert.equal(result.updates[0].quote.fxDate, '2026-10-03');
});

test('provider identity and duplicate guards reject mismatches without sacrificing matching positions', async () => {
  const ether = coin({ id: 'ether-position', symbol: 'ETH', market: { provider: 'coinlore', id: '80', symbol: 'ETH', currency: 'USD' } });
  for (const wrong of [
    [{ ...btcRow, id: '91' }, ethRow],
    [{ ...btcRow, symbol: 'WBTC' }, ethRow],
    [btcRow, btcRow, ethRow],
  ]) {
    const { fetcher } = fixture([wrong]);
    const result = await fetchHoldingPrices([coin(), ether], 'USD', options(fetcher));
    assert.deepEqual(result.failures, { 'bitcoin-position': 'priceIdentity' });
    assert.deepEqual(result.updates.map(update => update.id), ['ether-position']);
  }
  const { calls, fetcher } = fixture([]);
  const invalid = coin({ market: { provider: 'coinlore', id: '90&secret=bad', symbol: 'BTC', currency: 'USD' } });
  assert.equal((await fetchHoldingPrices([invalid], 'USD', options(fetcher))).failures[invalid.id], 'priceIdentity');
  assert.equal(calls.length, 0);
});

test('zero, negative, invalid and overflowing marks fail per holding and use current derived quantity', async () => {
  const ether = coin({ id: 'ether-position', symbol: 'ETH', market: { provider: 'coinlore', id: '80', symbol: 'ETH', currency: 'USD' } });
  for (const price of ['0', '-1', 'NaN', '1e20', '100000000']) {
    const { fetcher } = fixture([[{ ...btcRow, price_usd: price }, ethRow]]);
    const result = await fetchHoldingPrices([coin(), ether], 'USD', options(fetcher));
    assert.deepEqual(result.failures, { 'bitcoin-position': 'priceInvalid' });
    assert.deepEqual(result.updates.map(update => update.id), ['ether-position']);
  }
  const { fetcher } = fixture([[btcRow]]);
  const held = coin({ openingQuantity: '0', quantity: '1000000' });
  assert.equal((await fetchHoldingPrices([held], 'USD', options(fetcher))).failures[held.id], 'priceInvalid');
});

test('CoinLore mixed-case symbols canonicalize without weakening unique ID or character checks', async () => {
  const held = coin({ id: 'ethena-position', symbol: 'USDE', market: { provider: 'coinlore', id: '123', symbol: 'USDE', currency: 'USD' } });
  const { fetcher } = fixture([[{ id: '123', symbol: 'USDe', price_usd: '1' }]]);
  assert.equal((await fetchHoldingPrices([held], 'USD', options(fetcher))).updates[0].quote.price, '1');
  for (const [id, symbol] of [['124', 'USDe'], ['123', ' USDe'], ['123', 'USDe '], ['123', 'USDe&other=bad']]) {
    const { fetcher } = fixture([[{ id, symbol, price_usd: '1' }]]);
    assert.equal((await fetchHoldingPrices([held], 'USD', options(fetcher))).failures[held.id], 'priceIdentity');
  }
});

test('licensed gateway sends deduplicated market identities, and matches all response identity fields', async () => {
  const second = stock('USD', { id: 'second-stock' });
  const { calls, fetcher } = fixture([{ quotes: [stockRow()] }]);
  const result = await fetchHoldingPrices([stock(), second], 'USD', options(fetcher));
  assert.equal(result.updates.length, 2);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { instruments: [{ id: 'NASDAQ:AAPL', symbol: 'AAPL', currency: 'USD' }] });
  assert.equal(result.updates[0].quote.marketAt, '2026-10-02T19:59:58Z');
  for (const patch of [{ symbol: 'MSFT' }, { id: 'NYSE:AAPL' }, { currency: 'EUR' }]) {
    const { fetcher } = fixture([{ quotes: [stockRow('USD', patch)] }]);
    assert.equal((await fetchHoldingPrices([stock()], 'USD', options(fetcher))).failures['stock-position'], 'priceIdentity');
  }
});

test('gateway requires safe configured transport, rejecting credentials and redirects', async () => {
  for (const endpoint of ['http://external.example/prices', 'https://user:secret@example.com/prices', 'https://example.com/prices?apikey=secret', '//example.com/prices', 'javascript:alert(1)']) {
    const { calls, fetcher } = fixture([]);
    const result = await fetchHoldingPrices([stock()], 'USD', { ...options(fetcher), access: { crypto: false, stockEndpoint: endpoint } });
    assert.equal(result.failures['stock-position'], 'providerRequired');
    assert.equal(calls.length, 0);
  }
});

test('cross-currency quotes use target-per-source rates including legacy BGN conversion', async () => {
  const cases = [
    ['EUR', 'USD', '111.111111', '1.11111111', true],
    ['EUR', 'GBP', '88.888889', '0.88888889', true],
    ['GBP', 'EUR', '112.5', '1.125', true],
    ['USD', 'BGN', '176.0247', '1.760247', true],
    ['EUR', 'BGN', '195.583', '1.95583', false],
    ['BGN', 'EUR', '51.129188', '0.51129188', false],
  ];
  for (const [source, target, price, rate, needsFX] of cases) {
    const { calls, fetcher } = fixture([{ quotes: [stockRow(source)] }, ...(needsFX ? [fxRow] : [])]);
    const result = await fetchHoldingPrices([stock(source)], target, options(fetcher));
    assert.deepEqual(result.failures, {}, `${source} to ${target}`);
    assert.equal(result.updates[0].quote.price, price);
    assert.equal(result.updates[0].quote.fxRate, rate);
    assert.equal(calls.length, needsFX ? 2 : 1);
    if (needsFX) assert.ok(!new URL(calls[1].url).searchParams.get('symbols').includes('BGN'));
  }
});

test('FX outages retain conversion-dependent marks while same-currency quotes still succeed', async () => {
  const { fetcher } = fixture([[btcRow], { quotes: [stockRow('EUR')] }, new Error('offline')]);
  const result = await fetchHoldingPrices([coin(), stock('EUR')], 'EUR', options(fetcher));
  assert.deepEqual(result.failures, { 'bitcoin-position': 'priceFX' });
  assert.deepEqual(result.updates.map(update => update.id), ['stock-position']);
  assert.equal(result.updates[0].quote.price, '100');
});

test('dated FX accepts weekends but rejects future, malformed, stale and missing rates', async () => {
  for (const [patch, failure] of [
    [{ date: '2026-09-25' }, 'priceStale'],
    [{ date: '2026-10-04' }, 'priceFX'],
    [{ date: '2026-02-30' }, 'priceFX'],
    [{ rates: { GBP: 0.8 } }, 'priceFX'],
    [{ rates: { EUR: 0 } }, 'priceFX'],
    [{ base: 'EUR' }, 'priceFX'],
    [{ amount: 100 }, 'priceFX'],
  ]) {
    const { fetcher } = fixture([[btcRow], { ...fxRow, ...patch }]);
    assert.equal((await fetchHoldingPrices([coin()], 'EUR', options(fetcher))).failures['bitcoin-position'], failure);
  }
  const { fetcher } = fixture([[btcRow], { ...fxRow, date: '2026-09-26' }]);
  assert.equal((await fetchHoldingPrices([coin()], 'EUR', options(fetcher))).updates.length, 1, 'Seven days remains within the explicit maximum');
});

test('gateway quote timestamps must be real, recent and not in the future', async () => {
  for (const [marketAt, expected] of [['2026-09-20', 'priceStale'], ['2026-10-04T12:00:00Z', 'priceInvalid'], ['2026-02-30T12:00:00Z', 'priceInvalid'], [null, 'priceInvalid']]) {
    const { fetcher } = fixture([{ quotes: [stockRow('USD', { marketAt })] }]);
    assert.equal((await fetchHoldingPrices([stock()], 'USD', options(fetcher))).failures['stock-position'], expected);
  }
});

test('429 and malformed or oversized payloads produce no update or retry', async () => {
  for (const [response, key] of [
    [() => json({}, { status: 429 }), 'priceRateLimit'],
    [() => new Response('{bad'), 'priceResponse'],
    [() => new Response(' '.repeat(262145)), 'priceResponse'],
    [() => new Response('{}', { headers: { 'Content-Length': '262145' } }), 'priceResponse'],
    [{ unexpected: true }, 'priceResponse'],
  ]) {
    const holdings = [coin()], before = structuredClone(holdings), { calls, fetcher } = fixture([response]);
    const result = await fetchHoldingPrices(holdings, 'USD', options(fetcher));
    assert.deepEqual(result, { updates: [], failures: { 'bitcoin-position': key } });
    assert.equal(calls.length, 1);
    assert.deepEqual(holdings, before);
  }
});

test('ten-second deadline completes even if a fetch implementation ignores AbortSignal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const holdings = [coin()], before = structuredClone(holdings);
  const pending = fetchHoldingPrices(holdings, 'USD', options(() => new Promise(() => {})));
  t.mock.timers.tick(10000);
  assert.deepEqual(await pending, { updates: [], failures: { 'bitcoin-position': 'priceTimeout' } });
  assert.deepEqual(holdings, before);
});

test('caller cancellation returns promptly and an already-aborted call makes no request', async () => {
  const controller = new AbortController();
  const pending = fetchHoldingPrices([coin()], 'USD', { ...options(() => new Promise(() => {})), signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { updates: [], failures: { 'bitcoin-position': 'priceAborted' } });
  const { calls, fetcher } = fixture([]);
  assert.equal((await fetchHoldingPrices([coin()], 'USD', { ...options(fetcher), signal: controller.signal })).failures['bitcoin-position'], 'priceAborted');
  assert.equal(calls.length, 0);
});

test('in-place edits during a request cannot rebind its original snapshot signature', async () => {
  const held = coin(), signature = holdingQuoteSignature(held);
  const fetcher = async () => { held.price = '999'; held.name = 'Edited'; return json([btcRow]); };
  const result = await fetchHoldingPrices([held], 'USD', options(fetcher));
  assert.equal(result.updates[0].expected, signature);
  assert.notEqual(result.updates[0].expected, holdingQuoteSignature(held));
});

test('explicit fictional sample prices and FX run without any network or access permission', async () => {
  let calls = 0;
  const result = await fetchHoldingPrices([coin(), stock('GBP')], 'EUR', { now, sample: true, fetcher: () => { calls++; throw new Error(); } });
  assert.equal(calls, 0);
  assert.deepEqual(result.failures, {});
  assert.deepEqual(result.updates.map(update => update.quote.price), ['36000', '140.625']);
  assert.ok(result.updates.every(update => update.quote.marketAt === null));
});

test('returned quotes integrate with real holdings and trades without changing any cash or transactions', async () => {
  const date = new Date().toISOString().slice(0, 10), state = createState(date);
  state.profile.currency = 'USD';
  state.opening = 100000;
  createHolding(state, { ...coin(), valuedAt: date });
  recordTrade(state, { id: 'purchase', holdingId: 'bitcoin-position', side: 'buy', quantity: '0.25', amount: 5000, date });
  const summary = wealthSummary(state), before = structuredClone(state), { fetcher } = fixture([[btcRow]]);
  const result = await fetchHoldingPrices(summary.holdings, state.profile.currency, { ...options(fetcher), now: () => new Date() });
  assert.deepEqual(applyHoldingQuotes(state, result.updates).applied, ['bitcoin-position']);
  assert.equal(wealthSummary(state).holdings[0].quantity, '1.5');
  assert.equal(wealthSummary(state).holdings[0].value, 15000);
  assert.equal(wealthSummary(state).cash, wealthSummary(before).cash);
  assert.deepEqual(state.entries, before.entries);
  assert.deepEqual(state.investmentTrades, before.investmentTrades);
  validateState(state);
});
