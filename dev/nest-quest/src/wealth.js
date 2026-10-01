import './wealth.css';
import { localDate } from './model.js';
import { t, money, locale } from './i18n.js';
import { icon } from './icons.js';
import { wealthSummary, holdingValue, normalizeDecimal } from './wealth-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const errorField = '<p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p>';
const kindIcon = kind => icon(kind === 'crypto' ? 'coins' : 'leaf');
const kindName = kind => t(kind === 'crypto' ? 'wealthCrypto' : 'wealthStock');
const decimalText = value => {
  const [whole, fraction] = normalizeDecimal(value).split('.');
  const separator = new Intl.NumberFormat(locale()).formatToParts(1.1).find(part => part.type === 'decimal').value;
  return new Intl.NumberFormat(locale()).format(BigInt(whole)) + (fraction ? `${separator}${fraction}` : '');
};
const dateText = value => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const centsInput = amount => amount == null ? '' : `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
const actionButton = (action, id, label, symbol, extra = '') => `<button type="button" class="icon-button" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(label)}" ${extra}>${icon(symbol)}</button>`;

export function wealthOverviewHTML(state) {
  const total = wealthSummary(state), currency = state.profile.currency;
  const formattedWorth = money(total.netWorth, currency);
  const valueSize = formattedWorth.length > 20 ? 'long' : formattedWorth.length > 16 ? 'medium' : formattedWorth.length > 11 ? 'short' : 'normal';
  return `<section class="wealth-overview panel" aria-labelledby="wealth-overview-title">
    <div class="wealth-overview-heading"><div><span class="tiny-label">${esc(t('wealthKicker'))}</span><h2 id="wealth-overview-title">${esc(t('wealthNetWorth'))}</h2></div><div class="wealth-overview-actions"><span class="wealth-currency">${esc(currency)}</span><button type="button" class="button button-small button-outline" data-action="holding-owned">${icon('plus')}${esc(t('wealthAddInvestment'))}</button></div></div>
    <strong class="wealth-total ${total.netWorth < 0 ? 'negative' : ''}" data-value-size="${valueSize}">${esc(formattedWorth)}</strong>
    <p class="wealth-formula">${esc(t('wealthFormula'))}</p>
    <div class="wealth-stat-grid">${[['wealthCash', total.cash, 'wallet'], ['wealthInvestments', total.investments, 'leaf'], ['wealthDebt', total.liabilities, 'bills']].map(([label, amount, symbol], index) => index === 0 ? `<button type="button" class="wealth-stat wealth-stat-edit" data-action="wealth-cash" aria-label="${esc(t('wealthEditCash'))}">${icon(symbol)}${icon('edit', 'wealth-stat-edit-icon')}<span>${esc(t(label))}</span><strong class="${amount < 0 ? 'negative' : ''}">${esc(money(amount, currency))}</strong></button>` : `<div class="wealth-stat">${icon(symbol)}<span>${esc(t(label))}</span><strong class="${amount < 0 ? 'negative' : ''}">${esc(money(amount, currency))}</strong></div>`).join('')}</div>
    <p class="wealth-manual-note">${esc(t('wealthManualValues', { currency }))}</p>
    <p class="wealth-village-basis">${esc(t('wealthVillageBasis'))}</p>
  </section>`;
}

export function wealthHTML(state, { overview = true, tradeLimit = 12 } = {}) {
  const total = wealthSummary(state), currency = state.profile.currency;
  const holdings = [...total.holdings].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, locale()));
  const cards = holdings.map(holding => {
    const used = state.investmentTrades.some(trade => trade.holdingId === holding.id);
    return `<article class="wealth-holding"><div class="wealth-holding-heading"><span class="wealth-asset-mark ${holding.kind}">${kindIcon(holding.kind)}</span><div><span class="wealth-holding-kind">${esc(kindName(holding.kind))}${holding.symbol ? ` · ${esc(holding.symbol)}` : ''}</span><h3>${esc(holding.name)}</h3></div><div class="wealth-card-actions">${actionButton('holding-edit', holding.id, t('wealthEditNamed', { name: holding.name }), 'edit')}${actionButton('holding-remove', holding.id, t('wealthRemoveNamed', { name: holding.name }), 'close', used ? `disabled title="${esc(t('holdingUsed'))}"` : '')}</div></div>
      <strong class="wealth-holding-value">${esc(money(holding.value, currency))}</strong><p class="wealth-position-math">${esc(t('wealthUnits', { n: decimalText(holding.quantity) }))}<span aria-hidden="true"> × </span>${esc(decimalText(holding.price))} ${esc(currency)}</p>
      <p class="wealth-valued-at">${esc(t('wealthValuedAt', { date: dateText(holding.valuedAt) }))}</p><div class="wealth-trade-actions"><button type="button" class="button button-small button-outline" data-action="holding-buy" data-id="${esc(holding.id)}">${icon('plus')}${esc(t('wealthBuy'))}</button><button type="button" class="button button-small button-outline" data-action="holding-sell" data-id="${esc(holding.id)}" ${holding.quantity === '0' ? 'disabled' : ''}>${icon('arrow')}${esc(t('wealthSell'))}</button></div></article>`;
  }).join('');
  const debts = state.liabilities.map(liability => `<article class="wealth-debt-row"><span class="wealth-asset-mark debt">${icon('bills')}</span><div><h3>${esc(liability.name)}</h3><strong>${esc(money(liability.amount, currency))}</strong></div><div class="wealth-card-actions">${actionButton('liability-edit', liability.id, t('wealthEditNamed', { name: liability.name }), 'edit')}${actionButton('liability-remove', liability.id, t('wealthRemoveNamed', { name: liability.name }), 'close')}</div></article>`).join('');
  const limit = Math.max(12, Math.min(total.trades.length, Math.floor(Number(tradeLimit) || 12)));
  const trades = total.trades.slice(0, limit).map(trade => {
    const holding = state.holdings.find(item => item.id === trade.holdingId);
    return `<article class="wealth-transfer-row"><div class="wealth-transfer-copy"><strong>${esc(holding.name)}</strong><span>${esc(t(trade.side === 'buy' ? 'wealthPurchase' : 'wealthSale'))} · ${esc(t('wealthUnits', { n: decimalText(trade.quantity) }))} · ${esc(dateText(trade.date))}</span></div><strong class="wealth-transfer-amount">${trade.side === 'buy' ? '−' : '+'}${esc(money(trade.amount, currency))}</strong><div class="wealth-card-actions">${actionButton('trade-edit', trade.id, t('wealthEditTransfer', { name: holding.name }), 'edit')}${actionButton('trade-remove', trade.id, t('wealthRemoveTransfer', { name: holding.name }), 'close')}</div></article>`;
  }).join('');
  return `${overview ? wealthOverviewHTML(state) : ''}<section class="wealth-holdings-panel panel" aria-labelledby="wealth-holdings-title"><div class="wealth-section-heading"><div><span class="tiny-label">${esc(t('wealthManualPortfolio'))}</span><h2 id="wealth-holdings-title">${esc(t('wealthYourInvestments'))}</h2></div><div class="wealth-add-actions"><button type="button" class="button button-small button-outline" data-action="holding-owned">${icon('plus')}${esc(t('wealthAlreadyOwn'))}</button><button type="button" class="button button-small" data-action="holding-purchase">${icon('coins')}${esc(t('wealthNewPurchase'))}</button></div></div>${holdings.length ? `<div class="wealth-holdings-grid">${cards}</div>` : `<div class="wealth-empty">${icon('leaf')}<p>${esc(t('wealthEmptyHoldings'))}</p></div>`}<p class="wealth-panel-note">${esc(t('wealthTransferShort'))}</p></section>
    <details class="wealth-debts panel" data-wealth-debts><summary><span>${icon('bills')}<strong>${esc(t('wealthDebtsOptional'))}</strong></span><span class="wealth-disclosure-total">${esc(money(total.liabilities, currency))}</span>${icon('arrow', 'wealth-chevron')}</summary><div class="wealth-disclosure-content">${debts || `<p class="wealth-empty-note">${esc(t('wealthNoDebts'))}</p>`}<button type="button" class="button button-small button-outline" data-action="liability-add">${icon('plus')}${esc(t('wealthAddDebt'))}</button></div></details>
    ${total.trades.length ? `<details class="wealth-transfers panel" data-wealth-trades><summary><span>${icon('arrow')}<strong>${esc(t('wealthTransfers'))}</strong></span><span class="wealth-disclosure-count">${total.trades.length}</span>${icon('arrow', 'wealth-chevron')}</summary><div class="wealth-disclosure-content"><p class="wealth-panel-note">${esc(t('wealthTransferShort'))}</p>${trades}${limit < total.trades.length ? `<button type="button" class="button button-small button-outline wealth-more" data-action="trade-more">${esc(t('wealthMoreTransfers', { n: total.trades.length - limit }))}</button>` : ''}</div></details>` : ''}`;
}

export function holdingPreviewHTML(state, { quantity = '', price = '', id = '', mode = 'owned' } = {}) {
  try {
    const value = mode === 'edit' && id ? wealthSummary({ ...state, holdings: state.holdings.map(holding => holding.id === id ? { ...holding, openingQuantity: normalizeDecimal(quantity), price: normalizeDecimal(price) } : holding) }).holdings.find(holding => holding.id === id).value : holdingValue(quantity, price);
    return `<span>${esc(t('wealthMarkedValue'))}</span><strong>${esc(money(value, state.profile.currency))}</strong>`;
  } catch { return `<span>${esc(t('wealthPreviewHint'))}</span>`; }
}

export function holdingFormHTML(state, { id = '', mode = 'owned', tradeId = '' } = {}) {
  const trade = tradeId ? state.investmentTrades.find(item => item.id === tradeId) : null;
  const effectiveId = trade?.holdingId || id;
  const holding = state.holdings.find(item => item.id === effectiveId);
  const current = wealthSummary(state).holdings.find(item => item.id === effectiveId);
  const selectedMode = trade?.side || (['owned', 'purchase', 'edit', 'buy', 'sell'].includes(mode) ? mode : 'owned');
  const trading = selectedMode === 'buy' || selectedMode === 'sell';
  const purchasing = selectedMode === 'purchase', editing = selectedMode === 'edit';
  const title = trade ? t(selectedMode === 'sell' ? 'wealthEditSale' : 'wealthEditPurchase') : t({ owned: 'wealthAddOwned', purchase: 'wealthRecordPurchase', edit: 'wealthEditHolding', buy: 'wealthRecordBuy', sell: 'wealthRecordSale' }[selectedMode]);
  const quantity = trade?.quantity ?? (editing ? holding?.openingQuantity || '0' : '');
  const price = holding?.price || '';
  const date = trade?.date || (editing ? holding?.valuedAt : null) || localDate();
  const currency = state.profile.currency;
  return `<p class="eyebrow wealth-form-kicker">${esc(t('wealthYourInvestments'))}</p><h2>${esc(title)}</h2><p class="modal-description wealth-form-description">${esc(t(trading || purchasing ? 'wealthTradeHint' : editing ? 'wealthEditHint' : 'wealthOwnedHint'))}</p>
    <form id="holding-form" class="wealth-form" data-mode="${selectedMode}" data-id="${esc(effectiveId)}" data-trade-id="${esc(trade?.id || '')}">
      ${trading ? `<div class="wealth-form-asset"><span class="wealth-asset-mark ${holding.kind}">${kindIcon(holding.kind)}</span><div><strong>${esc(holding.name)}</strong><span>${esc(t('wealthCurrentlyHeld', { n: decimalText(current.quantity) }))}</span></div></div>` : `<fieldset class="wealth-kind-picker"><legend>${esc(t('wealthAssetType'))}</legend>${['stock', 'crypto'].map(kind => `<label><input type="radio" name="kind" value="${kind}" ${kind === (holding?.kind || 'stock') ? 'checked' : ''}><span>${kindIcon(kind)}${esc(kindName(kind))}</span></label>`).join('')}</fieldset><div class="field"><label for="holding-name">${esc(t('wealthAssetName'))}</label><input id="holding-name" name="name" value="${esc(holding?.name || '')}" maxlength="64" required autocomplete="off" placeholder="${esc(t('wealthAssetExample'))}" autofocus></div>`}
      <div class="wealth-form-fields ${trading ? '' : 'paired'}"><div class="field"><label for="holding-quantity">${esc(t(editing ? 'wealthOpeningQuantity' : 'wealthQuantity'))}</label><input id="holding-quantity" name="quantity" value="${esc(quantity)}" inputmode="decimal" maxlength="21" required autocomplete="off" placeholder="0.00" ${trading ? 'autofocus' : ''}></div>${trading ? '' : `<div class="field"><label for="holding-price">${esc(t('wealthUnitPrice', { currency }))}</label><input id="holding-price" name="price" value="${esc(price)}" inputmode="decimal" maxlength="21" required autocomplete="off" placeholder="0.00"></div>`}</div>
      ${trading || purchasing ? `<div class="field"><label for="holding-amount">${esc(t(selectedMode === 'sell' ? 'wealthCashReceived' : 'wealthCashPaid', { currency }))}</label><input id="holding-amount" name="amount" value="${esc(centsInput(trade?.amount))}" inputmode="decimal" maxlength="11" required autocomplete="off" placeholder="0.00"></div>` : ''}
      ${trading ? '' : `<output id="holding-value-preview" class="wealth-value-preview" aria-live="polite">${holdingPreviewHTML(state, { quantity, price, id: effectiveId, mode: selectedMode })}</output>${editing ? `<p class="wealth-form-note">${esc(t('wealthOpeningHint', { n: decimalText(current.quantity) }))}</p>` : ''}`}
      <details class="wealth-form-details"><summary>${esc(t('entryDetails'))}</summary><div class="wealth-form-fields paired">${trading ? '' : `<div class="field"><label for="holding-symbol">${esc(t('wealthSymbol'))}</label><input id="holding-symbol" name="symbol" value="${esc(holding?.symbol || '')}" maxlength="20" autocomplete="off" placeholder="AAPL / BTC"></div>`}<div class="field"><label for="holding-date">${esc(t(trading || purchasing ? 'date' : 'wealthValuationDate'))}</label><input id="holding-date" name="date" type="date" value="${esc(date)}" min="2000-01-01" max="${localDate()}" required></div></div></details>${errorField}<button type="submit" class="button button-full">${icon(trading || purchasing ? 'coins' : 'check')}${esc(t(trade ? 'wealthSaveTransfer' : trading || purchasing ? 'wealthSaveTrade' : 'wealthSaveHolding'))}</button>
    </form>`;
}

export function liabilityFormHTML(state, { id = '' } = {}) {
  const liability = state.liabilities.find(item => item.id === id);
  return `<p class="eyebrow wealth-form-kicker">${esc(t('wealthDebt'))}</p><h2>${esc(t(liability ? 'wealthEditDebt' : 'wealthAddDebt'))}</h2><p class="modal-description wealth-form-description">${esc(t('wealthDebtHint'))}</p><form id="liability-form" class="wealth-form" data-id="${esc(id)}"><div class="field"><label for="liability-name">${esc(t('wealthDebtName'))}</label><input id="liability-name" name="name" value="${esc(liability?.name || '')}" maxlength="64" required autocomplete="off" placeholder="${esc(t('wealthDebtExample'))}" autofocus></div><div class="field"><label for="liability-amount">${esc(t('wealthDebtAmount', { currency: state.profile.currency }))}</label><input id="liability-amount" name="amount" value="${esc(centsInput(liability?.amount))}" inputmode="decimal" maxlength="11" required autocomplete="off" placeholder="0.00"></div>${errorField}<button type="submit" class="button button-full">${icon('check')}${esc(t('wealthSaveDebt'))}</button></form>`;
}
