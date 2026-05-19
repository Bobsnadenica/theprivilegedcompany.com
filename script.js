/**
 * ThePrivilegedCompany Monolith Engine [Final Boss Tier]
 * Senior Engineering Standard.
 */

const routes = {
    '': { title: 'Sovereign', view: 'home.html', isStatic: true },
    'manifest': { title: 'Manifest', view: 'manifest.html' },
    'who-are-we': { title: 'Pedigree', view: 'who-are-we.html' },
    'data-engine': { title: 'Intelligence', view: 'data-engine.html' },
    'b2b': { title: 'Architecture', view: 'b2b.html' },
    'personal-it': { title: 'Private', view: 'personal-it.html' },
    'privacy': { title: 'Protocol', view: 'privacy.html' },
    'faq': { title: 'Knowledge', view: 'faq.html' }
};

const hubView = document.getElementById('hub-view');
const dynamicView = document.getElementById('dynamic-view');
const transitionMask = document.getElementById('transition-mask');
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursor-follower');

/**
 * Normalizes the path to match route keys
 */
const getRouteKey = () => {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p !== '' && p !== 'index.html');
    const lastPart = parts[parts.length - 1] || '';
    return routes.hasOwnProperty(lastPart) ? lastPart : '';
};

/**
 * SPA Router with Cinematic Transitions
 */
const router = async () => {
    const key = getRouteKey();
    const route = routes[key];
    
    // Start Transition Mask
    transitionMask.classList.add('is-active');
    await new Promise(r => setTimeout(r, 800));

    // Update active state in nav
    document.querySelectorAll('#main-nav a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if ((key === '' && (href === './' || href === 'index.html')) || (key !== '' && href.includes(key))) {
            link.classList.add('active');
        }
    });

    if (key === '') {
        dynamicView.style.display = 'none';
        hubView.style.display = 'block';
    } else {
        hubView.style.display = 'none';
        dynamicView.style.display = 'block';
        
        try {
            const response = await fetch(`views/${route.view}`);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const html = await response.text();
            dynamicView.innerHTML = html;
        } catch (error) {
            console.error('Portal Error:', error);
            dynamicView.innerHTML = `<div style="padding: 10rem; text-align: center;"><h2>Connection Interrupted</h2></div>`;
        }
    }

    document.title = `ThePrivilegedCompany | ${route.title}`;
    window.scrollTo(0, 0);

    // End Transition Mask
    transitionMask.classList.remove('is-active');
    document.body.classList.remove('is-loading');
    
    // Re-init view specific logic
    initMagnetic();
    new ScrambleText('[data-scramble]');
    initArchitectureCanvas();
    initTabs();
};

/**
 * Tab Switching Logic
 */
const initTabs = () => {
    const triggers = document.querySelectorAll('.tab-trigger');
    const contents = document.querySelectorAll('.tab-content');
    if (!triggers.length) return;

    triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const tab = trigger.dataset.tab;
            triggers.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.style.display = 'none');

            trigger.classList.add('active');
            const target = document.getElementById(`tab-${tab}`);
            if (target) target.style.display = 'block';
        });
    });
};

/**
 * Architecture Canvas V2 Interactivity
 */
const initArchitectureCanvas = () => {
    const layers = document.querySelectorAll('.canvas-layer');
    const details = document.getElementById('layer-details-v2');
    if (!layers.length || !details) return;

    const data = {
        edge: { title: 'Edge Protocol', body: 'Global ingress management. We utilize terraformed CloudFront and WAF configurations to neutralize threats at the perimeter while delivering sub-50ms latency globally.' },
        compute: { title: 'Compute Engine', body: 'Elastic workload orchestration. Our Kubernetes and Serverless clusters are engineered for zero-touch scaling, automatically adjusting to massive traffic spikes.' },
        data: { title: 'Data Sovereign', body: 'Distributed data integrity. We architect RDBMS and NoSQL systems that utilize multi-region replication and automated failover for zero-loss operations.' },
        security: { title: 'Zero Trust', body: 'Complete environment hardening. We implement granular IAM, rotatable secret management, and end-to-end encryption for both data-at-rest and data-in-transit.' }
    };

    layers.forEach(layer => {
        layer.addEventListener('click', () => {
            const key = layer.dataset.layer;
            const info = data[key];
            details.innerHTML = `
                <div class="details-content">
                    <h2 style="font-family: var(--f-display); font-size: 3rem; margin-bottom: 2rem; color: var(--c-accent);">${info.title}</h2>
                    <p style="font-size: 1.2rem; color: var(--c-fg); line-height: 1.4;">${info.body}</p>
                </div>
            `;
        });
    });
};

/**
 * Scramble Text Engine
 */
class ScrambleText {
    constructor(selector) {
        this.elements = document.querySelectorAll(selector);
        this.chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        this.init();
    }

    init() {
        this.elements.forEach(el => {
            if (el.dataset.scrambled) return;
            el.dataset.scrambled = "true";
            const originalText = el.textContent;
            el.addEventListener('mouseenter', () => this.scramble(el, originalText));
        });
    }

    scramble(el, original) {
        if (el.scrambling) return;
        el.scrambling = true;

        let iteration = 0;
        const interval = setInterval(() => {
            el.textContent = original.split('').map((char, index) => {
                if (/\s/.test(char)) return char;
                if (index < iteration) return original[index];
                return this.chars[Math.floor(Math.random() * this.chars.length)];
            }).join('');

            if (iteration >= original.length) {
                clearInterval(interval);
                el.textContent = original;
                el.scrambling = false;
            }
            iteration += 1 / 2;
        }, 30);
    }
}

/**
 * System Health Simulation
 */
const initHealthCheck = () => {
    const dashboard = document.getElementById('health-dashboard');
    const toggleBtn = document.getElementById('health-header-toggle');
    const commandEl = document.getElementById('diagnostic-command');
    const outputEl = document.getElementById('diagnostic-output');
    const logEl = document.getElementById('diagnostic-log');
    if (!dashboard || !toggleBtn || !commandEl || !outputEl || !logEl) return;

    const statusMap = {
        http: 'status-http',
        traffic: 'status-traffic',
        seo: 'status-seo',
        shield: 'status-shield',
        assets: 'status-assets',
        latency: 'status-latency',
        cache: 'status-cache',
        errors: 'status-errors'
    };

    const targetHost = 'theprivilegedcompany.com';
    const targetUrl = `https://${targetHost}`;
    const getPageSnapshot = () => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        return {
            assets: resources.length,
            links: document.querySelectorAll('a[href]').length,
            loadMs: Math.round(navigation?.duration || performance.now()),
            title: document.title
        };
    };

    const checks = [
        () => {
            return {
                command: `curl -I ${targetUrl}/`,
                output: 'reveals: status, redirects, CDN/cache, HSTS, CSP, content-type',
                updates: { http: 'HEADERS', shield: 'POLICY' }
            };
        },
        () => {
            return {
                command: `dig +short A ${targetHost} && dig +short NS ${targetHost}`,
                output: 'reveals: DNS records, host routing, nameservers, CDN edge clues',
                updates: { latency: 'DNS', errors: 'SURFACE' }
            };
        },
        () => {
            return {
                command: `echo | openssl s_client -connect ${targetHost}:443 -servername ${targetHost}`,
                output: 'reveals: certificate chain, expiry window, TLS version, ALPN',
                updates: { latency: 'TLS', shield: 'CERT' }
            };
        },
        () => {
            return {
                command: `curl -s ${targetUrl}/robots.txt && curl -s ${targetUrl}/sitemap.xml`,
                output: 'reveals: crawl rules, public routes, sitemap coverage, indexing hints',
                updates: { seo: 'CRAWL', cache: 'ROUTES' }
            };
        },
        () => {
            return {
                command: `npx lighthouse ${targetUrl} --view`,
                output: 'reveals: Core Web Vitals, accessibility, SEO, best-practice gaps',
                updates: { assets: 'CWV', seo: 'AUDIT' }
            };
        },
        () => {
            return {
                command: `curl -sL ${targetUrl}/ | pup 'title,meta[name=description],a attr{href}'`,
                output: 'reveals: page title, meta description, links, content structure',
                updates: { cache: 'CONTENT', seo: 'META' }
            };
        },
        () => {
            return {
                command: `nmap -Pn -sV ${targetHost}`,
                output: 'reveals: exposed ports, service versions, unexpected public surface',
                updates: { errors: 'PORTS', shield: 'SCAN' }
            };
        },
        () => {
            return {
                command: `curl -s 'https://crt.sh/?q=${targetHost}&output=json'`,
                output: 'reveals: certificate-transparency subdomains and shadow assets',
                updates: { errors: 'SUBDOMAINS', shield: 'CT LOGS' }
            };
        },
        () => {
            return {
                command: 'goaccess access.log --log-format=COMBINED',
                output: 'requires owned logs; reveals real visits, referrers, bots, 404s, top pages',
                updates: { traffic: 'OWN LOGS', errors: '4XX/5XX' }
            };
        },
        () => {
            const snapshot = getPageSnapshot();
            return {
                command: 'browser performance + DOM snapshot',
                output: `current render: ${snapshot.assets} assets, ${snapshot.links} links, ${snapshot.loadMs}ms load, title="${snapshot.title}"`,
                updates: { assets: `${snapshot.assets} ASSETS`, cache: `${snapshot.links} LINKS` }
            };
        }
    ];

    let checkIndex = 0;
    let diagnosticsTimer;
    let diagnosticsRunning = false;
    let diagnosticsHasRun = false;

    const updateStatus = (key, value) => {
        const target = document.getElementById(statusMap[key]);
        if (!target) return;

        const dot = document.createElement('span');
        dot.className = 'status-dot pulse';
        target.replaceChildren(dot, document.createTextNode(` ${value}`));

        setTimeout(() => {
            dot.classList.remove('pulse');
        }, 900);
    };

    const appendLog = (result) => {
        const entry = document.createElement('div');
        entry.className = 'diagnostic-log-entry';

        const command = document.createElement('div');
        command.className = 'diagnostic-log-command';
        command.textContent = `$ ${result.command}`;

        const output = document.createElement('div');
        output.className = 'diagnostic-log-output';
        output.textContent = result.output;

        entry.append(command, output);
        logEl.append(entry);
        logEl.scrollTop = logEl.scrollHeight;
    };

    const runDiagnostic = () => {
        const result = checks[checkIndex % checks.length]();
        checkIndex += 1;

        commandEl.textContent = result.command;
        outputEl.textContent = result.output;
        Object.entries(result.updates).forEach(([key, value]) => updateStatus(key, value));
        appendLog(result);
    };

    const startDiagnostics = () => {
        if (diagnosticsRunning || diagnosticsHasRun) return;

        diagnosticsRunning = true;
        checkIndex = 0;
        logEl.replaceChildren();
        commandEl.textContent = 'run website-probe-checklist';
        outputEl.textContent = 'Running each probe example once...';

        const runNext = () => {
            if (checkIndex >= checks.length) {
                commandEl.textContent = 'diagnostics complete';
                outputEl.textContent = 'Probe examples logged below. Run them from a terminal against sites you own or are allowed to test.';
                diagnosticsRunning = false;
                diagnosticsHasRun = true;
                diagnosticsTimer = null;
                return;
            }

            runDiagnostic();
            diagnosticsTimer = setTimeout(runNext, 700);
        };

        runNext();
    };

    const syncExpandedState = () => {
        const isExpanded = !dashboard.classList.contains('minimized');
        toggleBtn.setAttribute('aria-expanded', String(isExpanded));
        if (isExpanded) startDiagnostics();
    };

    syncExpandedState();

    toggleBtn.addEventListener('click', () => {
        dashboard.classList.toggle('minimized');
        syncExpandedState();
    });
};

/**
 * Custom Cursor Logic
 */
const initCursor = () => {
    let mouseX = 0, mouseY = 0;
    let followerX = 0, followerY = 0;

    window.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
        
        const target = e.target.closest('a, button, [data-magnetic]');
        document.body.classList.toggle('cursor-hover', !!target);
    });

    const loop = () => {
        followerX += (mouseX - followerX - 20) * 0.22;
        followerY += (mouseY - followerY - 20) * 0.22;
        follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0)`;
        requestAnimationFrame(loop);
    };
    loop();
};

/**
 * Magnetic Elements
 */
const initMagnetic = () => {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
        el.addEventListener('mousemove', e => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            el.style.transform = `translate3d(${x * 0.3}px, ${y * 0.3}px, 0)`;
        });
        el.addEventListener('mouseleave', () => {
            el.style.transform = `translate3d(0, 0, 0)`;
        });
    });
};

/**
 * Quantum Web Canvas
 */
class QuantumWeb {
    constructor(id) {
        this.canvas = document.getElementById(id);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null, vx: 0, vy: 0 };
        this.lastMouse = { x: 0, y: 0 };
        this.init();
        this.animate();
        window.addEventListener('resize', () => this.init());
        window.addEventListener('mousemove', e => {
            this.mouse.vx = e.clientX - this.lastMouse.x;
            this.mouse.vy = e.clientY - this.lastMouse.y;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
        });
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.particles = [];
        const count = Math.floor((this.canvas.width * this.canvas.height) / 4000);
        for (let i = 0; i < Math.min(count, 500); i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                ox: 0, oy: 0, // Offset for mouse wake
                vx: (Math.random() - 0.5) * 0.2,
                vy: (Math.random() - 0.5) * 0.2,
                size: Math.random() * 2 + 0.5
            });
        }
    }

    animate() {
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach(p => {
            // Apply mouse wake
            const dx = p.x - this.mouse.x;
            const dy = p.y - this.mouse.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 200) {
                const force = (200 - dist) / 200;
                p.ox += this.mouse.vx * force * 0.18;
                p.oy += this.mouse.vy * force * 0.18;
            }

            // Dampen offset
            p.ox *= 0.9;
            p.oy *= 0.9;

            p.x += p.vx + p.ox;
            p.y += p.vy + p.oy;

            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            this.ctx.fillStyle = 'rgba(255, 157, 0, 0.6)'; // Increased dot intensity
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Web connections
        this.ctx.lineWidth = 0.5;
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    const alpha = (1 - dist / 150) * 0.2; // Stronger connections
                    this.ctx.strokeStyle = `rgba(255, 157, 0, ${alpha})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
        requestAnimationFrame(() => this.animate());
    }
}

/**
 * Telemetry Log Engine
 */
const initTelemetry = () => {
    const log = document.getElementById('telemetry-log');
    if (!log) return;
    const actions = ['FETCH', 'PUSH', 'SCRAMBLE', 'REVEAL', 'SYNC', 'HARDEN', 'INIT', 'HARVEST', 'SCALE'];
    const addEntry = () => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const hex = Math.random().toString(16).substring(2, 10).toUpperCase();
        const action = actions[Math.floor(Math.random() * actions.length)];
        entry.innerHTML = `<span class="log-hex">[${hex}]</span> ${action} protocol active...`;
        log.prepend(entry);
        while (log.childNodes.length > 6) log.lastChild.remove();
    };
    setInterval(addEntry, 2500);
};

/**
 * Event Interceptor
 */
document.addEventListener('click', e => {
    const link = e.target.closest('[data-link]');
    if (link) {
        const url = new URL(link.href);
        if (url.origin === window.location.origin) {
            e.preventDefault();
            history.pushState(null, null, link.href);
            router();
        }
    }
});

window.addEventListener('popstate', router);

document.addEventListener('DOMContentLoaded', () => {
    new QuantumWeb('bg-canvas');
    initCursor();
    initMagnetic();
    initHealthCheck();
    new ScrambleText('[data-scramble]');
    router();
});
