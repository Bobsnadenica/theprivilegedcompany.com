(() => {
  const copy = {
    bg: {
      back: '← Всички проекти', languageLabel: 'Език', eyebrow: 'МЯСТО ЗА СЕМЕЙНИ ИСТОРИИ',
      title: 'Истории за слушане.', intro: 'Тази библиотека е подготвена за твоите аудиозаписи. Файловете не са качени.',
      collection: 'БИБЛИОТЕКА', browse: 'Подготвени записи', search: 'Търси запис…', searchLabel: 'Търси запис',
      ready: 'МЯСТО ЗА АУДИО', placeholder: 'Аудиофайлът още не е добавен', empty: 'Няма съвпадения. Опитай друга дума.',
      count: n => `${n} места за записи`, results: (n, total) => `Показани са ${n} от ${total} места.`,
      note: 'Плейърът ще се активира, когато добавиш аудиофайлове.',
      filesNote: 'Аудиофайловете умишлено не са включени в тази страница или в хранилището.'
    },
    en: {
      back: '← All projects', languageLabel: 'Language', eyebrow: 'A SPACE FOR FAMILY STORIES',
      title: 'Stories to listen to.', intro: 'This library is ready for your audio recordings. The files have not been uploaded.',
      collection: 'LIBRARY', browse: 'Prepared slots', search: 'Search recordings…', searchLabel: 'Search recordings',
      ready: 'AUDIO SLOT', placeholder: 'Audio file not added yet', empty: 'No matches. Try another word.',
      count: n => `${n} recording slots`, results: (n, total) => `Showing ${n} of ${total} slots.`,
      note: 'Playback will be enabled when you add audio files.',
      filesNote: 'Audio files are intentionally not included in this page or its repository.'
    }
  };
  const $ = selector => document.querySelector(selector);
  const list = $('#tracks');
  const search = $('#search');
  const language = $('#language');
  const empty = $('#empty-state');
  const params = new URLSearchParams(location.search);
  let languageCode = params.get('lang') === 'en' ? 'en' : 'bg';
  const slots = Array.from({ length: 106 }, (_, index) => index + 1);

  function say(key, ...args) {
    const value = copy[languageCode][key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function filterSlots() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of list.children) {
      const matches = !query || row.textContent.toLocaleLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    empty.hidden = visible !== 0;
    $('#filter-status').textContent = say('results', visible, slots.length);
  }

  function render() {
    document.documentElement.lang = languageCode;
    language.value = languageCode;
    document.querySelectorAll('[data-copy]').forEach(node => {
      node.textContent = say(node.dataset.copy);
    });
    document.querySelectorAll('[data-copy-aria]').forEach(node => {
      node.setAttribute('aria-label', say(node.dataset.copyAria));
    });
    search.placeholder = say('search');
    $('#slot-count').textContent = say('count', slots.length);
    $('#placeholder-note').textContent = say('note');

    const fragment = document.createDocumentFragment();
    for (const slot of slots) {
      const row = document.createElement('li');
      row.className = 'track-row';
      row.dataset.slot = String(slot).padStart(3, '0');

      const card = document.createElement('div');
      card.className = 'track-button placeholder-card';

      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(slot).padStart(2, '0');

      const title = document.createElement('span');
      title.className = 'track-title';
      title.textContent = `${languageCode === 'bg' ? 'Запис' : 'Recording'} ${String(slot).padStart(3, '0')}`;

      const status = document.createElement('span');
      status.className = 'placeholder-status';
      status.textContent = '＋';
      status.setAttribute('aria-hidden', 'true');

      const note = document.createElement('span');
      note.className = 'placeholder-caption';
      note.textContent = say('placeholder');

      card.append(number, title, status, note);
      row.append(card);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    filterSlots();
  }

  language.addEventListener('change', () => {
    languageCode = language.value;
    const url = new URL(location.href);
    url.searchParams.set('lang', languageCode);
    history.replaceState(null, '', url);
    render();
  });
  search.addEventListener('input', filterSlots);
  render();
})();
