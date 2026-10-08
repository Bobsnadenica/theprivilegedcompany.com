(() => {
    const wrapper = document.getElementById('fade-wrapper');
    let navigation;
    document.querySelectorAll('main a').forEach(link => {
        link.addEventListener('click', event => {
            if (!wrapper || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol) || (url.pathname === location.pathname && url.search === location.search)) return;
            event.preventDefault();
            clearTimeout(navigation);
            wrapper.classList.add('explode');
            navigation = setTimeout(() => location.assign(url.href), 160);
        });
    });
    window.addEventListener('pageshow', () => { clearTimeout(navigation); wrapper?.classList.remove('explode'); });
})();
