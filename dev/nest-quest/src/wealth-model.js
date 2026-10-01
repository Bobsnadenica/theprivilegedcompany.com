// Manual positions in the profile's one base currency. Decimal strings retain
// fractional units exactly; prices never come from a network or quote service.
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
    openingQuantity: normalizeDecimal(input.openingQuantity ?? '0'), price: normalizeDecimal(input.price ?? '0'), valuedAt: input.valuedAt ?? today() };
}
export function createHolding(state, input) {
  if (state.holdings.length >= WEALTH_LIMITS.holdings) fail('limitReached');
  const holding = holdingInput(input, newId(input)); commit(state, { holdings: [...state.holdings, holding] }); return holding;
}
export function updateHolding(state, id, patch) {
  const existing = state.holdings.find(holding => holding.id === id); if (!existing) fail('holdingMissing');
  const holding = holdingInput({ ...existing, ...patch }, id); commit(state, { holdings: state.holdings.map(item => item.id === id ? holding : item) }); return holding;
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
