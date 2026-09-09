import { CURRENCIES, categoryColors, categoriesFor, csv, emptyLedger, localDate, money, parseAmount, summarize, validateEntry } from './budget-model.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createBudgetUI(makeRepository) {
  const $ = id => document.getElementById(id);
  const form = $('entry-form');
  let dirty = false;
  let ledger = emptyLedger(), repository, epoch = 0, busy = false, editing = null, pending = null, shown = 50;
  const currentMonth = () => $('all-time').checked ? '' : $('budget-month').value;
  const currentCurrency = () => $('budget-currency').value;
  const error = message => { $('budget-error').textContent = message; $('budget-error').hidden = !message; };
  const status = message => { $('budget-status').textContent = message; };
  function setBusy(value) {
    busy = value;
    $('entry-fields').disabled = value;
    $('budget-refresh').disabled = value;
    document.querySelectorAll('.entry-action').forEach(button => { button.disabled = value; });
    $('budget-panel').setAttribute('aria-busy', String(value));
  }
  function categoryOptions(selected = '') {
    const options = categoriesFor(ledger.entries, $('entry-type').value, (ledger.removedCategories || []).filter(c => c.type === $('entry-type').value).map(c => c.name));
    $('entry-category').replaceChildren(...options.map(name => new Option(name, name)), new Option('+ New category', '__new__'));
    if (options.includes(selected)) $('entry-category').value = selected;
    $('custom-category-wrap').hidden = $('entry-category').value !== '__new__';
    $('custom-category').required = !$('custom-category-wrap').hidden;
    $('category-delete').disabled = ['Other', '__new__'].includes($('entry-category').value);
  }
  function resetForm() {
    dirty = false;
    editing = null; pending = null;
    form.reset();
    $('entry-date').value = localDate();
    $('entry-currency').value = currentCurrency();
    $('entry-form-title').textContent = 'Add an entry';
    $('entry-submit').textContent = 'Add expense';
    $('entry-cancel').hidden = true;
    $('entry-delete').hidden = true;
    categoryOptions();
  }
  function renderChart(type, summary) {
    const root = $(`${type}-chart`); root.replaceChildren();
    const colorMap = categoryColors(ledger.entries.map(entry => entry.category));
    const colorFor = name => colorMap.get(name);
    const total = summary[type]; const groups = summary.groups[type];
    const figure = el('div', 'pie-chart');
    figure.setAttribute('role', 'img');
    figure.setAttribute('aria-label', total ? `${type} by category. ${groups.map(([name, amount]) => `${name}: ${money(amount, currentCurrency())}, ${(amount / total * 100).toFixed(1)}%`).join('; ')}` : `No ${type} entries in this period.`);
    if (!total) {
      figure.classList.add('pie-empty');
      root.append(figure, el('p', 'chart-empty', `No ${type} yet. Add an entry to see the breakdown.`));
      return;
    }
    let offset = 0;
    figure.style.background = `conic-gradient(${groups.map(([name, amount]) => {
      const start = offset; offset += amount / total * 100;
      return `${colorFor(name)} ${start}% ${offset}%`;
    }).join(',')})`;
    const legend = el('ul', 'chart-legend');
    for (const [name, amount] of groups) {
      const row = el('li', 'legend-row');
      const swatch = el('span', 'swatch'); swatch.style.background = colorFor(name);swatch.setAttribute('aria-hidden', 'true');
      const label = el('span', 'legend-label', name);
      const value = el('span', 'legend-value', money(amount, currentCurrency()));
      value.append(el('small', '', `${(amount / total * 100).toFixed(1)}%`));
      row.append(swatch, label, value);legend.append(row);
    }
    root.append(figure, legend);
  }
  function edit(entry) {
    if (busy) return;
    error(''); editing = entry; pending = null;
    $('entry-type').value = entry.type; categoryOptions(entry.category);
    $('entry-amount').value = (entry.amount / 100).toFixed(2);
    $('entry-date').value = entry.date;
    $('entry-currency').value = entry.currency;
    $('entry-note').value = entry.note;
    $('entry-form-title').textContent = 'Edit entry';
    $('entry-submit').textContent = 'Save changes';
    $('entry-cancel').hidden = false;
    $('entry-delete').hidden = false;
    form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    $('entry-amount').focus({ preventScroll: true });
  }
  function render() {
    const summary = summarize(ledger.entries, currentMonth(), currentCurrency());
    $('total-income').textContent = money(summary.income, currentCurrency());
    $('total-expense').textContent = money(summary.expense, currentCurrency());
    $('total-balance').textContent = money(summary.balance, currentCurrency());
    $('total-balance').classList.toggle('negative', summary.balance < 0);
    $('period-caption').textContent = currentMonth() ? `For ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${currentMonth()}-15T12:00:00`))} · ${currentCurrency()}` : `All time · ${currentCurrency()}`;
    renderChart('income', summary); renderChart('expense', summary);
    const list = $('transaction-list'); list.replaceChildren();
    $('transactions-empty').hidden = summary.entries.length > 0;
    $('entry-count').textContent = `${summary.entries.length} ${summary.entries.length === 1 ? 'entry' : 'entries'}`;
    for (const entry of summary.entries.slice(0, shown)) {
      const row = el('li', 'transaction');
      const mark = el('span', `transaction-sign ${entry.type}`, entry.type === 'income' ? '+' : '−');mark.setAttribute('aria-hidden', 'true');
      const details = el('div', 'transaction-details');
      details.append(el('strong', '', entry.category), el('span', 'transaction-meta', `${entry.date} · ${entry.type === 'income' ? 'Income' : 'Expense'}`));
      if (entry.note) details.append(el('span', 'transaction-note', entry.note));
      const amount = el('strong', `transaction-amount ${entry.type}`, `${entry.type === 'income' ? '+' : '−'}${money(entry.amount, entry.currency)}`);
      const actions = el('div', 'transaction-actions');
      const editButton = el('button', 'btn-ghost entry-action', 'Edit');editButton.type = 'button';editButton.setAttribute('aria-label', `Edit ${entry.category} on ${entry.date}`);
      editButton.addEventListener('click', () => edit(entry));
      const deleteButton = el('button', 'btn-ghost danger entry-action delete-entry', 'Delete entry');deleteButton.type = 'button';deleteButton.setAttribute('aria-label', `Delete ${entry.category} on ${entry.date}`);
      deleteButton.addEventListener('click', () => removeEntry(entry));
      actions.append(editButton, deleteButton);row.append(mark, details, amount, actions);list.append(row);
    }
    $('load-more').hidden = summary.entries.length <= shown;
    $('budget-export').disabled = !summary.entries.length;
  }
  async function removeEntry(entry) {
    if (!entry || busy || !confirm(`Delete ${money(entry.amount, entry.currency)} for ${entry.category} on ${entry.date}?`)) return;
    await save({ id: entry.id, expectedRevision: entry.revision, entry: null }, 'Entry deleted.');
  }
  $('entry-delete').addEventListener('click', () => removeEntry(editing));
  async function refresh({ force = false } = {}) {
    if (busy || !repository) return;
    const generation = epoch; const activeRepository = repository;
    error('');status('Loading your budget…');setBusy(true);
    try {
      const next = await activeRepository.load({ force });
      if (generation !== epoch) return;
      ledger = next;render();
      // Refresh preserves unsaved input and selected categories.
      const chosen = $('entry-category').value;
      if (chosen !== '__new__') categoryOptions(chosen);
      status('Up to date. Entries sync with your account.');
    } catch (err) {
      if (generation === epoch) { error(err.message || 'Could not load your budget. Please try again.');status('Could not refresh. Any displayed entries may be out of date.'); }
    } finally { if (generation === epoch) setBusy(false); }
  }
  async function save(change, message) {
    const generation = epoch; const activeRepository = repository;
    error('');status('Saving…');setBusy(true);
    try {
      const next = await activeRepository.commit(change);
      if (generation !== epoch) return;
      ledger = next;
      if (change.entry) {
        $('budget-currency').value = change.entry.currency;
        $('all-time').checked = false; $('budget-month').disabled = false;
        $('budget-month').value = change.entry.date.slice(0, 7);
      }
      if (change.entry || change.removeCategory || editing?.id === change.id) resetForm();
      render();status(`${message} Synced to your account.`);
      if (!change.entry) $('transactions-title').focus({ preventScroll: true });
    } catch (err) {
      if (generation === epoch) {
        const http = err.$metadata?.httpStatusCode;
        error([409, 412].includes(http) ? 'Another device is saving. Please try again. Your input is still here.' : (err.message || 'Could not save. Check your connection and try again.'));
        status('Not saved. Keep this page open and retry when connected.');
      }
    } finally { if (generation === epoch) setBusy(false); }
  }
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('change', () => { dirty = true; });
  window.addEventListener('beforeunload', event => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !repository || !form.reportValidity()) return;
    try {
      const category = ($('entry-category').value === '__new__' ? $('custom-category').value : $('entry-category').value).trim();
      const values = { type: $('entry-type').value, amount: parseAmount($('entry-amount').value), date: $('entry-date').value, category, currency: $('entry-currency').value, note: $('entry-note').value.trim() };
      const fingerprint = JSON.stringify(values);
      if (!pending || pending.fingerprint !== fingerprint) {
        const id = editing?.id || crypto.randomUUID();
        pending = { fingerprint, change: { id, expectedRevision: editing?.revision ?? null, entry: validateEntry({ id, revision: crypto.randomUUID(), ...values }) } };
      }
      await save(pending.change, editing ? 'Entry updated.' : 'Entry added.');
    } catch (err) { error(err.message); }
  });
  $('entry-type').addEventListener('change', () => {
    categoryOptions();$('entry-submit').textContent = editing ? 'Save changes' : `Add ${$('entry-type').value}`;
  });
  $('category-delete').addEventListener('click', async () => {
    const name = $('entry-category').value, type = $('entry-type').value;
    if (busy || ['Other', '__new__'].includes(name) || !confirm(`Delete category “${name}”? Its entries will move to Other; amounts will be preserved.`)) return;
    await save({removeCategory: {type, name}, revision: crypto.randomUUID()}, 'Category deleted.');
    categoryOptions();
  });
  $('entry-category').addEventListener('change', () => {
    $('category-delete').disabled = ['Other', '__new__'].includes($('entry-category').value);
    $('custom-category-wrap').hidden = $('entry-category').value !== '__new__';
    $('custom-category').required = !$('custom-category-wrap').hidden;
    if (!$('custom-category-wrap').hidden) $('custom-category').focus();
  });
  $('entry-cancel').addEventListener('click', () => { resetForm();error(''); });
  $('budget-refresh').addEventListener('click', () => refresh({ force: true }));
  for (const id of ['budget-month', 'budget-currency', 'all-time']) $(id).addEventListener('change', () => {
    if (!$('budget-month').value) $('budget-month').value = localDate().slice(0, 7);
    $('budget-month').disabled = $('all-time').checked;
    if (!editing && !$('entry-amount').value) $('entry-currency').value = currentCurrency();
    shown = 50;render();
  });
  $('load-more').addEventListener('click', () => { shown += 50;render(); });
  $('budget-export').addEventListener('click', () => {
    const blob = new Blob(['\ufeff', csv(summarize(ledger.entries, currentMonth(), currentCurrency()).entries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = el('a');a.href = url;a.download = `budget-${currentMonth() || 'all'}-${currentCurrency()}.csv`;a.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && repository && !$('budget-panel').hidden) refresh(); });
  for (const id of ['budget-currency', 'entry-currency']) $(id).replaceChildren(...CURRENCIES.map(currency => new Option(currency, currency)));
  function stop() {
    epoch++;repository?.clear();repository = null;ledger = emptyLedger();editing = null;pending = null;shown = 50;
    $('budget-currency').value = 'EUR';$('budget-month').value = localDate().slice(0, 7);$('all-time').checked = false;$('budget-month').disabled = false;
    resetForm();render();error('');status('');setBusy(false);
  }
  stop();
  return { stop, refresh, hasUnsaved: () => dirty, start() { stop();repository = makeRepository();return refresh(); } };
}
