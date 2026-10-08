(() => {
    const root = document.documentElement;
    const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
    const language = document.getElementById('language');
    const query = new URLSearchParams(location.search).get('lang');
    let lang = (query || read('tpc-language')) === 'bg' ? 'bg' : 'en';
    const translated = [...document.querySelectorAll('[data-bg]')];
    translated.forEach(node => { node.dataset.en = node.textContent; });
    const search = document.getElementById('project-search');
    const clear = document.getElementById('clear-search');
    const cards = [...document.querySelectorAll('.portal-tile')];
    const searchable = new Map(cards.map(card => [card, `${card.textContent} ${[...card.querySelectorAll('[data-bg]')].map(node => node.dataset.bg).join(' ')}`.toLocaleLowerCase()]));
    function filter() {
        const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        cards.forEach(card => { card.hidden = !words.every(word => searchable.get(card).includes(word)); });
        document.querySelectorAll('.portal-section').forEach(section => { section.hidden = ![...section.querySelectorAll('.portal-tile')].some(card => !card.hidden); });
        const count = cards.filter(card => !card.hidden).length;
        document.getElementById('search-status').textContent = lang === 'bg' ? `Показани проекти: ${count} от ${cards.length}` : `${count} of ${cards.length} projects`;
        document.getElementById('no-results').hidden = count > 0;
        clear.hidden = !words.length;
    }
    function translate() {
        root.lang = lang;
        language.value = lang;
        translated.forEach(node => { node.textContent = node.dataset[lang]; });
        search.placeholder = lang === 'bg' ? 'Търси игри, инструменти, проекти…' : 'Search games, tools, experiments…';
        document.getElementById('theme-toggle').setAttribute('aria-label', lang === 'bg' ? 'Тъмна тема' : 'Dark theme');
        filter();
    }
    language.addEventListener('change', () => {
        lang = language.value; save('tpc-language', lang);
        const url = new URL(location.href); url.searchParams.set('lang', lang); history.replaceState(null, '', url);
        translate();
    });
    search.addEventListener('input', filter);
    function clearSearch() { search.value = ''; filter(); search.focus(); }
    clear.addEventListener('click', clearSearch);
    search.addEventListener('keydown', event => { if (event.key === 'Escape') clearSearch(); });
    const toggle = document.getElementById('theme-toggle');
    function setTheme(dark) {
        root.classList.toggle('dark', dark);
        toggle.setAttribute('aria-pressed', String(dark));
        document.getElementById('sun-icon').classList.toggle('hidden', !dark);
        document.getElementById('moon-icon').classList.toggle('hidden', dark);
        document.getElementById('theme-color-meta').content = dark ? '#10100f' : '#fff0d7';
    }
    setTheme(read('theme') !== 'light');
    toggle.addEventListener('click', () => {
        const dark = !root.classList.contains('dark'); setTheme(dark); save('theme', dark ? 'dark' : 'light');
    });
    translate();
    // The hub no longer needs or retains precise location from the legacy map.
    try { localStorage.removeItem('userLocation'); localStorage.removeItem('mapState'); } catch {}
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});

    const loadButton = document.getElementById('load-map');
    const status = document.getElementById('map-status');
    const container = document.getElementById('map-container');
    let map, marker, timer, busy = false, inView = false;
    const message = (en, bg) => { status.textContent = lang === 'bg' ? bg : en; };
    function loadLeaflet() {
        if (window.L) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            const timeout = setTimeout(() => { js.remove(); reject(new Error('Map timed out')); }, 10000);
            js.onload = () => { clearTimeout(timeout); resolve(); };
            js.onerror = () => { clearTimeout(timeout); reject(new Error('Map unavailable')); };
            document.head.append(css, js);
        });
    }
    async function update() {
        clearTimeout(timer);
        if (!map || busy || document.hidden || !inView) return;
        busy = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: controller.signal });
            if (!response.ok) throw new Error('ISS unavailable');
            const { latitude, longitude, timestamp } = await response.json();
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(timestamp)) throw new Error('Invalid position');
            if (!marker) {
                marker = L.circleMarker([latitude, longitude], { radius: 8, color: '#fff1c1', fillColor: '#dba04b', fillOpacity: 1 }).addTo(map).bindTooltip('ISS / МКС');
                map.setView([latitude, longitude], 2);
            } else marker.setLatLng([latitude, longitude]);
            const time = new Date(timestamp * 1000).toLocaleTimeString(lang === 'bg' ? 'bg-BG' : 'en-GB');
            message(`ISS position observed at ${time} · Where the ISS at?`, `Позиция на МКС към ${time} · Where the ISS at?`);
        } catch {
            message('Live position unavailable. The map remains usable; retrying while visible.', 'Позицията е недостъпна. Картата работи; опитваме отново, докато е видима.');
        } finally {
            clearTimeout(timeout); busy = false;
            if (!document.hidden && inView) timer = setTimeout(update, 15000);
        }
    }
    loadButton.addEventListener('click', async () => {
        loadButton.disabled = true;
        message('Loading the map…', 'Зареждане на картата…');
        try {
            await loadLeaflet(); container.hidden = false;
            map = L.map('map', { scrollWheelZoom: false }).setView([0, 0], 2);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 8, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            loadButton.hidden = true;
            new IntersectionObserver(entries => {
                inView = entries[0].isIntersecting;
                if (inView) update(); else clearTimeout(timer);
            }).observe(container);
        } catch { loadButton.disabled = false; message('The map could not load. Please try again.', 'Картата не се зареди. Опитай отново.'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else update(); });
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', () => { if (map) { map.invalidateSize(); update(); } });
})();
