// A small, dependency-free light sculpture. The website works without this module.
const TAU = Math.PI * 2;
const forms = ['Weave', 'Orbit', 'Bloom'];

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
    constructor(root, canvas, ctx, translate) {
        this.root = root;
        this.canvas = canvas;
        this.ctx = ctx;
        this.translate = translate;
        this.stage = root.querySelector('.sculpture-stage');
        this.name = root.querySelector('#sculpture-form');
        this.pauseButton = root.querySelector('#sculpture-pause');
        this.pauseLabel = root.querySelector('#sculpture-pause-label');
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
        this.order = Array.from({ length: this.bands }, (_, band) => ({ band, depth: 0 }));
        this.form = 0;
        this.morph = 1;
        this.phase = .4;
        this.pointer = { x: 0, y: 0 };
        this.visible = false;
        this.paused = false;
        this.frame = 0;
        this.lastPaint = null;
        this.onFrame = timestamp => this.tick(timestamp);
        this.readTheme();
        this.resize();

        root.querySelector('#sculpture-reshape').addEventListener('click', () => this.reshape());
        this.pauseButton.addEventListener('click', () => {
            this.paused = !this.paused;
            this.pauseButton.setAttribute('aria-pressed', String(this.paused));
            this.pauseLabel.dataset.i18nSource = this.paused ? 'Resume sculpture animation' : 'Pause sculpture animation';
            this.pauseLabel.textContent = this.translate(this.pauseLabel.dataset.i18nSource);
            this.syncMotion();
        });
        this.stage.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch' || this.paused || this.motion.matches) return;
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
        root.querySelector('.sculpture-controls').hidden = false;
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

    reshape() {
        // Snapshot the current interpolation so repeated clicks never jump backwards.
        this.from.set(this.vertices);
        this.form = (this.form + 1) % forms.length;
        this.morph = 0;
        this.name.dataset.i18nSource = forms[this.form];
        this.name.textContent = this.translate(forms[this.form]);
        this.root.dataset.form = String(this.form);
        this.syncMotion();
    }

    canAnimate() {
        return this.visible && !document.hidden && !this.motion.matches && !this.paused;
    }

    syncMotion() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.lastPaint = null;
        this.pauseButton.hidden = this.motion.matches;
        this.root.dataset.motion = this.motion.matches ? 'reduced' : this.paused ? 'paused' : 'idle';
        if (this.motion.matches || this.paused) {
            this.vertices.set(this.geometry[this.form]);
            this.morph = 1;
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
            this.morph = Math.min(1, this.morph + delta / 1100);
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
        for (const layer of this.order) {
            layer.depth = 0;
            for (let step = 0; step <= this.samples; step++) {
                const i = layer.band * stride + step * 3;
                const x = this.vertices[i], y = this.vertices[i + 1], z = this.vertices[i + 2];
                const rx = x * cy + z * sy;
                const rz = z * cy - x * sy;
                const ry = y * cx - rz * sx;
                const depth = y * sx + rz * cx;
                const perspective = 3.8 / (3.8 + depth);
                this.projected[i] = this.width / 2 + (rx * cz - ry * sz) * scale * perspective;
                this.projected[i + 1] = this.height / 2 + (ry * cz + rx * sz) * scale * perspective;
                this.projected[i + 2] = depth;
                layer.depth += depth / (this.samples + 1);
            }
        }
        this.order.sort((a, b) => b.depth - a.depth);
        ctx.lineJoin = 'round';
        for (const layer of this.order) {
            const start = layer.band * stride;
            const near = Math.max(.1, Math.min(1, .55 - layer.depth * .65));
            ctx.beginPath();
            for (let step = 0; step <= this.samples; step++) {
                const i = start + step * 3;
                if (step === 0) ctx.moveTo(this.projected[i], this.projected[i + 1]);
                else ctx.lineTo(this.projected[i], this.projected[i + 1]);
            }
            if (!this.compact && !this.light) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = `rgba(${this.accent}, ${near * .06})`;
                ctx.stroke();
            }
            ctx.lineWidth = .55 + near * .65;
            ctx.strokeStyle = `rgba(${layer.band % 4 === 0 ? this.highlight : this.accent}, ${.16 + near * .64})`;
            ctx.stroke();
            for (let step = (layer.band * 7 + Math.floor(this.phase * 12)) % 15; step < this.samples; step += 15) {
                const i = start + step * 3;
                const alpha = Math.max(.12, Math.min(.9, .5 - this.projected[i + 2] * .45));
                ctx.fillStyle = `rgba(${this.highlight}, ${alpha})`;
                ctx.beginPath();
                ctx.arc(this.projected[i], this.projected[i + 1], .65 + alpha * .75, 0, TAU);
                ctx.fill();
            }
        }
    }
}

export function initHeroSculpture(translate = value => value) {
    const root = document.getElementById('hero-sculpture');
    if (!root || root.classList.contains('sculpture-ready')) return;
    const canvas = root.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !window.ResizeObserver || !window.IntersectionObserver) return;
    return new LightSculpture(root, canvas, ctx, translate);
}
