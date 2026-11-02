(() => {
  const copy = {
    bg: {
      back: '← Всички проекти', eyebrow: 'МЯСТО ЗА СЕМЕЙНИ ИСТОРИИ',
      title: 'Истории за слушане.', intro: 'Разгледай аудиозаписите и пусни избрания файл.',
      collection: 'БИБЛИОТЕКА', browse: 'Аудиофайлове', ready: 'ПЛЕЙЪР', playerTitle: 'Избери запис',
      search: 'Търси файл…', searchLabel: 'Търси файл', downloadAll: '↓ Изтегли всички', downloadCurrent: '↓ Изтегли', downloadFile: name => `Изтегли ${name}`, loading: 'Зареждане на аудиофайловете…',
      empty: 'Все още няма аудиозаписи.', noMatches: 'Няма съвпадения. Опитай друга дума.',
      count: n => `${n} аудиофайла`, results: (n, total) => `Показани са ${n} от ${total} файла.`,
      idle: 'Аудиофайлът се зарежда само след избор.', error: 'Библиотеката не може да бъде заредена в момента.',
      load: name => `Зареждане: ${name}`, selected: name => `Избран запис: ${name}`,
      playing: name => `Слушаш: ${name}`, failed: 'Записът не може да бъде възпроизведен.'
    },
    en: {
      back: '← All projects', eyebrow: 'A SPACE FOR FAMILY STORIES',
      title: 'Stories to listen to.', intro: 'Browse the recordings and play a file when you choose it.',
      collection: 'LIBRARY', browse: 'Audio files', ready: 'PLAYER', playerTitle: 'Choose a recording',
      search: 'Search files…', searchLabel: 'Search files', downloadAll: '↓ Download all', downloadCurrent: '↓ Download', downloadFile: name => `Download ${name}`, loading: 'Loading audio files…',
      empty: 'No recordings yet.', noMatches: 'No matches. Try another search.',
      count: n => `${n} audio files`, results: (n, total) => `Showing ${n} of ${total} files.`,
      idle: 'Audio loads only after you select a recording.', error: 'The library could not be loaded right now.',
      load: name => `Loading: ${name}`, selected: name => `Selected: ${name}`,
      playing: name => `Playing: ${name}`, failed: 'This recording could not be played.'
    }
  };
  const $ = selector => document.querySelector(selector);
  const list = $('#tracks');
  const search = $('#search');
  const languageToggle = $('#language-toggle');
  const downloadAll = $('#download-all');
  const downloadCurrent = $('#download-current');
  const playerPanel = $('#audio-player-panel');
  const empty = $('#empty-state');
  const audio = $('#audio');
  const endpoint = window.__KIDS_AUDIO__?.endpoint?.replace(/\/$/, '');
  const params = new URLSearchParams(location.search);
  let languageCode = params.get('lang') === 'en' ? 'en' : 'bg';
  let files = [];
  let loadError = false;
  let loadFinished = false;
  let currentFile = null;
  let playerState = 'idle';
  let manifestArchive = false;

  function say(key, ...args) {
    const value = copy[languageCode][key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function downloadUrl(key) {
    return `${endpoint}/download?key=${encodeURIComponent(key)}`;
  }

  function updatePlayer() {
    $('#player-title').textContent = currentFile?.name || say('playerTitle');
    playerPanel.hidden = !currentFile;
    document.body.classList.toggle('has-active-player', Boolean(currentFile));
    downloadCurrent.href = currentFile && endpoint ? downloadUrl(currentFile.key) : '#';
    const message = playerState === 'loading' ? say('load', currentFile.name)
      : playerState === 'playing' ? say('playing', currentFile.name)
        : playerState === 'selected' ? say('selected', currentFile.name)
          : playerState === 'error' ? say('failed') : say('idle');
    $('#player-status').textContent = message;
  }

  function filterFiles() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of list.children) {
      const matches = !query || row.dataset.filename.toLocaleLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    empty.hidden = !loadFinished || loadError || (files.length > 0 && visible !== 0);
    empty.textContent = files.length === 0 ? say('empty') : say('noMatches');
    $('#filter-status').textContent = loadError ? say('error')
      : loadFinished ? say('results', visible, files.length) : say('loading');
  }

  function render() {
    document.documentElement.lang = languageCode;
    languageToggle.innerHTML = languageCode === 'bg' ? '🇬🇧 <span>EN</span>' : '🇧🇬 <span>BG</span>';
    languageToggle.setAttribute('aria-label', languageCode === 'bg' ? 'Switch language to English' : 'Смени езика на български');
    document.querySelectorAll('[data-copy]').forEach(node => {
      node.textContent = say(node.dataset.copy);
    });
    document.querySelectorAll('[data-copy-aria]').forEach(node => {
      node.setAttribute('aria-label', say(node.dataset.copyAria));
    });
    search.placeholder = say('search');
    $('#slot-count').textContent = loadFinished ? say('count', files.length) : say('loading');
    $('#placeholder-note').textContent = loadError ? say('error') : say('idle');
    downloadAll.hidden = !manifestArchive;
    downloadAll.href = endpoint ? `${endpoint}/download-all` : '#';

    const fragment = document.createDocumentFragment();
    for (const [index, file] of files.entries()) {
      const row = document.createElement('li');
      row.className = 'track-row';
      row.dataset.filename = file.name;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'track-button file-button';
      button.dataset.key = file.key;
      button.setAttribute('aria-pressed', String(currentFile?.key === file.key));

      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const title = document.createElement('span');
      title.className = 'track-title';
      title.textContent = file.name;

      const symbol = document.createElement('span');
      symbol.className = 'track-symbol';
      symbol.textContent = currentFile?.key === file.key && playerState === 'playing' ? 'Ⅱ' : '▶';
      symbol.setAttribute('aria-hidden', 'true');

      button.append(number, title, symbol);
      const download = document.createElement('a');
      download.className = 'track-download';
      download.href = endpoint ? downloadUrl(file.key) : '#';
      download.setAttribute('aria-label', say('downloadFile', file.name));
      download.textContent = '↓';
      row.append(button, download);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    updatePlayer();
    filterFiles();
  }

  async function loadFiles() {
    try {
      if (!endpoint) throw new Error('Audio endpoint is not configured');
      const response = await fetch(`${endpoint}/manifest`);
      if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
      const manifest = await response.json();
      files = Array.isArray(manifest.files)
        ? manifest.files.filter(file => file && typeof file.name === 'string'
          && typeof file.key === 'string' && file.key.startsWith('prikazki/'))
        : [];
      manifestArchive = manifest.archive?.key?.toLowerCase() === 'prikazki/archive.zip';
    } catch {
      loadError = true;
    }
    loadFinished = true;
    render();
  }

  async function selectFile(key) {
    const file = files.find(entry => entry.key === key);
    if (!file || !endpoint) return;
    if (currentFile?.key === key && !audio.paused) {
      audio.pause();
      return;
    }

    currentFile = file;
    playerState = 'loading';
    audio.src = `${endpoint}/play?key=${encodeURIComponent(file.key)}`;
    audio.load();
    render();
    try {
      await audio.play();
    } catch {
      playerState = 'selected';
      updatePlayer();
    }
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-key]');
    if (button) selectFile(button.dataset.key);
  });
  search.addEventListener('input', filterFiles);
  audio.addEventListener('playing', () => { playerState = 'playing'; render(); });
  audio.addEventListener('pause', () => {
    if (playerState === 'playing' && currentFile) { playerState = 'selected'; render(); }
  });
  audio.addEventListener('error', () => { playerState = 'error'; updatePlayer(); });
  languageToggle.addEventListener('click', () => {
    languageCode = languageCode === 'bg' ? 'en' : 'bg';
    const url = new URL(location.href);
    url.searchParams.set('lang', languageCode);
    history.replaceState(null, '', url);
    render();
  });

  render();
  loadFiles();
})();
