// Shot intervals follow the four chapters. Frame progress is reversible and independent of scroll speed.
const chapterCuts = [0, 3.65, 7.65, 9.8, 11];
const clamp = value => Math.max(0, Math.min(1, value));
export function filmPosition(chapterProgress) {
    const clamped = Math.max(0, Math.min(4, chapterProgress));
    const act = Math.min(3, Math.floor(clamped));
    const frame = chapterCuts[act] + (chapterCuts[act + 1] - chapterCuts[act]) * (clamped - act);
    const first = Math.floor(frame);
    const mix = clamp((frame - first - .34) / .66);
    return { first, next: Math.min(11, first + 1), blend: mix * mix * (3 - 2 * mix), frame };
}

export function initScrollStudio() {
    const story = document.getElementById('scroll-studio');
    if (!story) return;
    const canvas = story.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const chapters = [...story.querySelectorAll('.cipher-chapter')];
    const stage = canvas.parentElement;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const images = new Map();
    let nearby = false;
    let raf = 0;
    function schedule() {
        if (nearby && !document.hidden && !motion.matches && !raf) raf = requestAnimationFrame(paint);
    }
    function imageAt(index) {
        if (!images.has(index)) {
            const image = new Image();
            image.decoding = 'async';
            image.onload = schedule;
            image.src = '/assets/cipher/shot-' + String(index + 1).padStart(2, '0') + '.webp';
            images.set(index, image);
        }
        return images.get(index);
    }
    function compose(image, age, alpha) {
        const zoom = 1.04 + clamp(age) * .085;
        const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        ctx.globalAlpha = alpha;
        ctx.drawImage(image, (canvas.width - w) * (.48 + clamp(age) * .08), (canvas.height - h) * .48, w, h);
    }
    function paint() {
        raf = 0;
        if (!nearby || document.hidden || motion.matches) return;
        const dpr = Math.min(1.5, devicePixelRatio || 1);
        const width = Math.max(1, Math.round(stage.clientWidth * dpr));
        const height = Math.max(1, Math.round(stage.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const line = stage.getBoundingClientRect().top + (innerWidth <= 760 ? stage.clientHeight + (innerHeight - stage.clientHeight) * .4 : stage.clientHeight * .48);
        const rects = chapters.map(chapter => chapter.getBoundingClientRect());
        const index = Math.max(0, rects.findLastIndex(rect => rect.top <= line));
        const fraction = clamp((line - rects[index].top) / rects[index].height);
        const position = filmPosition(index + fraction);
        const a = imageAt(position.first), b = imageAt(position.next);
        imageAt(Math.min(11, position.next + 1));
        if (a.complete && a.naturalWidth) {
            compose(a, position.frame - position.first + .2, 1);
            if (position.blend && b.complete && b.naturalWidth) compose(b, position.frame - position.next + .2, position.blend);
            ctx.globalAlpha = 1;
        }
        stage.style.setProperty('--film-progress', (index + fraction) / 4);
    }
    new IntersectionObserver(([entry]) => {
        nearby = entry.isIntersecting;
        if (!nearby && raf) { cancelAnimationFrame(raf); raf = 0; }
        schedule();
    }, {rootMargin:'150px'}).observe(story);
    new ResizeObserver(schedule).observe(stage);
    addEventListener('scroll', schedule, {passive:true});
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
    document.querySelector('a[href="#scroll-studio"]')?.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        story.focus({preventScroll:true});
        story.scrollIntoView();
    });
}
