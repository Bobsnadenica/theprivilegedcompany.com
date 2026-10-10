// Positions are valued in the profile's one base currency. Decimal strings
// retain fractional units exactly; optional quotes only replace market marks.
export const WEALTH_LIMITS = Object.freeze({ holdings: 100, trades: 10000, liabilities: 100, wholeDigits: 12, decimalPlaces: 8 });
const SCALE = 100000000n, VALUE_DIVISOR = SCALE * SCALE / 100n;
const MONEY_LIMIT = 9999999999, SAFE_LIMIT = BigInt(Number.MAX_SAFE_INTEGER);
const idValid = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const amountValid = value => Number.isSafeInteger(value) && value >= 0 && value <= MONEY_LIMIT;
const nameValid = value => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 64;
const dateValid = value => {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const fail = (key = 'invalidSave') => { throw new Error(key); };
const checked = value => { if (value < -SAFE_LIMIT || value > SAFE_LIMIT) fail(); return Number(value); };
const newId = input => input.id ?? crypto.randomUUID();

export function normalizeDecimal(value, allowZero = true) {
  if (typeof value !== 'string') fail('amount');
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(text)) fail('amount');
  const [whole, fraction = ''] = text.split('.');
  const integer = whole.replace(/^0+(?=\d)/, ''), remainder = fraction.replace(/0+$/, '');
  const result = remainder ? `${integer}.${remainder}` : integer;
  if (!allowZero && result === '0') fail('amount');
  return result;
}
const atoms = value => { const [whole, fraction = ''] = normalizeDecimal(value).split('.'); return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0')); };
const fromAtoms = value => { const whole = value / SCALE, fraction = (value % SCALE).toString().padStart(8, '0').replace(/0+$/, ''); return fraction ? `${whole}.${fraction}` : whole.toString(); };
const decimalValid = (value, allowZero = true) => {
  if (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,8})?$/.test(value)) return false;
  try { return allowZero || atoms(value) > 0n; } catch { return false; }
};

// Provider payloads may use exponent notation or more than eight places. Round
// their decimal text once instead of passing through binary float arithmetic.
export function remoteDecimal(value, allowZero = false) {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('amount');
  if (!['string', 'number'].includes(typeof value)) fail('amount');
  const text = String(value).trim();
  if (text.length > 256) fail('amount');
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,4}))?$/.exec(text);
  if (!match) fail('amount');
  const exponent = Number(match[3] || 0);
  if (Math.abs(exponent) > 1000) fail('amount');
  const places = (match[2] || '').length - exponent, coefficient = BigInt(match[1] + (match[2] || ''));
  const difference = places - 8;
  const divisor = difference > 0 ? 10n ** BigInt(difference) : 1n;
  const rounded = difference > 0 ? (coefficient + divisor / 2n) / divisor : coefficient * 10n ** BigInt(-difference);
  if (rounded >= 1000000000000n * SCALE || (!allowZero && rounded === 0n)) fail('amount');
  return fromAtoms(rounded);
}

export function convertQuotePrice(sourcePrice, fxRate) {
  const product = atoms(normalizeDecimal(sourcePrice, false)) * atoms(normalizeDecimal(fxRate, false));
  const rounded = (product + SCALE / 2n) / SCALE;
  if (rounded === 0n || rounded >= 1000000000000n * SCALE) fail('amount');
  return fromAtoms(rounded);
}

const QUOTE_CURRENCIES = ['USD', 'EUR', 'GBP', 'BGN'];
const QUOTE_PROVIDERS = ['coinlore', 'licensed'];
const objectFields = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const quoteDecimal = value => decimalValid(value, false) && normalizeDecimal(value, false) === value;
const timeValue = value => {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  if (!dateValid(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
  return Date.parse(value);
};
const marketValid = (market, holding) => objectFields(market, ['provider', 'id', 'symbol', 'currency'])
  && QUOTE_PROVIDERS.includes(market.provider) && typeof market.id === 'string' && /^[A-Za-z0-9._:/-]{1,64}$/.test(market.id)
  && typeof market.symbol === 'string' && /^[A-Z0-9._:/-]{1,20}$/.test(market.symbol)
  && QUOTE_CURRENCIES.includes(market.currency) && market.symbol === holding.symbol
  && (market.provider !== 'coinlore' || holding.kind === 'crypto');
function validateQuote(quote, now = Date.now()) {
  if (!objectFields(quote, ['provider', 'price', 'sourcePrice', 'sourceCurrency', 'marketAt', 'fetchedAt', 'fxRate', 'fxDate'])
    || !QUOTE_PROVIDERS.includes(quote.provider) || !QUOTE_CURRENCIES.includes(quote.sourceCurrency)
    || !quoteDecimal(quote.price) || !quoteDecimal(quote.sourcePrice) || !quoteDecimal(quote.fxRate)
    || !dateValid(quote.fxDate) || quote.fxDate > new Date(now).toISOString().slice(0, 10)) fail();
  const fetched = timeValue(quote.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now + 300000) fail();
  if (quote.marketAt !== null) {
    if (dateValid(quote.marketAt)) {
      if (quote.marketAt > new Date(now + 300000).toISOString().slice(0, 10)) fail();
    } else {
      const market = timeValue(quote.marketAt);
      if (!Number.isFinite(market) || market > now + 300000 || market > fetched + 300000) fail();
    }
  }
  if (convertQuotePrice(quote.sourcePrice, quote.fxRate) !== quote.price) fail();
}
function validateHoldingMetadata(holding, baseCurrency) {
  if (Object.hasOwn(holding, 'market') && !marketValid(holding.market, holding)) fail();
  if (Object.hasOwn(holding, 'quote')) {
    validateQuote(holding.quote);
    if (!holding.market || holding.quote.provider !== holding.market.provider || holding.quote.sourceCurrency !== holding.market.currency
      || holding.quote.price !== holding.price || (baseCurrency === holding.quote.sourceCurrency && holding.quote.fxRate !== '1')) fail();
  }
}

const marketFields = market => market ? [market.provider, market.id, market.symbol, market.currency] : null;
const quoteFields = quote => quote ? [quote.provider, quote.price, quote.sourcePrice, quote.sourceCurrency, quote.marketAt, quote.fetchedAt, quote.fxRate, quote.fxDate] : null;
export function holdingQuoteSignature(holding) {
  return JSON.stringify([holding.id, holding.kind, holding.name, holding.symbol, holding.openingQuantity, holding.price, holding.valuedAt,
    marketFields(holding.market), quoteFields(holding.quote)]);
}

// Network callers supply only successful quotes. A stale or removed position
// is skipped; an invalid batch commits nothing, including earlier valid marks.
export function applyHoldingQuotes(state, updates) {
  if (!Array.isArray(updates) || updates.length > WEALTH_LIMITS.holdings) fail();
  const ids = new Set();
  for (const update of updates) {
    if (!update || !idValid(update.id) || ids.has(update.id) || typeof update.expected !== 'string' || update.expected.length > 2000) fail();
    ids.add(update.id); validateQuote(update.quote);
  }
  const applied = [], skipped = [], patches = new Map();
  for (const update of updates) {
    const holding = state.holdings.find(item => item.id === update.id);
    if (!holding?.market || holdingQuoteSignature(holding) !== update.expected) { skipped.push(update.id); continue; }
    const valuedAt = update.quote.marketAt?.slice(0, 10) || update.quote.fetchedAt.slice(0, 10);
    const next = { ...holding, price: update.quote.price, valuedAt, quote: structuredClone(update.quote) };
    validateHoldingMetadata(next, state.profile?.currency); patches.set(update.id, next); applied.push(update.id);
  }
  if (applied.length) commit(state, { holdings: state.holdings.map(holding => patches.get(holding.id) || holding) });
  return { applied, skipped };
}

// Round each marked position once, half up to one cent, then sum displayed rows.
export function holdingValue(quantity, price) {
  const value = (atoms(quantity) * atoms(price) + VALUE_DIVISOR / 2n) / VALUE_DIVISOR;
  if (value > BigInt(MONEY_LIMIT)) fail('amount');
  return Number(value);
}

export function tradeCashMovement(state) {
  let result = 0n;
  for (const trade of state.investmentTrades || []) {
    if (!trade || !['buy', 'sell'].includes(trade.side) || !amountValid(trade.amount) || trade.amount === 0) fail();
    result += BigInt(trade.amount) * (trade.side === 'sell' ? 1n : -1n);
  }
  return checked(result);
}

// Cash exists independently of goals; an empty goal list must not hide money.
export function cashBalance(state) {
  if (!amountValid(state.opening) || !Array.isArray(state.entries)) fail();
  let cash = BigInt(state.opening);
  for (const entry of state.entries) {
    if (!entry || !['income', 'expense', 'saving'].includes(entry.type) || !amountValid(entry.amount) || entry.amount === 0) fail();
    if (entry.type === 'income') cash += BigInt(entry.amount);
    if (entry.type === 'expense') cash -= BigInt(entry.amount);
    // Legacy savings transfers never create or remove another cash contribution.
  }
  return checked(cash + BigInt(tradeCashMovement(state)));
}

function calculate(state) {
  if (!Array.isArray(state.holdings) || state.holdings.length > WEALTH_LIMITS.holdings
    || !Array.isArray(state.investmentTrades) || state.investmentTrades.length > WEALTH_LIMITS.trades
    || !Array.isArray(state.liabilities) || state.liabilities.length > WEALTH_LIMITS.liabilities) fail();
  const ids = new Set((state.entries || []).map(entry => entry.id)), positions = new Map(), quantities = new Map();
  for (const holding of state.holdings) {
    if (!holding || !idValid(holding.id) || ids.has(holding.id) || !['stock', 'crypto'].includes(holding.kind)
      || !nameValid(holding.name) || typeof holding.symbol !== 'string' || !/^[A-Za-z0-9._:/-]{0,20}$/.test(holding.symbol)
      || !decimalValid(holding.openingQuantity) || !decimalValid(holding.price) || !dateValid(holding.valuedAt)) fail();
    validateHoldingMetadata(holding, state.profile?.currency);
    ids.add(holding.id); positions.set(holding.id, holding); quantities.set(holding.id, atoms(holding.openingQuantity));
  }
  const chronological = state.investmentTrades.map((trade, index) => ({ trade, index }));
  for (const { trade } of chronological) {
    if (!trade || !idValid(trade.id) || ids.has(trade.id) || !positions.has(trade.holdingId) || !dateValid(trade.date)
      || !['buy', 'sell'].includes(trade.side) || !decimalValid(trade.quantity, false)
      || !amountValid(trade.amount) || trade.amount === 0) fail();
    ids.add(trade.id);
  }
  chronological.sort((a, b) => a.trade.date.localeCompare(b.trade.date) || a.index - b.index);
  for (const { trade } of chronological) {
    const quantity = quantities.get(trade.holdingId) + atoms(trade.quantity) * (trade.side === 'buy' ? 1n : -1n);
    if (quantity < 0n) fail('tradeOversell');
    // Keep derived quantities inside the same precision/size boundary as inputs.
    if (quantity >= 1000000000000n * SCALE) fail();
    quantities.set(trade.holdingId, quantity);
  }
  let debt = 0n;
  for (const liability of state.liabilities) {
    if (!liability || !idValid(liability.id) || ids.has(liability.id) || !nameValid(liability.name) || !amountValid(liability.amount)) fail();
    ids.add(liability.id); debt += BigInt(liability.amount);
  }
  let investments = 0n;
  const holdings = state.holdings.map(holding => {
    const quantity = fromAtoms(quantities.get(holding.id)), value = holdingValue(quantity, holding.price);
    investments += BigInt(value); return { ...holding, quantity, value };
  });
  const cash = cashBalance(state);
  return { cash, investments: checked(investments), liabilities: checked(debt), netWorth: checked(BigInt(cash) + investments - debt), holdings,
    trades: chronological.reverse().map(({ trade }) => ({ ...trade })) };
}
export function validateWealth(state) { calculate(state); return state; }
export function wealthSummary(state) { return calculate(state); }

function commit(state, fields) { validateWealth({ ...state, ...fields }); Object.assign(state, fields); }
function holdingInput(input, id) {
  return { id, kind: input.kind, name: String(input.name ?? '').trim(), symbol: String(input.symbol ?? '').trim().toUpperCase(),
    openingQuantity: normalizeDecimal(input.openingQuantity ?? '0'), price: normalizeDecimal(input.price ?? '0'), valuedAt: input.valuedAt ?? today(),
    ...(input.market != null ? { market: structuredClone(input.market) } : {}),
    ...(input.quote != null ? { quote: structuredClone(input.quote) } : {}) };
}
export function createHolding(state, input) {
  if (state.holdings.length >= WEALTH_LIMITS.holdings) fail('limitReached');
  const holding = holdingInput(input, newId(input)); commit(state, { holdings: [...state.holdings, holding] }); return holding;
}
export function updateHolding(state, id, patch) {
  const existing = state.holdings.find(holding => holding.id === id); if (!existing) fail('holdingMissing');
  const holding = holdingInput({ ...existing, ...patch }, id);
  if (holding.price !== existing.price || holding.valuedAt !== existing.valuedAt || holding.kind !== existing.kind || holding.symbol !== existing.symbol
    || JSON.stringify(marketFields(holding.market)) !== JSON.stringify(marketFields(existing.market))) delete holding.quote;
  commit(state, { holdings: state.holdings.map(item => item.id === id ? holding : item) }); return holding;
}
export function removeHolding(state, id) {
  if (!state.holdings.some(holding => holding.id === id)) fail('holdingMissing');
  if (state.investmentTrades.some(trade => trade.holdingId === id)) fail('holdingUsed');
  commit(state, { holdings: state.holdings.filter(holding => holding.id !== id) });
}
function tradeInput(input, id) {
  return { id, holdingId: input.holdingId, side: input.side, quantity: normalizeDecimal(input.quantity, false), amount: input.amount, date: input.date ?? today() };
}
export function recordTrade(state, input) {
  if (state.investmentTrades.length >= WEALTH_LIMITS.trades) fail('limitReached');
  const trade = tradeInput(input, newId(input)); commit(state, { investmentTrades: [...state.investmentTrades, trade] }); return trade;
}
export function updateTrade(state, id, patch) {
  const existing = state.investmentTrades.find(trade => trade.id === id); if (!existing) fail('tradeMissing');
  const trade = tradeInput({ ...existing, ...patch }, id); commit(state, { investmentTrades: state.investmentTrades.map(item => item.id === id ? trade : item) }); return trade;
}
export function removeTrade(state, id) {
  if (!state.investmentTrades.some(trade => trade.id === id)) fail('tradeMissing');
  commit(state, { investmentTrades: state.investmentTrades.filter(trade => trade.id !== id) });
}
function liabilityInput(input, id) { return { id, name: String(input.name ?? '').trim(), amount: input.amount }; }
export function createLiability(state, input) {
  if (state.liabilities.length >= WEALTH_LIMITS.liabilities) fail('limitReached');
  const liability = liabilityInput(input, newId(input)); commit(state, { liabilities: [...state.liabilities, liability] }); return liability;
}
export function updateLiability(state, id, patch) {
  const existing = state.liabilities.find(liability => liability.id === id); if (!existing) fail('liabilityMissing');
  const liability = liabilityInput({ ...existing, ...patch }, id); commit(state, { liabilities: state.liabilities.map(item => item.id === id ? liability : item) }); return liability;
}
export function removeLiability(state, id) {
  if (!state.liabilities.some(liability => liability.id === id)) fail('liabilityMissing');
  commit(state, { liabilities: state.liabilities.filter(liability => liability.id !== id) });
}
