/**
 * ThePrivilegedCompany Monolith Engine [Final Boss Tier]
 * Senior Engineering Standard.
 */
import { languageMeta, translations } from './translations.js?v=20260702c';

const routes = {
    '': {
        title: 'IT Solutions, App & Website Development',
        // Root renders the hub view baked into index.html; no fragment is fetched.
        isStatic: true,
        description: 'IT solutions for businesses and individuals: app development, website building, technical SEO, automation, AI tools, cloud audits, and tech training.'
    },
    'manifest': {
        title: 'Services',
        view: 'manifest.html',
        description: 'Explore IT solutions from ThePrivilegedCompany: app development, website building, technical SEO, audits, automation, consulting, tech training, and custom tools.'
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
    'terms': {
        title: 'Terms',
        view: 'terms.html',
        description: 'Plain-language terms of engagement for working with ThePrivilegedCompany on IT and engineering projects.'
    },
    'faq': {
        title: 'FAQ',
        view: 'faq.html',
        description: 'Answers to common questions about ThePrivilegedCompany services, engagement style, technical delivery, and advisory work.'
    },
    'contact': {
        title: 'Contact',
        view: 'contact.html',
        description: 'Contact ThePrivilegedCompany with your project details, contact information, timeline, and the outcome you want to build.'
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
const assetVersion = '20260613d';
const serviceRequestTypes = {
    'Licensed Market Intelligence': 'Company data or market intelligence',
    'Technical Audits': 'Systems / process audit',
    'Team & Process Audits': 'Systems / process audit',
    'Consulting & Embedded Expertise': 'Consulting or advisory',
    'Everyday Tooling': 'Business automation or custom tools',
    'SEO Optimization': 'SEO and performance',
    'Website Building & Management': 'Website or app build',
    'Mobile & Web Applications': 'Website or app build',
    'Marketing Support': 'Marketing or social media',
    'Staff Enablement': 'Training / academy',
    'Custom Daily Tools': 'Business automation or custom tools',
    'Website Building': 'Website or app build',
    'App Building': 'Website or app build',
    'Career Consulting': 'Career consulting',
    'Tech Training': 'Training / academy',
    'Learn Any Tech Topic': 'Training / academy',
    'Social Media Management': 'Marketing or social media',
    'Advertisement Support': 'Marketing or social media',
    'Adult entertainment': 'Marketing or social media',
    'Scam & Funnel Awareness': 'Scam or fraud awareness'
};
const toolSuiteServiceName = 'Learn Any Tech Topic';
const toolSuitePath = 'dev/Tech%20Tools/index.html';
const serviceDestinations = {
    [toolSuiteServiceName]: {
        type: 'internal',
        href: toolSuitePath,
        label: 'Open Tool Suite'
    }
};
const knownServiceNames = Object.keys(serviceRequestTypes);
const supportedLanguages = Object.keys(languageMeta);
let currentLanguage = (() => {
    try {
        const stored = localStorage.getItem('tpc-language');
        return supportedLanguages.includes(stored) ? stored : 'en';
    } catch {
        return 'en';
    }
})();

const normalizeI18nKey = value => String(value || '').replace(/\s+/g, ' ').trim();

// Reverse map: any translated value -> its English source. Lets us recover the
// original key even when a node's text was already translated the first time we
// see it (e.g. after the scramble effect replaces the hero text node), so
// language switching round-trips correctly without a page reload.
const reverseI18n = new Map();
Object.values(translations).forEach(pack => {
    Object.entries(pack?.text || {}).forEach(([english, translated]) => {
        reverseI18n.set(normalizeI18nKey(translated), english);
    });
});

const t = value => {
    const key = normalizeI18nKey(value);
    if (!key || currentLanguage === 'en') return value;
    return translations[currentLanguage]?.text?.[key] || value;
};

const translateAttribute = value => {
    const key = normalizeI18nKey(value);
    if (!key || currentLanguage === 'en') return value;
    return translations[currentLanguage]?.attrs?.[key] || translations[currentLanguage]?.text?.[key] || value;
};

const getSourceText = element => {
    if (!element) return '';
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return normalizeI18nKey(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode.__i18nSource || walker.currentNode.nodeValue);
    return normalizeI18nKey(nodes.join(' '));
};

const getSelectedServiceName = () => {
    const params = new URLSearchParams(window.location.search);
    const service = normalizeI18nKey(params.get('service'));
    return knownServiceNames.includes(service) ? service : '';
};

const getCurrentRoute = () => {
    const key = getRouteKey();
    return {
        key,
        route: key === notFoundKey ? notFoundRoute : routes[key]
    };
};

const setMeta = (selector, attribute, value) => {
    const tag = document.head.querySelector(selector);
    if (tag) tag.setAttribute(attribute, value);
};

const updateSeo = (routeKey, route) => {
    const path = routeKey === notFoundKey ? window.location.pathname : (routeKey ? `/${routeKey}` : '/');
    const canonical = `${siteOrigin}${path}`;
    const title = `ThePrivilegedCompany | ${t(route.title)}`;
    const description = t(route.description);

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', routeKey === notFoundKey ? 'noindex, follow' : 'index, follow, max-image-preview:large');
    setMeta('link[rel="canonical"]', 'href', canonical);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
};

const applyTranslations = (root = document) => {
    document.documentElement.lang = currentLanguage;

    const select = document.getElementById('language-select');
    const flag = document.getElementById('language-current-flag');
    if (select) {
        select.value = currentLanguage;
        select.setAttribute('aria-label', translateAttribute('Language'));
    }
    if (flag) flag.textContent = languageMeta[currentLanguage]?.flag || languageMeta.en.flag;

    const sourceElements = [
        ...(root.nodeType === Node.ELEMENT_NODE && root.matches?.('[data-i18n-source]') ? [root] : []),
        ...(root.querySelectorAll?.('[data-i18n-source]') || [])
    ];

    sourceElements.forEach(element => {
        const source = element.dataset.i18nSource;
        if (source) element.textContent = t(source);
    });

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (!parent || !normalizeI18nKey(node.nodeValue)) return NodeFilter.FILTER_REJECT;
            if (parent.closest('script, style, svg, canvas, [data-i18n-ignore], [data-i18n-source]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
        if (!node.__i18nSource) {
            const raw = node.nodeValue;
            const english = reverseI18n.get(normalizeI18nKey(raw));
            if (english) {
                const lead = raw.match(/^\s*/)?.[0] || '';
                const trail = raw.match(/\s*$/)?.[0] || '';
                node.__i18nSource = `${lead}${english}${trail}`;
            } else {
                node.__i18nSource = raw;
            }
        }
        const source = node.__i18nSource;
        const key = normalizeI18nKey(source);
        const translated = currentLanguage === 'en' ? key : t(key);
        if (translated === key && currentLanguage !== 'en') return;

        const leading = source.match(/^\s*/)?.[0] || '';
        const trailing = source.match(/\s*$/)?.[0] || '';
        node.nodeValue = `${leading}${translated}${trailing}`;
    });

    root.querySelectorAll?.('[placeholder], [aria-label], [title]').forEach(element => {
        ['placeholder', 'aria-label', 'title'].forEach(attr => {
            if (!element.hasAttribute(attr)) return;
            const dataKey = `i18n${attr.replace(/-([a-z])/g, (_, char) => char.toUpperCase())}`;
            if (!element.dataset[dataKey]) element.dataset[dataKey] = element.getAttribute(attr);
            element.setAttribute(attr, translateAttribute(element.dataset[dataKey]));
        });
    });
};

const setLanguage = lang => {
    if (!supportedLanguages.includes(lang)) return;
    currentLanguage = lang;
    try {
        localStorage.setItem('tpc-language', lang);
    } catch {
        // Storage can be blocked; the page still switches for the current session.
    }
    applyTranslations();
    const { key, route } = getCurrentRoute();
    updateSeo(key, route);
    initServiceCards();
};

const initLanguageSwitcher = () => {
    const select = document.getElementById('language-select');
    if (!select || select.dataset.bound) return;
    select.dataset.bound = 'true';
    select.addEventListener('change', event => setLanguage(event.target.value));
    applyTranslations();
};

const getTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

const applyTheme = (theme, persist) => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f8fc' : '#030201');
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', theme === 'light' ? 'light' : 'dark');
    if (persist) {
        try {
            localStorage.setItem('tpc-theme', theme);
        } catch {
            // storage blocked; theme still applies for the session
        }
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
};

const initThemeSwitcher = () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    applyTheme(getTheme(), false);
    btn.addEventListener('click', () => applyTheme(getTheme() === 'light' ? 'dark' : 'light', true));
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
    const { key, route } = getCurrentRoute();
    
    // Start Transition Mask. Skip the wait entirely for reduced-motion users, and
    // otherwise wait only long enough for the mask to cover (CSS clip-path is 0.45s).
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    transitionMask.classList.add('is-active');
    await new Promise(r => setTimeout(r, prefersReducedMotion ? 0 : 460));

    // Update active state in nav
    document.querySelectorAll('#main-nav a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if ((key === '' && (href === './' || href === '/' || href === 'index.html')) || (key !== '' && href.includes(key))) {
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
    applyTranslations();

    // End Transition Mask
    transitionMask.classList.remove('is-active');
    document.body.classList.remove('is-loading');
    
    // Re-init view specific logic
    initMagnetic();
    new ScrambleText('[data-scramble]');
    new AnagramText('[data-anagram]');
    initArchitectureCanvas();
    initTabs();
    initServiceCards();
    initContactForm();
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

const initServiceCards = () => {
    document.querySelectorAll('.service-card').forEach(card => {
        const heading = card.querySelector('h3');
        const serviceName = getSourceText(heading);
        if (!serviceRequestTypes[serviceName]) return;

        const destination = serviceDestinations[serviceName];
        card.dataset.serviceName = serviceName;
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        if (destination) card.dataset.i18nAriaLabel = destination.label;
        card.setAttribute('aria-label', destination
            ? t(destination.label)
            : (currentLanguage === 'bg'
                ? `Започнете бриф за ${t(serviceName)}`
                : `Start a brief for ${serviceName}`)
        );

        let cta = card.querySelector('.service-card-cta');
        if (!cta) {
            cta = document.createElement('small');
            cta.className = 'service-card-cta';
            card.append(cta);
        }
        cta.dataset.i18nSource = destination ? destination.label : 'Start a brief';
        cta.textContent = t(cta.dataset.i18nSource);

        if (card.dataset.serviceBound) return;
        card.dataset.serviceBound = 'true';

        const openDestination = () => {
            if (destination?.type === 'internal') {
                window.location.href = new URL(destination.href, window.location.origin).href;
                return;
            }

            if (destination?.type === 'external') {
                window.location.href = destination.href;
                return;
            }

            const target = new URL('contact', window.location.origin);
            target.searchParams.set('service', serviceName);
            history.pushState(null, null, `${target.pathname}${target.search}`);
            router();
        };

        card.addEventListener('click', event => {
            if (event.target.closest('a, button, input, select, textarea')) return;
            openDestination();
        });
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openDestination();
        });
    });
};

const initContactForm = () => {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-form-status');
    const serviceContext = document.getElementById('contact-service-context');
    const serviceValue = document.getElementById('contact-service-value');
    const serviceInput = document.getElementById('contact-service-name');
    const subjectInput = document.getElementById('contact-email-subject');
    if (!form || !status) return;

    const selectedService = getSelectedServiceName();
    if (selectedService && serviceContext && serviceValue && serviceInput) {
        serviceContext.hidden = false;
        serviceInput.value = selectedService;
        serviceValue.dataset.i18nSource = selectedService;
        serviceValue.textContent = t(selectedService);

        const requestType = serviceRequestTypes[selectedService];
        if (requestType && form.elements.requestType) form.elements.requestType.value = requestType;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const data = new FormData(form);
        const name = String(data.get('name') || '').trim();
        const email = String(data.get('email') || '').trim();
        const phone = String(data.get('phone') || '').trim();
        const requestType = String(data.get('requestType') || '').trim();
        const serviceName = String(data.get('serviceName') || '').trim();
        const timeline = String(data.get('timeline') || '').trim();
        const budget = String(data.get('budget') || '').trim();
        const details = String(data.get('details') || '').trim();

        const subjectText = serviceName
            ? `Inquiry about: ${serviceName} - ${name}`
            : `Website inquiry from ${name}`;
        const bodyText = [
            `Name: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `Service: ${serviceName || 'Not specified'}`,
            `Looking for: ${requestType || 'Not specified'}`,
            `Timeline: ${timeline || 'Not specified'}`,
            `Budget: ${budget || 'Not specified'}`,
            '',
            'Details:',
            details
        ].join('\n');
        const subject = encodeURIComponent(subjectText);
        const body = encodeURIComponent(bodyText);
        const submitButton = form.querySelector('button[type="submit"]');

        if (data.get('_honey')) {
            status.textContent = t('Brief received. We will get back to you soon.');
            status.classList.add('is-visible');
            return;
        }

        if (subjectInput) subjectInput.value = subjectText;

        const payload = new FormData(form);
        payload.set('_subject', subjectText);
        payload.set('message', bodyText);

        status.textContent = t('Sending your brief securely...');
        status.classList.add('is-visible');
        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body: payload
            });

            if (!response.ok) throw new Error(`Contact endpoint returned ${response.status}`);

            status.textContent = t('Brief sent. We will get back to you soon.');
            form.reset();

            if (selectedService && serviceInput) {
                serviceInput.value = selectedService;
                const requestTypeForService = serviceRequestTypes[selectedService];
                if (requestTypeForService && form.elements.requestType) form.elements.requestType.value = requestTypeForService;
            }
        } catch (error) {
            console.warn('Contact endpoint unavailable; falling back to email client.', error);
            status.textContent = t('Automatic send was blocked. Opening your email client as a fallback.');
            window.location.href = `mailto:contactus@theprivilegedcompany.com?subject=${subject}&body=${body}`;
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
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
            applyTranslations(details);
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
            el.addEventListener('mouseenter', () => this.scramble(el, el.textContent));
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
 * Anagram Pulse Engine
 */
class AnagramText {
    constructor(selector) {
        this.elements = document.querySelectorAll(selector);
        this.chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.pairs = [
            ['TRACE', 'REACT'],
            ['ALERT', 'ALTER'],
            ['ROUTE', 'OUTER'],
            ['RAM', 'ARM'],
            ['ROM', 'ORM'],
            ['TLS', 'STL'],
            ['RAID', 'ARIA'],
            ['SSO', 'OSS'],
            ['OCR', 'ROC']
        ].map(([primary, alternate]) => ({ primary, alternate }));
        this.nextPairIndex = this.elements.length;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.init();
    }

    init() {
        this.elements.forEach((el, index) => {
            if (el.dataset.anagramBound) return;

            const initialPrimary = normalizeI18nKey(el.textContent).toUpperCase();
            const initialAlternate = normalizeI18nKey(el.dataset.anagram).toUpperCase();
            const initialPair = this.pairs.find(pair => pair.primary === initialPrimary && pair.alternate === initialAlternate)
                || this.pairs[index % this.pairs.length];

            el.dataset.anagramBound = 'true';
            el.dataset.anagramPhase = 'primary';
            this.applyPair(el, initialPair);
            el.textContent = initialPair.primary;

            if (this.reducedMotion) return;

            const run = () => {
                if (!el.isConnected) {
                    clearTimeout(el.anagramTimer);
                    return;
                }

                if (el.dataset.anagramPhase === 'primary') {
                    this.scramble(el, el.dataset.anagramAlternate, 'alternate');
                    return;
                }

                const nextPair = this.getNextPair(el);
                this.applyPair(el, nextPair);
                this.scramble(el, nextPair.primary, 'primary');
            };

            const delay = 1800 + index * 420;
            el.anagramTimer = setTimeout(() => {
                run();
                el.anagramTimer = setInterval(run, 4800 + index * 340);
            }, delay);

            el.addEventListener('mouseenter', run);
        });
    }

    applyPair(el, pair) {
        el.dataset.anagramPrimary = pair.primary;
        el.dataset.anagramAlternate = pair.alternate;
        el.dataset.anagram = pair.alternate;
        el.style.setProperty('--anagram-width', `${Math.max(pair.primary.length, pair.alternate.length)}ch`);
        el.setAttribute('aria-label', `${pair.primary} / ${pair.alternate}`);
    }

    getNextPair(el) {
        const activePrimaries = new Set([...this.elements]
            .filter(other => other !== el)
            .map(other => other.dataset.anagramPrimary)
            .filter(Boolean)
        );

        for (let i = 0; i < this.pairs.length; i += 1) {
            const pair = this.pairs[this.nextPairIndex % this.pairs.length];
            this.nextPairIndex += 1;
            if (!activePrimaries.has(pair.primary)) return pair;
        }

        return this.pairs[this.nextPairIndex++ % this.pairs.length];
    }

    scramble(el, target, phase) {
        if (el.anagramAnimating) return;
        el.anagramAnimating = true;
        el.classList.add('is-twitching');

        const source = normalizeI18nKey(el.textContent).toUpperCase();
        const maxLength = Math.max(source.length, target.length);
        let iteration = 0;

        const interval = setInterval(() => {
            el.textContent = Array.from({ length: maxLength }, (_, index) => {
                if (index < iteration && target[index]) return target[index];
                if (!target[index]) return '';
                return this.chars[Math.floor(Math.random() * this.chars.length)];
            }).join('');

            if (iteration >= maxLength) {
                clearInterval(interval);
                el.textContent = target;
                el.dataset.anagramCurrent = target;
                el.dataset.anagramPhase = phase;
                el.anagramAnimating = false;
                el.classList.remove('is-twitching');
            }

            iteration += 1;
        }, 34);
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

    const collectBrowserSmokeSignals = () => {
        const forms = [...document.forms];
        const postForms = forms.filter(form => (form.getAttribute('method') || 'get').toLowerCase() === 'post');
        const passwordForms = forms.filter(form => [...form.elements].some(element => element.type === 'password'));
        const fileInputs = [...document.querySelectorAll('input[type="file" i]')];
        const postMissingCsrf = postForms.filter(form => ![...form.elements].some(element =>
            /csrf|xsrf|authenticity|nonce|token/i.test(`${element.name || ''} ${element.id || ''} ${element.className || ''}`)
        ));
        const crossOriginForms = forms.filter(form => {
            try {
                const action = new URL(form.getAttribute('action') || window.location.href, window.location.href);
                return action.origin !== window.location.origin;
            } catch {
                return false;
            }
        });
        const riskyBlankLinks = [...document.querySelectorAll('a[target="_blank"]')].filter(link => {
            const rel = (link.getAttribute('rel') || '').toLowerCase();
            return !rel.includes('noopener') && !rel.includes('noreferrer');
        });
        const javascriptUrls = [...document.querySelectorAll('a[href], form[action]')].filter(node => {
            const attr = node.tagName.toLowerCase() === 'form' ? 'action' : 'href';
            return /^javascript:/i.test(node.getAttribute(attr) || '');
        });
        const inlineHandlers = [...document.querySelectorAll('*')].reduce((count, node) => (
            count + [...node.attributes || []].filter(attr => /^on/i.test(attr.name)).length
        ), 0);
        const inlineScriptText = [...document.scripts]
            .filter(script => !script.src && script.type !== 'text/plain')
            .map(script => script.textContent || '')
            .join('\n');
        const sinkHits = [
            /\beval\s*\(/gi,
            /\bdocument\.write\s*\(/gi,
            /\.innerHTML\s*=/gi,
            /insertAdjacentHTML\s*\(/gi
        ].reduce((count, pattern) => count + (inlineScriptText.match(pattern) || []).length, 0);
        const thirdPartyScripts = [...document.scripts].filter(script => {
            if (!script.src) return false;
            try {
                return new URL(script.src, window.location.href).origin !== window.location.origin;
            } catch {
                return false;
            }
        });
        const scriptsWithoutIntegrity = thirdPartyScripts.filter(script => !script.integrity);
        const sensitiveLinks = [...document.querySelectorAll('a[href]')].filter(link =>
            /(?:\/admin\b|\/administrator\b|\/swagger\b|\/openapi\b|\/api\/docs\b|\/actuator\b|\/debug\b|\/phpinfo\.php\b)/i.test(link.getAttribute('href') || '')
        );
        const pageHtml = stripEmbeddedProbe(document.documentElement.outerHTML || '');
        const clientSecretHits = [
            /AIza[0-9A-Za-z-_]{35}/g,
            /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
            /AKIA[0-9A-Z]{16}/g,
            /-----BEGIN [A-Z ]*PRIVATE KEY-----/g
        ].reduce((count, pattern) => count + (pageHtml.match(pattern) || []).length, 0);
        const debugHits = [
            /SQL syntax.*MySQL/i,
            /ORA-\d{4,5}/i,
            /Traceback \(most recent call last\)/i,
            /Unhandled(?:\s+\w+)?Exception/i,
            /Stack trace/i,
            /Exception in thread/i,
            /\bTypeError:\b/i,
            /\bReferenceError:\b/i
        ].filter(pattern => pattern.test(pageHtml)).length;
        const clientIssues = riskyBlankLinks.length + javascriptUrls.length + inlineHandlers + sinkHits + scriptsWithoutIntegrity.length + clientSecretHits + debugHits;

        return {
            formCount: forms.length,
            postForms: postForms.length,
            passwordForms: passwordForms.length,
            fileInputs: fileInputs.length,
            postMissingCsrf: postMissingCsrf.length,
            crossOriginForms: crossOriginForms.length,
            riskyBlankLinks: riskyBlankLinks.length,
            javascriptUrls: javascriptUrls.length,
            inlineHandlers,
            sinkHits,
            thirdPartyScripts: thirdPartyScripts.length,
            scriptsWithoutIntegrity: scriptsWithoutIntegrity.length,
            sensitiveLinks: sensitiveLinks.length,
            clientSecretHits,
            debugHits,
            clientIssues
        };
    };

    const request = async (path, options = {}) => {
        const started = performance.now();
        try {
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
        } catch {
            return {
                elapsed: performance.now() - started,
                response: {
                    ok: false,
                    status: 0,
                    headers: { get: () => null }
                },
                text: ''
            };
        }
    };

    let diagnosticsRunning = false;
    let diagnosticsHasRun = false;

    const updateStatus = (key, value) => {
        const target = document.getElementById(statusMap[key]);
        if (!target) return;

        const dot = document.createElement('span');
        dot.className = 'status-dot pulse';
        target.replaceChildren(dot, document.createTextNode(` ${t(value)}`));

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
        applyTranslations(entry);
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
            const isReachable = response => response.status >= 200 && response.status < 400;
            const directRouteIssues = directRoutes.filter(({ result }) => !isReachable(result.response)).length;
            const shouldReportDirectRouteIssues = window.location.protocol === 'https:';
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
            const serverHeader = getHeader(home.response, 'server', '');
            const githubPagesHeaderNote = /github/i.test(serverHeader) && missingHardeningHeaders.length
                ? (currentLanguage === 'bg'
                    ? 'GitHub Pages не прилага custom response headers; нужен е CDN/proxy слой.'
                    : 'GitHub Pages does not apply custom response headers; use a CDN/proxy layer.')
                : '';
            const sqlLeak = hasSqlErrorLeak(stripEmbeddedProbe(sqlSmoke.text));
            const browserSmoke = collectBrowserSmokeSignals();

            return [
                {
                    label: 'Response',
                    summary: currentLanguage === 'bg'
                        ? `${home.response.status} ${home.response.ok ? 'ОК' : 'провери'} - ${getHeader(home.response, 'content-type')} - ${byteSize(getHeader(home.response, 'content-length', '0'))} - ${formatMs(home.elapsed)}`
                        : `${home.response.status} ${home.response.ok ? 'OK' : 'check'} - ${getHeader(home.response, 'content-type')} - ${byteSize(getHeader(home.response, 'content-length', '0'))} - ${formatMs(home.elapsed)}`,
                    attention: !home.response.ok,
                    updates: { http: `${home.response.status} ${home.response.ok ? 'OK' : 'CHECK'}` }
                },
                {
                    label: 'Crawl Files',
                    summary: currentLanguage === 'bg'
                        ? `robots ${robots.response.status}; sitemap ${sitemap.response.status} с ${sitemapUrls.length} URL адрес${sitemapUrls.length === 1 ? '' : 'а'}.`
                        : `robots ${robots.response.status}; sitemap ${sitemap.response.status} with ${sitemapUrls.length} URL${sitemapUrls.length === 1 ? '' : 's'}.`,
                    attention: !robots.response.ok || !sitemap.response.ok || !sitemapUrls.length,
                    updates: {
                        traffic: `${sitemapUrls.length} URLS`,
                        seo: robots.response.ok ? 'ROBOTS OK' : 'ROBOTS?'
                    }
                },
                {
                    label: 'Routes',
                    summary: currentLanguage === 'bg'
                        ? `${routeEntries.length - missingFragments}/${routeEntries.length} view фрагмента са достъпни; ${shouldReportDirectRouteIssues ? `${directRouteIssues} директни маршрута имат нужда от fallback.` : 'директните route shell файлове са генерирани.'}`
                        : `${routeEntries.length - missingFragments}/${routeEntries.length} view fragments reachable; ${shouldReportDirectRouteIssues ? `${directRouteIssues} direct route${directRouteIssues === 1 ? '' : 's'} need fallback.` : 'direct route shells generated.'}`,
                    attention: Boolean(missingFragments || (shouldReportDirectRouteIssues && directRouteIssues)),
                    updates: {
                        cache: `${routeEntries.length - missingFragments}/${routeEntries.length}`,
                        errors: shouldReportDirectRouteIssues && directRouteIssues ? 'FALLBACK' : 'CLEAR'
                    }
                },
                {
                    label: 'Metadata',
                    summary: currentLanguage === 'bg'
                        ? `Title е наличен; description ${metaDescription ? `${metaDescription.length} символа` : 'липсва'}.`
                        : `Title present; description ${metaDescription ? `${metaDescription.length} chars` : 'missing'}.`,
                    attention: !metaDescription,
                    updates: { seo: metaDescription ? 'META OK' : 'META?' }
                },
                {
                    label: 'Speed',
                    summary: currentLanguage === 'bg'
                        ? `Зареждане ${Math.round(nav?.duration || performance.now())}ms; ${resources.length} assets; ${transferKb}KB трансфер.`
                        : `Load ${Math.round(nav?.duration || performance.now())}ms; ${resources.length} assets; ${transferKb}KB transferred.`,
                    attention: false,
                    updates: {
                        assets: `${resources.length} ASSETS`,
                        latency: `${Math.round((nav?.domainLookupEnd || 0) - (nav?.domainLookupStart || 0))}/${nav?.secureConnectionStart ? Math.round((nav.connectEnd || 0) - nav.secureConnectionStart) : 0}MS`
                    }
                },
                {
                    label: 'Security',
                    summary: currentLanguage === 'bg'
                        ? `${window.isSecureContext ? 'Сигурен контекст' : 'Локален/несигурен контекст'}; ${mixedContent.length} mixed-content URL адреса; response headers ${missingHardeningHeaders.length ? `${missingHardeningHeaders.length} липсват` : 'налични'}; HTML политики ${htmlPolicies.length ? htmlPolicies.join(', ') : 'няма'}.${githubPagesHeaderNote ? ` ${githubPagesHeaderNote}` : ''}`
                        : `${window.isSecureContext ? 'Secure context' : 'Local/non-secure context'}; ${mixedContent.length} mixed-content URL${mixedContent.length === 1 ? '' : 's'}; response headers ${missingHardeningHeaders.length ? `${missingHardeningHeaders.length} missing` : 'present'}; HTML policies ${htmlPolicies.length ? htmlPolicies.join(', ') : 'none'}.${githubPagesHeaderNote ? ` ${githubPagesHeaderNote}` : ''}`,
                    attention: Boolean(mixedContent.length || (missingHardeningHeaders.length && !htmlPolicies.length)),
                    updates: {
                        shield: missingHardeningHeaders.length ? (htmlPolicies.length ? 'HTML POLICY' : 'CHECK') : 'SECURE'
                    }
                },
                {
                    label: 'Browser Smoke',
                    summary: currentLanguage === 'bg'
                        ? `forms ${browserSmoke.formCount}; POST без CSRF сигнал ${browserSmoke.postMissingCsrf}; cross-origin forms ${browserSmoke.crossOriginForms}; client risks ${browserSmoke.clientIssues}; third-party scripts ${browserSmoke.thirdPartyScripts}, без SRI ${browserSmoke.scriptsWithoutIntegrity}; secrets ${browserSmoke.clientSecretHits}; debug ${browserSmoke.debugHits}.`
                        : `forms ${browserSmoke.formCount}; POST missing CSRF signal ${browserSmoke.postMissingCsrf}; cross-origin forms ${browserSmoke.crossOriginForms}; client risks ${browserSmoke.clientIssues}; third-party scripts ${browserSmoke.thirdPartyScripts}, missing SRI ${browserSmoke.scriptsWithoutIntegrity}; secrets ${browserSmoke.clientSecretHits}; debug ${browserSmoke.debugHits}.`,
                    attention: Boolean(
                        browserSmoke.postMissingCsrf ||
                        browserSmoke.crossOriginForms ||
                        browserSmoke.clientIssues ||
                        browserSmoke.sensitiveLinks
                    ),
                    updates: {
                        shield: browserSmoke.clientSecretHits || browserSmoke.debugHits ? 'CHECK' : 'BROWSER OK',
                        errors: browserSmoke.clientSecretHits || browserSmoke.debugHits ? 'CHECK' : (shouldReportDirectRouteIssues && directRouteIssues ? 'FALLBACK' : 'CLEAR')
                    }
                },
                {
                    label: 'Vuln Smoke',
                    summary: currentLanguage === 'bg'
                        ? `SQL error leak ${sqlLeak ? 'възможен' : 'чист'}; ${exposedFiles.length} изложени sensitive файла; response headers ${missingHardeningHeaders.length ? `липсват: ${missingHardeningHeaders.join(', ')}` : 'налични'}; HTML fallback ${htmlPolicies.length ? htmlPolicies.join(', ') : 'няма'}.`
                        : `SQL error leak ${sqlLeak ? 'possible' : 'clear'}; ${exposedFiles.length} exposed sensitive file${exposedFiles.length === 1 ? '' : 's'}; response headers ${missingHardeningHeaders.length ? `missing: ${missingHardeningHeaders.join(', ')}` : 'present'}; HTML fallback ${htmlPolicies.length ? htmlPolicies.join(', ') : 'none'}.`,
                    attention: Boolean(sqlLeak || exposedFiles.length),
                    updates: {
                        errors: sqlLeak || exposedFiles.length ? 'CHECK' : (shouldReportDirectRouteIssues && directRouteIssues ? 'FALLBACK' : 'CLEAR')
                    }
                },
                {
                    label: 'External Probe',
                    summary: currentLanguage === 'bg'
                        ? 'Копираният single-file скрипт добавя DNS, TLS, domain info, CORS, cookies, browser-style DOM checks, secret/debug scan, redirect/reflection/SQL smoke и optional nmap само за web ports.'
                        : 'Copied single-file script adds DNS, TLS, domain info, CORS, cookies, browser-style DOM checks, secret/debug scan, redirect/reflection/SQL smoke, and optional nmap web-port checks.',
                    attention: false,
                    updates: {
                        latency: 'DNS/TLS'
                    }
                }
            ];
        } catch (error) {
            return [{
                label: 'Probe Failed',
                summary: error instanceof Error ? error.message : String(error),
                attention: true,
                updates: { errors: 'FAILED' }
            }];
        }
    };

    const startDiagnostics = async () => {
        if (diagnosticsRunning || diagnosticsHasRun) return;

        diagnosticsRunning = true;
        logEl.replaceChildren();
        commandEl.textContent = 'copy website-probe.sh';
        outputEl.textContent = t('Copy one .sh browser-style probe. From Terminal, WSL, or Git Bash it checks setup, site health, and safe pentest smoke signals.');

        const summaries = await buildProbeSummary();
        summaries.forEach(summary => {
            Object.entries(summary.updates).forEach(([key, value]) => updateStatus(key, value));
        });
        summaries.forEach(appendSummary);

        commandEl.textContent = `example target: ${targetOrigin}`;
        outputEl.textContent = summaries.some(summary => summary.attention)
            ? t('Useful checks are listed below. Copy the script for the full single-file browser-style probe.')
            : t('Local checks are clear. Copy the script for the full single-file browser-style probe.');
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
            copyStatus.textContent = t('Copied');
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyStatus.textContent = '';
                copyBtn.classList.remove('copied');
            }, 1600);
            return;
        }

        copyStatus.textContent = t('Copy blocked');
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
    window.innerWidth > 760 &&
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
        this.canvas.__quantumWeb = this;
        this.particles = [];
        this.mouse = { x: null, y: null, vx: 0, vy: 0, down: false };
        this.lastMouse = { x: 0, y: 0 };
        this.lastFrame = 0;
        this.resizeTimer = null;
        this.ripples = [];
        this.isVisible = !document.hidden;
        this.readTheme();
        this.init();
        this.animate(0);
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            if (this.isVisible && !this.isReducedMotion) this.animate(performance.now());
        });
        document.addEventListener('themechange', () => this.readTheme());
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

    readTheme() {
        const cs = getComputedStyle(document.documentElement);
        this.accent = cs.getPropertyValue('--c-accent-rgb').trim() || '255, 157, 0';
        this.accentStrong = cs.getPropertyValue('--c-accent-strong-rgb').trim() || '255, 177, 59';
        this.bgColor = cs.getPropertyValue('--c-bg').trim() || '#030201';
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
        const cores = navigator.hardwareConcurrency || 8;
        const memory = navigator.deviceMemory || 8;
        const saveData = Boolean(navigator.connection?.saveData);
        this.isEconomy = saveData || cores <= 4 || memory <= 4;
        this.frameInterval = this.isReducedMotion ? 1000 : (this.isCompact || this.isEconomy ? 33 : 20);
        this.connectionDistance = this.isCompact ? 82 : (this.isEconomy ? 98 : 112);

        const density = this.isCompact ? 7600 : (this.isEconomy ? 5600 : 4600);
        const maxParticles = this.isReducedMotion ? 48 : (this.isCompact ? 95 : (this.isEconomy ? 170 : 260));
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

        this.canvas.dataset.particleCount = String(this.particles.length);
        this.canvas.dataset.frameInterval = String(this.frameInterval);
        this.canvas.dataset.performanceMode = this.isCompact ? 'compact' : (this.isEconomy ? 'economy' : 'rich');
    }

    animate(timestamp = 0) {
        if (!this.isVisible) return;
        if (!this.isReducedMotion && timestamp - this.lastFrame < this.frameInterval) {
            requestAnimationFrame(nextTimestamp => this.animate(nextTimestamp));
            return;
        }

        this.lastFrame = timestamp;
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.isCompact && this.mouse.x !== null) {
            const auraRadius = this.mouse.down ? 360 : 280;
            const aura = this.ctx.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, auraRadius);
            aura.addColorStop(0, this.mouse.down ? `rgba(${this.accentStrong}, 0.18)` : `rgba(${this.accent}, 0.1)`);
            aura.addColorStop(0.45, `rgba(${this.accent}, 0.035)`);
            aura.addColorStop(1, `rgba(${this.accent}, 0)`);
            this.ctx.fillStyle = aura;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.ripples = this.ripples
            .map(ripple => ({ ...ripple, radius: ripple.radius + 9, alpha: ripple.alpha * 0.955 }))
            .filter(ripple => ripple.alpha > 0.04 && ripple.radius < Math.max(this.width, this.height));

        this.ripples.forEach(ripple => {
            this.ctx.strokeStyle = `rgba(${this.accentStrong}, ${ripple.alpha * 0.22})`;
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
                this.ctx.fillStyle = `rgba(${this.accentStrong}, ${p.heat * 0.16})`;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, size * 3.2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.fillStyle = `rgba(${this.accent}, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.lineWidth = 0.5;
        if (!this.isReducedMotion && this.particles.length > 1) {
            const grid = new Map();
            const cellSize = this.connectionDistance;
            const connectionStride = this.isEconomy ? 2 : 1;
            this.particles.forEach(p => {
                const cellX = Math.floor(p.x / cellSize);
                const cellY = Math.floor(p.y / cellSize);
                const key = `${cellX}:${cellY}`;
                const bucket = grid.get(key) || [];
                bucket.push(p);
                grid.set(key, bucket);
            });

            this.particles.forEach((particle, particleIndex) => {
                if (particleIndex % connectionStride !== 0) return;
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
                                this.ctx.strokeStyle = `rgba(${this.accent}, ${alpha})`;
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
                        this.ctx.strokeStyle = `rgba(${this.accentStrong}, ${alpha})`;
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

// External links (showcase buttons, etc.) always open in a new tab.
document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link || link.hasAttribute('data-link')) return;
    let url;
    try {
        url = new URL(link.href, window.location.href);
    } catch (_) {
        return;
    }
    if (url.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
});

window.addEventListener('popstate', router);

document.addEventListener('DOMContentLoaded', () => {
    new QuantumWeb('bg-canvas');
    initCursor();
    initThemeSwitcher();
    initLanguageSwitcher();
    initMagnetic();
    initHealthCheck();
    router();
});
