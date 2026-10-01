import './village.css';
import { t, money } from './i18n.js';
import { icon } from './icons.js';
import { VILLAGE_THRESHOLDS, villageSummary } from './village-model.js';
export { VILLAGE_THRESHOLDS, villageSummary } from './village-model.js';

const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const buildingName = index => t(`villageBuild${index}`);
const rewardIcons = ['lantern', 'home', 'lantern', 'leaf', 'bridge', 'settings', 'groceries', 'flower', 'sun', 'coins', 'flower', 'shield'];
let sceneTime = 'day'; // Cosmetic session preference; never part of a financial save.

export function villageHTML(total, { reaction = null, reactionActive = false } = {}) {
  const info = villageSummary(total), esc = escapeText;
  const before = villageSummary({ balance: info.balance - (reaction?.delta || 0) });
  const notice = reactionActive && before.level !== info.level ? t(info.level > before.level ? 'villageUnlock' : 'villageReturn', { name: buildingName(info.level > before.level ? info.index : before.index) }) : '';
  return `<section class="village-card" aria-label="${esc(t('villageTitle'))}">
    <header class="village-heading"><div><span class="tiny-label">${esc(t('wealthVillageKicker'))}</span><h2>${esc(t('villageTitle'))}</h2></div><span class="village-level">${icon('home')}<span>${esc(t('villageLevel', { n: info.level }))}</span></span></header>
    <div class="village-canvas-host" data-village-stage data-village-level="${info.level}" data-village-time="${sceneTime}">
      <img class="village-fallback-art" src="/dev/nest-quest/art/willowmere.webp" alt="${esc(t('valley'))}" width="1536" height="1024">
      <span class="village-loading">${esc(t('villageLoading'))}</span>
      <div class="village-scene-tools"><span class="village-population">${esc(t('villageResidents', { n: info.population }))}</span><div class="village-time-switch" role="group" aria-label="${esc(t('villageSceneControls'))}"><button type="button" data-village-time-choice="day" aria-pressed="${sceneTime === 'day'}">${icon('sun')}<span>${esc(t('villageDay'))}</span></button><button type="button" data-village-time-choice="dusk" aria-pressed="${sceneTime === 'dusk'}">${icon('lantern')}<span>${esc(t('villageDusk'))}</span></button></div></div>
      <div class="village-camera-tools" role="group" aria-label="${esc(t('villageSceneControls'))}"><button type="button" data-village-zoom="out" disabled aria-label="${esc(t('villageZoomOut'))}"><span aria-hidden="true">−</span></button><button type="button" data-village-zoom="in" disabled aria-label="${esc(t('villageZoomIn'))}">${icon('plus')}</button><button type="button" data-village-reset disabled aria-label="${esc(t('villageReset'))}">${icon('map')}</button></div>
      <span class="village-notice ${notice ? 'show' : ''}" role="status">${esc(notice)}</span>
    </div>
    <div class="village-next"><span class="village-reward-icon">${icon(info.complete ? 'flag' : rewardIcons[info.nextIndex])}</span><div><strong>${esc(info.complete ? t('villageComplete') : t('villageNext', { name: buildingName(info.nextIndex) }))}</strong><span>${esc(info.complete ? t('villageResidents', { n: info.population }) : t('villageNeed', { amount: money(info.remaining, total?.currency || 'EUR') }))}</span></div><span class="village-next-level">${esc(t('villageLevel', { n: info.complete ? info.level : info.level + 1 }))}</span></div>
    <div class="village-progress" role="progressbar" aria-label="${esc(t('villageLevel', { n: info.level }))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(info.progress * 100)}"><span style="width:${info.progress * 100}%"></span></div>
    <div class="village-inspect-card" hidden role="status"><span class="village-inspect-icon" aria-hidden="true"></span><div><span class="village-inspect-level"></span><h3></h3><p class="village-inspect-description"></p><strong class="village-inspect-state"></strong></div><button type="button" data-village-back aria-label="${esc(t('villageInspectClose'))}">${icon('close')}</button></div>
    <details class="village-journal"><summary>${icon('book')}<span>${esc(t('villageJournal'))}</span><span class="village-journal-chevron" aria-hidden="true">⌄</span></summary><div class="village-blueprints" aria-label="${esc(t('villageTitle'))}">${VILLAGE_THRESHOLDS.map((threshold, index) => blueprintHTML(index, info, total)).join('')}</div></details>
    <p class="village-inspector">${esc(t('villageDrag'))}</p>
  </section>`;
}

function blueprintHTML(index, info, total) {
  const built = index <= info.index;
  return `<button type="button" data-village-inspect="${index}" class="${built ? 'built' : 'locked'} ${index === info.index ? 'current' : ''}" aria-pressed="false" aria-label="${escapeText(`${buildingName(index)}: ${built ? t('villageBuilt') : t('villageLocked', { amount: money(Math.max(0, VILLAGE_THRESHOLDS[index] - info.balance), total?.currency || 'EUR') })}`)}">${icon(built ? rewardIcons[index] : 'lock')}<span class="village-build-number">${index + 1}</span><span class="village-build-name">${escapeText(buildingName(index))}</span></button>`;
}

// A stable mount survives financial and language renders. Only the derived level
// changes; the expensive miniature, chosen view and cosmetic time stay in place.
export function mountVillage(element, total, options = {}) {
  const host = element?.querySelector('[data-village-stage]');
  if (!host) { const noop = () => {}; noop.update = () => {}; return noop; }
  let currentTotal = total, currentOptions = options, info = villageSummary(total);
  let disposed = false, started = false, destroy = () => {}, scene = null, selected = null, noticeTimer;
  const loading = host.querySelector('.village-loading'), card = element.querySelector('.village-card');
  const inspector = element.querySelector('.village-inspector'), detail = element.querySelector('.village-inspect-card');
  const query = selector => element.querySelector(selector);
  function showDetail(index, focus = true) {
    if (!Number.isInteger(index) || index < 0 || index >= VILLAGE_THRESHOLDS.length) return;
    selected = index; detail.hidden = false; detail.dataset.built = String(index <= info.index);
    query('.village-inspect-icon').innerHTML = icon(rewardIcons[index]);
    query('.village-inspect-level').textContent = t('villageLevel', { n: index + 1 });
    query('.village-inspect-card h3').textContent = buildingName(index);
    query('.village-inspect-description').textContent = t(`villageDetail${index}`);
    query('.village-inspect-state').textContent = index <= info.index ? t('villageBuilt') : t('villageLocked', { amount: money(Math.max(0, VILLAGE_THRESHOLDS[index] - info.balance), currentTotal?.currency || 'EUR') });
    element.querySelectorAll('[data-village-inspect]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.villageInspect) === index)));
    if (focus) scene?.select(index <= info.index ? index : null);
  }
  function closeDetail() {
    selected = null; detail.hidden = true;
    element.querySelectorAll('[data-village-inspect]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    scene?.select(null);
  }
  function refreshLabels() {
    card.setAttribute('aria-label', t('villageTitle')); query('.village-heading h2').textContent = t('villageTitle'); query('.village-heading .tiny-label').textContent = t('wealthVillageKicker');
    query('.village-level>span').textContent = t('villageLevel', { n: info.level }); host.dataset.villageLevel = String(info.level);
    query('.village-population').textContent = t('villageResidents', { n: info.population });
    query('.village-next strong').textContent = info.complete ? t('villageComplete') : t('villageNext', { name: buildingName(info.nextIndex) });
    query('.village-next>div>span').textContent = info.complete ? t('villageResidents', { n: info.population }) : t('villageNeed', { amount: money(info.remaining, currentTotal?.currency || 'EUR') });
    query('.village-next-level').textContent = t('villageLevel', { n: info.complete ? info.level : info.level + 1 }); query('.village-reward-icon').innerHTML = icon(info.complete ? 'flag' : rewardIcons[info.nextIndex]);
    const progress = query('.village-progress'); progress.setAttribute('aria-label', t('villageLevel', { n: info.level })); progress.setAttribute('aria-valuenow', String(Math.floor(info.progress * 100))); progress.firstElementChild.style.width = `${info.progress * 100}%`;
    query('.village-journal>summary>span').textContent = t('villageJournal');
    element.querySelectorAll('[data-village-inspect]').forEach(button => {
      const index = Number(button.dataset.villageInspect), built = index <= info.index;
      button.classList.toggle('built', built); button.classList.toggle('locked', !built); button.classList.toggle('current', index === info.index);
      button.setAttribute('aria-label', `${buildingName(index)}: ${built ? t('villageBuilt') : t('villageLocked', { amount: money(Math.max(0, VILLAGE_THRESHOLDS[index] - info.balance), currentTotal?.currency || 'EUR') })}`);
      button.querySelector('.village-build-name').textContent = buildingName(index); button.firstElementChild.outerHTML = icon(built ? rewardIcons[index] : 'lock');
    });
    element.querySelectorAll('[data-village-time-choice]').forEach(button => { button.lastElementChild.textContent = t(button.dataset.villageTimeChoice === 'day' ? 'villageDay' : 'villageDusk'); button.setAttribute('aria-pressed', String(button.dataset.villageTimeChoice === sceneTime)); });
    query('[data-village-reset]').setAttribute('aria-label', t('villageReset')); query('[data-village-back]').setAttribute('aria-label', t('villageInspectClose')); query('[data-village-zoom=in]').setAttribute('aria-label', t('villageZoomIn')); query('[data-village-zoom=out]').setAttribute('aria-label', t('villageZoomOut'));
    element.querySelectorAll('.village-time-switch,.village-camera-tools').forEach(group => group.setAttribute('aria-label', t('villageSceneControls')));
    inspector.textContent = t(host.dataset.villageFallback === 'true' ? 'villageBlueprintHint' : 'villageDrag');
    if (!loading.hidden) loading.textContent = t(host.dataset.villageFallback === 'true' ? 'villageFallback' : 'villageLoading');
    if (selected !== null) showDetail(selected, false);
  }
  function notice() {
    clearTimeout(noticeTimer); const target = query('.village-notice');
    const before = villageSummary({ balance: info.balance - (currentOptions.reaction?.delta || 0) });
    const changed = currentOptions.reactionActive && before.index !== info.index;
    target.textContent = changed ? t(info.index > before.index ? 'villageUnlock' : 'villageReturn', { name: buildingName(info.index > before.index ? info.index : before.index) }) : '';
    target.classList.toggle('show', !!changed);
    if (changed) noticeTimer = setTimeout(() => target.classList.remove('show'), 4500);
  }
  function click(event) {
    const button = event.target.closest('[data-village-inspect],[data-village-time-choice],[data-village-zoom],[data-village-reset],[data-village-back]'); if (!button) return;
    if (button.hasAttribute('data-village-inspect')) showDetail(Number(button.dataset.villageInspect));
    else if (button.hasAttribute('data-village-time-choice')) {
      sceneTime = button.dataset.villageTimeChoice; host.dataset.villageTime = sceneTime;
      element.querySelectorAll('[data-village-time-choice]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.villageTimeChoice === sceneTime))); scene?.setTime(sceneTime);
    } else if (button.hasAttribute('data-village-zoom')) scene?.zoom(button.dataset.villageZoom === 'in' ? 1 : -1);
    else { closeDetail(); scene?.reset(); }
  }
  element.addEventListener('click', click);
  const fallback = () => {
    if (disposed) return; host.dataset.villageFallback = 'true'; loading.hidden = false; loading.textContent = t('villageFallback'); inspector.textContent = t('villageBlueprintHint');
  };
  const start = async () => {
    if (started || disposed) return; started = true;
    try {
      const [THREE, { mergeGeometries }, { createVillage }] = await Promise.all([import('three'), import('three/addons/utils/BufferGeometryUtils.js'), import('./village-scene.js')]);
      if (disposed) return;
      scene = createVillage(THREE, mergeGeometries, element, host, currentTotal, { ...currentOptions, time: sceneTime, inspect: showDetail, onFallback: fallback, registerCleanup: cleanup => { destroy = cleanup; } });
      destroy = scene.cleanup; host.dataset.villageReady = 'true'; loading.hidden = true;
      host.querySelectorAll('[data-village-reset],[data-village-zoom]').forEach(button => { button.disabled = false; });
      if (selected !== null) scene.select(selected <= info.index ? selected : null);
    } catch { destroy(); destroy = () => {}; scene = null; fallback(); }
  };
  let observer;
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void start(); } }, { rootMargin: '180px' }); observer.observe(host);
  } else void start();
  notice();
  const cleanup = () => { disposed = true; clearTimeout(noticeTimer); observer?.disconnect(); element.removeEventListener('click', click); destroy(); };
  cleanup.update = (nextTotal, nextOptions = {}) => {
    if (disposed) return; const oldReaction = currentOptions.reaction;
    currentTotal = nextTotal; currentOptions = nextOptions; info = villageSummary(nextTotal);
    scene?.update(nextTotal, nextOptions); refreshLabels();
    if (oldReaction !== nextOptions.reaction) notice();
  };
  return cleanup;
}
