/**
 * ThePrivilegedCompany Monolith Engine [Final Boss Tier]
 * Senior Engineering Standard.
 */

const routes = {
    '': {
        title: 'AI Engineering, Automation & IT Advisory',
        view: 'home.html',
        isStatic: true,
        description: 'ThePrivilegedCompany builds AI-amplified software, cloud systems, automation, technical SEO, and private IT advisory for businesses and individuals.'
    },
    'manifest': {
        title: 'Services',
        view: 'manifest.html',
        description: 'Explore ThePrivilegedCompany services for AI software, cloud architecture, automation, technical SEO, product launch, and private technical advisory.'
    },
    'who-are-we': {
        title: 'Who We Are',
        view: 'who-are-we.html',
        description: 'Meet ThePrivilegedCompany, a focused engineering firm for high-stakes software, cloud systems, technical SEO, and private digital problem solving.'
    },
    'data-engine': {
        title: 'Data & Intelligence',
        view: 'data-engine.html',
        description: 'Data systems, analytics architecture, automation, and AI-amplified intelligence for clearer technical decisions and business outcomes.'
    },
    'b2b': {
        title: 'Business Engineering',
        view: 'b2b.html',
        description: 'Enterprise engineering for scalable cloud systems, resilient web platforms, technical SEO, automation, and full-stack product delivery.'
    },
    'personal-it': {
        title: 'Private IT Advisory',
        view: 'personal-it.html',
        description: 'Private technical advisory for individuals who need clear help with apps, websites, privacy, digital systems, and difficult technology problems.'
    },
    'architecture': {
        title: 'Architecture',
        view: 'architecture.html',
        description: 'Interactive architecture planning for edge, compute, data, and security systems designed for reliable modern digital operations.'
    },
    'privacy': {
        title: 'Privacy',
        view: 'privacy.html',
        description: 'Privacy and data handling details for ThePrivilegedCompany website visitors, clients, and technical advisory relationships.'
    },
    'faq': {
        title: 'FAQ',
        view: 'faq.html',
        description: 'Answers to common questions about ThePrivilegedCompany services, engagement style, technical delivery, and advisory work.'
    }
};

const notFoundKey = '__not_found__';
const notFoundRoute = {
    title: '404',
    view: 'not-found.html',
    description: 'This page did not make it through the portal. Return to ThePrivilegedCompany home, services, or website diagnostics.'
};

const hubView = document.getElementById('hub-view');
const dynamicView = document.getElementById('dynamic-view');
const transitionMask = document.getElementById('transition-mask');
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursor-follower');
const siteOrigin = 'https://www.theprivilegedcompany.com';
const assetVersion = '20260520f';

const setMeta = (selector, attribute, value) => {
    const tag = document.head.querySelector(selector);
    if (tag) tag.setAttribute(attribute, value);
};

const updateSeo = (routeKey, route) => {
    const path = routeKey === notFoundKey ? window.location.pathname : (routeKey ? `/${routeKey}` : '/');
    const canonical = `${siteOrigin}${path}`;
    const title = `ThePrivilegedCompany | ${route.title}`;

    document.title = title;
    setMeta('meta[name="description"]', 'content', route.description);
    setMeta('meta[name="robots"]', 'content', routeKey === notFoundKey ? 'noindex, follow' : 'index, follow, max-image-preview:large');
    setMeta('link[rel="canonical"]', 'href', canonical);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', route.description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', route.description);
};

/**
 * Normalizes the path to match route keys
 */
const getRouteKey = () => {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p !== '' && p !== 'index.html');
    const lastPart = parts[parts.length - 1] || '';
    if (!lastPart) return '';
    return routes.hasOwnProperty(lastPart) ? lastPart : notFoundKey;
};

/**
 * SPA Router with Cinematic Transitions
 */
const router = async () => {
    const key = getRouteKey();
    const route = key === notFoundKey ? notFoundRoute : routes[key];
    
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
            const response = await fetch(`views/${route.view}?v=${assetVersion}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const html = await response.text();
            dynamicView.innerHTML = html;
        } catch (error) {
            console.error('Portal Error:', error);
            dynamicView.innerHTML = `<div style="padding: 10rem; text-align: center;"><h2>Connection Interrupted</h2></div>`;
        }
    }

    updateSeo(key, route);
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
 * System Health Diagnostics
 */
const initHealthCheck = () => {
    const dashboard = document.getElementById('health-dashboard');
    const toggleBtn = document.getElementById('health-header-toggle');
    const commandEl = document.getElementById('diagnostic-command');
    const outputEl = document.getElementById('diagnostic-output');
    const logEl = document.getElementById('diagnostic-log');
    const copyBtn = document.getElementById('copy-probe-script');
    const copyStatus = document.getElementById('copy-probe-status');
    const scriptTemplate = document.getElementById('probe-script-template');
    if (!dashboard || !toggleBtn || !commandEl || !outputEl || !logEl || !copyBtn || !copyStatus || !scriptTemplate) return;

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

    const targetOrigin = window.location.origin;
    const targetPath = path => new URL(path, targetOrigin).href;
    const routeEntries = Object.entries(routes).filter(([key]) => key !== '');
    const probeScript = scriptTemplate.textContent.trim();

    const formatMs = ms => `${Math.max(1, Math.round(ms))}ms`;
    const copyFromHiddenTextarea = value => {
        const fallback = document.createElement('textarea');
        fallback.value = value;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.top = '0';
        fallback.style.left = '0';
        fallback.style.width = '2rem';
        fallback.style.height = '2rem';
        fallback.style.opacity = '0';
        fallback.style.pointerEvents = 'none';
        document.body.append(fallback);
        fallback.focus({ preventScroll: true });
        fallback.select();
        fallback.setSelectionRange(0, value.length);
        const copied = document.execCommand('copy');
        fallback.remove();
        return copied;
    };

    const copyFromHiddenSelection = value => {
        const fallback = document.createElement('pre');
        fallback.textContent = value;
        fallback.setAttribute('contenteditable', 'true');
        fallback.style.position = 'fixed';
        fallback.style.top = '0';
        fallback.style.left = '0';
        fallback.style.width = '2rem';
        fallback.style.height = '2rem';
        fallback.style.opacity = '0';
        fallback.style.pointerEvents = 'none';
        fallback.style.whiteSpace = 'pre';
        document.body.append(fallback);

        const range = document.createRange();
        range.selectNodeContents(fallback);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        fallback.focus({ preventScroll: true });

        const copied = document.execCommand('copy');
        selection.removeAllRanges();
        fallback.remove();
        return copied;
    };

    const compact = (value, max = 180) => {
        const clean = String(value || '').replace(/\s+/g, ' ').trim();
        return clean.length > max ? `${clean.slice(0, max)}...` : clean;
    };

    const getHeader = (response, name, fallback = 'n/a') => response.headers.get(name) || fallback;

    const byteSize = value => {
        const bytes = Number(value) || 0;
        if (!bytes) return 'size n/a';
        if (bytes < 1024) return `${bytes}B`;
        return `${Math.round((bytes / 1024) * 10) / 10}KB`;
    };

    const hasHeader = (response, name) => Boolean(response.headers.get(name));

    const hasSqlErrorLeak = text => (
        /SQL syntax|SQLSTATE|mysql_|mysqli_|PostgreSQL|pg_query|SQLite|ORA-\d|ODBC|JDBC|PDOException|unclosed quotation|unterminated quoted|string literal/i
    ).test(text);

    const stripEmbeddedProbe = text => text.replace(
        /<script type="text\/plain" id="probe-script-template">[\s\S]*?<\/script>/i,
        ''
    );

    const request = async (path, options = {}) => {
        const started = performance.now();
        const response = await fetch(targetPath(path), {
            cache: 'no-store',
            ...options
        });
        const elapsed = performance.now() - started;
        const text = options.method === 'HEAD' ? '' : await response.text();

        return {
            elapsed,
            response,
            text
        };
    };

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

    const appendSummary = ({ label, summary }) => {
        const entry = document.createElement('div');
        entry.className = 'diagnostic-log-entry';

        const command = document.createElement('div');
        command.className = 'diagnostic-log-command';
        command.textContent = label;

        const output = document.createElement('div');
        output.className = 'diagnostic-log-output';
        output.textContent = summary;

        entry.append(command, output);
        logEl.append(entry);
    };

    const buildProbeSummary = async () => {
        try {
            const sensitivePaths = ['/.env', '/.git/config', '/wp-config.php', '/config.php', '/backup.zip', '/db.sql'];
            const [home, robots, sitemap, fragments, directRoutes, sqlSmoke, sensitiveFiles] = await Promise.all([
                request('/', { method: 'HEAD' }),
                request('/robots.txt'),
                request('/sitemap.xml'),
                Promise.all(routeEntries.map(async ([, route]) => request(`/views/${route.view}`, { method: 'HEAD' }))),
                Promise.all(routeEntries.map(async ([key]) => ({ key, result: await request(`/${key}`, { method: 'HEAD' }) }))),
                request('/?tpc_probe=%27%22%29%3B--'),
                Promise.all(sensitivePaths.map(async path => ({ path, result: await request(path, { method: 'HEAD' }) })))
            ]);

            const sitemapUrls = [...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
            const missingFragments = fragments.filter(({ response }) => !response.ok).length;
            const directRouteIssues = directRoutes.filter(({ result }) => !result.response.ok).length;
            const exposedFiles = sensitiveFiles.filter(({ result }) => result.response.status >= 200 && result.response.status < 300);
            const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
            const resources = performance.getEntriesByType('resource');
            const nav = performance.getEntriesByType('navigation')[0];
            const transferKb = Math.round((resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0) / 1024) * 10) / 10;
            const mixedContent = [...document.querySelectorAll('[src], [href]')]
                .map(el => el.getAttribute('src') || el.getAttribute('href'))
                .filter(value => value && value.startsWith('http://'));
            const hardeningHeaders = [
                ['HSTS', 'strict-transport-security'],
                ['CSP', 'content-security-policy'],
                ['Frame guard', 'x-frame-options'],
                ['No sniff', 'x-content-type-options'],
                ['Referrer policy', 'referrer-policy']
            ];
            const missingHardeningHeaders = hardeningHeaders
                .filter(([, header]) => !hasHeader(home.response, header))
                .map(([label]) => label);
            const htmlPolicies = [
                document.querySelector('meta[http-equiv="Content-Security-Policy" i]') ? 'meta CSP' : null,
                document.querySelector('meta[name="referrer" i]') ? 'meta referrer' : null
            ].filter(Boolean);
            const sqlLeak = hasSqlErrorLeak(stripEmbeddedProbe(sqlSmoke.text));

            return [
                {
                    label: 'Response',
                    summary: `${home.response.status} ${home.response.ok ? 'OK' : 'check'} - ${getHeader(home.response, 'content-type')} - ${byteSize(getHeader(home.response, 'content-length', '0'))} - ${formatMs(home.elapsed)}`,
                    updates: { http: `${home.response.status} ${home.response.ok ? 'OK' : 'CHECK'}` }
                },
                {
                    label: 'Crawl Files',
                    summary: `robots ${robots.response.status}; sitemap ${sitemap.response.status} with ${sitemapUrls.length} URL${sitemapUrls.length === 1 ? '' : 's'}.`,
                    updates: {
                        traffic: `${sitemapUrls.length} URLS`,
                        seo: robots.response.ok ? 'ROBOTS OK' : 'ROBOTS?'
                    }
                },
                {
                    label: 'Routes',
                    summary: `${routeEntries.length - missingFragments}/${routeEntries.length} view fragments reachable; ${directRouteIssues} direct route${directRouteIssues === 1 ? '' : 's'} need fallback.`,
                    updates: {
                        cache: `${routeEntries.length - missingFragments}/${routeEntries.length}`,
                        errors: directRouteIssues ? 'FALLBACK' : 'CLEAR'
                    }
                },
                {
                    label: 'Metadata',
                    summary: `Title present; description ${metaDescription ? `${metaDescription.length} chars` : 'missing'}.`,
                    updates: { seo: metaDescription ? 'META OK' : 'META?' }
                },
                {
                    label: 'Speed',
                    summary: `Load ${Math.round(nav?.duration || performance.now())}ms; ${resources.length} assets; ${transferKb}KB transferred.`,
                    updates: {
                        assets: `${resources.length} ASSETS`,
                        latency: `${Math.round((nav?.domainLookupEnd || 0) - (nav?.domainLookupStart || 0))}/${nav?.secureConnectionStart ? Math.round((nav.connectEnd || 0) - nav.secureConnectionStart) : 0}MS`
                    }
                },
                {
                    label: 'Security',
                    summary: `${window.isSecureContext ? 'Secure context' : 'Local/non-secure context'}; ${mixedContent.length} mixed-content URL${mixedContent.length === 1 ? '' : 's'}; deploy headers ${missingHardeningHeaders.length ? `${missingHardeningHeaders.length} missing` : 'present'}; HTML policies ${htmlPolicies.length ? htmlPolicies.join(', ') : 'none'}.`,
                    updates: {
                        shield: window.isSecureContext ? 'SECURE' : 'LOCAL'
                    }
                },
                {
                    label: 'Vuln Smoke',
                    summary: `SQL error leak ${sqlLeak ? 'possible' : 'clear'}; ${exposedFiles.length} exposed sensitive file${exposedFiles.length === 1 ? '' : 's'}; deploy headers ${missingHardeningHeaders.length ? `needed: ${missingHardeningHeaders.join(', ')}` : 'present'}.`,
                    updates: {
                        errors: sqlLeak || exposedFiles.length ? 'CHECK' : (directRouteIssues ? 'FALLBACK' : 'CLEAR')
                    }
                }
            ];
        } catch (error) {
            return [{
                label: 'Probe Failed',
                summary: error instanceof Error ? error.message : String(error),
                updates: { errors: 'FAILED' }
            }];
        }
    };

    const startDiagnostics = async () => {
        if (diagnosticsRunning || diagnosticsHasRun) return;

        diagnosticsRunning = true;
        logEl.replaceChildren();
        commandEl.textContent = 'copy website-probe.sh';
        outputEl.textContent = 'One portable script. Run it with: bash website-probe.sh https://example.com';

        const summaries = await buildProbeSummary();
        summaries.forEach(summary => {
            appendSummary(summary);
            Object.entries(summary.updates).forEach(([key, value]) => updateStatus(key, value));
        });

        commandEl.textContent = `example target: ${targetOrigin}`;
        outputEl.textContent = 'The script reports only status, metadata, crawl files, route health, speed, and security signals.';
        diagnosticsRunning = false;
        diagnosticsHasRun = true;
    };

    let lastCopyAttempt = 0;

    const copyProbeScript = async event => {
        event?.preventDefault();

        const now = Date.now();
        if (now - lastCopyAttempt < 350) return;
        lastCopyAttempt = now;

        let copied = false;
        if (window.isSecureContext && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(probeScript);
                copied = true;
            } catch {
                copied = false;
            }
        }

        if (!copied) {
            copied = copyFromHiddenTextarea(probeScript);
        }

        if (!copied) {
            copied = copyFromHiddenSelection(probeScript);
        }

        if (copied) {
            copyStatus.textContent = 'Copied';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyStatus.textContent = '';
                copyBtn.classList.remove('copied');
            }, 1600);
            return;
        }

        copyStatus.textContent = 'Copy blocked';
        setTimeout(() => {
            copyStatus.textContent = '';
        }, 1800);
    };

    const syncExpandedState = () => {
        const isExpanded = !dashboard.classList.contains('minimized');
        toggleBtn.setAttribute('aria-expanded', String(isExpanded));
        if (isExpanded) startDiagnostics();
    };

    syncExpandedState();

    copyBtn.addEventListener('click', copyProbeScript);
    toggleBtn.addEventListener('click', () => {
        dashboard.classList.toggle('minimized');
        syncExpandedState();
    });
};

/**
 * Custom Cursor Logic
 */
const canUseEnhancedPointer = () => (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const initCursor = () => {
    if (!cursor || !follower || !canUseEnhancedPointer()) return;

    document.body.classList.add('has-custom-cursor');

    let mouseX = 0, mouseY = 0;
    let followerX = 0, followerY = 0;
    let cursorFrame = null;

    window.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        if (!cursorFrame) {
            cursorFrame = requestAnimationFrame(() => {
                cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
                cursorFrame = null;
            });
        }
        
        const target = e.target.closest('a, button, [data-magnetic]');
        document.body.classList.toggle('cursor-hover', !!target);
    }, { passive: true });

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
        if (el.dataset.magneticBound || !canUseEnhancedPointer()) {
            if (!canUseEnhancedPointer()) el.style.transform = 'translate3d(0, 0, 0)';
            return;
        }

        el.dataset.magneticBound = 'true';
        el.addEventListener('mousemove', e => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            el.style.transform = `translate3d(${x * 0.3}px, ${y * 0.3}px, 0)`;
        }, { passive: true });
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
        this.mouse = { x: null, y: null, vx: 0, vy: 0, down: false };
        this.lastMouse = { x: 0, y: 0 };
        this.lastFrame = 0;
        this.resizeTimer = null;
        this.ripples = [];
        this.init();
        this.animate(0);
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.init(), 150);
        });
        window.addEventListener('pointermove', e => {
            this.mouse.vx = e.clientX - this.lastMouse.x;
            this.mouse.vy = e.clientY - this.lastMouse.y;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            this.lastMouse.x = e.clientX;
            this.lastMouse.y = e.clientY;
        }, { passive: true });
        window.addEventListener('pointerdown', e => {
            this.mouse.down = true;
            if (!this.isCompact && !this.isReducedMotion) {
                this.ripples.push({ x: e.clientX, y: e.clientY, radius: 0, alpha: 0.9 });
                if (this.ripples.length > 4) this.ripples.shift();
            }
        }, { passive: true });
        window.addEventListener('pointerup', () => {
            this.mouse.down = false;
        }, { passive: true });
        window.addEventListener('pointerleave', () => {
            this.mouse.x = null;
            this.mouse.y = null;
            this.mouse.down = false;
        }, { passive: true });
    }

    init() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.particles = [];
        this.isCompact = window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.frameInterval = this.isCompact ? 33 : 16;
        this.connectionDistance = this.isCompact ? 86 : 118;

        const density = this.isCompact ? 7200 : 3800;
        const maxParticles = this.isReducedMotion ? 70 : (this.isCompact ? 125 : 360);
        const count = Math.floor((this.width * this.height) / density);

        for (let i = 0; i < Math.min(count, maxParticles); i++) {
            const depth = Math.random() * 0.75 + 0.25;
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                ox: 0,
                oy: 0,
                vx: (Math.random() - 0.5) * (0.12 + depth * 0.22),
                vy: (Math.random() - 0.5) * (0.12 + depth * 0.22),
                size: Math.random() * 1.6 + 0.35,
                depth,
                heat: 0,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    animate(timestamp = 0) {
        if (!this.isReducedMotion && timestamp - this.lastFrame < this.frameInterval) {
            requestAnimationFrame(nextTimestamp => this.animate(nextTimestamp));
            return;
        }

        this.lastFrame = timestamp;
        this.ctx.fillStyle = '#030201';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.isCompact && this.mouse.x !== null) {
            const auraRadius = this.mouse.down ? 360 : 280;
            const aura = this.ctx.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, auraRadius);
            aura.addColorStop(0, this.mouse.down ? 'rgba(255, 177, 59, 0.18)' : 'rgba(255, 157, 0, 0.1)');
            aura.addColorStop(0.45, 'rgba(255, 157, 0, 0.035)');
            aura.addColorStop(1, 'rgba(255, 157, 0, 0)');
            this.ctx.fillStyle = aura;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.ripples = this.ripples
            .map(ripple => ({ ...ripple, radius: ripple.radius + 9, alpha: ripple.alpha * 0.955 }))
            .filter(ripple => ripple.alpha > 0.04 && ripple.radius < Math.max(this.width, this.height));

        this.ripples.forEach(ripple => {
            this.ctx.strokeStyle = `rgba(255, 177, 59, ${ripple.alpha * 0.22})`;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        this.particles.forEach((p, index) => {
            p.index = index;
            p.heat *= 0.88;

            if (!this.isCompact && this.mouse.x !== null) {
                const dx = p.x - this.mouse.x;
                const dy = p.y - this.mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const wakeRadius = this.mouse.down ? 275 : 220;
                if (dist < wakeRadius) {
                    const force = (wakeRadius - dist) / wakeRadius;
                    const speed = Math.min(18, Math.sqrt(this.mouse.vx * this.mouse.vx + this.mouse.vy * this.mouse.vy));
                    p.ox += (dx / dist) * force * (0.35 + speed * 0.025);
                    p.oy += (dy / dist) * force * (0.35 + speed * 0.025);
                    p.ox += this.mouse.vx * force * 0.045;
                    p.oy += this.mouse.vy * force * 0.045;
                    p.heat = Math.max(p.heat, force);
                }
            }

            this.ripples.forEach(ripple => {
                const dx = p.x - ripple.x;
                const dy = p.y - ripple.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const wave = Math.max(0, 1 - Math.abs(dist - ripple.radius) / 58) * ripple.alpha;
                if (wave > 0) {
                    p.ox += (dx / dist) * wave * 2.2;
                    p.oy += (dy / dist) * wave * 2.2;
                    p.heat = Math.max(p.heat, wave);
                }
            });

            p.ox *= 0.9;
            p.oy *= 0.9;

            p.x += p.vx + p.ox;
            p.y += p.vy + p.oy;

            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;

            const twinkle = (Math.sin(timestamp * 0.0012 + p.phase) + 1) * 0.07;
            const alpha = Math.min(0.95, 0.28 + p.depth * 0.26 + p.heat * 0.42 + twinkle);
            const size = p.size + p.heat * 1.45;
            if (p.heat > 0.15) {
                this.ctx.fillStyle = `rgba(255, 177, 59, ${p.heat * 0.16})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, size * 3.2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.fillStyle = `rgba(255, 157, 0, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.lineWidth = 0.5;
        if (!this.isReducedMotion) {
            const grid = new Map();
            const cellSize = this.connectionDistance;
            this.particles.forEach(p => {
                const cellX = Math.floor(p.x / cellSize);
                const cellY = Math.floor(p.y / cellSize);
                const key = `${cellX}:${cellY}`;
                const bucket = grid.get(key) || [];
                bucket.push(p);
                grid.set(key, bucket);
            });

            this.particles.forEach(particle => {
                const cellX = Math.floor(particle.x / cellSize);
                const cellY = Math.floor(particle.y / cellSize);
                for (let x = cellX - 1; x <= cellX + 1; x++) {
                    for (let y = cellY - 1; y <= cellY + 1; y++) {
                        const bucket = grid.get(`${x}:${y}`);
                        if (!bucket) continue;
                        bucket.forEach(neighbor => {
                            if (neighbor.index <= particle.index) return;
                            const dx = particle.x - neighbor.x;
                            const dy = particle.y - neighbor.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < this.connectionDistance) {
                                const heat = Math.max(particle.heat, neighbor.heat);
                                const alpha = (1 - dist / this.connectionDistance) * (0.1 + heat * 0.18);
                                this.ctx.strokeStyle = `rgba(255, 157, 0, ${alpha})`;
                                this.ctx.beginPath();
                                this.ctx.moveTo(particle.x, particle.y);
                                this.ctx.lineTo(neighbor.x, neighbor.y);
                                this.ctx.stroke();
                            }
                        });
                    }
                }
            });

            if (!this.isCompact && this.mouse.x !== null) {
                this.particles.forEach(p => {
                    const dx = p.x - this.mouse.x;
                    const dy = p.y - this.mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 180) {
                        const alpha = (1 - dist / 180) * (this.mouse.down ? 0.28 : 0.16);
                        this.ctx.strokeStyle = `rgba(255, 177, 59, ${alpha})`;
                        this.ctx.beginPath();
                        this.ctx.moveTo(this.mouse.x, this.mouse.y);
                        this.ctx.lineTo(p.x, p.y);
                        this.ctx.stroke();
                    }
                });
            }
        }

        if (!this.isReducedMotion) {
            requestAnimationFrame(nextTimestamp => this.animate(nextTimestamp));
        }
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
