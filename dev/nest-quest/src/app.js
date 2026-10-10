import './styles.css';
import './adventure.css';
import './upgrades.css';
import './spending.css';
import './village.css';
import './scene-layout.css';
import './polish.css';
import './wealth.css';
import { createState, validateState, summarize, demoState, parseMoney, validDate, validMonth, localDate, uuid, csv } from './model.js';
import { GOAL_MILESTONES, goalSummary, goalReaction } from './goals.js';
import { adventureHTML, portfolioTitle, companionPosition, pathLengthAt } from './adventure.js';
import { t, money, locale, language, setLanguage, applyLanguage } from './i18n.js';
import { icon } from './icons.js';
import { entryHTML } from './entry.js';
import { CATEGORY_ICONS, categoryOptions, categoryById, normalizeCategoryName } from './categories.js';
import { goalDraft, readGoalDraft, goalEditorHTML, newGoal } from './goal-editor.js';
import { spendingHTML } from './spending.js';
import { mountVillage } from './village.js';
import { wealthSummary, createHolding, updateHolding, removeHolding, recordTrade, updateTrade, removeTrade, createLiability, updateLiability, removeLiability, applyHoldingQuotes, holdingQuoteSignature, normalizeDecimal } from './wealth-model.js';
import { wealthHTML, wealthOverviewHTML, holdingFormHTML, liabilityFormHTML, holdingPreviewHTML } from './wealth.js';
import { fetchHoldingPrices } from './market-prices.js';
import { CRYPTO_ASSETS } from './market-assets.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isDemo = new URLSearchParams(location.search).get('demo') === '1';
const isPriceDemo = isDemo && new URLSearchParams(location.search).get('prices') === 'sample';
const localKey = isPriceDemo ? 'nestquest:price-demo:v1' : isDemo ? 'nestquest:demo:v1' : 'nestquest:local:v1';
let localStore;
try { localStore = isDemo ? sessionStorage : localStorage; } catch { /* Report inaccessible storage below. */ }
let damagedSave = null, storageWarning = false, staleTab = false;
let state = readLocal();
let month = localDate().slice(0, 7), quickType = 'expense', ledgerFilter = 'all', ledgerLimit = 12, tradeLimit = 12;
let reaction = null, villageReaction = null, reactionActive = false, reactionPrevious = null, reactionTimer;
let account = null, syncEnabled = false, syncPaused = false, syncBusy = false, saveQueued = false, cloudErrorKey = null;
let lastSyncedRevision = null, lastDeviceRevision = state.revision;
let pendingAccount = null, cloudModule = null, modalCleanup = null, toastTimer, modalEpoch = 0;
const modal = $('#modal'), entrySheet = $('#entry-sheet');
let quickCategory = 'groceries', entryDraft = null, entryOwnerEpoch = 0, villageCleanup = null, villageOwnerEpoch = 0;
let recoverAccount = null;
let pricesBusy = false, pricesResult = null, priceFailures = {}, priceController = null, priceSequence = 0, lastPriceRequest = 0;
let activeView = ['#wealth', '#village-view'].includes(location.hash) ? 'wealth' : 'budget';
try { if (!location.hash && sessionStorage.getItem('nestquest:view') === 'wealth') activeView = 'wealth'; } catch { /* Navigation works without storage. */ }
if (!isDemo) {
  try {
    const savedAccount = JSON.parse(sessionStorage.getItem('nestquest:active') || 'null');
    if (savedAccount?.id && typeof savedAccount.id === 'string') {
      const stored = sessionStorage.getItem(`nestquest:account:${savedAccount.id}`);
      if (stored) {
        const cached = validateState(JSON.parse(stored));
        recoverAccount = { ...savedAccount, cached }; state = cached; damagedSave = null;
      }
    }
  } catch { /* An invalid account cache cannot replace a local adventure. */ }
}

function readLocal() {
  try {
    const raw = localStore.getItem(localKey);
    if (raw) {
      try { return validateState(JSON.parse(raw)); }
      catch { damagedSave = raw; }
    }
  } catch { storageWarning = true; }
  return isDemo ? priceDemoState() : createState();
}
function priceDemoState() {
  const sample = demoState();
  if (!isPriceDemo) return sample;
  createHolding(sample, { kind: 'stock', name: 'Example shares', symbol: 'DEMO', openingQuantity: '12.5', price: '100',
    market: { provider: 'licensed', id: 'DEMO', symbol: 'DEMO', currency: 'USD' } });
  createHolding(sample, { kind: 'crypto', name: 'Bitcoin', symbol: 'BTC', openingQuantity: '0.025', price: '70000',
    market: { provider: 'coinlore', id: '90', symbol: 'BTC', currency: 'USD' } });
  return validateState(sample);
}
function accountDeviceKey() { return `nestquest:account:${account?.userId || recoverAccount?.id}`; }
function storeDevice() {
  try {
    if (account || recoverAccount) {
      sessionStorage.setItem(accountDeviceKey(), JSON.stringify(state));
      sessionStorage.setItem('nestquest:active', JSON.stringify({ id: account?.userId || recoverAccount.id, lastSyncedRevision }));
    } else { localStore.setItem(localKey, JSON.stringify(state)); lastDeviceRevision = state.revision; }
    storageWarning = false;
  } catch { storageWarning = true; }
}
function checkOtherTab() {
  if (account || recoverAccount || isDemo || damagedSave) return;
  try {
    const current = JSON.parse(localStore.getItem(localKey) || 'null');
    if (current && current.revision !== lastDeviceRevision) staleTab = true;
  } catch { /* The write still reports storage failure. */ }
  if (staleTab) throw new Error('multiTab');
}
function mutate(change, { animate = true } = {}) {
  if (damagedSave) throw new Error('invalidSave');
  checkOtherTab();
  const next = structuredClone(state);
  change(next);
  next.revision = uuid(); next.updatedAt = new Date().toISOString();
  validateState(next);
  if (animate) {
    const change = goalReaction(state, next), wealthDelta = wealthSummary(next).netWorth - wealthSummary(state).netWorth;
    const investmentChanged = JSON.stringify(state.holdings) !== JSON.stringify(next.holdings) || JSON.stringify(state.investmentTrades) !== JSON.stringify(next.investmentTrades) || JSON.stringify(state.liabilities) !== JSON.stringify(next.liabilities);
    setReaction({ ...change, wealthDelta, valuation: investmentChanged && !change.transfer }, goalSummary(state));
  }
  else clearReaction();
  state = next; storeDevice(); render();
  if (syncEnabled && account && !syncPaused) scheduleCloudSave();
}
function scheduleCloudSave() {
  saveQueued = true;
  if (syncBusy) return;
  void flushCloudSave();
}
async function flushCloudSave() {
  if (syncBusy || !account || !syncEnabled || syncPaused) return;
  syncBusy = true; renderSaveStatus();
  const owner = account;
  try {
    while (saveQueued && account === owner && syncEnabled && !syncPaused) {
      saveQueued = false;
      const snapshot = structuredClone(state);
      await owner.repository.save(snapshot);
      if (account !== owner) return;
      lastSyncedRevision = snapshot.revision; storeDevice();
      if (state.revision !== snapshot.revision) saveQueued = true;
    }
  } catch (error) {
    if (account === owner) {
      syncPaused = true;
      cloudErrorKey = ['cloudConflict', 'sessionEnded', 'missingVersion'].includes(error.message) ? error.message : 'cloudError';
    }
  } finally { syncBusy = false; renderSaveStatus(); }
}
function errorText(error) {
  const key = error?.message;
  const known = ['invalidSave', 'cloudConflict', 'sessionEnded', 'missingVersion', 'questNotReady', 'notEnoughGold', 'passwordMismatch', 'multiTab', 'limitReached', 'cloudUnavailable', 'waitSync', 'goalError', 'goalsRequired', 'goalLimit', 'categoryError', 'categoryDuplicate', 'categoryUsed', 'categoryLimit', 'wealthNameError', 'wealthSymbolError', 'futureDate', 'holdingMissing', 'holdingUsed', 'tradeMissing', 'tradeOversell', 'liabilityMissing', 'pricesFormChanged'];
  return t(key === 'amount' ? 'amountError' : known.includes(key) ? key : 'cloudError');
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
function dateLabel(value) { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)); }
function monthLabel(value) { return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00`)); }
function cash(amount) { return money(amount, state.profile.currency); }
function renderSaveStatus() {
  const key = damagedSave ? 'corruptLocal' : storageWarning ? 'storageError' : account || recoverAccount ? syncPaused ? 'cloudPaused' : syncBusy || state.revision !== lastSyncedRevision ? 'savingCloud' : 'synced' : isDemo ? 'sessionSave' : 'local';
  $('#save-status').textContent = t(key);
  $('#save-status').classList.toggle('warning', storageWarning || syncPaused || staleTab);
  $('#account-label').textContent = account || recoverAccount ? t('cloud') : t('connect');
  $('#account-button').setAttribute('aria-label', account || recoverAccount ? t('cloud') : t('connect'));
  const warning = damagedSave ? 'corruptLocal' : staleTab ? 'multiTab' : storageWarning ? 'storageError' : cloudErrorKey;
  const banner = $('#save-banner'); banner.hidden = !warning;
  if (warning) {
    banner.innerHTML = `<span>${esc(t(warning))}</span><span class="notice-actions"><button class="button button-small button-outline" data-action="${damagedSave ? 'raw-export' : 'export'}">${esc(t(damagedSave ? 'rawExport' : 'export'))}</button>${staleTab ? `<button class="button button-small" data-action="reload">${esc(t('reload'))}</button>` : damagedSave ? `<button class="button button-small button-outline" data-action="reset">${esc(t('reset'))}</button>` : cloudErrorKey ? `<button class="button button-small button-outline" data-action="reconnect">${esc(t('reconnect'))}</button>` : ''}</span>`;
  }
}
function clearReaction() {
  clearTimeout(reactionTimer); reaction = null; villageReaction = null; reactionActive = false; reactionPrevious = null;
}
function setReaction(next, previous) {
  clearTimeout(reactionTimer);
  reaction = next; reactionActive = !!(next.delta || next.wealthDelta || next.pet || next.transfer || next.valuation); reactionPrevious = previous;
  villageReaction = { ...next, delta: next.wealthDelta ?? next.delta };
  if (reactionActive) reactionTimer = setTimeout(() => {
    reactionActive = false; reactionPrevious = null;
    document.querySelectorAll('.reactive-map, .hero-sidebar').forEach(element => element.classList.remove('reacting-up', 'reacting-down', 'reacting-complete', 'reacting-pet'));
    $('.floating-amount')?.replaceChildren();
  }, 4200);
}
function render() {
  applyLanguage(); document.title = `Nest & Quest — ${t('adventure')}`;
  $('#page-title').textContent = t('dashboardTitle');
  $('#month').value = month; $('#month').max = localDate().slice(0, 7);
  $('#demo-banner').hidden = !isDemo; $('#account-button').hidden = isDemo;
  if (isPriceDemo) $('#demo-banner [data-i18n]').textContent = t('pricesDemoNotice');
  const total = summarize(state, month);
  $('#summary').innerHTML = [['income', total.income], ['spent', total.expense], ['monthNet', total.income - total.expense]].map(([label, value]) =>
    `<article class="monthly-stat"><span>${esc(t(label))}</span><strong class="${value < 0 ? 'negative' : ''}">${esc(cash(value))}</strong></article>`).join('');
  const journeyOpen = $('.journey-journal')?.open || false;
  const debtsOpen = $('.wealth-debts')?.open || false, tradesOpen = $('.wealth-transfers')?.open || false;
  const current = goalSummary(state);
  // Keep the entire scene root: its observers and input handlers belong to it.
  // Account/import changes invalidate the view as well as any open entry draft.
  let retainedVillage = villageCleanup?.update && current && villageOwnerEpoch === entryOwnerEpoch ? $('#village-view') : null;
  if (retainedVillage) retainedVillage.remove();
  else { villageCleanup?.(); villageCleanup = null; }
  $('#adventure-view').innerHTML = adventureHTML(state, { reaction, reactionActive, previous: reactionPrevious, type: quickType, month });
  $('#money-actions').replaceChildren(...$('#adventure-view').querySelectorAll('.adventure-actions, .mobile-dock'));
  $('.journey-journal').open = journeyOpen;
  if (retainedVillage) $('#village-view').replaceWith(retainedVillage);
  $('#activity-count').textContent = String(total.entries.length);
  $('#spending-view').innerHTML = spendingHTML(state, total);
  $('#wealth-summary-view').innerHTML = wealthOverviewHTML(state);
  $('#networth-view').innerHTML = wealthHTML(state, { overview: false, tradeLimit, pricesBusy, pricesSample: isPriceDemo,
    pricesMessage: pricesResult ? t(pricesResult.key, pricesResult.values) : '',
    priceFailures: Object.fromEntries(Object.entries(priceFailures).map(([id, key]) => [id, t(key)])) });
  if ($('.wealth-debts')) $('.wealth-debts').open = debtsOpen;
  if ($('.wealth-transfers')) $('.wealth-transfers').open = tradesOpen;
  renderLedger(total); renderSaveStatus();
  const village = $('#village-view');
  const villageTotal = { ...current, balance: wealthSummary(state).netWorth, currency: state.profile.currency };
  const options = { reaction: villageReaction, reactionActive, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  if (current && village) {
    if (retainedVillage) villageCleanup.update(villageTotal, options);
    else villageCleanup = mountVillage(village, villageTotal, options);
    villageOwnerEpoch = entryOwnerEpoch;
  }
  renderView();
  if (current) requestAnimationFrame(() => {
    const position = companionPosition(current.ratio), map = $('.reactive-map');
    if (!map) return;
    // Establish the previous frame before changing the newly rendered world.
    $('.goal-hud').getBoundingClientRect();
    map.style.setProperty('--unrevealed', `${Math.max(0, 100 - Math.min(100, position.x + 12))}%`);
    $('.path-progress').style.strokeDashoffset = String(100 - pathLengthAt(current.ratio));
    const traveller = $('#route-traveller');
    traveller.style.left = `${position.x}%`; traveller.style.top = `${position.y}%`;
    $('.goal-progress span').style.width = `${current.ratio * 100}%`;
    for (const goal of current.goals) {
      const progress = $(`[data-goal-id="${goal.id}"] .portfolio-progress span`);
      if (progress) progress.style.width = `${goal.ratio * 100}%`;
    }
  });
}
function renderView() {
  $('#budget-view').hidden = activeView !== 'budget'; $('#wealth-view').hidden = activeView !== 'wealth';
  document.querySelectorAll('[data-view]').forEach(button => { const selected = button.dataset.view === activeView; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
}
function selectView(next, { focus = false } = {}) {
  activeView = next === 'wealth' ? 'wealth' : 'budget'; renderView();
  try { sessionStorage.setItem('nestquest:view', activeView); } catch { /* Keep the view in memory. */ }
  history.replaceState(null, '', `${location.pathname}${location.search}#${activeView}`);
  if (focus) $(`#${activeView}-tab`).focus();
}
function renderLedger(total) {
  const filtered = total.entries.filter(entry => ledgerFilter === 'all' || entry.type === ledgerFilter);
  const options = ['all', 'income', 'expense', ...(state.entries.some(entry => entry.type === 'saving') ? ['saving'] : [])];
  $('#ledger-view').innerHTML = `<div class="ledger-filter"><select id="entry-filter" aria-label="${esc(t('allTypes'))}">${options.map(id => `<option value="${id}" ${id === ledgerFilter ? 'selected' : ''}>${esc(t(id === 'all' ? 'allTypes' : id === 'saving' ? 'legacyTransfer' : id))}</option>`).join('')}</select><span>${esc(monthLabel(month))} · ${filtered.length}</span><button class="button button-small button-outline" data-action="csv">${icon('download')}${esc(t('downloadCsv'))}</button></div>
    <div class="ledger-list">${total.entries.length === 0 ? `<div class="empty-state">${icon('wallet')}<h3>${esc(t('emptyEntries'))}</h3><p>${esc(t('emptyEntriesBody'))}</p></div>` : filtered.length === 0 ? `<div class="empty-state"><p>${esc(t('noFiltered'))}</p></div>` : filtered.slice(0, ledgerLimit).map(entry => {
      const category = categoryById(state, entry.category);
      const label = entry.type === 'expense' ? category?.name || t(category?.id || 'other') : t(entry.type === 'saving' ? 'legacyTransfer' : 'income');
      const name = entry.note || label;
      return `<button class="entry-row" data-edit="${entry.id}" aria-label="${esc(`${t('editEntry')}: ${name}, ${cash(entry.amount)}`)}"><span class="entry-symbol ${entry.type}">${icon(entry.type === 'expense' ? category?.icon : entry.type === 'saving' ? 'jar' : 'wallet')}</span><span class="entry-info"><span class="entry-name">${esc(name)}</span><span class="entry-meta">${esc(dateLabel(entry.date))} · ${esc(label)}</span></span><span class="entry-amount ${entry.type}">${entry.type === 'income' ? '+' : entry.type === 'expense' ? '−' : ''}${esc(cash(entry.amount))}</span>${icon('edit', 'entry-edit-icon')}</button>`;
    }).join('')}</div>${filtered.length > ledgerLimit ? `<button class="button button-small button-outline button-full" data-action="more-entries">${esc(t('showMore'))}</button>` : ''}`;
}
function quickValues() {
  return $('#quick-entry-form') ? Object.fromEntries(new FormData($('#quick-entry-form'))) : entryDraft;
}
function openEntry(type = quickType) {
  if (!state.goals.length || !state.profile.started) { ensureGoal(); return; }
  quickType = type === 'income' ? 'income' : 'expense';
  entrySheet.innerHTML = entryHTML(state, { type: quickType, category: quickCategory, draft: entryDraft });
  if (!entrySheet.open) entrySheet.showModal();
  syncEntryViewport(); updateEntryImpact();
  // Let touch users choose a category before opening the numeric keyboard.
  if (matchMedia('(pointer: fine)').matches) $('#quick-amount').focus();
}
function syncEntryViewport() {
  if (!entrySheet.open) return;
  const view = window.visualViewport;
  entrySheet.style.setProperty('--sheet-height', `${view?.height || innerHeight}px`);
  entrySheet.style.setProperty('--sheet-offset', `${Math.max(0, innerHeight - (view?.height || innerHeight) - (view?.offsetTop || 0))}px`);
}
window.visualViewport?.addEventListener('resize', syncEntryViewport);
window.visualViewport?.addEventListener('scroll', syncEntryViewport);
function closeEntry({ discard = false } = {}) {
  entryDraft = discard ? null : quickValues();
  entrySheet.close();
}
function resetEntryDraft() {
  cancelPriceRefresh();
  entryOwnerEpoch++; tradeLimit = 12;
  if (entrySheet.open) entrySheet.close();
  entryDraft = null; quickCategory = 'groceries'; entrySheet.replaceChildren();
}
function selectQuickType(type) {
  entryDraft = quickValues();
  const detailsOpen = $('.entry-details')?.open;
  openEntry(type);
  $('.entry-details').open = !!detailsOpen;
}
function selectCategory(category) {
  if (!categoryById(state, category)) return;
  quickCategory = category; $('#quick-category').value = category;
  document.querySelectorAll('[data-category]').forEach(button => {
    const active = button.dataset.category === category;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  updateEntryImpact();
}
function updateEntryImpact() {
  const target = $('#entry-impact'); if (!target) return;
  let amount;
  try { amount = parseMoney($('#quick-amount').value); } catch { /* Empty amounts keep the short instruction. */ }
  target.textContent = amount ? t(quickType === 'income' ? 'incomeAdds' : 'expenseReduces', { amount: cash(amount) }) : t(quickType === 'income' ? 'quickIncomeHint' : 'quickExpenseHint');
}
function revealReaction() {
  if (!reactionActive) return;
  if (activeView === 'budget') { toast(t('entrySaved')); return; }
  $('#companion-button').focus({ preventScroll: true });
  const speech = $('#companion-speech'); speech.textContent = speech.textContent;
  const map = $('.adventure-hero'), box = map.getBoundingClientRect();
  if (box.bottom < 100 || box.top > innerHeight - 120) {
    map.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

// One native dialog keeps keyboard focus inside each form and returns it to the
// invoking control. Financial text is escaped on every render.
function openModal(content, { closeable = true, onClose } = {}) {
  if (entrySheet.open) closeEntry();
  modalEpoch++;
  const previousCleanup = modalCleanup; modalCleanup = null;
  if (previousCleanup) previousCleanup();
  modalCleanup = onClose || null;
  $('#modal-content').innerHTML = `<div class="modal-shell">${closeable ? `<button class="modal-close" type="button" data-action="close" aria-label="${esc(t('close'))}">${icon('close')}</button>` : ''}${content}</div>`;
  modal.dataset.closeable = String(closeable);
  if (!modal.open) modal.showModal();
  const first = modal.querySelector('[autofocus]'); if (first) first.focus();
}
function closeModal() { modalEpoch++; const cleanup = modalCleanup; modalCleanup = null; if (cleanup) cleanup(); modal.close(); }
function formError(message) {
  const target = entrySheet.open ? $('#quick-error') : modal.open ? $('#form-error') : null;
  if (target) { target.textContent = message; target.hidden = false; target.focus(); }
  else toast(message);
}
const errorField = '<p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p>';
function ensureGoal() {
  if (!damagedSave && !recoverAccount && (!state.profile.started || !state.goals.length)) goalModal({ required: true });
}
function onboarding() { ensureGoal(); }
function goalModal({ required = false, draft = null } = {}) {
  const value = draft || goalDraft(state);
  openModal(goalEditorHTML(state, value, isDemo), { closeable: !required });
  $('#goal-form').goalDraft = value;
}
function holdingModal(options = {}) {
  cancelPriceRefresh();
  render();
  openModal(holdingFormHTML(state, options), { onClose: () => { $('#holding-form')?.priceController?.abort(); } });
  const form = $('#holding-form'), holding = state.holdings.find(item => item.id === form.dataset.id);
  form.ownerEpoch = entryOwnerEpoch;
  form.holdingSignature = holding ? holdingQuoteSignature(holding) : null;
}
function liabilityModal(id = '') { openModal(liabilityFormHTML(state, { id })); }
function wealthSaved(key) { closeModal(); toast(t(key)); }
function cancelPriceRefresh() {
  priceSequence++; priceController?.abort(); priceController = null; pricesBusy = false; pricesResult = null; priceFailures = {};
}
async function refreshPrices() {
  if (pricesBusy) return;
  if (Date.now() - lastPriceRequest < 15000) { toast(t('pricesWait')); return; }
  const holdings = wealthSummary(state).holdings.filter(holding => holding.market);
  if (!holdings.length) { toast(t('pricesChoose')); return; }
  const epoch = entryOwnerEpoch, currency = state.profile.currency, owner = account, recovering = recoverAccount, sequence = ++priceSequence;
  const controller = new AbortController(); priceController = controller;
  pricesBusy = true; pricesResult = null; priceFailures = {}; lastPriceRequest = Date.now(); render();
  try {
    const result = await fetchHoldingPrices(holdings, currency, { signal: controller.signal, sample: isPriceDemo });
    if (sequence !== priceSequence || epoch !== entryOwnerEpoch || currency !== state.profile.currency || owner !== account || recovering !== recoverAccount) return;
    priceFailures = result.failures;
    const applicable = result.updates.filter(update => state.holdings.some(holding => holding.id === update.id && holdingQuoteSignature(holding) === update.expected));
    let applied = [];
    if (applicable.length) mutate(next => { applied = applyHoldingQuotes(next, applicable).applied; });
    const failed = Object.keys(result.failures).length + result.updates.length - applied.length;
    pricesResult = { key: applied.length ? failed ? 'pricesPartial' : 'pricesReady' : 'pricesNoChange', values: { n: applied.length, failed } };
    if (applied.length) revealReaction();
  } catch (error) {
    if (sequence === priceSequence && epoch === entryOwnerEpoch) pricesResult = { key: error.message === 'multiTab' ? 'multiTab' : 'priceNetwork' };
  } finally {
    if (sequence === priceSequence) { pricesBusy = false; priceController = null; render(); }
  }
}
function formMarket(form) {
  const data = new FormData(form), asset = CRYPTO_ASSETS.find(asset => asset.id === data.get('market'));
  const existing = state.holdings.find(item => item.id === form.dataset.id);
  const symbol = String(data.get('symbol')).trim().toUpperCase();
  if (data.get('kind') === 'crypto') {
    if (asset && asset.symbol === symbol) return { provider: 'coinlore', id: asset.id, symbol: asset.symbol, currency: 'USD' };
    if (existing?.market?.provider === 'coinlore' && existing.market.id === data.get('market') && existing.symbol === symbol) return existing.market;
  }
  return existing?.kind === data.get('kind') && existing?.market?.provider === 'licensed' && existing.symbol === symbol ? existing.market : null;
}
async function fetchFormPrice() {
  const form = $('#holding-form'); if (!form) return;
  const market = formMarket(form), output = $('#holding-price-status');
  if (!market) { output.textContent = t('pricesChoose'); return; }
  const controller = new AbortController(); form.priceController?.abort(); form.priceController = controller;
  const ownerEpoch = entryOwnerEpoch, currency = state.profile.currency, owner = account, recovering = recoverAccount, priceInput = $('#holding-price');
  const inputPrice = priceInput.value, inputSymbol = $('#holding-symbol').value, selectedMarket = $('#holding-market').value;
  const button = form.querySelector('[data-action="holding-price"]'); button.disabled = true; output.textContent = t('wealthUpdatingPrices');
  try {
    const values = Object.fromEntries(new FormData(form));
    const holding = { id: form.dataset.id || uuid(), kind: 'crypto', name: values.name || market.symbol, symbol: market.symbol,
      openingQuantity: normalizeDecimal(values.quantity || '0'), price: normalizeDecimal(values.price || '0'), valuedAt: localDate(), market };
    const result = await fetchHoldingPrices([holding], currency, { signal: controller.signal, sample: isPriceDemo });
    if (!form.isConnected || form.priceController !== controller || ownerEpoch !== entryOwnerEpoch || currency !== state.profile.currency || owner !== account || recovering !== recoverAccount) return;
    if (priceInput.value !== inputPrice || $('#holding-symbol').value !== inputSymbol || $('#holding-market').value !== selectedMarket) return;
    const quote = result.updates[0]?.quote;
    if (!quote) { output.textContent = t(result.failures[holding.id] || 'priceNetwork'); return; }
    priceInput.value = quote.price; $('#holding-date').value = localDate(new Date(quote.fetchedAt)); form.priceQuote = quote;
    $('#holding-value-preview').innerHTML = holdingPreviewHTML(state, { quantity: new FormData(form).get('quantity'), price: quote.price, id: form.dataset.id, mode: form.dataset.mode });
    output.textContent = t('wealthPriceCheckedAt', { date: new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(quote.fetchedAt)) });
  } catch { if (form.isConnected && form.priceController === controller) output.textContent = t('priceNetwork'); }
  finally { if (form.isConnected && form.priceController === controller) { button.disabled = !$('#holding-market').value; form.priceController = null; } }
}
function choosePreset(kind) {
  const form = $('#goal-form'); if (!form) return;
  const draft = readGoalDraft(form);
  const existing = kind !== 'custom' && draft.goals.find(goal => goal.kind === kind);
  if (existing) draft.goals = draft.goals.filter(goal => goal.id !== existing.id);
  else {
    if (draft.goals.length >= 12) { formError(t('goalLimit')); return; }
    draft.goals.push(newGoal(kind));
  }
  goalModal({ required: !state.goals.length, draft });
  if (kind === 'custom') modal.querySelector('.goal-editor-row:last-child input').focus();
}
function removeGoal(id) {
  const draft = readGoalDraft($('#goal-form'));
  draft.goals = draft.goals.filter(goal => goal.id !== id);
  goalModal({ required: !state.goals.length, draft });
}
function categoriesModal({ returnToEntry = false, editId = null } = {}) {
  const category = state.customCategories.find(item => item.id === editId);
  const ownerEpoch = entryOwnerEpoch;
  const colors = ['#729573', '#df9d66', '#8292b5', '#a98ab0', '#ca8ca5', '#7caaa6'];
  const used = id => state.entries.some(entry => entry.category === id);
  openModal(`<p class="eyebrow">${esc(t('category'))}</p><h2>${esc(t(category ? 'editCategory' : 'addCategory'))}</h2>
    <form id="category-form" data-id="${category?.id || ''}"><div class="field"><label for="category-name">${esc(t('categoryName'))}</label><input id="category-name" name="name" value="${esc(category?.name || '')}" maxlength="32" required autocomplete="off" placeholder="${esc(t('categoryExample'))}"></div>
    <fieldset class="category-icon-picker"><legend>${esc(t('categoryIcon'))}</legend><div>${CATEGORY_ICONS.map(id => `<button type="button" data-category-icon="${id}" class="icon-choice ${(category?.icon || 'other') === id ? 'selected' : ''}" aria-pressed="${(category?.icon || 'other') === id}" aria-label="${esc(t(id))}">${icon(id)}</button>`).join('')}</div><input name="icon" id="category-icon" type="hidden" value="${category?.icon || 'other'}"></fieldset>
    <fieldset class="category-color-picker"><legend>${esc(t('categoryColor'))}</legend><div>${[...new Set([category?.color, ...colors].filter(Boolean))].map((color, i) => `<button type="button" class="color-choice ${(category?.color || colors[0]) === color ? 'selected' : ''}" style="--swatch:${color}" data-category-color="${color}" aria-pressed="${(category?.color || colors[0]) === color}" aria-label="${esc(t('colorChoice', { n: i + 1 }))}">${icon('check')}</button>`).join('')}</div><input name="color" id="category-color" type="hidden" value="${category?.color || colors[0]}"></fieldset>
    ${errorField}<button class="button button-full" type="submit">${esc(t(category ? 'saveCategory' : 'addCategory'))}${icon('plus')}</button></form>
    ${state.customCategories.length ? `<div class="custom-category-list"><h3>${esc(t('yourCategories'))}</h3>${state.customCategories.map(item => `<div class="custom-category-row"><span style="color:${item.color}">${icon(item.icon)}</span><strong>${esc(item.name)}</strong><button type="button" class="icon-button" data-action="edit-category" data-id="${item.id}" aria-label="${esc(t('editCategoryName', { name: item.name }))}">${icon('edit')}</button><button type="button" class="icon-button" data-action="remove-category" data-id="${item.id}" ${used(item.id) ? 'disabled' : ''} aria-label="${esc(t('removeCategoryName', { name: item.name }))}" title="${esc(t(used(item.id) ? 'categoryUsed' : 'removeCategoryName', { name: item.name }))}">${icon('close')}</button></div>`).join('')}<p class="fine-print">${esc(t('categoryKeepHistory'))}</p></div>` : ''}`, {
      onClose: returnToEntry ? () => queueMicrotask(() => {
        if (!modal.open && entryOwnerEpoch === ownerEpoch) openEntry(quickType);
      }) : undefined,
    });
  $('#category-form').returnToEntry = returnToEntry;
}
function entryModal(id) {
  const existing = state.entries.find(entry => entry.id === id); if (!existing) return;
  openModal(`<p class="eyebrow">${esc(t(existing.type === 'saving' ? 'legacyTransfer' : existing.type))} · ${state.profile.currency}</p><h2>${esc(t('editEntry'))}</h2>${existing.type === 'saving' ? `<p class="modal-description">${esc(t('legacyHint'))}</p>` : '<div style="height:20px"></div>'}
    <form id="entry-form" data-type="${existing.type}" data-id="${id}"><div class="form-grid"><div class="field"><label for="entry-amount">${esc(t('amount'))} (${state.profile.currency})</label><input name="amount" id="entry-amount" value="${(existing.amount / 100).toFixed(2)}" inputmode="decimal" maxlength="11" required autofocus></div><div class="field"><label for="entry-date">${esc(t('date'))}</label><input name="date" id="entry-date" type="date" value="${existing.date}" min="2000-01-01" max="${localDate()}" required></div></div>
    ${existing.type === 'expense' ? `<div class="field"><label for="entry-category">${esc(t('category'))}</label><select name="category" id="entry-category">${categoryOptions(state).map(category => `<option value="${category.id}" ${category.id === existing.category ? 'selected' : ''}>${esc(category.name || t(category.id))}</option>`).join('')}</select></div>` : ''}<div class="field"><label for="entry-note">${esc(t('note'))}</label><input name="note" id="entry-note" value="${esc(existing.note)}" maxlength="160" autocomplete="off"></div>${errorField}<div class="form-actions"><button type="button" class="button button-outline" data-action="close">${esc(t('cancel'))}</button><button class="button" type="submit">${esc(t('saveEntry'))}</button></div><button type="button" class="modal-link danger" data-action="delete-entry" data-id="${id}">${esc(t('deleteEntry'))}</button></form>`);
}
function landmarkModal(index) {
  const total = goalSummary(state); if (!total || !Number.isInteger(index) || index < 0 || index > 5) return;
  const open = index <= total.milestone;
  openModal(`<img class="modal-art" src="/dev/nest-quest/art/ember-${total.stage}.webp" alt="${esc(state.profile.name)}"><p class="eyebrow">${Math.round(GOAL_MILESTONES[index] * 100)}% · ${esc(t(open ? 'checkpointBuilt' : 'checkpointLocked'))}</p><h2>${esc(t(`landmark${index}`))}</h2><p class="modal-description">${esc(t(`landmarkStory${index}`))}</p>${open ? '' : `<p class="checkpoint-needed">${esc(t('checkpointNeed', { amount: cash(Math.ceil(total.target * GOAL_MILESTONES[index])) }))}</p>`}<p class="fine-print">${esc(t('checkpointRule'))}</p><button class="button button-full" data-action="close">${esc(t('continue'))}</button>`);
}
function settingsModal() {
  openModal(`<p class="eyebrow">${esc(t('settings'))}</p><h2>${esc(t('backupTitle'))}</h2><p class="modal-description">${esc(t('backupBody'))}</p><div class="field"><label for="rename-companion">${esc(t('companionName'))}</label><form id="rename-form" class="form-grid"><input name="name" id="rename-companion" value="${esc(state.profile.name)}" maxlength="24" required><button class="button button-small" type="submit">${esc(t('savePlan'))}</button></form></div><p class="fine-print">${esc(state.profile.currency)} · ${esc(t('noCurrencyChange'))}</p><div class="form-divider"></div>
    <div class="settings-buttons"><button class="button button-outline" data-action="export">${icon('download')}${esc(t('export'))}</button><button class="button button-outline" data-action="import">${icon('upload')}${esc(t('import'))}</button><button class="button button-outline" data-action="goal">${icon('jar')}${esc(t('manageGoals'))}</button><button class="button button-outline" data-action="categories">${icon('other')}${esc(t('yourCategories'))}</button></div>
    ${account || recoverAccount ? `<div class="settings-account"><span class="tiny-label">${esc(t('cloud'))}</span><p>${esc(account?.email || t('cloudPaused'))}</p><button class="button button-small button-outline" data-action="sign-out">${esc(t('signOut'))}</button>${account ? `<br><button class="modal-link danger" data-action="remove-cloud">${esc(t('removeCloud'))}</button>` : ''}</div>` : `<div class="form-divider"></div><button class="modal-link danger" data-action="reset">${esc(t('reset'))}</button>`}
    <p class="onboard-foot"><a href="./privacy.html?lang=${language()}" target="_blank" rel="noopener">${esc(t('privacy'))}</a></p>${errorField}`);
}
function download(text, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSave() { download(JSON.stringify(state, null, 2), `nest-quest-${localDate()}.json`); }
function confirmAction(title, description, buttonLabel, action, danger = false) {
  openModal(`<h2>${esc(t(title))}</h2><p class="modal-description">${esc(description)}</p>${errorField}<div class="form-actions"><button class="button button-outline" data-action="close">${esc(t('cancel'))}</button><button class="button ${danger ? 'button-danger' : ''}" id="confirm-action">${esc(t(buttonLabel))}</button></div>`);
  $('#confirm-action').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await action(); } catch (error) { formError(errorText(error)); if ($('#confirm-action')) $('#confirm-action').disabled = false; }
  });
}
async function importSave(file) {
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('invalidSave');
    const imported = validateState(JSON.parse(await file.text()));
    confirmAction('importAsk', t('importBody', { name: imported.profile.name, n: imported.entries.length, currency: imported.profile.currency }), 'continue', () => {
      mutate(next => { Object.assign(next, structuredClone(imported)); }); resetEntryDraft();
      month = localDate().slice(0, 7); closeModal(); render(); ensureGoal(); toast(t('restored'));
    });
  } catch { toast(t('invalidSave')); }
}

// Authentication is loaded only on request or when restoring a previously
// enabled account save in this tab. Guest play makes no AWS requests.
async function getCloudModule() { cloudModule ||= await import('./cloud.js'); return cloudModule; }
async function accountModal() {
  if (isDemo || damagedSave) return;
  if (account && !syncPaused) { settingsModal(); return; }
  openModal(`<p class="eyebrow">${esc(t('cloud'))}</p><h2>${esc(t('signInTitle'))}</h2><p class="modal-description">${esc(t('signInBody'))}</p><p id="connect-loading" class="fine-print">${esc(t('loggingIn'))}</p>${errorField}`);
  const epoch = modalEpoch;
  try {
    const cloud = await getCloudModule(), auth = await cloud.getSession();
    if (!modal.open || modalEpoch !== epoch || !$('#connect-loading')) return;
    if (auth) { await prepareAccount(auth, epoch); return; }
    loginForm();
  } catch (error) { if (modalEpoch === epoch) { formError(errorText(error)); $('#connect-loading')?.remove(); } }
}
function loginForm() {
  openModal(`<p class="eyebrow">${esc(t('cloud'))}</p><h2>${esc(t('signInTitle'))}</h2><p class="modal-description">${esc(t('signInBody'))}</p><form id="login-form"><div class="field"><label for="login-email">${esc(t('email'))}</label><input id="login-email" name="email" type="email" required autocomplete="username" autofocus></div><div class="field"><label for="login-password">${esc(t('password'))}</label><input id="login-password" name="password" type="password" required autocomplete="current-password"></div>${errorField}<button class="button button-full" type="submit">${esc(t('signIn'))}${icon('arrow')}</button></form><p class="onboard-foot">${esc(t('existingAccounts'))} <a href="/contact/?lang=${language()}" target="_blank" rel="noopener">${esc(t('requestAccess'))}</a></p><p class="onboard-foot"><a href="/portal/" target="_blank" rel="noopener">${esc(t('recovery'))}</a></p>`);
}
async function prepareAccount(auth, epoch = modalEpoch) {
  const nextAccount = await (await getCloudModule()).connectAccount(auth);
  let remote;
  try { remote = await nextAccount.repository.load(); }
  catch (error) { nextAccount.close(); throw error; }
  if (!modal.open || modalEpoch !== epoch) { nextAccount.close(); return; }
  const old = pendingAccount;
  if (old) old.close();
  pendingAccount = nextAccount;
  const remoteSummary = remote ? copySummary(remote) : '';
  const ownSummary = copySummary(state);
  openModal(`<p class="eyebrow">${esc(t('cloud'))}</p><h2>${esc(t(remote ? 'cloudChoiceTitle' : 'signInTitle'))}</h2><p class="modal-description">${esc(t(remote ? 'cloudChoiceBody' : 'cloudEmpty'))}</p>
    ${remote ? `<div class="cloud-option"><span class="tiny-label">${esc(t('cloud'))}</span><p class="cloud-detail">${esc(remoteSummary)}</p><button class="button button-small" id="use-cloud">${esc(t('useCloud'))}</button></div>` : ''}
    <div class="cloud-option"><span class="tiny-label">${esc(t('local'))}</span><p class="cloud-detail">${esc(ownSummary)}</p><button class="button button-small ${remote ? 'button-outline' : ''}" id="use-device">${esc(t(remote ? 'useDevice' : 'enableCloud'))}</button></div><button class="modal-link" data-action="export">${esc(t('export'))}</button>${errorField}`, { onClose: () => { if (pendingAccount === nextAccount) { nextAccount.close(); pendingAccount = null; } } });
  const enable = async useRemote => {
    $('#use-device').disabled = true; if ($('#use-cloud')) $('#use-cloud').disabled = true;
    const choiceEpoch = modalEpoch, snapshot = structuredClone(state);
    modal.dataset.closeable = 'false';
    const closeButton = modal.querySelector('.modal-close'); if (closeButton) closeButton.disabled = true;
    try {
      if (!useRemote) await nextAccount.repository.save(snapshot);
      if (!modal.open || modalEpoch !== choiceEpoch || pendingAccount !== nextAccount) { nextAccount.close(); return; }
      if (!useRemote && state.revision !== snapshot.revision) throw new Error('cloudConflict');
      const previous = account;
      const previousId = previous?.userId || recoverAccount?.id;
      if (previous) previous.close();
      if (previousId && previousId !== nextAccount.userId) { try { sessionStorage.removeItem(`nestquest:account:${previousId}`); } catch { /* Optional session cache. */ } }
      account = nextAccount; pendingAccount = null; recoverAccount = null; resetEntryDraft();
      if (useRemote) state = structuredClone(remote);
      lastSyncedRevision = state.revision; syncEnabled = true; syncPaused = false; cloudErrorKey = null; saveQueued = false;
      clearReaction(); storeDevice(); closeModal(); render(); toast(t('cloudLoaded'));
      ensureGoal();
    } catch (error) {
      if (modalEpoch !== choiceEpoch || pendingAccount !== nextAccount) return;
      modal.dataset.closeable = 'true'; if (closeButton) closeButton.disabled = false;
      formError(errorText(error)); $('#use-device').disabled = false; if ($('#use-cloud')) $('#use-cloud').disabled = false;
    }
  };
  $('#use-device').addEventListener('click', () => { void enable(false); });
  $('#use-cloud')?.addEventListener('click', () => { void enable(true); });
}
async function restoreAccount() {
  const saved = recoverAccount;
  let restored;
  try {
    const cloud = await getCloudModule(), auth = await cloud.getSession();
    if (!auth || auth.session.getIdToken().payload.sub !== saved.id) throw new Error('sessionEnded');
    restored = await cloud.connectAccount(auth); const remote = await restored.repository.load();
    if (recoverAccount !== saved) { restored.close(); return; }
    account = restored; recoverAccount = null; lastSyncedRevision = saved.lastSyncedRevision;
    const dirty = state.revision !== saved.lastSyncedRevision;
    if (!remote || dirty && remote.revision !== saved.lastSyncedRevision) {
      syncPaused = true; cloudErrorKey = 'cloudConflict';
    } else if (dirty) { syncEnabled = true; scheduleCloudSave(); }
    else {
      if (remote.revision !== state.revision) {
        resetEntryDraft(); if (modal.open) closeModal();
      }
      state = structuredClone(remote); syncEnabled = true; lastSyncedRevision = state.revision;
    }
    clearReaction(); storeDevice(); render(); ensureGoal();
  } catch (error) { restored?.close(); if (recoverAccount === saved) { syncPaused = true; cloudErrorKey = error.message === 'sessionEnded' ? 'sessionEnded' : 'cloudError'; render(); } }
}
async function disconnect({ signOut = true } = {}) {
  if (syncBusy) throw new Error('waitSync');
  resetEntryDraft();
  const id = account?.userId || recoverAccount?.id;
  account?.close(); account = null; recoverAccount = null; syncEnabled = false; syncPaused = false; cloudErrorKey = null;
  if (id) { try { sessionStorage.removeItem(`nestquest:account:${id}`); sessionStorage.removeItem('nestquest:active'); } catch { /* No durable account copy was made. */ } }
  if (signOut) (await getCloudModule()).signOut();
  state = readLocal(); lastDeviceRevision = state.revision; lastSyncedRevision = null; clearReaction(); closeModal(); render();
  ensureGoal();
}

function copySummary(copy) {
  const total = goalSummary(copy);
  return `${t('cloudSummary', { name: copy.profile.name, goal: copy.goals.length ? portfolioTitle(copy) : t('noGoalYet'), fund: money(total?.balance || 0, copy.profile.currency), entries: copy.entries.length })} · ${t('wealthSnapshotSummary', { netWorth: money(wealthSummary(copy).netWorth, copy.profile.currency), n: copy.holdings.length })}`;
}
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
$('#month').addEventListener('change', event => {
  if (!validMonth(event.target.value) || event.target.value > localDate().slice(0, 7)) { event.target.value = month; return; }
  month = event.target.value; ledgerLimit = 12; render();
});
$('#settings-button').addEventListener('click', settingsModal);
entrySheet.addEventListener('cancel', event => { event.preventDefault(); closeEntry(); });
entrySheet.addEventListener('click', event => { if (event.target === entrySheet) closeEntry(); });
document.addEventListener('input', event => {
  if (event.target.id === 'quick-amount') updateEntryImpact();
  const form = event.target.closest('#holding-form');
  if (form && ['holding-price', 'holding-symbol', 'holding-date'].includes(event.target.id)) {
    form.priceQuote = null; form.priceController?.abort(); form.priceController = null;
    if (event.target.id === 'holding-symbol' && formMarket(form) === null) $('#holding-market').value = '';
    const priceButton = form.querySelector('[data-action="holding-price"]'); if (priceButton) priceButton.disabled = !$('#holding-market').value;
  }
  if (form && $('#holding-value-preview')) { const values = Object.fromEntries(new FormData(form)); $('#holding-value-preview').innerHTML = holdingPreviewHTML(state, { quantity: values.quantity, price: values.price, id: form.dataset.id, mode: form.dataset.mode }); }
});
$('.game-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); selectView(event.key === 'Home' ? 'budget' : event.key === 'End' ? 'wealth' : activeView === 'budget' ? 'wealth' : 'budget', { focus: true });
});
document.addEventListener('invalid', event => { const details = event.target.closest('details'); if (details) details.open = true; }, true);
$('#account-button').addEventListener('click', () => { void accountModal(); });
$('#import-file').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; void importSave(file); });
modal.addEventListener('cancel', event => { if (modal.dataset.closeable === 'false') event.preventDefault(); });
modal.addEventListener('close', () => { const cleanup = modalCleanup; modalCleanup = null; if (cleanup) cleanup(); });
modal.addEventListener('click', event => { if (event.target === modal && modal.dataset.closeable !== 'false') closeModal(); });
document.addEventListener('change', event => {
  const holdingForm = event.target.closest('#holding-form');
  if (holdingForm && (event.target.name === 'kind' || event.target.id === 'holding-market')) {
    holdingForm.priceQuote = null; holdingForm.priceController?.abort(); holdingForm.priceController = null;
    const kind = new FormData(holdingForm).get('kind');
    for (const row of holdingForm.querySelectorAll('[data-markets-for]')) row.hidden = row.dataset.marketsFor !== kind;
    if (event.target.name === 'kind') $('#holding-market').value = '';
    const asset = CRYPTO_ASSETS.find(asset => asset.id === $('#holding-market').value);
    if (kind === 'crypto' && asset) { $('#holding-name').value = asset.name; $('#holding-symbol').value = asset.symbol; $('#holding-price').value = ''; }
    $('#holding-quantity-label').textContent = t(holdingForm.dataset.mode === 'edit' ? kind === 'crypto' ? 'wealthOpeningCoins' : 'wealthOpeningShares' : kind === 'crypto' ? 'wealthCoins' : 'wealthShares');
    holdingForm.querySelector('[data-action="holding-price"]').disabled = !formMarket(holdingForm) || kind !== 'crypto';
    $('#holding-price-status').textContent = '';
  }
  if (event.target.id === 'entry-filter') { ledgerFilter = event.target.value; ledgerLimit = 12; renderLedger(summarize(state, month)); }
  if (event.target.id === 'currency') {
    const draft = readGoalDraft($('#goal-form'));
    goalModal({ required: !state.goals.length, draft });
    $('#currency').focus();
  }
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.view) { selectView(target.dataset.view); return; }
  if (target.dataset.lang) {
    // Keep an unfinished entry when switching language.
    if (entrySheet.open) entryDraft = quickValues();
    const draft = modal.open && $('#goal-form') ? readGoalDraft($('#goal-form')) : null;
    setLanguage(target.dataset.lang); render();
    if (entrySheet.open) openEntry(quickType);
    if (modal.open) {
      if (draft) goalModal({ required: !state.goals.length, draft });
      else closeModal();
    }
    return;
  }
  if (target.dataset.quickType) { selectQuickType(target.dataset.quickType); return; }
  if (target.dataset.category) { selectCategory(target.dataset.category); return; }
  if (target.dataset.categoryIcon || target.dataset.categoryColor) {
    const attribute = target.dataset.categoryIcon ? 'categoryIcon' : 'categoryColor';
    const value = target.dataset[attribute];
    $(attribute === 'categoryIcon' ? '#category-icon' : '#category-color').value = value;
    target.parentElement.querySelectorAll('button').forEach(button => { const selected = button.dataset[attribute] === value; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    return;
  }
  if (target.dataset.preset) { choosePreset(target.dataset.preset); return; }
  if (target.dataset.edit) { entryModal(target.dataset.edit); return; }
  const action = target.dataset.action, id = target.dataset.id; if (!action) return;
  try {
    if (action === 'close') closeModal();
    if (action === 'close-entry') closeEntry();
    if (action === 'add-expense') openEntry('expense');
    if (action === 'add-income') openEntry('income');
    if (action === 'remove-goal') removeGoal(id);
    if (action === 'categories') categoriesModal({ returnToEntry: entrySheet.open });
    if (action === 'edit-category') categoriesModal({ returnToEntry: $('#category-form')?.returnToEntry, editId: id });
    if (action === 'remove-category') {
      if (state.entries.some(entry => entry.category === id)) throw new Error('categoryUsed');
      const returnToEntry = $('#category-form')?.returnToEntry;
      mutate(next => { next.customCategories = next.customCategories.filter(item => item.id !== id); }, { animate: false });
      if (entryDraft?.category === id) { entryDraft.category = 'groceries'; quickCategory = 'groceries'; }
      categoriesModal({ returnToEntry });
    }
    if (action === 'goal' || action === 'wealth-cash') { goalModal({ required: !state.goals.length }); if (action === 'wealth-cash') $('#goal-opening').focus(); }
    if (action === 'holding-owned') holdingModal({ mode: 'owned' });
    if (action === 'prices-update') await refreshPrices();
    if (action === 'holding-price') await fetchFormPrice();
    if (action === 'holding-purchase') holdingModal({ mode: 'purchase' });
    if (['holding-edit', 'holding-buy', 'holding-sell'].includes(action)) holdingModal({ id, mode: action.slice(8) });
    if (action === 'trade-edit') holdingModal({ tradeId: id });
    if (action === 'liability-add' || action === 'liability-edit') liabilityModal(id);
    if (action === 'trade-more') { tradeLimit += 40; render(); }
    if (action === 'holding-remove') confirmAction('wealthRemoveHoldingAsk', t('wealthRemoveHoldingBody'), 'wealthRemove', () => {
      mutate(next => removeHolding(next, id)); wealthSaved('wealthRemoved');
    }, true);
    if (action === 'trade-remove') confirmAction('wealthRemoveTransferAsk', t('wealthRemoveTransferBody'), 'wealthRemove', () => {
      mutate(next => removeTrade(next, id)); wealthSaved('wealthRemoved');
    }, true);
    if (action === 'liability-remove') confirmAction('wealthRemoveDebtAsk', t('wealthRemoveDebtBody'), 'wealthRemove', () => {
      mutate(next => removeLiability(next, id)); wealthSaved('wealthRemoved');
    }, true);
    if (action === 'login-first') { closeModal(); await accountModal(); }
    if (action === 'landmark') landmarkModal(Number(id));
    if (action === 'pet') { setReaction({ pet: true, delta: 0, direction: 'steady' }, goalSummary(state)); render(); }
    if (action === 'more-entries') { ledgerLimit += 40; renderLedger(summarize(state, month)); }
    if (action === 'csv') download(`\ufeff${csv(state, month)}`, `nest-quest-${month}.csv`, 'text/csv;charset=utf-8');
    if (action === 'export') exportSave();
    if (action === 'raw-export') download(damagedSave, `nest-quest-original-${localDate()}.json`);
    if (action === 'import') $('#import-file').click();
    if (action === 'reload') location.reload();
    if (action === 'reconnect') await accountModal();
    if (action === 'delete-entry') confirmAction('deleteEntryAsk', t('deleteEntryBody'), 'deleteEntry', () => {
      mutate(next => { next.entries = next.entries.filter(entry => entry.id !== id); }); closeModal(); revealReaction(); toast(t('entryDeleted'));
    }, true);
    if (action === 'reset') confirmAction('resetAsk', t('resetBody'), 'reset', () => {
      if (account || recoverAccount) throw new Error('cloudConflict');
      resetEntryDraft(); localStore.removeItem(localKey); damagedSave = null; staleTab = false; state = isDemo ? priceDemoState() : createState(); lastDeviceRevision = state.revision;
      clearReaction(); storeDevice(); closeModal(); render(); if (!isDemo) ensureGoal();
    }, true);
    if (action === 'sign-out') {
      if (syncBusy) throw new Error('waitSync');
      if (state.revision !== lastSyncedRevision) {
        confirmAction('signOutAsk', t('signOutBody'), 'signOut', async () => { await disconnect(); toast(t('signedOut')); });
        const backup = document.createElement('button'); backup.className = 'button button-outline button-full'; backup.dataset.action = 'export'; backup.textContent = t('export');
        modal.querySelector('.form-actions').before(backup);
      } else { await disconnect(); toast(t('signedOut')); }
    }
    if (action === 'remove-cloud') confirmAction('removeCloudAsk', t('removeCloudBody'), 'removeCloud', async () => {
      if (syncBusy) throw new Error('waitSync'); if (!account) throw new Error('cloudUnavailable');
      syncEnabled = false;
      try { await account.repository.remove(); await disconnect(); toast(t('cloudRemoved')); }
      catch (error) { syncPaused = true; cloudErrorKey = 'cloudError'; throw error; }
    }, true);
  } catch (error) { formError(errorText(error)); renderSaveStatus(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['quick-entry-form', 'entry-form', 'goal-form', 'rename-form', 'category-form', 'login-form', 'new-password-form', 'holding-form', 'liability-form'].includes(form.id)) return;
  event.preventDefault(); const data = new FormData(form);
  try {
    if (form.id === 'quick-entry-form' || form.id === 'entry-form') {
      if (!state.goals.length || !state.profile.started) { ensureGoal(); return; }
      const date = data.get('date'); if (!validDate(date) || date > localDate()) { formError(t('futureDate')); return; }
      const type = form.dataset.type, id = form.dataset.id || uuid(), amount = parseMoney(data.get('amount'));
      const previous = state.entries.find(entry => entry.id === id);
      const category = type === 'expense' ? data.get('category') : type;
      const entry = { id, type, amount, date, note: String(data.get('note') || '').trim(), category,
        ...(type === 'expense' ? { essential: previous?.essential ?? categoryById(state, category)?.essential ?? false } : {}) };
      mutate(next => {
        if (!form.dataset.id && next.entries.length >= 10000) throw new Error('limitReached');
        next.entries = next.entries.filter(item => item.id !== id); next.entries.push(entry);
        if (!next.recordDays.includes(date)) next.recordDays.push(date);
      });
      // A dated edit may move into another month's trail, while the lifetime
      // goal remains the same. Re-render only the trail in this case.
      month = date.slice(0, 7); $('#month').value = month;
      $('#activity-count').textContent = String(summarize(state, month).entries.length);
      const total = summarize(state, month);
      renderLedger(total); $('#spending-view').innerHTML = spendingHTML(state, total);
      $('#summary').innerHTML = [['income', total.income], ['spent', total.expense], ['monthNet', total.income - total.expense]].map(([label, value]) => `<article class="monthly-stat"><span>${esc(t(label))}</span><strong class="${value < 0 ? 'negative' : ''}">${esc(cash(value))}</strong></article>`).join('');
      if (entrySheet.open) closeEntry({ discard: true });
      if (modal.open) closeModal(); revealReaction();
      if (!reaction?.delta) toast(t('entrySaved'));
    }
    if (form.id === 'holding-form') {
      if (form.ownerEpoch !== entryOwnerEpoch) throw new Error('pricesFormChanged');
      const mode = form.dataset.mode, id = form.dataset.id, tradeId = form.dataset.tradeId;
      const existingHolding = state.holdings.find(holding => holding.id === id);
      if (form.holdingSignature && (!existingHolding || holdingQuoteSignature(existingHolding) !== form.holdingSignature)) throw new Error('pricesFormChanged');
      const date = data.get('date');
      if (!validDate(date) || date > localDate()) throw new Error('futureDate');
      const quantity = String(data.get('quantity'));
      if (mode === 'buy' || mode === 'sell') {
        const input = { holdingId: id, side: mode, quantity, amount: parseMoney(data.get('amount')), date };
        mutate(next => tradeId ? updateTrade(next, tradeId, input) : recordTrade(next, input));
        wealthSaved('wealthTradeSaved');
      } else {
        const name = String(data.get('name') || '').trim(), symbol = String(data.get('symbol') || '').trim();
        if (!name || name.length > 64) throw new Error('wealthNameError');
        if (!/^[A-Za-z0-9._:/-]{0,20}$/.test(symbol)) throw new Error('wealthSymbolError');
        const input = { kind: data.get('kind'), name, symbol,
          openingQuantity: mode === 'purchase' ? '0' : quantity, price: String(data.get('price')), valuedAt: date,
          market: formMarket(form), quote: form.priceQuote || existingHolding?.quote || null };
        const amount = mode === 'purchase' ? parseMoney(data.get('amount')) : null;
        // One cloned state commits both legs; invalid trades never leave a position behind.
        mutate(next => {
          const holding = mode === 'edit' ? updateHolding(next, id, input) : createHolding(next, input);
          if (form.priceQuote) applyHoldingQuotes(next, [{ id: holding.id, expected: holdingQuoteSignature(holding), quote: form.priceQuote }]);
          if (mode === 'purchase') recordTrade(next, { holdingId: holding.id, side: 'buy', quantity, amount, date });
        });
        wealthSaved(mode === 'purchase' ? 'wealthTradeSaved' : 'wealthHoldingSaved');
      }
    }
    if (form.id === 'liability-form') {
      const name = String(data.get('name') || '').trim();
      if (!name || name.length > 64) throw new Error('wealthNameError');
      const input = { name, amount: parseMoney(data.get('amount'), true) };
      mutate(next => form.dataset.id ? updateLiability(next, form.dataset.id, input) : createLiability(next, input));
      wealthSaved('wealthDebtSaved');
    }
    if (form.id === 'goal-form') {
      const draft = readGoalDraft(form);
      if (!draft.goals.length) throw new Error('goalsRequired');
      const goals = draft.goals.map(goal => {
        const title = String(goal.title).trim(); if (!title || title.length > 64) throw new Error('goalError');
        return { id: goal.id, kind: goal.kind, title, target: parseMoney(goal.amount) };
      });
      const opening = parseMoney(draft.opening, true);
      mutate(next => {
        next.goals = goals; next.opening = opening;
        if (form.dataset.first === 'true' && draft.currency !== next.profile.currency && (next.entries.length || next.holdings.length || next.investmentTrades.length || next.liabilities.length)) throw new Error('goalError');
        if (form.dataset.first === 'true') next.profile = { name: String(draft.name).trim(), currency: draft.currency, started: true };
      }); closeModal(); revealReaction(); if (!reaction?.delta) toast(t('goalUpdated'));
      if (activeView === 'wealth') $('#companion-button').focus({ preventScroll: true });
    }
    if (form.id === 'category-form') {
      const name = String(data.get('name')).trim(), id = form.dataset.id || `custom-${uuid()}`;
      if (!name || name.length > 32) throw new Error('categoryError');
      if (categoryOptions(state).some(item => item.id !== id && normalizeCategoryName(item.name || t(item.id)) === normalizeCategoryName(name))) throw new Error('categoryDuplicate');
      if (!form.dataset.id && state.customCategories.length >= 30) throw new Error('categoryLimit');
      const category = { id, name, icon: data.get('icon'), color: data.get('color') };
      mutate(next => { const index = next.customCategories.findIndex(item => item.id === id); if (index >= 0) next.customCategories[index] = category; else next.customCategories.push(category); }, { animate: false });
      if (form.returnToEntry) { quickCategory = id; if (entryDraft) entryDraft.category = id; }
      closeModal(); toast(t('categorySaved'));
    }
    if (form.id === 'rename-form') { mutate(next => { next.profile.name = String(data.get('name')).trim(); }, { animate: false }); closeModal(); }
    if (form.id === 'login-form') {
      const epoch = modalEpoch;
      const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = t('loggingIn');
      try {
        const auth = await (await getCloudModule()).signIn(String(data.get('email')).trim(), data.get('password'));
        if (!form.isConnected || epoch !== modalEpoch) return;
        $('#login-password').value = '';
        if (auth.status === 'NEW_PASSWORD_REQUIRED') newPasswordModal(auth);
        else await prepareAccount(auth, epoch);
      } catch (error) { if (form.isConnected) { formError(error.message === 'invalidSave' ? t('invalidSave') : t('signInError')); button.disabled = false; button.textContent = t('signIn'); } }
    }
    if (form.id === 'new-password-form') {
      if (data.get('password') !== data.get('confirm')) throw new Error('passwordMismatch');
      const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const auth = await cloudModule.completeNewPassword(form.pendingAuth.user, data.get('password'), form.pendingAuth.userAttributes);
        await prepareAccount(auth);
      } catch { formError(t('signInError')); button.disabled = false; }
    }
  } catch (error) { formError(['holding-form', 'liability-form'].includes(form.id) && error.message === 'amount' ? t('wealthNumberError') : errorText(error)); renderSaveStatus(); }
});
function newPasswordModal(auth) {
  openModal(`<h2>${esc(t('newPasswordTitle'))}</h2><p class="modal-description">${esc(t('newPasswordHelp'))}</p><form id="new-password-form"><div class="field"><label for="new-password">${esc(t('password'))}</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" required autofocus></div><div class="field"><label for="confirm-password">${esc(t('confirmPassword'))}</label><input id="confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="8" required></div>${errorField}<button type="submit" class="button button-full">${esc(t('continue'))}</button></form>`);
  $('#new-password-form').pendingAuth = auth;
}
window.addEventListener('hashchange', () => { activeView = ['#wealth', '#village-view'].includes(location.hash) ? 'wealth' : 'budget'; renderView(); });
window.addEventListener('storage', event => { if (!account && !recoverAccount && event.key === localKey && event.newValue !== JSON.stringify(state)) { staleTab = true; renderSaveStatus(); } });
window.addEventListener('beforeunload', event => { if (storageWarning || ((account || recoverAccount) && state.revision !== (lastSyncedRevision || recoverAccount?.lastSyncedRevision))) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { if (cloudErrorKey === 'cloudError' && account) { syncPaused = false; cloudErrorKey = null; scheduleCloudSave(); } });
window.addEventListener('pageshow', () => { if (!account && !recoverAccount) { try { checkOtherTab(); } catch { renderSaveStatus(); } } });

// Load the other small forms after the initial scene, so an evolution stays visible.
window.addEventListener('load', () => {
  for (const stage of ['young', 'adventurer', 'guardian']) {
    const image = new Image(); image.fetchPriority = 'low'; image.src = `/dev/nest-quest/art/ember-${stage}.webp`;
  }
}, { once: true });
render();
if (recoverAccount) void restoreAccount();
else if ((!state.profile.started || !state.goals.length) && !damagedSave) ensureGoal();
else if (isDemo && !damagedSave) storeDevice();
