// A small, dependency-free light sculpture. The website works without this module.
const TAU = Math.PI * 2;
const forms = ['Weave', 'Orbit', 'Bloom'];
const sparkDuration = 3400;

export function scatterPoint(index, count) {
    // A deterministic, evenly distributed cloud; no random allocations during paint.
    const y = 1 - 2 * (index + .5) / count;
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = .72 + .32 * ((index * .61803398875) % 1);
    const ring = Math.sqrt(1 - y * y) * radius;
    return [Math.cos(angle) * ring, y * radius, Math.sin(angle) * ring];
}

export function sculpturePoint(form, u, v) {
    if (form === 1) {
        const radius = .61 + .24 * Math.cos(v);
        return [radius * Math.cos(u), .24 * Math.sin(v), radius * Math.sin(u)];
    }
    if (form === 2) {
        const latitude = v / 2;
        const radius = (.68 + .13 * Math.cos(5 * u) * Math.sin(latitude)) * Math.sin(latitude);
        return [radius * Math.cos(u), .74 * Math.cos(latitude), radius * Math.sin(u)];
    }
    // A trefoil with a real tube frame, so the threads stay continuous at the seams.
    const center = [(Math.sin(u) + 2 * Math.sin(2 * u)) / 3.3,
        (Math.cos(u) - 2 * Math.cos(2 * u)) / 3.3, -Math.sin(3 * u) / 3.3];
    const tangent = [Math.cos(u) + 4 * Math.cos(2 * u),
        -Math.sin(u) + 4 * Math.sin(2 * u), -3 * Math.cos(3 * u)];
    const length = Math.hypot(...tangent);
    const t = tangent.map(n => n / length);
    const radial = Math.hypot(t[0], t[1]);
    const n = [-t[1] / radial, t[0] / radial, 0];
    const b = [-t[2] * n[1], t[2] * n[0], t[0] * n[1] - t[1] * n[0]];
    return center.map((value, i) => value + .13 * (Math.cos(v) * n[i] + Math.sin(v) * b[i]));
}

export class LightSculpture {
    constructor(root, canvas, ctx) {
        this.root = root;
        this.canvas = canvas;
        this.ctx = ctx;
        this.stage = root.querySelector('.sculpture-stage');
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        this.compact = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
        this.bands = this.compact ? 16 : 24;
        this.samples = this.compact ? 80 : 128;
        this.geometry = forms.map((_, form) => {
            const points = new Float32Array(this.bands * (this.samples + 1) * 3);
            for (let band = 0; band < this.bands; band++) {
                for (let step = 0; step <= this.samples; step++) {
                    points.set(sculpturePoint(form, step / this.samples * TAU, band / this.bands * TAU),
                        (band * (this.samples + 1) + step) * 3);
                }
            }
            return points;
        });
        this.vertices = this.geometry[0].slice();
        this.from = this.vertices.slice();
        this.projected = this.vertices.slice();
        this.threadProjected = this.vertices.slice();
        this.cloud = new Float32Array(this.vertices.length);
        for (let i = 0; i < this.cloud.length / 3; i++) {
            this.cloud.set(scatterPoint(i, this.cloud.length / 3), i * 3);
        }
        this.order = Array.from({ length: this.bands }, (_, band) => ({ band, depth: 0 }));
        this.form = 0;
        this.morph = 1;
        this.phase = .4;
        this.arrival = 1;
        this.sparkAge = sparkDuration;
        this.energy = 1;
        this.pointer = { x: 0, y: 0 };
        this.visible = false;
        this.frame = 0;
        this.lastPaint = null;
        this.onFrame = timestamp => this.tick(timestamp);
        this.readTheme();
        this.resize();

        this.stage.addEventListener('click', () => this.spark());
        this.stage.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch' || this.motion.matches) return;
            const rect = this.stage.getBoundingClientRect();
            this.pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
            this.pointer.y = (event.clientY - rect.top) / rect.height * 2 - 1;
        }, { passive: true });
        this.stage.addEventListener('pointerleave', () => { this.pointer.x = this.pointer.y = 0; });
        this.motion.addEventListener('change', () => this.syncMotion());
        document.addEventListener('visibilitychange', () => this.syncMotion());
        document.addEventListener('themechange', () => { this.readTheme(); this.syncMotion(); });
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.stage);
        this.intersectionObserver = new IntersectionObserver(entries => {
            this.visible = entries[0].isIntersecting;
            this.syncMotion();
        }, { threshold: 0 });
        this.intersectionObserver.observe(root);
        root.classList.add('sculpture-ready');
    }

    readTheme() {
        const style = getComputedStyle(document.documentElement);
        this.accent = style.getPropertyValue('--c-accent-rgb').trim();
        this.highlight = style.getPropertyValue('--c-accent-strong-rgb').trim();
        this.light = document.documentElement.dataset.theme === 'light';
    }

    resize() {
        const rect = this.stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.width = rect.width;
        this.height = rect.height;
        const dpr = Math.min(devicePixelRatio || 1, this.compact ? 1.25 : 1.5);
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.syncMotion();
    }

    setForm(form) {
        if (!Number.isInteger(form) || form < 0 || form >= forms.length || form === this.form) return;
        // Snapshot the current interpolation so repeated clicks never jump backwards.
        this.from.set(this.vertices);
        this.form = form;
        this.morph = 0;
        this.root.dataset.form = String(this.form);
        this.syncMotion();
    }

    canAnimate() {
        return this.visible && !document.hidden && !this.motion.matches;
    }

    spark() {
        if (!this.canAnimate()) return;
        // Repeated taps never stack bursts or create another animation loop.
        if (this.sparkAge < sparkDuration) return;
        this.sparkAge = 0;
        this.arrival = 0;
        this.root.dataset.effect = 'spark';
    }

    syncMotion() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.lastPaint = null;
        this.root.dataset.motion = this.motion.matches ? 'reduced' : 'idle';
        if (this.motion.matches) {
            this.vertices.set(this.geometry[this.form]);
            this.morph = 1;
            this.arrival = this.energy = 0;
            this.sparkAge = sparkDuration;
            this.root.dataset.effect = 'rest';
            this.pointer.x = this.pointer.y = 0;
        }
        if (!this.visible || document.hidden || !this.width) return;
        this.render();
        if (this.canAnimate()) {
            this.root.dataset.motion = 'running';
            this.frame = requestAnimationFrame(this.onFrame);
        }
    }

    tick(timestamp) {
        this.frame = 0;
        if (!this.canAnimate()) return;
        // 30 Hz is enough for a slow sculpture; the existing cursor stays at native speed.
        const elapsed = this.lastPaint === null ? 0 : timestamp - this.lastPaint;
        if (this.lastPaint === null || elapsed >= 32) {
            const delta = Math.min(elapsed, 64);
            this.lastPaint = timestamp;
            this.phase += delta * .00012;
            this.arrival = Math.max(0, this.arrival - delta / 2200);
            this.sparkAge = Math.min(sparkDuration, this.sparkAge + delta);
            this.morph = Math.min(1, this.morph + delta / 1100);
            const pulse = this.sparkAge < sparkDuration ? Math.pow(Math.sin(this.sparkAge / sparkDuration * Math.PI), .8) : 0;
            this.energy = Math.max(this.arrival * this.arrival * (3 - 2 * this.arrival), pulse,
                Math.sin(this.morph * Math.PI) * .25);
            this.root.dataset.effect = this.arrival > 0 ? 'arrival' : pulse > 0 ? 'spark' : 'rest';
            const ease = this.morph * this.morph * (3 - 2 * this.morph);
            const target = this.geometry[this.form];
            if (this.morph < 1) {
                for (let i = 0; i < this.vertices.length; i++) {
                    this.vertices[i] = this.from[i] + (target[i] - this.from[i]) * ease;
                }
            } else this.vertices.set(target);
            this.render();
        }
        this.frame = requestAnimationFrame(this.onFrame);
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        const scale = Math.min(this.width, this.height) * .43;
        const ax = -.36 + this.pointer.y * .22;
        const ay = this.phase + this.pointer.x * .28;
        const az = -.18;
        const sx = Math.sin(ax), cx = Math.cos(ax), sy = Math.sin(ay), cy = Math.cos(ay);
        const sz = Math.sin(az), cz = Math.cos(az);
        const stride = (this.samples + 1) * 3;
        const releasing = this.energy > .001;
        const threads = releasing ? this.threadProjected : this.projected;
        const project = (x, y, z, target, i) => {
            const rx = x * cy + z * sy;
            const rz = z * cy - x * sy;
            const ry = y * cx - rz * sx;
            const depth = y * sx + rz * cx;
            const perspective = 3.8 / (3.8 + depth);
            target[i] = this.width / 2 + (rx * cz - ry * sz) * scale * perspective;
            target[i + 1] = this.height / 2 + (ry * cz + rx * sz) * scale * perspective;
            target[i + 2] = depth;
        };
        for (const layer of this.order) {
            layer.depth = 0;
            for (let step = 0; step <= this.samples; step++) {
                const i = layer.band * stride + step * 3;
                const x = this.vertices[i], y = this.vertices[i + 1], z = this.vertices[i + 2];
                project(x, y, z, threads, i);
                if (releasing) project(x + (this.cloud[i] - x) * this.energy,
                    y + (this.cloud[i + 1] - y) * this.energy,
                    z + (this.cloud[i + 2] - z) * this.energy, this.projected, i);
                layer.depth += threads[i + 2] / (this.samples + 1);
            }
        }
        this.order.sort((a, b) => b.depth - a.depth);
        ctx.lineJoin = 'round';
        const threadOpacity = Math.pow(1 - this.energy, 8);
        for (const layer of this.order) {
            const start = layer.band * stride;
            const near = Math.max(.1, Math.min(1, .55 - layer.depth * .65));
            ctx.beginPath();
            for (let step = 0; step <= this.samples; step++) {
                const i = start + step * 3;
                if (step === 0) ctx.moveTo(threads[i], threads[i + 1]);
                else ctx.lineTo(threads[i], threads[i + 1]);
            }
            if (!this.compact && !this.light) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = `rgba(${this.accent}, ${near * .06 * threadOpacity})`;
                ctx.stroke();
            }
            ctx.lineWidth = .55 + near * .65;
            ctx.strokeStyle = `rgba(${layer.band % 4 === 0 ? this.highlight : this.accent}, ${(.16 + near * .64) * threadOpacity})`;
            ctx.stroke();
            const spacing = this.energy > .05 ? 4 : 15;
            for (let step = layer.band % spacing; step < this.samples; step += spacing) {
                const i = start + step * 3;
                const alpha = Math.max(.12, Math.min(.9, .5 - this.projected[i + 2] * .45));
                ctx.fillStyle = `rgba(${this.highlight}, ${alpha})`;
                ctx.beginPath();
                ctx.arc(this.projected[i], this.projected[i + 1], .65 + alpha * (.75 + this.energy * .85), 0, TAU);
                ctx.fill();
            }
            // A little light travels along each thread, continuously rather than in steps.
            if (threadOpacity > .1 && layer.band % 3 === 0) {
                const position = (this.phase * 15 + layer.band * 5) % this.samples;
                const step = Math.floor(position), fraction = position - step;
                const i = start + step * 3, next = i + 3;
                const x = threads[i] + (threads[next] - threads[i]) * fraction;
                const y = threads[i + 1] + (threads[next + 1] - threads[i + 1]) * fraction;
                ctx.beginPath();
                ctx.fillStyle = `rgba(${this.highlight}, ${threadOpacity * .95})`;
                ctx.arc(x, y, 2, 0, TAU);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = `rgba(${this.accent}, ${threadOpacity * .09})`;
                ctx.arc(x, y, 7, 0, TAU);
                ctx.fill();
            }
        }
        if (this.energy > .02) {
            ctx.strokeStyle = `rgba(${this.highlight}, ${this.energy * .28})`;
            ctx.lineWidth = .8;
            ctx.beginPath();
            ctx.ellipse(this.width / 2, this.height / 2, scale * (1 + this.energy * .05),
                scale * .33, -.45 + this.phase * .1, this.phase, this.phase + TAU * .78);
            ctx.stroke();
        }
    }
}

export function initHeroSculpture() {
    const root = document.getElementById('hero-sculpture');
    if (!root || root.classList.contains('sculpture-ready')) return;
    const canvas = root.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !window.ResizeObserver || !window.IntersectionObserver) return;
    return new LightSculpture(root, canvas, ctx);
}

export function initServiceLight() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.home-service-grid article').forEach(card => {
        let lastMove = -Infinity;
        card.addEventListener('pointermove', event => {
            if (reduced.matches || event.timeStamp - lastMove < 32) return;
            lastMove = event.timeStamp;
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--light-x', `${event.clientX - rect.left}px`);
            card.style.setProperty('--light-y', `${event.clientY - rect.top}px`);
        }, { passive: true });
    });
}
