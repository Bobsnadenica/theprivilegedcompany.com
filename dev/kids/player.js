(() => {
  const copy = {
    bg: {
      back: '← Всички проекти', languageLabel: 'Език', eyebrow: 'МЯСТО ЗА СЕМЕЙНИ ИСТОРИИ',
      title: 'Истории за слушане.', intro: 'Аудиозаписи за слушане и търсене по име на файл.',
      collection: 'БИБЛИОТЕКА', browse: 'Аудиофайлове', ready: 'КАТАЛОГ', search: 'Търси файл…', searchLabel: 'Търси файл',
      loading: 'Зареждане на аудиофайловете…', empty: 'Няма аудиофайлове или съвпадения.',
      count: n => `${n} аудиофайла`, results: (n, total) => `Показани са ${n} от ${total} файла.`,
      note: 'Имената се зареждат от файловете в библиотеката.', error: 'Имената на файловете не могат да бъдат заредени в момента.'
    },
    en: {
      back: '← All projects', languageLabel: 'Language', eyebrow: 'A SPACE FOR FAMILY STORIES',
      title: 'Stories to listen to.', intro: 'Audio recordings, searchable by filename.',
      collection: 'LIBRARY', browse: 'Audio files', ready: 'CATALOG', search: 'Search files…', searchLabel: 'Search files',
      loading: 'Loading audio files…', empty: 'No audio files or matches found.',
      count: n => `${n} audio files`, results: (n, total) => `Showing ${n} of ${total} files.`,
      note: 'Names are loaded from the files in the library.', error: 'File names could not be loaded right now.'
    }
  };
  const $ = selector => document.querySelector(selector);
  const list = $('#tracks');
  const search = $('#search');
  const language = $('#language');
  const empty = $('#empty-state');
  const params = new URLSearchParams(location.search);
  let languageCode = params.get('lang') === 'en' ? 'en' : 'bg';
  let files = [];
  let loadError = false;
  let loadFinished = false;

  function say(key, ...args) {
    const value = copy[languageCode][key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function filterFiles() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of list.children) {
      const matches = !query || row.dataset.filename.toLocaleLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    empty.hidden = !loadFinished || visible !== 0;
    empty.textContent = loadError ? say('error') : say('empty');
    $('#filter-status').textContent = loadError ? '' : loadFinished ? say('results', visible, files.length) : say('loading');
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
    $('#slot-count').textContent = loadFinished ? say('count', files.length) : say('loading');
    $('#placeholder-note').textContent = loadError ? say('error') : say('note');

    const fragment = document.createDocumentFragment();
    for (const [index, filename] of files.entries()) {
      const row = document.createElement('li');
      row.className = 'track-row';
      row.dataset.filename = filename;

      const card = document.createElement('div');
      card.className = 'track-button file-row';

      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const title = document.createElement('span');
      title.className = 'track-title';
      title.textContent = filename;

      card.append(number, title);
      row.append(card);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    filterFiles();
  }

  async function loadFiles() {
    try {
      const response = await fetch('https://api.github.com/repos/Bobsnadenica/theprivilegedcompany.com/contents/kids?ref=main', {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const entries = await response.json();
      files = entries
        .filter(entry => entry.type === 'file' && /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(entry.name))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } catch {
      loadError = true;
    }
    loadFinished = true;
    render();
  }

  language.addEventListener('change', () => {
    languageCode = language.value;
    const url = new URL(location.href);
    url.searchParams.set('lang', languageCode);
    history.replaceState(null, '', url);
    render();
  });
  search.addEventListener('input', filterFiles);
  render();
  loadFiles();
})();
