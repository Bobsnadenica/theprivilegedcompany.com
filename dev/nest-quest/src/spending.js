import { categoryOptions } from './categories.js';
import { t, money, locale } from './i18n.js';
import { icon } from './icons.js';

const escapeText = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const categoryColor = value => /^#[a-f\d]{6}$/i.test(value) ? value : '#729573';

export function spendingHTML(state, summary) {
  const esc = escapeText;
  const total = summary.expense;
  const currency = state.profile.currency;
  const options = new Map(categoryOptions(state).map(category => [category.id, category]));
  const percentage = new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 1 });
  const rows = Object.entries(summary.categories)
    .filter(([id, amount]) => options.has(id) && Number.isSafeInteger(amount) && amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, amount]) => {
      const category = options.get(id);
      return { name: category.custom ? category.name : t(id), icon: category.icon,
        color: categoryColor(category.color), amount, ratio: total > 0 ? amount / total : 0 };
    });
  const rowHTML = row => `<li class="spending-row" style="--category-color:${row.color}">
    <span class="spending-icon">${icon(row.icon)}</span>
    <div class="spending-category"><div class="spending-row-heading"><span class="spending-name">${esc(row.name)}</span><strong class="spending-amount">${esc(money(row.amount, currency))}</strong></div>
      <div class="spending-row-chart"><span class="spending-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, row.ratio * 100))}%"></i></span><span class="spending-percent">${esc(percentage.format(row.ratio))}</span></div>
    </div></li>`;
  const remaining = rows.slice(6);
  return `<section class="monthly-spending" aria-label="${esc(t('spendingByCategory'))}">
    <h3>${esc(t('spendingByCategory'))}</h3>
    ${rows.length ? `<div class="spending-distribution" aria-hidden="true">${rows.map(row => `<span style="--category-color:${row.color};flex-grow:${row.ratio}"></span>`).join('')}</div>
    <ul class="spending-list">${rows.slice(0, 6).map(rowHTML).join('')}</ul>
    ${remaining.length ? `<details class="spending-more"><summary>${esc(t('moreCategories', { n: remaining.length }))}${icon('arrow')}</summary><ul class="spending-list">${remaining.map(rowHTML).join('')}</ul></details>` : ''}`
    : `<p class="spending-empty">${esc(t('noCategorySpending'))}</p>`}
  </section>`;
}
