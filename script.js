/**
 * ThePrivilegedCompany Monolith Engine [Final Boss Tier]
 * Senior Engineering Standard.
 */
import { languageMeta, translations } from './translations.js?v=20261008f';

const routes = {
    '': {
        title: 'IT Solutions, App & Website Development',
        // Root renders the hub view baked into index.html; no fragment is fetched.
        isStatic: true,
        description: 'Websites, apps, automation, and 1:1 tech consultations for individuals and businesses. Practical AI and IT mentoring with a certified senior cloud architect.'
    },
    'manifest': {
        title: 'Services',
        view: 'manifest.html',
        description: 'Websites, apps, automation, and 1:1 AI/IT mentoring with a certified senior cloud architect. Services for individuals and businesses.'
    },
    'who-are-we': {
        title: 'Who we are',
        view: 'who-are-we.html',
        description: 'Meet ThePrivilegedCompany: a lead architect working with AI-assisted tools on software, cloud systems, and practical technical challenges.'
    },
    'data-engine': {
        title: 'Data & Intelligence',
        view: 'data-engine.html',
        description: 'Performance data, load testing, and production experience to guide decisions about your software and infrastructure.'
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
        description: 'How ThePrivilegedCompany handles email enquiries and information shared during an engagement.'
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
        description: 'Ask about a project, a 1:1 consultation, or AI/IT mentoring with a certified senior cloud architect. Practical help for you or your business.'
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
const assetVersion = '20261008f';

const getCampaignAttribution = search => {
    const params = new URLSearchParams(search);
    if (['utm_source', 'utm_medium', 'utm_campaign'].some(key => params.getAll(key).length !== 1)) return null;
    if (params.get('utm_source') !== 'facebook' || params.get('utm_medium') !== 'organic_social') return null;
    const campaign = params.get('utm_campaign');
    if (!['company_launch_en', 'company_launch_bg'].includes(campaign)) return null;
    const content = params.get('utm_content');
    const supportedContent = params.getAll('utm_content').length === 1 && ['page_button', 'introduction_post'].includes(content);
    return { source: 'facebook', medium: 'organic_social', campaign, ...(supportedContent ? { content } : {}) };
};
// ponytail: memory only for this SPA visit; full reloads reset attribution.
// Explicit campaign labels avoid storing arbitrary URLs, identifiers or click IDs.
const campaignAttribution = getCampaignAttribution(window.location.search);

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
    '1:1 Tech Consultations': '1:1 consultation',
    'Tech Training': 'Training / academy',
    'Learn Any Tech Topic': 'Training / academy',
    'Social Media Management': 'Marketing or social media',
    'Advertisement Support': 'Marketing or social media',
    'Adult entertainment': 'Marketing or social media',
    'Scam & Funnel Awareness': 'Scam or fraud awareness'
};
const knownServiceNames = Object.keys(serviceRequestTypes);
const supportedLanguages = Object.keys(languageMeta);
let currentLanguage = (() => {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (supportedLanguages.includes(requested)) return requested;
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

const consultationTopics = {
    learn: { label: 'Learn AI', form: 2, description: 'Bring your curiosity. Learn to ask better questions, check AI answers, and use it in everyday work.' },
    build: { label: 'Build something', form: 0, description: 'Have an idea? Explore the right tools and plan your first working version together.' },
    solve: { label: 'Solve a problem', form: 1, description: 'Bring the problem that has you stuck. Work through it together and find a clear next step.' }
};
const getConsultationTopic = search => {
    const params = new URLSearchParams(search);
    const key = params.get('topic');
    // Only these public labels enter the email draft; never arbitrary URL text.
    return params.getAll('topic').length === 1 && Object.hasOwn(consultationTopics, key) ? consultationTopics[key] : null;
};

const initHomeIntent = () => {
    const choices = document.getElementById('hero-intents');
    const description = document.getElementById('hero-intent-description');
    const link = document.getElementById('hero-intent-link');
    if (!choices || !description || !link) return;
    let sculpture;
    const update = () => {
        const key = choices.querySelector('input:checked')?.value;
        if (!Object.hasOwn(consultationTopics, key)) return;
        const topic = consultationTopics[key];
        description.dataset.i18nSource = topic.description;
        description.textContent = t(topic.description);
        link.href = `/contact?service=1%3A1%20Tech%20Consultations&topic=${key}`;
        sculpture?.setForm(topic.form);
    };
    choices.addEventListener('change', update);
    choices.hidden = false;
    update();
    // Enquiries work even if the optional Canvas module never loads.
    return instance => { sculpture = instance; update(); };
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
    if (select) {
        select.value = currentLanguage;
    }
    document.querySelectorAll('[data-facebook-link]').forEach(link => {
        link.href = currentLanguage === 'bg'
            ? 'https://www.facebook.com/profile.php?id=61594916066192'
            : 'https://www.facebook.com/profile.php?id=61594741023963';
    });
    document.querySelectorAll('[data-soroya-link]').forEach(link => {
        link.href = `/dev/soroya/${currentLanguage === 'bg' ? 'index-bg.html' : 'index.html'}`;
    });

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

    root.querySelectorAll?.('[placeholder], [aria-label], [title], [alt]').forEach(element => {
        ['placeholder', 'aria-label', 'title', 'alt'].forEach(attr => {
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
    const pageUrl = new URL(window.location.href);
    if (pageUrl.searchParams.has('lang')) {
        pageUrl.searchParams.set('lang', lang);
        history.replaceState(null, '', pageUrl);
    }
    try {
        localStorage.setItem('tpc-language', lang);
    } catch {
        // Storage can be blocked; the page still switches for the current session.
    }
    applyTranslations();
    // Hide a stale draft so the visitor can prepare it in the new language; keep inputs.
    document.getElementById('contact-form')?.dispatchEvent(new Event('input'));
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
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim());
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
    const path = window.location.pathname.replace(/\/index\.html$/, '/');
    const key = path.replace(/^\//, '').replace(/\/$/, '');
    return Object.hasOwn(routes, key) ? key : notFoundKey;
};

/**
 * SPA Router with Cinematic Transitions
 */
let navigationId = 0;
const router = async () => {
    const navigation = ++navigationId;
    const { key, route } = getCurrentRoute();
    document.body.dataset.route = key || 'home';
    
    // Start Transition Mask. Skip the wait entirely for reduced-motion users, and
    // otherwise wait only long enough for the mask to cover (CSS clip-path is 0.35s).
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const needsTransition = navigation > 1 || key !== '';
    if (needsTransition) transitionMask.classList.add('is-active');
    await new Promise(r => setTimeout(r, prefersReducedMotion || !needsTransition ? 0 : 360));
    if (navigation !== navigationId) return;

    // Update active state in nav
    document.querySelectorAll('#main-nav a').forEach(link => {
        const active = new URL(link.href, window.location.origin).pathname === (key ? `/${key}` : '/');
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    if (key === '') {
        dynamicView.style.display = 'none';
        hubView.style.display = 'block';
    } else {
        hubView.style.display = 'none';
        dynamicView.style.display = 'block';
        
        try {
            const response = await fetch(`views/${route.view}?v=${assetVersion}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const html = await response.text();
            if (navigation !== navigationId) return;
            dynamicView.innerHTML = html;
        } catch (error) {
            if (navigation !== navigationId) return;
            console.error('Portal Error:', error);
            dynamicView.innerHTML = `<section class="route-error"><h1>Connection interrupted.</h1><p>We could not load this page. Check your connection and try again.</p><button class="btn-hud" id="route-retry" type="button">Try again</button></section>`;
            document.getElementById('route-retry')?.addEventListener('click', router);
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
    // Announce SPA navigation and keep the next Tab press in the new content.
    if (navigation > 1) {
        const heading = (key === '' ? hubView : dynamicView).querySelector?.('h1');
        if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
        }
    }
};

/**
 * Tab Switching Logic
 */
const initTabs = () => {
    const triggers = document.querySelectorAll('.tab-trigger');
    const contents = document.querySelectorAll('.tab-content');
    if (!triggers.length) return;

    triggers.forEach((trigger, index) => {
        trigger.tabIndex = trigger.getAttribute('aria-selected') === 'true' ? 0 : -1;
        trigger.addEventListener('click', () => {
            const tab = trigger.dataset.tab;
            triggers.forEach(t => {
                const isActive = t === trigger;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', String(isActive));
                t.tabIndex = isActive ? 0 : -1;
            });
            contents.forEach(content => {
                content.hidden = content.id !== `tab-${tab}`;
            });

            const target = document.getElementById(`tab-${tab}`);
            if (target) target.hidden = false;
        });
        trigger.addEventListener('keydown', event => {
            const destinations = { ArrowRight: (index + 1) % triggers.length, ArrowLeft: (index - 1 + triggers.length) % triggers.length, Home: 0, End: triggers.length - 1 };
            if (!Object.hasOwn(destinations, event.key)) return;
            event.preventDefault();
            const next = triggers[destinations[event.key]];
            next.focus();
            next.click();
        });
    });
};

const initServiceCards = () => {
    document.querySelectorAll('.service-card').forEach(card => {
        const serviceName = card.dataset.serviceName || getSourceText(card.querySelector('h3'));
        if (!serviceRequestTypes[serviceName]) return;
        card.dataset.serviceName = serviceName;
        let cta = card.querySelector('.service-card-cta');
        if (!cta) {
            cta = document.createElement('a');
            cta.className = 'service-card-cta';
            card.append(cta);
        }
        cta.href = `/contact?service=${encodeURIComponent(serviceName)}`;
        cta.toggleAttribute('data-link', true);
        cta.dataset.i18nSource = 'Request a quote';
        cta.textContent = t(cta.dataset.i18nSource);
        cta.setAttribute('aria-label', currentLanguage === 'bg'
            ? `Оферта за: ${t(serviceName)}`
            : `Request a quote for: ${serviceName}`);
    });
};

const initContactForm = () => {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-form-status');
    const serviceContext = document.getElementById('contact-service-context');
    const serviceValue = document.getElementById('contact-service-value');
    const serviceInput = document.getElementById('contact-service-name');
    const topicContext = document.getElementById('contact-topic-context');
    const topicValue = document.getElementById('contact-topic-value');
    const draftTools = document.getElementById('contact-draft-tools');
    const draftText = document.getElementById('contact-draft-text');
    const draftLink = document.getElementById('contact-email-draft');
    const copyButton = document.getElementById('contact-copy');
    const addressButton = document.getElementById('contact-copy-address');
    const addressValue = document.getElementById('contact-address-value');
    const addressStatus = document.getElementById('contact-address-status');
    if (!form || !status) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const selectedService = getSelectedServiceName();
    let selectedTopic = selectedService === '1:1 Tech Consultations' ? getConsultationTopic(window.location.search) : null;
    if (selectedService && serviceContext && serviceValue && serviceInput) {
        serviceContext.hidden = false;
        serviceInput.value = selectedService;
        serviceValue.dataset.i18nSource = selectedService;
        serviceValue.textContent = t(selectedService);

        const requestType = serviceRequestTypes[selectedService];
        if (requestType && form.elements.requestType) form.elements.requestType.value = requestType;
    }
    if (selectedTopic && topicContext && topicValue) {
        topicContext.hidden = false;
        topicValue.dataset.i18nSource = selectedTopic.label;
        topicValue.textContent = t(selectedTopic.label);
    }

    form.addEventListener('change', event => {
        if (event.target.name !== 'requestType' || !serviceInput) return;
        if (serviceRequestTypes[serviceInput.value] === event.target.value) return;
        // A visitor can change their mind after following a service-specific link.
        serviceInput.value = '';
        selectedTopic = null;
        if (topicContext) topicContext.hidden = true;
        serviceContext.hidden = true;
        draftTools.hidden = true;
        status.textContent = '';
        status.classList.remove('is-visible');
    });

    form.addEventListener('submit', event => {
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

        // Native required validation accepts whitespace. Check meaningful content too.
        for (const field of ['name', 'email', 'phone', 'details']) {
            const input = form.elements[field];
            const value = String(data.get(field) || '').trim();
            if ((input.required && !value) || (input.maxLength > 0 && value.length > input.maxLength)) {
                status.textContent = t('Please complete the required fields and keep your message within the field limits.');
                status.classList.add('is-visible');
                input.focus();
                return;
            }
        }

        if (data.get('_honey')) return;

        const subjectText = (serviceName
            ? `${t('Inquiry about')}: ${t(serviceName)} - ${name}`
            : `${t('Website inquiry from')} ${name}`).replace(/[\r\n]/g, ' ');
        const bodyText = [
            `${t('Name:')} ${name}`,
            `${t('Email:')} ${email}`,
            `${t('Phone:')} ${phone || t('Not specified')}`,
            `${t('Service:')} ${t(serviceName || 'Not specified')}`,
            `${t('Looking for:')} ${t(requestType || 'Not specified')}`,
            ...(selectedTopic ? [`${t('Focus:')} ${t(selectedTopic.label)}`] : []),
            `${t('Timeline:')} ${t(timeline || 'Not specified')}`,
            `${t('Budget:')} ${t(budget || 'Not specified')}`,
            ...(campaignAttribution ? [`Campaign: ${[campaignAttribution.source, campaignAttribution.medium, campaignAttribution.campaign, campaignAttribution.content].filter(Boolean).join(' / ')}`] : []),
            '',
            t('Details:'),
            details
        ].join('\n');
        const subjectLink = `mailto:contactus@theprivilegedcompany.com?subject=${encodeURIComponent(subjectText)}`;
        const mailto = `${subjectLink}&body=${encodeURIComponent(bodyText)}`;
        // Mail apps have different URL limits. Long enquiries stay available to copy in full.
        const fitsEmailLink = mailto.length <= 1800;
        draftText.value = `${subjectText}\n\n${bodyText}`;
        draftLink.href = fitsEmailLink ? mailto : subjectLink;
        draftTools.hidden = false;
        status.textContent = t(fitsEmailLink
            ? 'Your enquiry is ready. Choose Open email app, or copy it and send from your usual inbox.'
            : 'Your enquiry is too long for an email link. Copy it below, open your email app, and paste it before sending.');
        status.classList.add('is-visible');
        // A separate native link keeps opening the mail app a direct visitor action.
        draftLink.focus();
    });
    form.addEventListener('input', () => {
        draftTools.hidden = true;
        status.textContent = '';
        status.classList.remove('is-visible');
    });
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(draftText.value);
            status.textContent = t('Enquiry copied. Paste it into your email app and press Send.');
        } catch {
            draftText.focus();
            draftText.select();
            status.textContent = t('Select and copy the prepared enquiry below, then paste it into your email app.');
        }
    });
    addressButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(addressValue.value);
            addressValue.hidden = true;
            addressStatus.textContent = t('Email address copied. Paste it into the To field in your email app.');
        } catch {
            addressValue.hidden = false;
            addressValue.focus();
            addressValue.select();
            addressValue.setSelectionRange(0, addressValue.value.length);
            addressStatus.textContent = t('Copy the selected email address into your email app.');
        }
    });
    addressButton.disabled = false;
    if (submitButton) submitButton.disabled = false;
};

/**
 * Architecture Canvas V2 Interactivity
 */
const initArchitectureCanvas = () => {
    const layers = document.querySelectorAll('.canvas-layer');
    const details = document.getElementById('layer-details-v2');
    if (!layers.length || !details) return;

    const data = {
        edge: { title: 'Edge delivery', body: 'We configure CloudFront and web application firewalls with Terraform to improve content delivery and filter unwanted traffic at the perimeter.' },
        compute: { title: 'Compute Engine', body: 'We use Kubernetes and serverless services to adjust capacity to demand, with scaling policies and monitoring suited to your workload.' },
        data: { title: 'Data reliability', body: 'We design relational and NoSQL data systems with replication, backups, and failover. Recovery objectives guide the design and testing.' },
        security: { title: 'Zero Trust', body: 'We configure access policies, secret rotation, and encryption for stored data and network traffic, with controls suited to each system.' }
    };

    layers.forEach(layer => {
        layer.addEventListener('click', () => {
            const key = layer.dataset.layer;
            const info = data[key];
            layers.forEach(item => item.setAttribute('aria-pressed', String(item === layer)));
            details.innerHTML = `
                <div class="details-content">
                    <h2>${info.title}</h2>
                    <p>${info.body}</p>
                </div>
            `;
            applyTranslations(details);
        });
        layer.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            layer.click();
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
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (el.scrambling) return;
        el.scrambling = true;
        el.dataset.i18nSource ||= getSourceText(el);
        const language = currentLanguage;

        let iteration = 0;
        const interval = setInterval(() => {
            if (currentLanguage !== language) {
                clearInterval(interval);
                el.textContent = t(el.dataset.i18nSource);
                el.scrambling = false;
                return;
            }
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
                    ? 'GitHub Pages не прилага персонализирани HTTP заглавки; необходим е CDN или прокси сървър.'
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
                        ? `${routeEntries.length - missingFragments}/${routeEntries.length} фрагмента на страници са достъпни; ${shouldReportDirectRouteIssues ? `${directRouteIssues} директни адреса изискват резервно пренасочване.` : 'файловете за директно зареждане на страниците са генерирани.'}`
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
                        ? `Заглавието е налично; описание ${metaDescription ? `${metaDescription.length} символа` : 'липсва'}.`
                        : `Title present; description ${metaDescription ? `${metaDescription.length} chars` : 'missing'}.`,
                    attention: !metaDescription,
                    updates: { seo: metaDescription ? 'META OK' : 'META?' }
                },
                {
                    label: 'Speed',
                    summary: currentLanguage === 'bg'
                        ? `Зареждане ${Math.round(nav?.duration || performance.now())}ms; ${resources.length} ресурса; ${transferKb}KB трансфер.`
                        : `Load ${Math.round(nav?.duration || performance.now())}ms; ${resources.length} ресурса; ${transferKb}KB transferred.`,
                    attention: false,
                    updates: {
                        assets: `${resources.length} ASSETS`,
                        latency: `${Math.round((nav?.domainLookupEnd || 0) - (nav?.domainLookupStart || 0))}/${nav?.secureConnectionStart ? Math.round((nav.connectEnd || 0) - nav.secureConnectionStart) : 0}MS`
                    }
                },
                {
                    label: 'Security',
                    summary: currentLanguage === 'bg'
                        ? `${window.isSecureContext ? 'Сигурен контекст' : 'Локален/несигурен контекст'}; ${mixedContent.length} адреса със смесено HTTP/HTTPS съдържание; HTTP заглавки ${missingHardeningHeaders.length ? `${missingHardeningHeaders.length} липсват` : 'налични'}; HTML политики ${htmlPolicies.length ? htmlPolicies.join(', ') : 'няма'}.${githubPagesHeaderNote ? ` ${githubPagesHeaderNote}` : ''}`
                        : `${window.isSecureContext ? 'Secure context' : 'Local/non-secure context'}; ${mixedContent.length} mixed-content URL${mixedContent.length === 1 ? '' : 's'}; response headers ${missingHardeningHeaders.length ? `${missingHardeningHeaders.length} missing` : 'present'}; HTML policies ${htmlPolicies.length ? htmlPolicies.join(', ') : 'none'}.${githubPagesHeaderNote ? ` ${githubPagesHeaderNote}` : ''}`,
                    attention: Boolean(mixedContent.length || (missingHardeningHeaders.length && !htmlPolicies.length)),
                    updates: {
                        shield: missingHardeningHeaders.length ? (htmlPolicies.length ? 'HTML POLICY' : 'CHECK') : 'SECURE'
                    }
                },
                {
                    label: 'Browser Smoke',
                    summary: currentLanguage === 'bg'
                        ? `формуляри ${browserSmoke.formCount}; POST без видим CSRF маркер ${browserSmoke.postMissingCsrf}; формуляри към друг домейн ${browserSmoke.crossOriginForms}; рискове в клиентския код ${browserSmoke.clientIssues}; външни скриптове ${browserSmoke.thirdPartyScripts}, без SRI ${browserSmoke.scriptsWithoutIntegrity}; възможни тайни ${browserSmoke.clientSecretHits}; данни за отстраняване на грешки ${browserSmoke.debugHits}.`
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
                        ? `Разкриване на SQL грешки ${sqlLeak ? 'възможно' : 'не е открито'}; ${exposedFiles.length} публично достъпни чувствителни файла; HTTP заглавки ${missingHardeningHeaders.length ? `липсват: ${missingHardeningHeaders.join(', ')}` : 'налични'}; Резервни HTML политики ${htmlPolicies.length ? htmlPolicies.join(', ') : 'няма'}.`
                        : `SQL error leak ${sqlLeak ? 'possible' : 'clear'}; ${exposedFiles.length} exposed sensitive file${exposedFiles.length === 1 ? '' : 's'}; response headers ${missingHardeningHeaders.length ? `missing: ${missingHardeningHeaders.join(', ')}` : 'present'}; HTML fallback ${htmlPolicies.length ? htmlPolicies.join(', ') : 'none'}.`,
                    attention: Boolean(sqlLeak || exposedFiles.length),
                    updates: {
                        errors: sqlLeak || exposedFiles.length ? 'CHECK' : (shouldReportDirectRouteIssues && directRouteIssues ? 'FALLBACK' : 'CLEAR')
                    }
                },
                {
                    label: 'External Probe',
                    summary: currentLanguage === 'bg'
                        ? 'Копираният скрипт добавя проверки на DNS, TLS, домейна, CORS, бисквитките и структурата на страницата. Проверява за разкрити тайни, диагностични данни и основни проблеми с пренасочвания и SQL; по избор използва nmap само за уеб портове.'
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
        toggleBtn.setAttribute('aria-label', t(isExpanded ? 'Close website diagnostics' : 'Open website diagnostics'));
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
const enhancedPointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
const canUseEnhancedPointer = () => (
    window.innerWidth > 760 &&
    enhancedPointerMedia.matches &&
    !reducedMotionMedia.matches
);

const initCursor = () => {
    if (!cursor || !follower) return;

    const hideCursor = () => document.body.classList.remove('has-custom-cursor', 'cursor-hover');
    window.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || !canUseEnhancedPointer()) {
            hideCursor();
            return;
        }
        // Position follows the pointer directly; only the ring size is animated.
        const position = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
        cursor.style.transform = position;
        follower.style.transform = position;
        document.body.classList.add('has-custom-cursor');
        document.body.classList.toggle('cursor-hover', !!event.target.closest('a, button, input, select, textarea, [role="link"], [data-magnetic]'));
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', hideCursor);
    window.addEventListener('blur', hideCursor);
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
            el.style.transform = `translate3d(${x * 0.08}px, ${y * 0.08}px, 0)`;
        }, { passive: true });
        el.addEventListener('mouseleave', () => {
            el.style.transform = `translate3d(0, 0, 0)`;
        });
    });
};

/**
 * A layered starfield, shared by every route.
 */
class QuantumWeb {
    constructor(id) {
        this.canvas = document.getElementById(id);
        this.ctx = this.canvas?.getContext('2d');
        if (!this.ctx) return;
        this.mouse = { x: null, y: null };
        this.offset = { x: 0, y: 0 };
        this.ripples = [];
        this.time = 0;
        this.resizeTimer = null;
        this.isVisible = !document.hidden;
        this.readTheme();
        this.init();
        this.animate(0);
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            cancelAnimationFrame(this.animationFrame);
            this.lastFrame = null;
            if (this.isVisible) this.animate(performance.now());
        });
        document.addEventListener('themechange', () => {
            this.readTheme();
            if (this.isReducedMotion) this.animate(performance.now());
        });
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
            cancelAnimationFrame(this.animationFrame);
            this.init();
            this.animate(performance.now());
        });
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.init();
                if (this.isReducedMotion) this.animate(performance.now());
            }, 150);
        });
        window.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch' || this.isReducedMotion || this.isCompact) return;
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
        }, { passive: true });
        window.addEventListener('pointerdown', event => {
            if (this.isReducedMotion || this.isCompact || event.pointerType === 'touch' || event.button > 0) return;
            if (event.target?.closest?.('a, button, input, select, textarea, label, summary, [contenteditable]')) return;
            this.mouse.x = event.clientX;
            this.mouse.y = event.clientY;
            this.gravityEnergy = 1;
            this.addRipple(event.clientX, event.clientY);
        }, { passive: true });
        document.addEventListener('sculpturechange', event => {
            if (this.isReducedMotion || !this.isVisible) return;
            const { x, y } = event.detail || {};
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > this.width || y < 0 || y > this.height) return;
            this.addRipple(x, y);
        });
        const releasePointer = () => { this.mouse.x = this.mouse.y = null; this.gravityEnergy = 0; };
        window.addEventListener('pointerleave', releasePointer, { passive: true });
        window.addEventListener('blur', releasePointer);
    }

    addRipple(x, y) {
        this.ripples.push({ x, y, radius: 0, alpha: .65 });
        if (this.ripples.length > 3) this.ripples.shift();
    }

    readTheme() {
        const style = getComputedStyle(document.documentElement);
        this.accent = style.getPropertyValue('--c-accent-rgb').trim() || '216, 174, 105';
        this.starlight = style.getPropertyValue('--c-starlight-rgb').trim() || '246, 230, 201';
        this.isLight = document.documentElement.dataset.theme === 'light';
        // Reuse a tiny soft glow instead of painting hard-edged circles behind every star.
        this.starGlow = document.createElement('canvas');
        this.starGlow.width = this.starGlow.height = 64;
        const glowContext = this.starGlow.getContext('2d');
        if (!glowContext) { this.starGlow = null; return; }
        const glow = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
        glow.addColorStop(0, `rgba(${this.starlight}, .45)`);
        glow.addColorStop(.14, `rgba(${this.starlight}, .22)`);
        glow.addColorStop(.42, `rgba(${this.accent}, .07)`);
        glow.addColorStop(1, `rgba(${this.accent}, 0)`);
        glowContext.fillStyle = glow;
        glowContext.fillRect(0, 0, 64, 64);
    }

    init() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.isCompact = this.width < 760 || window.matchMedia('(pointer: coarse)').matches;
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const cores = navigator.hardwareConcurrency || 8;
        const memory = navigator.deviceMemory || 8;
        this.isEconomy = Boolean(navigator.connection?.saveData) || cores <= 4 || memory <= 4;
        this.dpr = Math.min(window.devicePixelRatio || 1, this.isCompact || this.isEconomy ? 1.25 : 1.5);
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.frameInterval = this.isReducedMotion ? 1000 : (this.isCompact || this.isEconomy ? 33 : 1000 / 60 - 1);
        this.lastFrame = null;
        this.time = this.time || 0;
        this.offset = { x: 0, y: 0 };
        this.ripples = [];
        this.mouse.x = this.mouse.y = null;
        this.captured = 0;
        this.gravityEnergy = 0;
        this.gravityRadius = Math.min(430, this.width * .42);
        const limit = this.isReducedMotion ? 220 : this.isCompact ? 240 : this.isEconomy ? 480 : 1100;
        const density = this.isCompact ? 1300 : 1250;
        const count = Math.min(limit, Math.max(70, Math.floor(this.width * this.height / density)));
        this.particles = Array.from({ length: count }, (_, index) => {
            // Distant pinpoints, a middle layer, and a few softly lit foreground stars.
            const layer = index % 20 === 0 ? 2 : index % 4 === 0 ? 1 : 0;
            const depth = [.16, .48, .86][layer] + Math.random() * .12;
            return {
                x: Math.random() * (this.width + 100) - 50,
                y: Math.random() * (this.height + 100) - 50,
                layer, depth, size: [.65, 1.05, 1.65][layer] + Math.random() * .6,
                life: 1,
                phase: Math.random() * Math.PI * 2,
                speed: .25 + Math.random() * .4,
                glint: layer === 2 && index % 60 === 0
            };
        });
        this.canvas.dataset.effect = 'gravity-starfield';
        this.canvas.dataset.particleCount = String(count);
        this.canvas.dataset.frameInterval = String(this.frameInterval);
        this.canvas.dataset.performanceMode = this.isCompact ? 'compact' : this.isEconomy ? 'economy' : 'rich';
        this.canvas.dataset.motion = this.isReducedMotion ? 'reduced' : 'running';
    }

    drawGravityWell() {
        const { x, y } = this.mouse;
        const ctx = this.ctx;
        const swell = 1 + this.gravityEnergy * .16;
        const glow = ctx.createRadialGradient(x, y, 12, x, y, 145);
        glow.addColorStop(0, `rgba(${this.starlight}, ${.3 + this.gravityEnergy * .15})`);
        glow.addColorStop(.28, `rgba(${this.accent}, .16)`);
        glow.addColorStop(1, `rgba(${this.accent}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - 145, y - 145, 290, 290);
        // A tilted accretion disk and a dark centre; always behind page content.
        for (let ring = 0; ring < 5; ring++) {
            const rx = (36 + ring * 9) * swell, ry = (11 + ring * 3.2) * swell;
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, -.35, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${this.accent}, ${.38 - ring * .045})`;
            ctx.lineWidth = ring === 0 ? 2 : .8;
            ctx.stroke();
            ctx.beginPath();
            const start = this.time * (1.1 + ring * .12) + ring * .9;
            ctx.ellipse(x, y, rx, ry, -.35, start, start + 1.15);
            ctx.strokeStyle = `rgba(${this.starlight}, ${.9 - ring * .1})`;
            ctx.lineWidth = 1.3;
            ctx.stroke();
            // One moving highlight per ring gives the disk depth without more particles.
            const px = Math.cos(start + 1.15) * rx, py = Math.sin(start + 1.15) * ry;
            ctx.beginPath();
            ctx.arc(x + px * Math.cos(-.35) - py * Math.sin(-.35), y + px * Math.sin(-.35) + py * Math.cos(-.35), 1.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.starlight}, ${.9 - ring * .1})`;
            ctx.fill();
        }
        const rim = ctx.createRadialGradient(x, y, 15, x, y, 28);
        rim.addColorStop(0, `rgba(${this.starlight}, .65)`);
        rim.addColorStop(.35, `rgba(${this.accent}, .2)`);
        rim.addColorStop(1, `rgba(${this.accent}, 0)`);
        ctx.fillStyle = rim;
        ctx.fillRect(x - 28, y - 28, 56, 56);
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#030403';
        ctx.fill();
        ctx.strokeStyle = `rgba(${this.starlight}, .95)`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 19.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${this.accent}, .32)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        // The front edge crosses the dark core like a thin ribbon of light.
        ctx.beginPath();
        ctx.ellipse(x, y, 38 * swell, 11 * swell, -.35, .12, Math.PI - .12);
        ctx.strokeStyle = `rgba(${this.starlight}, .6)`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    animate(timestamp = 0) {
        if (!this.isVisible) return;
        const elapsed = this.lastFrame === null ? 0 : timestamp - this.lastFrame;
        if (!this.isReducedMotion && this.lastFrame !== null && elapsed < this.frameInterval) {
            this.animationFrame = requestAnimationFrame(next => this.animate(next));
            return;
        }
        const step = this.isReducedMotion ? 0 : Math.min(Math.max(elapsed, 0), 50) / (1000 / 60);
        this.lastFrame = timestamp;
        this.time += step / 60;
        this.gravityEnergy *= Math.pow(.95, step);
        if (this.gravityEnergy < .001) this.gravityEnergy = 0;
        this.ctx.clearRect(0, 0, this.width, this.height);

        const interactive = !this.isCompact && !this.isReducedMotion && this.mouse.x !== null;
        const gravityState = interactive ? 'active' : 'idle';
        if (this.canvas.dataset.gravity !== gravityState) this.canvas.dataset.gravity = gravityState;
        const targetX = interactive ? (this.mouse.x / this.width - .5) * 42 : 0;
        const targetY = interactive ? (this.mouse.y / this.height - .5) * 32 : 0;
        const easing = 1 - Math.pow(.93, step);
        this.offset.x += (targetX - this.offset.x) * easing;
        this.offset.y += (targetY - this.offset.y) * easing;

        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const ripple = this.ripples[i];
            ripple.radius += 5 * step;
            ripple.alpha *= Math.pow(.967, step);
            if (ripple.alpha < .02) {
                this.ripples.splice(i, 1);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(${this.accent}, ${ripple.alpha * .4})`;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        }
        const spanX = this.width + 100, spanY = this.height + 100;
        for (const star of this.particles) {
            star.x += (.04 + star.depth * .24) * step;
            star.y -= (.025 + star.depth * .1) * step;
            star.x = ((star.x + 50) % spanX + spanX) % spanX - 50;
            star.y = ((star.y + 50) % spanY + spanY) % spanY - 50;
            let x = star.x + this.offset.x * star.depth;
            let y = star.y + this.offset.y * star.depth;
            const shimmer = .88 + Math.sin(this.time * star.speed + star.phase) * .12;
            let light = 0;
            star.life = Math.min(1, star.life + step * .035);
            if (interactive && step > 0) {
                const dx = x - this.mouse.x, dy = y - this.mouse.y;
                const distance = Math.hypot(dx, dy);
                const influence = Math.pow(Math.max(0, 1 - distance / this.gravityRadius), .7);
                if (influence > 0) {
                    const pull = influence * (.8 + influence * 3.6) * (.75 + star.depth * .5) * (1 + this.gravityEnergy * .9);
                    const spin = influence * (.009 + 2 / Math.max(40, distance)) * (1 + this.gravityEnergy * .35);
                    const angle = Math.atan2(dy, dx) + spin * step;
                    const radius = distance - pull * step;
                    if (radius < 18) {
                        // Recycle swallowed stars at the edge of the field. Population stays bounded.
                        const birthAngle = Math.random() * Math.PI * 2;
                        const birthRadius = this.gravityRadius * (.85 + Math.random() * .4);
                        star.x = this.mouse.x + Math.cos(birthAngle) * birthRadius - this.offset.x * star.depth;
                        star.y = this.mouse.y + Math.sin(birthAngle) * birthRadius - this.offset.y * star.depth;
                        star.life = 0;
                        this.captured++;
                        continue;
                    }
                    x = this.mouse.x + Math.cos(angle) * radius;
                    y = this.mouse.y + Math.sin(angle) * radius;
                    star.x = x - this.offset.x * star.depth;
                    star.y = y - this.offset.y * star.depth;
                    light = influence * .55;
                    if (influence > .05) {
                        const trail = 7;
                        const midAngle = angle - spin * trail / 2;
                        const tailAngle = angle - spin * trail;
                        this.ctx.beginPath();
                        this.ctx.moveTo(x, y);
                        this.ctx.quadraticCurveTo(
                            this.mouse.x + Math.cos(midAngle) * (radius + pull * trail / 2),
                            this.mouse.y + Math.sin(midAngle) * (radius + pull * trail / 2),
                            this.mouse.x + Math.cos(tailAngle) * (radius + pull * trail),
                            this.mouse.y + Math.sin(tailAngle) * (radius + pull * trail));
                        this.ctx.lineWidth = .55 + star.depth * .7;
                        this.ctx.strokeStyle = `rgba(${this.starlight}, ${influence * .65 * star.life})`;
                        this.ctx.stroke();
                    }
                }
            }
            for (const ripple of this.ripples) {
                const distance = Math.hypot(x - ripple.x, y - ripple.y);
                light += Math.max(0, 1 - Math.abs(distance - ripple.radius) / 75) * ripple.alpha;
            }
            const alpha = Math.min(1, (.62 + star.depth * .35) * shimmer + light) * star.life;
            const color = star.layer === 0 ? this.accent : this.starlight;
            if (star.layer === 2 && this.starGlow) {
                const radius = star.size * 8;
                this.ctx.globalAlpha = alpha;
                this.ctx.drawImage(this.starGlow, x - radius, y - radius, radius * 2, radius * 2);
                this.ctx.globalAlpha = 1;
            }
            this.ctx.fillStyle = `rgba(${color}, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
            if (star.glint) {
                const length = star.size * (3 + shimmer);
                this.ctx.strokeStyle = `rgba(${color}, ${alpha * .3})`;
                this.ctx.lineWidth = .5;
                this.ctx.beginPath();
                this.ctx.moveTo(x - length, y);
                this.ctx.lineTo(x + length, y);
                this.ctx.moveTo(x, y - length);
                this.ctx.lineTo(x, y + length);
                this.ctx.stroke();
            }
        }
        if (interactive) this.drawGravityWell();
        if (!this.isReducedMotion) this.animationFrame = requestAnimationFrame(next => this.animate(next));
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
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest('a[data-link]');
    if (link && (link.hasAttribute('download') || (link.target && link.target !== '_self'))) return;
    if (link) {
        const url = new URL(link.href);
        if (url.origin === window.location.origin && !url.hash) {
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
    if (['https:', 'http:'].includes(url.protocol) && url.origin !== window.location.origin) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
});

window.addEventListener('popstate', router);

document.addEventListener('DOMContentLoaded', () => {
    // The shared <base> makes bare hashes point home; skip content locally instead.
    document.querySelector('.skip-link')?.addEventListener('click', event => {
        event.preventDefault();
        const main = document.getElementById('app-root');
        main.focus({ preventScroll: true });
        main.scrollIntoView();
    });
    new QuantumWeb('bg-canvas');
    const connectSculpture = initHomeIntent();
    // Decorative enhancement is isolated from navigation and the enquiry form.
    import('./hero-sculpture.js?v=20261008f')
        .then(({ initHeroSculpture, initServiceLight }) => { connectSculpture?.(initHeroSculpture()); initServiceLight(); })
        .catch(() => { /* Keep the static sculpture if enhancement is unavailable. */ });
    initCursor();
    initThemeSwitcher();
    initLanguageSwitcher();
    initMagnetic();
    initHealthCheck();
    router();
});
