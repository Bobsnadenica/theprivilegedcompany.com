import { CATEGORIES, localDate } from './model.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

const escapeText = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
export function entryHTML(state, { type = 'expense', category = 'groceries', draft = null } = {}) {
  const esc = escapeText;
  const selectedType = type === 'income' ? 'income' : 'expense';
  const chosen = draft?.category ?? category;
  const selectedCategory = Object.hasOwn(CATEGORIES, chosen) ? chosen : 'groceries';
  const currency = state.profile.currency;
  const amount = draft?.amount ?? '', note = draft?.note ?? '', date = draft?.date ?? localDate();
  const expense = selectedType === 'expense';
  return `<section class="quick-entry">
    <div class="sheet-heading"><h2 id="entry-title">${esc(t(expense ? 'newExpense' : 'newIncome'))}</h2><button type="button" class="icon-button" data-action="close-entry" aria-label="${esc(t('close'))}">${icon('close')}</button></div>
    <div class="entry-switch" aria-label="${esc(t('ledger'))}">${['income', 'expense'].map(value => `<button type="button" data-quick-type="${value}" class="${value === selectedType ? 'active' : ''}" aria-pressed="${value === selectedType}">${icon(value === 'income' ? 'plus' : 'coins')}${esc(t(value === 'income' ? 'moneyIn' : 'moneyOut'))}</button>`).join('')}</div>
    <form id="quick-entry-form" data-type="${selectedType}">
      <div class="amount-entry"><label id="quick-amount-label" for="quick-amount">${esc(t('amount'))}</label><div class="amount-control"><span class="amount-currency">${esc(currency)}</span><input id="quick-amount" name="amount" value="${esc(amount)}" inputmode="decimal" maxlength="11" required placeholder="0.00" autocomplete="off"></div></div>
      <fieldset class="quick-category" ${expense ? '' : 'hidden'}><legend>${esc(t('category'))}</legend><div class="category-grid">${Object.keys(CATEGORIES).map(value => `<button type="button" class="category-button ${value === selectedCategory ? 'active' : ''}" data-category="${value}" aria-pressed="${value === selectedCategory}">${icon(value)}<span>${esc(t(value))}</span></button>`).join('')}</div><input type="hidden" id="quick-category" name="category" value="${selectedCategory}"></fieldset>
      <details class="entry-details" ${note ? 'open' : ''}><summary>${esc(t('entryDetails'))}</summary><div class="entry-detail-fields"><div class="field"><label for="quick-note">${esc(t('quickNote'))}</label><input id="quick-note" name="note" value="${esc(note)}" maxlength="160" placeholder="${esc(t('quickPlaceholder'))}" autocomplete="off"></div><div class="field"><label for="quick-date">${esc(t('date'))}</label><input id="quick-date" name="date" type="date" value="${esc(date)}" min="2000-01-01" max="${localDate()}" required></div></div></details>
      <output id="entry-impact" class="entry-impact" aria-live="polite">${esc(t(expense ? 'quickExpenseHint' : 'quickIncomeHint'))}</output>
      <p id="quick-error" class="form-error" role="alert" tabindex="-1" hidden></p>
      <button class="button button-full" id="quick-submit" type="submit">${icon(expense ? 'coins' : 'plus')}<span>${esc(t(expense ? 'recordExpenseNow' : 'recordIncomeNow'))}</span></button>
    </form>
  </section>`;
}
