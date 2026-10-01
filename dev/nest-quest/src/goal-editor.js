import { GOAL_PRESETS } from './goals.js';
import { CURRENCIES, uuid } from './model.js';
import { escapeText as esc, goalName } from './adventure.js';
import { t, money, language } from './i18n.js';
import { icon } from './icons.js';

export const goalIcons = { car: 'car', wedding: 'rings', house: 'home', emergency: 'shield', travel: 'plane', custom: 'flag' };
export function newGoal(kind = 'car') {
  const preset = GOAL_PRESETS.find(item => item.kind === kind);
  return { id: uuid(), kind, title: goalName(kind), amount: (preset.target / 100).toFixed(2) };
}
export function goalDraft(state) {
  return { goals: state.goals.length ? state.goals.map(goal => ({ ...goal, amount: (goal.target / 100).toFixed(2) })) : [newGoal()],
    opening: (state.opening / 100).toFixed(2), currency: state.profile.currency,
    name: state.profile.name === 'Ember' && language() === 'bg' ? 'Ембър' : state.profile.name };
}
export function readGoalDraft(form) {
  const data = new FormData(form), draft = form.goalDraft;
  return { ...draft, opening: data.get('opening'), name: data.get('name') ?? draft.name,
    currency: data.get('currency') ?? draft.currency,
    goals: draft.goals.map(goal => ({ ...goal, title: data.get(`title-${goal.id}`), amount: data.get(`target-${goal.id}`) })) };
}
export function goalEditorHTML(state, draft, isDemo) {
  const first = !state.profile.started, currency = draft.currency;
  return `<p class="eyebrow">${esc(t('adventure'))}</p><h2>${esc(t('chooseGoals'))}</h2><p class="modal-description">${esc(t('multipleGoalSetup'))}</p>
    <form id="goal-form" data-first="${first}">
      <fieldset class="goal-presets"><legend>${esc(t('goalPresets'))}</legend>${GOAL_PRESETS.map(item => {
        const active = item.kind !== 'custom' && draft.goals.some(goal => goal.kind === item.kind);
        return `<button type="button" class="goal-preset ${active ? 'selected' : ''}" data-preset="${item.kind}" aria-pressed="${active}">${icon(goalIcons[item.kind])}<strong>${esc(goalName(item.kind))}</strong><small>${item.kind === 'custom' ? esc(t('addGoal')) : esc(money(item.target, currency))}</small></button>`;
      }).join('')}</fieldset>
      <div class="goal-editor-list">${draft.goals.map(goal => `<section class="goal-editor-row" data-goal-row="${goal.id}"><div class="goal-row-heading"><span class="goal-row-icon">${icon(goalIcons[goal.kind])}</span><span>${esc(goalName(goal.kind))}</span><button type="button" class="icon-button" data-action="remove-goal" data-id="${goal.id}" aria-label="${esc(t('removeGoal', { name: goal.title }))}">${icon('close')}</button></div><div class="goal-row-fields"><div class="field"><label for="title-${goal.id}">${esc(t('goalName'))}</label><input id="title-${goal.id}" name="title-${goal.id}" value="${esc(goal.title)}" maxlength="64" required autocomplete="off"></div><div class="field"><label for="target-${goal.id}">${esc(t('goalTarget'))} (${currency})</label><input id="target-${goal.id}" name="target-${goal.id}" value="${esc(goal.amount)}" maxlength="11" required inputmode="decimal"></div></div></section>`).join('')}</div>
      ${first ? `<details class="profile-details"><summary>${esc(t('personalize'))}</summary><div class="form-grid"><div class="field"><label for="companion-name">${esc(t('companionName'))}</label><input id="companion-name" name="name" value="${esc(draft.name)}" maxlength="24" required autocomplete="off"></div><div class="field"><label for="currency">${esc(t('currency'))}</label><select id="currency" name="currency" ${state.entries.length ? 'disabled' : ''}>${CURRENCIES.map(value => `<option ${value === currency ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div></details>` : ''}
      <div class="field opening-field"><label for="goal-opening">${esc(t('openingFund'))} (${currency})</label><input id="goal-opening" name="opening" value="${esc(draft.opening)}" maxlength="11" required inputmode="decimal"></div><p class="fine-print">${esc(t('openingHint'))}</p>
      <details class="fund-explanation"><summary>${esc(t('howGoalsShare'))}</summary><p>${esc(t('allocationRule'))}</p><p>${esc(t('fundRule'))}</p>${state.entries.some(entry => entry.type === 'saving') ? `<p>${esc(t('legacyHint'))}</p>` : ''}</details>
      <p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p><button class="button button-full" type="submit">${esc(t(first ? 'begin' : 'saveGoals'))}${icon('arrow')}</button>
    </form>${first ? `<div class="onboard-foot"><button class="modal-link" data-action="import">${esc(t('import'))}</button>${!isDemo ? `<button class="modal-link" data-action="login-first">${esc(t('connect'))}</button>` : ''}</div>` : ''}`;
}
