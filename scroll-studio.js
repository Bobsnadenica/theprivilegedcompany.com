// A single native-scroll timeline drives three photographic layers in perspective.
export function initScrollStudio() {
    const journey = document.querySelector('.studio-journey');
    if (!journey) return;
    const stage = journey.querySelector('.studio-visual');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let pending = 0;

    function draw() {
        pending = 0;
        const top = parseFloat(getComputedStyle(stage).top) || 0;
        const travel = Math.max(1, journey.offsetHeight - stage.offsetHeight);
        const progress = Math.max(0, Math.min(1, (top - journey.getBoundingClientRect().top) / travel));
        const phase = motion.matches ? 0.5 : progress;
        stage.style.setProperty('--opening', Math.sin(Math.PI * phase).toFixed(4));
        stage.style.setProperty('--turn', (phase - 0.5).toFixed(4));
    }

    function schedule() {
        if (visible && !document.hidden && !pending) pending = requestAnimationFrame(draw);
    }
    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (!visible && pending) {
            cancelAnimationFrame(pending);
            pending = 0;
        }
        schedule();
    }).observe(journey);
    new ResizeObserver(schedule).observe(journey);
    addEventListener('scroll', () => { if (!motion.matches) schedule(); }, { passive: true });
    motion.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', schedule);
}
