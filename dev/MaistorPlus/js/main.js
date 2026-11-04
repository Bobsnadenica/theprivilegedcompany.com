(function () {
  "use strict";

  function isOnHomePage() {
    return !!document.getElementById("услуги");
  }

  function headerOffset() {
    const banner = document.querySelector(".top-marquee");
    const header = document.getElementById("site-header");
    return (banner?.offsetHeight || 0) + (header?.offsetHeight || 0) + 16;
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    if (isOnHomePage()) {
      history.pushState(null, "", "#" + id);
    }
    return true;
  }

  function parseHashLink(href) {
    if (!href || href === "#") return null;
    const hashIndex = href.indexOf("#");
    if (hashIndex === -1) return null;
    const path = href.slice(0, hashIndex);
    const id = decodeURIComponent(href.slice(hashIndex + 1));
    return id ? { path, id } : null;
  }

  function homeIndexHref() {
    const segments = window.location.pathname
      .replace(/\/index\.html$/, "")
      .split("/")
      .filter(Boolean);
    if (segments.length === 0) return "index.html";
    return "../".repeat(segments.length) + "index.html";
  }

  function closeMobileNav() {
    const nav = document.getElementById("mobile-nav");
    const iconMenu = document.getElementById("icon-menu");
    const iconClose = document.getElementById("icon-close");
    if (!nav) return;
    nav.classList.remove("is-open");
    nav.classList.add("hidden");
    iconMenu?.classList.remove("hidden");
    iconClose?.classList.add("hidden");
    document.getElementById("mobile-menu-toggle")?.setAttribute("aria-expanded", "false");
  }

  function initHashLinks() {
    document.querySelectorAll('a[href*="#"]').forEach((link) => {
      const href = link.getAttribute("href");
      const parsed = parseHashLink(href);
      if (!parsed) return;

      if (!isOnHomePage()) {
        if (!parsed.path || parsed.path === "." || parsed.path === "./") {
          link.setAttribute("href", homeIndexHref() + "#" + parsed.id);
        }
        return;
      }

      if (parsed.path && parsed.path !== "." && parsed.path !== "./") return;

      link.addEventListener("click", (e) => {
        if (!document.getElementById(parsed.id)) return;
        e.preventDefault();
        scrollToSection(parsed.id);
        closeMobileNav();
      });
    });

    if (isOnHomePage() && window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1));
      setTimeout(() => scrollToSection(id), 100);
    }
  }

  function initHeader() {
    const header = document.getElementById("site-header");
    const toggle = document.getElementById("mobile-menu-toggle");
    const nav = document.getElementById("mobile-nav");
    const iconMenu = document.getElementById("icon-menu");
    const iconClose = document.getElementById("icon-close");

    if (header) {
      window.addEventListener(
        "scroll",
        () => {
          header.classList.toggle("bg-primary/95", window.scrollY > 48);
          header.classList.toggle("bg-primary/80", window.scrollY <= 48);
        },
        { passive: true }
      );
    }

    toggle?.addEventListener("click", () => {
      const isHidden = nav.classList.contains("hidden");
      nav.classList.toggle("hidden", !isHidden);
      nav.classList.toggle("is-open", isHidden);
      iconMenu?.classList.toggle("hidden", isHidden);
      iconClose?.classList.toggle("hidden", !isHidden);
      toggle.setAttribute("aria-expanded", String(isHidden));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || nav?.classList.contains("hidden")) return;
      closeMobileNav();
      toggle?.focus();
    });

    nav?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMobileNav);
    });
  }

  function initFloatingUi() {
    const callBtn = document.getElementById("call-button");
    const backToTop = document.getElementById("back-to-top");
    const stickyCta = document.getElementById("sticky-cta");

    function update() {
      const y = window.scrollY;
      const sticky = y > 800;
      const showTop = y > 600;

      callBtn?.classList.toggle("is-hidden-ui", sticky);
      stickyCta?.classList.toggle("is-hidden-ui", !sticky);
      backToTop?.classList.toggle("is-hidden-ui", !showTop);

      if (backToTop) {
        backToTop.classList.toggle("bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]", sticky);
        backToTop.classList.toggle("bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]", !sticky);
        backToTop.classList.toggle("lg:bottom-4", !sticky);
      }
    }

    backToTop?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initAccordion() {
    document.querySelectorAll("[data-accordion]").forEach((root) => {
      const buttons = root.querySelectorAll("[data-accordion-trigger]");
      buttons.forEach((btn, index) => {
        btn.addEventListener("click", () => {
          const panel = root.querySelector(`[data-accordion-panel="${index}"]`);
          const isOpen = panel?.classList.contains("is-open");
          root.querySelectorAll("[data-accordion-panel]").forEach((p) => p.classList.remove("is-open"));
          root.querySelectorAll("[data-accordion-trigger]").forEach((b) => {
            b.setAttribute("aria-expanded", "false");
            b.querySelector("[data-chevron]")?.classList.remove("rotate-180");
          });
          if (!isOpen && panel) {
            panel.classList.add("is-open");
            btn.setAttribute("aria-expanded", "true");
            btn.querySelector("[data-chevron]")?.classList.add("rotate-180");
          }
        });
      });
    });
  }

  function animateCounter(el) {
    const target = Number(el.dataset.countTo || 0);
    const suffix = el.dataset.countSuffix || "";
    const duration = 2000;
    const start = performance.now();

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function initCounters() {
    document.querySelectorAll("[data-counter]").forEach((counter) => {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: "-100px" }
      );
      observer.observe(counter);
    });
  }

  function initTestimonials() {
    const root = document.getElementById("testimonials-carousel");
    if (!root || !window.SITE) return;

    const track = root.querySelector("[data-testimonials-track]");
    const prev = root.querySelector("[data-testimonials-prev]");
    const next = root.querySelector("[data-testimonials-next]");
    let index = 0;

    function perPage() {
      return window.innerWidth >= 768 ? 2 : 1;
    }

    function render() {
      const pp = perPage();
      const max = Math.max(0, SITE.testimonials.length - pp);
      index = Math.min(index, max);
      const items = SITE.testimonials.slice(index, index + pp);
      track.innerHTML = items
        .map(
          (t) => `
        <div class="relative min-w-0">
          <div class="rounded-2xl rounded-bl-none bg-white p-5 shadow-card sm:p-8">
            <p class="text-base leading-relaxed text-primary/80 sm:text-lg">"${t.text}"</p>
          </div>
          <div class="mt-4 flex items-center gap-4 sm:mt-6">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 ring-2 ring-accent sm:h-14 sm:w-14" aria-hidden="true">
              <svg class="h-6 w-6 fill-yellow-400 text-yellow-400 sm:h-7 sm:w-7" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <div class="min-w-0">
              <p class="truncate font-display font-semibold text-white">${t.name}</p>
              <p class="text-sm text-white/50">${t.city}</p>
            </div>
          </div>
        </div>`
        )
        .join("");
      if (prev) {
        prev.disabled = index === 0;
        prev.classList.toggle("opacity-30", index === 0);
      }
      if (next) {
        next.disabled = index >= max;
        next.classList.toggle("opacity-30", index >= max);
      }
    }

    prev?.addEventListener("click", () => {
      index = Math.max(0, index - 1);
      render();
    });
    next?.addEventListener("click", () => {
      index = Math.min(Math.max(0, SITE.testimonials.length - perPage()), index + 1);
      render();
    });
    window.addEventListener("resize", render);
    render();
  }

  function initContactForm() {
    const form = document.getElementById("contact-form");
    const success = document.getElementById("contact-success");
    const errorEl = document.getElementById("contact-error");
    const submitBtn = document.getElementById("contact-submit");
    if (!form || !success) return;

    async function submitViaPhp(formData) {
      const response = await fetch("./api/contact.php", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) return true;
      if (response.status === 404) return false;
      throw new Error(data.error || "Възникна грешка при изпращането.");
    }

    async function submitViaFormSubmit(formData) {
      const payload = {
        name: String(formData.get("name") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        message: String(formData.get("message") || "").trim(),
        _subject:
          "Ново запитване от pokrivplus.com — " +
          String(formData.get("name") || "").trim(),
        _template: "table",
        _captcha: "false",
      };

      if (payload.email) {
        payload._replyto = payload.email;
      }

      const endpoint =
        (window.SITE && SITE.contactFormEndpoint) ||
        "https://formsubmit.co/ajax/info@pokrivplus.com";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false) return true;
      throw new Error(
        data.message || "Възникна грешка при изпращането. Опитайте отново."
      );
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (form.querySelector('[name="_gotcha"]')?.value) return;

      if (errorEl) {
        errorEl.classList.add("hidden");
        errorEl.textContent = "";
      }

      const defaultLabel = submitBtn?.textContent || "Изпрати";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Изпращане...";
      }

      const formData = new FormData(form);

      try {
        let sent = false;

        try {
          sent = await submitViaPhp(formData);
        } catch (err) {
          if (!String(err.message || "").includes("Failed to fetch")) {
            throw err;
          }
        }

        if (!sent) {
          await submitViaFormSubmit(formData);
        }

        form.classList.add("hidden");
        success.classList.remove("hidden");
      } catch (err) {
        if (errorEl) {
          errorEl.textContent =
            err.message ||
            "Възникна грешка. Опитайте отново или се обадете на 0893 871 252.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = defaultLabel;
        }
      }
    });
  }

  function initCookieConsent() {
    const banner = document.getElementById("cookie-consent");
    if (!banner) return;
    if (localStorage.getItem("cookie-consent")) return;

    setTimeout(() => banner.classList.remove("is-hidden-ui"), 1500);

    banner.querySelector("[data-cookie-accept]")?.addEventListener("click", () => {
      localStorage.setItem("cookie-consent", "accepted");
      banner.classList.add("is-hidden-ui");
    });
    banner.querySelectorAll("[data-cookie-dismiss]").forEach((btn) => {
      btn.addEventListener("click", () => banner.classList.add("is-hidden-ui"));
    });
  }

  function initServiceCards() {
    document.querySelectorAll("[data-scroll-contact]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToSection("контакти");
      });
    });
  }

  function initRevealContent() {
    document.querySelectorAll("main [style]").forEach((el) => {
      const style = el.getAttribute("style") || "";
      if (/opacity:\s*0/.test(style)) {
        el.removeAttribute("style");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initRevealContent();
    initHashLinks();
    initHeader();
    initFloatingUi();
    initAccordion();
    initCounters();
    initTestimonials();
    initContactForm();
    initCookieConsent();
    initServiceCards();
  });
})();
