(() => {
  // Older cached entry pages loaded this script without the archive markup.
  if (!document.querySelector('#language')) {
    location.replace(new URL('index.html?v=20261008a', location.href).href);
    return;
  }
  const designs = ['Chatgpt.html', 'DeepSeek.html', 'Gemini.html', 'Grok.html', 'Meta.html'];
  const copy = {
    en: {title:'One prompt. Different directions.',eyebrow:'Archived AI design studies',intro:'Early experiments comparing the layouts different AI models produced from a similar brief. Explore the visual approaches; these are design samples, not finished research products.',note:'The conspiracy-themed sample text contains unverified claims. It is not factual reporting or advice. The archived pages are in English.',design:'Design study',game:'A small idle-game prototype · English',random:'Surprise me with a design',cta:'Have an idea worth building? We offer 1:1 consultations with a certified senior cloud architect.',contact:'Discuss your idea →',back:'← Projects & experiments'},
    bg: {title:'Една задача. Различни посоки.',eyebrow:'Архив на AI дизайн експерименти',intro:'Ранни експерименти, сравняващи визуалните решения на различни AI модели по сходно задание. Това са примери за дизайн, а не завършени изследователски продукти.',note:'Текстовете на тема конспирации съдържат непроверени твърдения. Те не са журналистически материали или съвети. Архивните страници са на английски.',design:'Дизайн експеримент',game:'Малък прототип на игра · На английски',random:'Изненадайте ме с дизайн',cta:'Имате идея за собствен проект? Предлагаме 1:1 консултации със сертифициран старши архитект на облачни решения.',contact:'Обсъдете идеята си →',back:'← Проекти и експерименти'}
  };
  let language = new URLSearchParams(location.search).get('lang') === 'bg' ? 'bg' : 'en';
  const apply = () => {
    document.documentElement.lang = language;
    document.title = language === 'bg' ? 'AI дизайн експерименти — The Privileged Company' : 'AI design studies — The Privileged Company';
    document.querySelector('#language').value = language;
    document.querySelectorAll('[data-copy]').forEach(element => { element.textContent = copy[language][element.dataset.copy]; });
    document.querySelector('#back').textContent = copy[language].back;
    document.querySelector('#back').href = '/dev?lang=' + language;
    document.querySelector('#contact').href = '/contact?service=1%3A1%20Tech%20Consultations&lang=' + language;
    document.querySelectorAll('.card').forEach(link => { const url = new URL(link.href); url.searchParams.set('lang', language); link.href = url.href; });
  };
  document.querySelector('#language').addEventListener('change', event => { language = event.target.value; const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(null, '', url); apply(); });
  document.querySelector('#random').addEventListener('click', () => { location.assign(designs[Math.floor(Math.random() * designs.length)] + '?lang=' + language); });
  apply();
})();
