import { QUESTS } from './model.js';
import { GOAL_MILESTONES, goalSummary } from './goals.js';
import { t, money } from './i18n.js';
import { icon } from './icons.js';
import { villageHTML, villageSummary } from './village.js';
import { wealthSummary } from './wealth-model.js';

export const escapeText = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const goalName = kind => t(`goal${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);
export function goalTitle(goal) {
  if (!goal) return t('chooseGoal');
  const defaults = {
    car: ['New car', 'Нова кола'], wedding: ['Wedding', 'Сватба'], house: ['New home', 'Нов дом'],
    emergency: ['Safety fund', 'Резервен фонд'], travel: ['Dream trip', 'Мечтано пътуване'],
  };
  return defaults[goal.kind]?.includes(goal.title) ? goalName(goal.kind) : goal.title;
}
export function portfolioTitle(state) {
  return state.goals.length === 1 ? goalTitle(state.goals[0]) : state.goals.length ? t('goalsCount', { n: state.goals.length }) : t('chooseGoals');
}
const goalIcons = { car: 'car', wedding: 'rings', house: 'home', emergency: 'shield', travel: 'plane', custom: 'flag' };
function goalsHTML(state, total, before = total) {
  const esc = escapeText;
  if (!total.goals?.length) return '';
  return `<section class="portfolio panel" aria-label="${esc(t('yourGoals'))}"><div class="portfolio-heading"><div><span class="tiny-label">${esc(t('sharedFund'))}</span><h2>${esc(t('yourGoals'))}</h2></div><button type="button" class="button button-small button-outline" data-action="goal">${icon('plus')}${esc(t('manageGoals'))}</button></div><div class="portfolio-grid">${total.goals.map(goal => `<article class="portfolio-goal" data-goal-id="${goal.id}"><span class="portfolio-icon">${icon(goalIcons[goal.kind])}</span><div class="portfolio-body"><h3>${esc(goalTitle(goal))}</h3><div class="portfolio-amount"><strong>${esc(money(goal.balance, state.profile.currency))}</strong><span>${esc(money(goal.target, state.profile.currency))}</span></div><div class="portfolio-progress" role="progressbar" aria-label="${esc(goalTitle(goal))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.percent}"><span style="width:${(before.goals?.find(previousGoal => previousGoal.id === goal.id)?.ratio ?? goal.ratio) * 100}%"></span></div><small>${esc(goal.completed ? t('goalReached') : t('goalLeft', { amount: money(goal.remaining, state.profile.currency) }))}</small></div></article>`).join('')}</div><p class="portfolio-note">${esc(t('allocationShort'))}${total.surplus ? ` <strong>${esc(t('goalSurplus', { amount: money(total.surplus, state.profile.currency) }))}</strong>` : ''}</p></section>`;
}
const symbols = ['home', 'lantern', 'bridge', 'flower', 'shield', 'flag'];

export function companionPosition(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  let index = GOAL_MILESTONES.findIndex((threshold, i) => i < 5 && clamped >= threshold && clamped < GOAL_MILESTONES[i + 1]);
  if (index < 0) return { x: QUESTS[5].x, y: QUESTS[5].y };
  const part = (clamped - GOAL_MILESTONES[index]) / (GOAL_MILESTONES[index + 1] - GOAL_MILESTONES[index]);
  return { x: QUESTS[index].x + (QUESTS[index + 1].x - QUESTS[index].x) * part,
    y: QUESTS[index].y + (QUESTS[index + 1].y - QUESTS[index].y) * part };
}

export function reactionSpeech(state, reaction) {
  const total = goalSummary(state);
  if (!total) return t('goalSetup');
  const values = { goal: portfolioTitle(state), amount: money(Math.abs(reaction?.delta || 0), state.profile.currency),
    place: t(`landmark${Math.min(5, total.milestone + (reaction?.milestoneDown ? 1 : 0))}`) };
  if (reaction?.pet) return t('petSpeech');
  if (reaction?.transfer) return t('wealthTransferReaction');
  if (reaction?.valuation) return t('wealthValueReaction');
  if (reaction?.completed) return t('reactionComplete', values);
  if (reaction?.reopened) return t('reactionReopen', values);
  const wealthBalance = wealthSummary(state).netWorth, delta = reaction?.wealthDelta ?? reaction?.delta ?? 0;
  const village = villageSummary({ balance: wealthBalance }), previousVillage = villageSummary({ balance: wealthBalance - delta });
  if (delta && village.index > previousVillage.index) return t('villageUnlock', { name: t(`villageBuild${village.index}`) });
  if (delta && village.index < previousVillage.index) return t('villageReturn', { name: t(`villageBuild${previousVillage.index}`) });
  if (reaction?.milestoneUp) return t('reactionUnlock', values);
  if (reaction?.milestoneDown) return t('reactionRelock', values);
  if (reaction?.direction === 'up') return t('reactionUp', values);
  if (reaction?.direction === 'down') return t('reactionDown', values);
  if (total.balance < 0) return t('negativeSpeech');
  if (total.completed) return t('completeSpeech', values);
  return t('idleSpeech', { goal: portfolioTitle(state), amount: money(total.remaining, state.profile.currency) });
}

export function adventureHTML(state, { reaction = null, reactionActive = false, previous = null } = {}) {
  const esc = escapeText, cash = amount => money(amount, state.profile.currency);
  const total = goalSummary(state) || { balance: 0, target: 3000000, ratio: 0, percent: 0, remaining: 3000000, stage: 'young', milestone: 0, income: 0, expense: 0 };
  const before = reactionActive && previous ? previous : total;
  const position = companionPosition(before.ratio);
  const next = Math.min(5, total.milestone + 1);
  const reactionClass = reactionActive ? reaction?.pet || reaction?.transfer || reaction?.valuation ? 'reacting-pet' : reaction?.completed ? 'reacting-complete' : reaction?.direction === 'down' ? 'reacting-down' : reaction?.direction === 'up' ? 'reacting-up' : '' : '';
  const signed = reaction?.delta ? `${reaction.delta > 0 ? '+' : '−'}${cash(Math.abs(reaction.delta))}` : '';
  const reveal = Math.min(100, position.x + 12);
  const rail = GOAL_MILESTONES.map((threshold, index) => {
    const open = index <= total.milestone;
    return `<button type="button" class="milestone ${open ? 'unlocked' : 'locked'} ${index === total.milestone ? 'current' : ''}" data-action="landmark" data-id="${index}" aria-label="${esc(`${t(`landmark${index}`)} · ${Math.round(threshold * 100)}% · ${t(open ? 'checkpointBuilt' : 'checkpointLocked')}`)}"><span class="milestone-icon">${icon(open ? symbols[index] : 'lock')}</span><span class="milestone-label sr-only">${esc(t(`landmark${index}`))}</span><small>${Math.round(threshold * 100)}%</small></button>`;
  }).join('');
  const path = QUESTS.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  // The path's physical lengths differ from financial checkpoint intervals.
  // Clip the colored path by the actual route marker location instead of assuming
  // that 50% of savings means 50% of this SVG's length.
  const pathProgress = pathLengthAt(before.ratio);
  return `<div class="goal-adventure">
    <section class="adventure-hero" aria-label="${esc(t('adventure'))}">
      <div id="village-view">${villageHTML({ ...total, balance: wealthSummary(state).netWorth, currency: state.profile.currency }, { reaction: reaction ? { ...reaction, delta: reaction.wealthDelta ?? reaction.delta } : null, reactionActive })}</div>
      <aside class="hero-sidebar ${reactionClass}">
        <section class="goal-card goal-hud" aria-label="${esc(t('goalFund'))}"><div class="goal-heading"><span class="goal-symbol" aria-hidden="true">${icon(state.goals.length === 1 ? goalIcons[state.goals[0].kind] : 'jar')}</span><div><span class="tiny-label">${esc(t('goalFund'))}</span><h3>${esc(portfolioTitle(state))}</h3></div><button type="button" class="goal-edit" data-action="goal" aria-label="${esc(t('manageGoals'))}">${icon('edit')}</button></div><div class="goal-numbers"><strong class="goal-balance ${total.balance < 0 ? 'negative' : ''}" id="goal-balance">${esc(cash(total.balance))}</strong><span class="goal-percentage" id="goal-percent">${total.percent}%</span></div><p class="goal-total">${esc(t('goalTargetOf', { amount: cash(total.target) }))}</p><div class="goal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${total.percent}" aria-label="${esc(portfolioTitle(state))}"><span style="width:${before.ratio * 100}%"></span></div><div class="goal-meta"><span>${esc(total.completed ? t('goalReached') : t('goalLeft', { amount: cash(total.remaining) }))}</span></div></section>
        <section class="ember-sanctuary" aria-label="${esc(state.profile.name)}"><span class="ember-stage">${icon('sparkles')}${esc(t(total.stage))}</span><button type="button" id="companion-button" class="map-companion" data-action="pet" aria-label="${esc(t('tapEmber', { name: state.profile.name }))}"><span class="companion-aura" aria-hidden="true"></span><img src="/dev/nest-quest/art/ember-${total.stage}.webp" alt="${esc(state.profile.name)}" width="512" height="650"><span class="floating-amount" aria-hidden="true">${reactionActive ? esc(signed) : ''}</span></button><div class="companion-reaction world-message" role="status" aria-live="polite" aria-atomic="true"><strong>${esc(state.profile.name)}</strong>${signed ? `<span class="reaction-delta ${reaction.delta < 0 ? 'negative' : ''}">${esc(signed)}</span>` : ''}<p id="companion-speech">${esc(reactionSpeech(state, reaction))}</p></div><div class="celebration" aria-hidden="true">${Array.from({ length: 12 }, (_, index) => `<i style="--i:${index}"></i>`).join('')}</div></section>
      </aside>
    </section>
    ${goalsHTML(state, total, before)}
    <details class="journey-journal living-world panel"><summary class="journey-toggle"><span class="journey-symbol">${icon('map')}</span><span><strong>${esc(t('journeyMap'))}</strong><small>${esc(t('worldState', { n: total.milestone + 1 }))}</small></span>${icon('arrow', 'journey-chevron')}</summary>
      <div class="world-heading"><div><span class="tiny-label">${esc(t('journeyMilestones'))}</span><h2>${esc(t('valley'))}</h2></div><span class="realm-status">${total.percent}%</span></div>
      <div class="world-stage"><div class="reactive-map ${reactionClass} ${total.balance < 0 ? 'fund-negative' : ''}" style="--unrevealed:${100 - reveal}%" data-world-stage="${total.stage}" data-milestone="${total.milestone}" data-goal-ratio="${total.ratio}">
        <img class="world-muted" src="/dev/nest-quest/art/willowmere.webp" alt="${esc(t('valley'))}" width="1536" height="1024">
        <img class="world-color" src="/dev/nest-quest/art/willowmere.webp" alt="" width="1536" height="1024" aria-hidden="true">
        <svg class="journey-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="path-background" d="${path}"/><path class="path-progress" d="${path}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - pathProgress}"/></svg>
        ${QUESTS.map((point, index) => `<button type="button" class="map-pin ${index <= total.milestone ? 'unlocked' : 'locked'} ${index === total.milestone ? 'current' : ''}" style="left:${point.x}%;top:${point.y}%" data-action="landmark" data-id="${index}" aria-label="${esc(t(`landmark${index}`))}">${index <= total.milestone ? icon('check') : icon('lock')}</button>`).join('')}
        <span id="route-traveller" class="route-traveller" style="left:${position.x}%;top:${position.y}%" aria-hidden="true">${icon('sparkles')}</span>
        <span class="map-caption">${esc(t(total.stage))} · ${total.percent}%</span>
      </div>
      </div>
      <div class="milestone-rail" aria-label="${esc(t('adventure'))}">${rail}</div>
      <p class="next-checkpoint">${esc(total.completed ? t('goalReached') : t('nextCheckpoint', { place: t(`landmark${next}`), amount: cash(Math.ceil(total.target * GOAL_MILESTONES[next])) }))}</p>
    </details></div><div class="adventure-actions"><button class="button expense-action" type="button" data-action="add-expense">${icon('plus')}<span>${esc(t('addExpense'))}</span></button><button class="button button-outline income-action" type="button" data-action="add-income">${icon('wallet')}<span>${esc(t('addIncome'))}</span></button></div><div class="mobile-dock"><button type="button" class="button expense-action" data-action="add-expense">${icon('plus')}<span>${esc(t('addExpense'))}</span></button><button type="button" class="button button-outline income-action" data-action="add-income">${icon('wallet')}<span>${esc(t('addIncome'))}</span></button></div>`;

}

export function pathLengthAt(ratio) {
  const segments = QUESTS.slice(1).map((point, index) => Math.hypot(point.x - QUESTS[index].x, point.y - QUESTS[index].y));
  const total = segments.reduce((sum, length) => sum + length, 0);
  let covered = 0;
  for (let index = 0; index < segments.length; index++) {
    const part = Math.max(0, Math.min(1, (ratio - GOAL_MILESTONES[index]) / (GOAL_MILESTONES[index + 1] - GOAL_MILESTONES[index])));
    covered += segments[index] * part;
  }
  return covered / total * 100;
}
