import './styles.css';
import { CURRENCIES, CATEGORIES, QUESTS, ITEMS, createState, validateState, summarize, progress, questStatus, claimQuest, buyItem, demoState, parseMoney, validDate, validMonth, localDate, uuid, streak, csv } from './model.js';
import { t, money, locale, language, setLanguage, applyLanguage } from './i18n.js';
import { story as chapterStory } from './story.js';
import { icon } from './icons.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isDemo = new URLSearchParams(location.search).get('demo') === '1';
const localKey = isDemo ? 'nestquest:demo:v1' : 'nestquest:local:v1';
let localStore;
try { localStore = isDemo ? sessionStorage : localStorage; } catch { /* Report inaccessible storage below. */ }
let damagedSave = null, storageWarning = false, staleTab = false;
let state = readLocal();
let month = localDate().slice(0, 7), view = 'adventure', selectedQuest = null, ledgerFilter = 'all', ledgerLimit = 40;
let account = null, syncEnabled = false, syncPaused = false, syncBusy = false, saveQueued = false, cloudErrorKey = null;
let lastSyncedRevision = null, lastDeviceRevision = state.revision;
let pendingAccount = null, cloudModule = null, modalCleanup = null, toastTimer, modalEpoch = 0;
const modal = $('#modal');
let recoverAccount = null;
if (!isDemo) {
  try {
    const savedAccount = JSON.parse(sessionStorage.getItem('nestquest:active') || 'null');
    if (savedAccount?.id && typeof savedAccount.id === 'string') {
      const stored = sessionStorage.getItem(`nestquest:account:${savedAccount.id}`);
      if (stored) {
        const cached = validateState(JSON.parse(stored));
        recoverAccount = { ...savedAccount, cached }; state = cached;
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
  return isDemo ? demoState() : createState();
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
function mutate(change) {
  if (damagedSave) throw new Error('invalidSave');
  checkOtherTab();
  const next = structuredClone(state);
  change(next);
  next.revision = uuid(); next.updatedAt = new Date().toISOString();
  validateState(next); state = next; storeDevice(); render();
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
  const known = ['invalidSave', 'cloudConflict', 'sessionEnded', 'missingVersion', 'questNotReady', 'notEnoughGold', 'passwordMismatch', 'multiTab', 'limitReached', 'cloudUnavailable', 'waitSync'];
  return t(key === 'amount' ? 'amountError' : known.includes(key) ? key : 'cloudError');
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
function dateLabel(value) { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)); }
function monthLabel(value) { return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00`)); }
function cash(amount) { return money(amount, state.profile.currency); }
function story(id) { return chapterStory(id, state.profile.name); }
const bar = ratio => `<div class="progress-track"><span class="progress-fill" style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></span></div>`;
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
function render() {
  applyLanguage();
  document.title = `Nest & Quest — ${t(view)}`;
  $('#page-title').textContent = t('dashboardTitle');
  $('#month').value = month;
  $('#month').max = localDate().slice(0, 7);
  $('#demo-banner').hidden = !isDemo;
  $('#account-button').hidden = isDemo;
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const total = summarize(state, month);
  $('#summary').innerHTML = [
    ['income', 'incomeHint', 'wallet', total.income], ['spent', 'expenseHint', 'coins', total.expense],
    ['saved', 'savingHint', 'jar', total.saving], ['remaining', 'remainingHint', 'leaf', total.remaining],
  ].map(([label, hint, symbol, value]) => `<article class="summary-card ${value < 0 ? 'negative' : ''}"><p class="summary-label"><span>${esc(t(label))}</span>${icon(symbol)}</p><p class="summary-amount">${esc(cash(value))}</p><p class="summary-hint">${esc(t(hint))}</p></article>`).join('');
  for (const name of ['adventure', 'ledger', 'journal']) $(`#${name}-view`).hidden = name !== view;
  if (view === 'adventure') renderAdventure(total);
  if (view === 'ledger') renderLedger(total);
  if (view === 'journal') renderJournal();
  renderSaveStatus();
}
function renderAdventure(total) {
  const game = progress(state), quests = QUESTS.map((_, index) => questStatus(state, month, index));
  const defaultQuest = quests.findIndex(q => !q.complete);
  const currentIndex = selectedQuest ?? (defaultQuest < 0 ? 5 : defaultQuest);
  const current = quests[currentIndex], narrative = story(current.id);
  const completedCount = quests.filter(q => q.complete).length;
  const mood = total.income === 0 ? 'New' : total.storm ? 'Rain' : total.goalProgress >= .5 ? 'Bright' : 'Calm';
  const decorations = `${state.equipped.includes('wildflowers') ? `<span class="scene-flower">${icon('flower')}</span>` : ''}${state.equipped.includes('lantern') ? `<span class="scene-lantern">${icon('lantern')}</span>` : ''}${state.equipped.includes('fireflies') ? '<span class="firefly"></span><span class="firefly"></span><span class="firefly"></span>' : ''}`;
  const finished = completedCount === 6 && selectedQuest === null;
  $('#adventure-view').innerHTML = `<div class="adventure-grid">
    <aside class="companion-panel panel"><div class="companion-heading"><span class="tiny-label">${esc(t('companionLabel'))}</span><span class="level-pill">${esc(t('level', { n: game.level }))}</span></div>
      <div class="companion-scene ${total.storm ? 'raining' : ''}"><img src="/dev/nest-quest/art/ember-${game.stage}.webp" alt="${esc(state.profile.name)}" width="512" height="650">${decorations}</div>
      <div class="companion-details"><h2 class="companion-name">${esc(state.profile.name)}</h2><p class="companion-role">${esc(t(game.stage))}</p>
      <div class="xp-line"><span>${game.xp} XP</span><span>${esc(t(game.level === 50 ? 'maxLevel' : 'xp', { n: game.nextXp - game.xp }))}</span></div>${bar(game.levelProgress)}
      <p class="mood">${icon(total.storm ? 'rain' : 'sun')}${esc(t(`mood${mood}`))}</p><p class="companion-speech">“${esc(t(`message${mood}`))}”</p></div>
      <button class="button button-outline button-full care-button" data-action="care">${icon('heart')}<span>${esc(t(state.checkins.includes(localDate()) ? 'careDone' : 'care', { name: state.profile.name }))}</span></button><p class="care-hint">${esc(t('careHint'))}</p>
    </aside>
    <div class="world-column"><section class="world-panel panel"><div class="world-header"><div><h2>${esc(t('valley'))}</h2><p>${esc(t('valleyHint'))}</p></div><span class="tiny-label">${esc(t('chaptersDone', { n: completedCount }))}</span></div>
      <div class="world-map ${total.storm ? 'is-raining' : ''}"><img src="/dev/nest-quest/art/willowmere.webp" alt="${esc(t('valley'))}" width="1536" height="1024">
        ${quests.map((q, i) => `<button class="map-pin ${q.complete ? 'complete' : q.locked ? 'locked' : q.ready ? 'ready' : ''} ${i === currentIndex ? 'selected' : ''}" style="left:${q.x}%;top:${q.y}%" data-quest="${i}" aria-label="${esc(`${t('chapter', { n: i + 1 })}: ${story(q.id).title}${q.complete ? ` — ${t('questComplete')}` : q.locked ? ` — ${t('questLocked')}` : q.ready ? ` — ${t('questReady')}` : ''}`)}" aria-pressed="${i === currentIndex}">${q.complete ? icon('check') : q.locked ? icon('lock') : i + 1}</button>`).join('')}
        <span class="map-caption">${esc(monthLabel(month))} · ${esc(t('chaptersDone', { n: completedCount }))}</span></div>
      <div class="quest-card" id="current-quest"><div class="quest-heading"><span class="eyebrow">${esc(finished ? t('questComplete') : t('chapter', { n: currentIndex + 1 }))}</span><span class="reward-preview">+${current.xp} XP <span>+${current.gold} ${icon('coins')}</span></span></div>
        <h3>${esc(finished ? t('allDone') : narrative.title)}</h3><p class="quest-description">${esc(finished ? t('allDoneBody') : narrative.intro)}</p>
        ${finished ? '' : current.complete ? `<p class="quest-note">${icon('check')}${esc(t('questComplete'))}</p><button class="plan-edit" data-action="read-story" data-id="${current.id}">${esc(t('journal'))} →</button>` : current.locked ? `<p class="quest-note">${icon('lock')}${esc(t('questLocked'))}</p>` : `<div class="quest-checks">${current.checks.map(check => renderCheck(check)).join('')}</div><button class="button button-small" data-action="explore" data-id="${current.id}" ${current.ready ? '' : 'disabled'}>${icon('map')}${esc(t('explore'))}<span aria-hidden="true">→</span></button>`}
      </div></section>
      <div class="plan-panels"><section class="plan-panel panel"><div class="plan-panel-top"><h3>${esc(t('goalTitle'))}</h3>${icon('jar')}</div><p class="plan-value">${esc(cash(total.saving))}</p><p class="plan-subtitle">${esc(t('goalOf', { amount: cash(total.goal) }))}</p>${bar(total.goalProgress)}<p class="plan-description">${esc(t('goalExplain'))}</p><button class="plan-edit" data-action="plan">${esc(t('editPlan'))} ↗</button></section>
      <section class="plan-panel panel ${total.flexible > total.flexLimit ? 'over-budget' : ''}"><div class="plan-panel-top"><h3>${esc(t('flexTitle'))}</h3>${icon('flower')}</div><p class="plan-value">${esc(cash(Math.max(0, total.flexLimit - total.flexible)))}</p><p class="plan-subtitle">${esc(t('flexOf', { spent: cash(total.flexible), limit: cash(total.flexLimit) }))}</p>${bar(total.flexLimit > 0 ? total.flexible / total.flexLimit : total.flexible > 0 ? 1 : 0)}<p class="plan-description">${esc(t('flexExplain'))}</p><button class="plan-edit" data-action="plan">${esc(t('editPlan'))} ↗</button></section></div>
      ${total.storm ? `<aside class="rain-notice">${icon('rain')}<div><strong>${esc(t('rainTitle'))}</strong><p>${esc(t('rainBody'))}</p></div></aside>` : total.income === 0 && total.expense > 0 ? `<aside class="rain-notice">${icon('leaf')}<p>${esc(t('unknownIncome'))}</p></aside>` : ''}
    </div></div>`;
}
function renderCheck(check) {
  const done = !check.needsGoal && check.value >= check.target;
  const label = t(check.key, { n: check.target, percent: Math.round((check.ratio || 0) * 100) });
  const value = check.money ? check.needsGoal ? t('setGoal') : `${cash(check.value)} / ${cash(check.target)}` : check.target > 1 ? `${check.value} / ${check.target}` : '';
  return `<div class="quest-check ${done ? 'done' : ''}"><span class="check-circle">${done ? icon('check') : ''}</span><span>${esc(label)}</span><span class="quest-check-value">${esc(value)}</span></div>`;
}
function empty(title, description, symbol = 'leaf', action = '') {
  return `<div class="empty-state">${icon(symbol)}<h3>${esc(t(title))}</h3><p>${esc(t(description))}</p>${action}</div>`;
}
function renderLedger(total) {
  const filtered = total.entries.filter(e => ledgerFilter === 'all' || e.type === ledgerFilter);
  const groups = Object.entries(total.categories).sort((a, b) => b[1] - a[1]);
  let start = 0;
  const segments = groups.map(([id, amount]) => { const end = start + (amount / total.expense) * 100; const result = `${CATEGORIES[id].color} ${start}% ${end}%`; start = end; return result; }).join(',');
  $('#ledger-view').innerHTML = `<div class="view-heading"><div><h2>${esc(t('transactions'))}</h2><p>${esc(t('transactionsBody'))}</p></div><button class="button button-small button-outline" data-action="csv">${icon('download')}${esc(t('downloadCsv'))}</button></div>
    <div class="ledger-grid"><section class="ledger-list panel"><div class="ledger-filter"><select id="entry-filter" aria-label="${esc(t('allTypes'))}">${['all', 'income', 'expense', 'saving'].map(id => `<option value="${id}" ${id === ledgerFilter ? 'selected' : ''}>${esc(t(id === 'all' ? 'allTypes' : id))}</option>`).join('')}</select><span>${esc(monthLabel(month))} · ${filtered.length}</span></div>
      ${total.entries.length === 0 ? empty('emptyEntries', 'emptyEntriesBody', 'wallet', `<button class="button button-small" data-entry="income">${esc(t('addIncome'))}</button>`) : filtered.length === 0 ? `<div class="empty-state"><p>${esc(t('noFiltered'))}</p></div>` : filtered.slice(0, ledgerLimit).map(e => `<button class="entry-row" data-edit="${e.id}" aria-label="${esc(`${t('editEntry')}: ${e.note || t(e.type === 'expense' ? e.category : e.type)}, ${cash(e.amount)}`)}"><span class="entry-symbol ${e.type}">${icon(e.type === 'expense' ? 'coins' : e.type === 'saving' ? 'jar' : 'wallet')}</span><span class="entry-info"><span class="entry-name">${esc(e.note || t(e.type === 'expense' ? e.category : e.type))}</span><span class="entry-meta">${esc(dateLabel(e.date))} · ${esc(t(e.type === 'expense' ? e.category : e.type))}${e.type === 'expense' ? ` · ${esc(t(e.essential ? 'essentialsLabel' : 'flexibleLabel'))}` : ''}</span></span><span class="entry-amount ${e.type}">${e.type === 'income' ? '+' : e.type === 'expense' ? '−' : '↗ '}${esc(cash(e.amount))}</span>${icon('edit', 'entry-edit-icon')}</button>`).join('')}
      ${filtered.length > ledgerLimit ? `<button class="button button-small button-quiet button-full" data-action="more-entries">${esc(t('showMore'))}</button>` : ''}</section>
      <aside class="breakdown-panel panel"><h3>${esc(t('breakdown'))}</h3><div class="donut" style="background:${groups.length ? `conic-gradient(${segments})` : '#e7e9de'}"><span>${esc(cash(total.expense))}</span></div><div class="category-legend">${groups.map(([id, amount]) => `<div class="category-line"><span class="category-dot" style="background:${CATEGORIES[id].color}"></span><span>${esc(t(id))}<span class="category-percent">${Math.round(amount / total.expense * 100)}%</span></span><strong>${esc(cash(amount))}</strong></div>`).join('')}</div></aside></div>`;
}
function renderJournal() {
  const game = progress(state);
  const claims = [...state.claims].reverse();
  $('#journal-view').innerHTML = `<div class="view-heading"><div><h2>${esc(t('journalTitle'))}</h2><p>${esc(t('journalBody'))}</p></div><span class="level-pill">${esc(t('level', { n: game.level }))}</span></div>
    <div class="journal-stats">${[[game.kindness, 'kindness'], [game.courage, 'courage'], [streak(state), 'careStreak'], [game.loggedDays, 'savedDays']].map(([value, label]) => `<article class="journal-stat"><strong>${value}</strong><span>${esc(t(label))}</span></article>`).join('')}</div>
    <div class="journal-grid"><section class="journal-list panel">${claims.length === 0 ? empty('journalEmpty', 'journalEmptyBody', 'book') : claims.map(claim => {
      const narrative = story(claim.quest), quest = QUESTS.find(q => q.id === claim.quest);
      return `<article class="journal-entry"><span class="tiny-label">${esc(monthLabel(claim.month))} · ${esc(t(claim.choice === 'kind' ? 'kind' : 'bold'))}</span><h3>${esc(narrative.title)}</h3><p>${esc(narrative[claim.choice])}</p><div class="journal-reward"><span>+${quest.xp} XP</span><span>+${quest.gold} ${esc(t('gold', { n: '' }).trim())}</span></div></article>`;
    }).join('')}</section>
    <aside class="shop-panel panel"><h3>${esc(t('shopTitle'))}</h3><p>${esc(t('shopBody'))}</p><div class="shop-gold">${icon('coins')}${esc(t('gold', { n: game.gold }))}</div><div class="shop-items">${ITEMS.map(item => {
      const owned = state.items.includes(item.id), equipped = state.equipped.includes(item.id);
      return `<article class="shop-item">${icon(item.icon)}<div><strong>${esc(t(item.id))}</strong><p>${esc(t(`${item.id}Body`))}</p><button class="button button-small button-outline" data-action="${owned ? 'equip' : 'buy'}" data-id="${item.id}" ${!owned && game.gold < item.cost ? 'disabled' : ''}>${esc(t(owned ? equipped ? 'unequip' : 'equip' : 'buy', { n: item.cost }))}</button></div></article>`;
    }).join('')}</div></aside></div>`;
}

// One native dialog keeps keyboard focus inside each form and returns it to the
// invoking control. Financial text is escaped on every render.
function openModal(content, { closeable = true, onClose } = {}) {
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
  const target = $('#form-error');
  if (target) { target.textContent = message; target.hidden = false; target.focus(); }
  else toast(message);
}
const errorField = '<p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p>';
function onboarding() {
  if (damagedSave || recoverAccount) return;
  openModal(`<img class="modal-art" src="/dev/nest-quest/art/ember-young.webp" alt="Ember"><p class="eyebrow">${esc(t('onboardKicker'))}</p><h2>${esc(t('onboardTitle'))}</h2><p class="modal-description">${esc(t('onboardBody'))}</p>
    <form id="onboard-form"><div class="form-grid"><div class="field"><label for="companion-name">${esc(t('companionName'))}</label><input id="companion-name" name="name" value="${language() === 'bg' ? 'Ембър' : 'Ember'}" maxlength="24" required autocomplete="off" autofocus></div><div class="field"><label for="currency">${esc(t('currency'))}</label><select name="currency" id="currency">${CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select></div></div>
    <div class="field" style="margin-top:18px"><label for="initial-income">${esc(t('initialIncome'))}</label><input id="initial-income" name="income" inputmode="decimal" value="0" maxlength="11" required><small>${esc(t('optionalIncome'))}</small></div>
    <div class="field"><label for="initial-goal">${esc(t('savingsGoal'))}</label><input id="initial-goal" name="goal" inputmode="decimal" value="100" maxlength="11" required></div>${errorField}<button class="button button-full" type="submit">${esc(t('begin'))}${icon('arrow')}</button></form><p class="onboard-foot"><a href="./play.html?demo=1&lang=${language()}">${esc(t('demo'))}</a></p>`, { closeable: false });
}
function entryModal(type, id = null) {
  if (!state.profile.started) { onboarding(); return; }
  const existing = id ? state.entries.find(e => e.id === id) : null;
  if (id && !existing) return;
  type = existing?.type || type;
  const today = localDate(), defaultDate = month === today.slice(0, 7) ? today : `${month}-01`;
  openModal(`<p class="eyebrow">${esc(t('ledger'))} · ${esc(state.profile.currency)}</p><h2>${esc(t(existing ? 'editEntry' : type === 'income' ? 'addIncome' : type === 'saving' ? 'addSaving' : 'addExpense'))}</h2>
    ${type === 'saving' ? `<p class="modal-description">${esc(t('savingExplain'))}</p>` : '<div style="height:20px"></div>'}
    <form id="entry-form" data-type="${type}" data-id="${id || ''}"><div class="form-grid"><div class="field"><label for="entry-amount">${esc(t('amount'))} (${state.profile.currency})</label><input name="amount" id="entry-amount" value="${existing ? (existing.amount / 100).toFixed(2) : ''}" inputmode="decimal" maxlength="11" required autofocus placeholder="0.00"></div><div class="field"><label for="entry-date">${esc(t('date'))}</label><input name="date" id="entry-date" type="date" value="${existing?.date || defaultDate}" min="2000-01-01" max="${today}" required></div></div>
    ${type === 'expense' ? `<div class="field" style="margin-top:17px"><label for="entry-category">${esc(t('category'))}</label><select name="category" id="entry-category">${Object.keys(CATEGORIES).map(c => `<option value="${c}" ${c === (existing?.category || 'groceries') ? 'selected' : ''}>${esc(t(c))}</option>`).join('')}</select></div>` : '<div style="height:16px"></div>'}
    <div class="field"><label for="entry-note">${esc(t('note'))}</label><input name="note" id="entry-note" value="${esc(existing?.note || '')}" maxlength="160" placeholder="${esc(t('notePlaceholder'))}" autocomplete="off"></div>
    ${type === 'expense' ? `<div class="checkbox-field"><input id="entry-essential" name="essential" type="checkbox" ${existing ? existing.essential ? 'checked' : '' : 'checked'}><label for="entry-essential">${esc(t('essential'))}<small>${esc(t('essentialHelp'))}</small></label></div>` : ''}${errorField}
    <div class="form-actions"><button type="button" class="button button-outline" data-action="close">${esc(t('cancel'))}</button><button class="button" type="submit">${esc(t('saveEntry'))}</button></div>
    ${id ? `<button type="button" class="modal-link danger" data-action="delete-entry" data-id="${id}">${esc(t('deleteEntry'))}</button>` : ''}</form>`);
}
function planModal() {
  const plan = state.plans[month] || { goal: 0, flex: null };
  openModal(`<p class="eyebrow">${esc(monthLabel(month))}</p><h2>${esc(t('planTitle'))}</h2><p class="modal-description">${esc(t('planBody'))}</p><form id="plan-form"><div class="field"><label for="plan-goal">${esc(t('savingsGoal'))} (${state.profile.currency})</label><input name="goal" id="plan-goal" inputmode="decimal" maxlength="11" value="${(plan.goal / 100).toFixed(2)}" required autofocus></div><div class="field"><label for="plan-flex">${esc(t('flexLimit'))} (${state.profile.currency})</label><input name="flex" id="plan-flex" inputmode="decimal" maxlength="11" value="${plan.flex === null ? '' : (plan.flex / 100).toFixed(2)}" placeholder="${esc(t('flexOptional'))}"><small>${esc(t('autoFlex'))}</small></div>${errorField}<div class="form-actions"><button type="button" class="button button-outline" data-action="close">${esc(t('cancel'))}</button><button class="button" type="submit">${esc(t('savePlan'))}</button></div></form>`);
}
function questModal(id) {
  const q = questStatus(state, month, QUESTS.findIndex(q => q.id === id)), narrative = story(id);
  if (q.complete) {
    const claim = state.claims.find(c => c.month === month && c.quest === id);
    showStoryResult(narrative, claim.choice, q); return;
  }
  if (!q.ready) { toast(t('questNotReady')); return; }
  openModal(`<p class="eyebrow">${esc(t('chapter', { n: QUESTS.findIndex(quest => quest.id === id) + 1 }))}</p><h2>${esc(narrative.title)}</h2><p class="modal-description">${esc(narrative.intro)}</p><p class="field-label">${esc(t('choosePath'))}</p>
    ${['kind', 'bold'].map(choice => `<button class="story-choice" data-action="claim" data-id="${id}" data-choice="${choice}">${icon(choice === 'kind' ? 'heart' : 'sparkles')}<span><strong>${esc(t(choice))}</strong><small>${esc(t(`${choice}Hint`))}</small></span><span class="arrow" aria-hidden="true">→</span></button>`).join('')}${errorField}`);
}
function showStoryResult(narrative, choice, q) {
  openModal(`<div class="story-result"><img class="modal-art" src="/dev/nest-quest/art/ember-${progress(state).stage}.webp" alt="${esc(state.profile.name)}"><p class="eyebrow">${esc(t('questComplete'))}</p><h2>${esc(narrative.title)}</h2><p class="modal-description">${esc(narrative[choice])}</p><p class="story-reward">${icon('sparkles')}${esc(t('storyFinish', { name: state.profile.name, xp: q.xp, gold: q.gold }))}</p><button class="button button-full" data-action="close">${esc(t('continue'))}${icon('arrow')}</button></div>`);
}
function settingsModal() {
  openModal(`<p class="eyebrow">${esc(t('settings'))}</p><h2>${esc(t('backupTitle'))}</h2><p class="modal-description">${esc(t('backupBody'))}</p><div class="field"><label for="rename-companion">${esc(t('companionName'))}</label><form id="rename-form" class="form-grid"><input name="name" id="rename-companion" value="${esc(state.profile.name)}" maxlength="24" required><button class="button button-small" type="submit">${esc(t('savePlan'))}</button></form></div><p class="fine-print">${esc(state.profile.currency)} · ${esc(t('noCurrencyChange'))}</p><div class="form-divider"></div>
    <div class="settings-buttons"><button class="button button-outline" data-action="export">${icon('download')}${esc(t('export'))}</button><button class="button button-outline" data-action="import">${icon('upload')}${esc(t('import'))}</button><button class="button button-outline" data-action="plan">${icon('jar')}${esc(t('editPlan'))}</button></div>
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
      mutate(next => { Object.assign(next, structuredClone(imported)); });
      month = localDate().slice(0, 7); selectedQuest = null; closeModal(); render(); toast(t('restored'));
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
  const remoteSummary = remote ? t('cloudSummary', { name: remote.profile.name, level: progress(remote).level, entries: remote.entries.length }) : '';
  const ownSummary = t('cloudSummary', { name: state.profile.name, level: progress(state).level, entries: state.entries.length });
  openModal(`<p class="eyebrow">${esc(t('cloud'))}</p><h2>${esc(t(remote ? 'cloudChoiceTitle' : 'signInTitle'))}</h2><p class="modal-description">${esc(t(remote ? 'cloudChoiceBody' : 'cloudEmpty'))}</p>
    ${remote ? `<div class="cloud-option"><span class="tiny-label">${esc(t('cloud'))}</span><p class="cloud-detail">${esc(remoteSummary)}</p><button class="button button-small" id="use-cloud">${esc(t('useCloud'))}</button></div>` : ''}
    <div class="cloud-option"><span class="tiny-label">${esc(t('local'))}</span><p class="cloud-detail">${esc(ownSummary)}</p><button class="button button-small ${remote ? 'button-outline' : ''}" id="use-device">${esc(t(remote ? 'useDevice' : 'enableCloud'))}</button></div><button class="modal-link" data-action="export">${esc(t('export'))}</button>${errorField}`, { onClose: () => { if (pendingAccount === nextAccount) { nextAccount.close(); pendingAccount = null; } } });
  const enable = async useRemote => {
    $('#use-device').disabled = true; if ($('#use-cloud')) $('#use-cloud').disabled = true;
    try {
      if (!useRemote) await nextAccount.repository.save(state);
      const previous = account;
      const previousId = previous?.userId || recoverAccount?.id;
      if (previous) previous.close();
      if (previousId && previousId !== nextAccount.userId) { try { sessionStorage.removeItem(`nestquest:account:${previousId}`); } catch { /* Optional session cache. */ } }
      account = nextAccount; pendingAccount = null; recoverAccount = null;
      if (useRemote) state = structuredClone(remote);
      lastSyncedRevision = state.revision; syncEnabled = true; syncPaused = false; cloudErrorKey = null; saveQueued = false;
      storeDevice(); selectedQuest = null; closeModal(); render(); toast(t('cloudLoaded'));
      if (!state.profile.started) onboarding();
    } catch (error) { formError(errorText(error)); $('#use-device').disabled = false; if ($('#use-cloud')) $('#use-cloud').disabled = false; }
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
    const dirty = saved.cached.revision !== saved.lastSyncedRevision;
    if (!remote || dirty && remote.revision !== saved.lastSyncedRevision) {
      syncPaused = true; cloudErrorKey = 'cloudConflict';
    } else if (dirty) { syncEnabled = true; scheduleCloudSave(); }
    else { state = structuredClone(remote); syncEnabled = true; lastSyncedRevision = state.revision; }
    storeDevice(); render();
  } catch (error) { restored?.close(); if (recoverAccount === saved) { syncPaused = true; cloudErrorKey = error.message === 'sessionEnded' ? 'sessionEnded' : 'cloudError'; render(); } }
}
async function disconnect({ signOut = true } = {}) {
  if (syncBusy) throw new Error('waitSync');
  const id = account?.userId || recoverAccount?.id;
  account?.close(); account = null; recoverAccount = null; syncEnabled = false; syncPaused = false; cloudErrorKey = null;
  if (id) { try { sessionStorage.removeItem(`nestquest:account:${id}`); sessionStorage.removeItem('nestquest:active'); } catch { /* No durable account copy was made. */ } }
  if (signOut) (await getCloudModule()).signOut();
  state = readLocal(); lastDeviceRevision = state.revision; lastSyncedRevision = null; selectedQuest = null; closeModal(); render();
  if (!state.profile.started) onboarding();
}

document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
$('#month').addEventListener('change', event => {
  if (!validMonth(event.target.value) || event.target.value > localDate().slice(0, 7)) { event.target.value = month; return; }
  month = event.target.value; selectedQuest = null; ledgerLimit = 40; render();
});
$('#settings-button').addEventListener('click', settingsModal);
$('#account-button').addEventListener('click', () => { void accountModal(); });
$('#import-file').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; void importSave(file); });
modal.addEventListener('cancel', event => { if (modal.dataset.closeable === 'false') event.preventDefault(); });
modal.addEventListener('close', () => { const cleanup = modalCleanup; modalCleanup = null; if (cleanup) cleanup(); });
modal.addEventListener('click', event => { if (event.target === modal && modal.dataset.closeable !== 'false') closeModal(); });
document.addEventListener('change', event => {
  if (event.target.id === 'entry-filter') { ledgerFilter = event.target.value; ledgerLimit = 40; renderLedger(summarize(state, month)); }
  if (event.target.id === 'entry-category') $('#entry-essential').checked = CATEGORIES[event.target.value].essential;
});
document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.lang) {
    setLanguage(target.dataset.lang); render();
    if (modal.open) { const form = modal.querySelector('form')?.id; if (form === 'onboard-form') onboarding(); else if (form === 'plan-form') planModal(); else closeModal(); }
    return;
  }
  if (target.dataset.view) { view = target.dataset.view; render(); $('#main').focus({ preventScroll: true }); return; }
  if (target.dataset.entry) { entryModal(target.dataset.entry); return; }
  if (target.dataset.edit) { entryModal(null, target.dataset.edit); return; }
  if (target.dataset.quest !== undefined) { selectedQuest = Number(target.dataset.quest); renderAdventure(summarize(state, month)); return; }
  const action = target.dataset.action, id = target.dataset.id;
  if (!action) return;
  try {
    if (action === 'close') closeModal();
    if (action === 'care') {
      if (state.checkins.includes(localDate())) toast(t('careAlready', { name: state.profile.name }));
      else { mutate(next => { next.checkins.push(localDate()); }); toast(t('careReaction', { name: state.profile.name })); }
    }
    if (action === 'plan') planModal();
    if (action === 'explore' || action === 'read-story') questModal(id);
    if (action === 'claim') {
      mutate(next => { claimQuest(next, month, id, target.dataset.choice); }); selectedQuest = null; render();
      showStoryResult(story(id), target.dataset.choice, QUESTS.find(q => q.id === id));
    }
    if (action === 'buy') { mutate(next => { buyItem(next, id); }); toast(t('itemBought', { name: state.profile.name })); }
    if (action === 'equip') mutate(next => { next.equipped = next.equipped.includes(id) ? next.equipped.filter(v => v !== id) : [...next.equipped, id]; });
    if (action === 'more-entries') { ledgerLimit += 40; renderLedger(summarize(state, month)); }
    if (action === 'csv') download(`\ufeff${csv(state, month)}`, `nest-quest-${month}.csv`, 'text/csv;charset=utf-8');
    if (action === 'export') exportSave();
    if (action === 'raw-export') download(damagedSave, `nest-quest-original-${localDate()}.json`);
    if (action === 'import') $('#import-file').click();
    if (action === 'reload') location.reload();
    if (action === 'reconnect') await accountModal();
    if (action === 'delete-entry') confirmAction('deleteEntryAsk', t('deleteEntryBody'), 'deleteEntry', () => {
      mutate(next => { next.entries = next.entries.filter(e => e.id !== id); }); closeModal(); toast(t('entryDeleted'));
    }, true);
    if (action === 'reset') confirmAction('resetAsk', t('resetBody'), 'reset', () => {
      if (account || recoverAccount) throw new Error('cloudConflict');
      localStore.removeItem(localKey); damagedSave = null; staleTab = false; state = isDemo ? demoState() : createState(); lastDeviceRevision = state.revision;
      storeDevice(); selectedQuest = null; closeModal(); render(); if (!isDemo) onboarding();
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
      if (syncBusy) throw new Error('waitSync');
      if (!account) throw new Error('cloudUnavailable');
      syncEnabled = false;
      try { await account.repository.remove(); await disconnect(); toast(t('cloudRemoved')); }
      catch (error) { syncPaused = true; cloudErrorKey = 'cloudError'; throw error; }
    }, true);
  } catch (error) { if (modal.open) formError(errorText(error)); else toast(errorText(error)); renderSaveStatus(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['entry-form', 'plan-form', 'onboard-form', 'rename-form', 'login-form', 'new-password-form'].includes(form.id)) return;
  event.preventDefault(); const data = new FormData(form);
  try {
    if (form.id === 'entry-form') {
      const date = data.get('date'); if (!validDate(date) || date > localDate()) { formError(t('futureDate')); return; }
      const type = form.dataset.type, id = form.dataset.id || uuid(), amount = parseMoney(data.get('amount'));
      const entry = { id, type, amount, date, note: String(data.get('note') || '').trim(), category: type === 'expense' ? data.get('category') : type,
        ...(type === 'expense' ? { essential: data.get('essential') === 'on' } : {}) };
      mutate(next => {
        if (!form.dataset.id && next.entries.length >= 10000) throw new Error('limitReached');
        next.entries = next.entries.filter(e => e.id !== id); next.entries.push(entry);
        if (!next.recordDays.includes(date)) next.recordDays.push(date);
      });
      month = date.slice(0, 7); selectedQuest = null; closeModal(); render(); toast(t('entrySaved'));
    }
    if (form.id === 'plan-form') {
      const goal = parseMoney(data.get('goal'), true), text = String(data.get('flex')).trim(), flex = text ? parseMoney(text, true) : null;
      mutate(next => { next.plans[month] = { goal, flex }; }); closeModal(); toast(t('planSaved'));
    }
    if (form.id === 'onboard-form') {
      const name = String(data.get('name')).trim(), currency = data.get('currency'), income = parseMoney(data.get('income'), true), goal = parseMoney(data.get('goal'), true);
      mutate(next => {
        next.profile = { name, currency, started: true }; next.plans[month] = { goal, flex: null };
        if (income > 0) { next.entries.push({ id: uuid(), type: 'income', category: 'income', amount: income, date: localDate(), note: '' }); next.recordDays.push(localDate()); }
      }); closeModal();
    }
    if (form.id === 'rename-form') { mutate(next => { next.profile.name = String(data.get('name')).trim(); }); closeModal(); }
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
  } catch (error) { formError(errorText(error)); renderSaveStatus(); }
});
function newPasswordModal(auth) {
  openModal(`<h2>${esc(t('newPasswordTitle'))}</h2><p class="modal-description">${esc(t('newPasswordHelp'))}</p><form id="new-password-form"><div class="field"><label for="new-password">${esc(t('password'))}</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" required autofocus></div><div class="field"><label for="confirm-password">${esc(t('confirmPassword'))}</label><input id="confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="8" required></div>${errorField}<button type="submit" class="button button-full">${esc(t('continue'))}</button></form>`);
  $('#new-password-form').pendingAuth = auth;
}
window.addEventListener('storage', event => { if (!account && !recoverAccount && event.key === localKey && event.newValue !== JSON.stringify(state)) { staleTab = true; renderSaveStatus(); } });
window.addEventListener('beforeunload', event => { if (storageWarning || ((account || recoverAccount) && state.revision !== (lastSyncedRevision || recoverAccount?.lastSyncedRevision))) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { if (cloudErrorKey === 'cloudError' && account) { syncPaused = false; cloudErrorKey = null; scheduleCloudSave(); } });
window.addEventListener('pageshow', () => { if (!account && !recoverAccount) { try { checkOtherTab(); } catch { renderSaveStatus(); } } });

render();
if (recoverAccount) void restoreAccount();
else if (!state.profile.started && !damagedSave) onboarding();
else if (isDemo && !damagedSave) storeDevice();
