import './styles.css';
import { applyLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
function update() {
  applyLanguage();
  document.title = document.body.classList.contains('privacy-page') ? `Nest & Quest — ${t('privacy')}` : `Nest & Quest — ${t('eyebrow')}`;
}
document.querySelectorAll('[data-lang]').forEach(el => el.addEventListener('click', () => { setLanguage(el.dataset.lang); update(); }));
update();
