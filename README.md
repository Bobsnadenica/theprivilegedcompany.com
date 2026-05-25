# ThePrivilegedCompany Next-Gen Portal

A sophisticated, data-informed "portal" built at the intersection of high-scale enterprise engineering and elite personal digital advisory. This repository houses the flagship digital presence for ThePrivilegedCompany, adhering to "The Studio" standard of Dark Mode Precision.

## 🏛 Architecture & Engineering

### 1. Vanilla SPA Router
The site operates as a custom-built Single Page Application (SPA) using **Modular ES6+ JavaScript** and the **HTML5 History API**. 
- **Zero Dependencies:** No frameworks (React, Vue, etc.) are used, ensuring absolute performance and zero layout shifts.
- **Cinematic Transitions:** Custom CSS-driven transitions handle view switching with high-end micro-interactions.
- **Dynamic View Loading:** Content is stored as modular HTML fragments in the `/views` directory and fetched on-demand.

### 2. Design System (Dark Mode Precision)
- **Visual Direction:** Deep charcoals (`#080808`), brushed metal accents, and surgical typography.
- **Typography:**
  - *Authority:* **Fraunces** (headers) for a premium, established feel.
  - *Logic:* **Manrope** (body/data) for clarity and technical precision.
- **CSS Variables:** A sophisticated variable system allows for instant "skinning" and consistent spacing throughout the portal.

### 3. Data-Informed Narrative
The portal is structured around three core pillars:
- **Engineering:** High-scale Cloud/AWS and Platform Architecture.
- **Intelligence (The Data Engine):** Empirical engineering driven by massive internal telemetry.
- **Resolution:** Elite personal IT advisory ("The Concierge") for high-net-worth individuals.

## 🚀 Deployment & Hosting

### GitHub Pages Optimization
The portal is optimized for static hosting on GitHub Pages:
- **Route Shells:** Static route folders such as `/contact/`, `/manifest/`, and `/who-are-we/` are generated from `index.html` with `node scripts/sync-route-pages.mjs` so GitHub Pages can return `200` for direct route refreshes.
- **SPA Fallback:** `404.html` remains as a fallback for truly unknown paths and routes them into the SPA not-found view.
- **Security Headers:** The `_headers` file is included for Cloudflare Pages and Netlify style hosts. GitHub Pages does not apply custom response headers from repository files, so HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy must be configured at the CDN/proxy layer when using GitHub Pages.
- **Contact Form:** The public contact form posts to FormSubmit for `contactus@theprivilegedcompany.com` and falls back to `mailto:` if the endpoint is blocked. The first production submission may require FormSubmit email verification.

## 📁 File Structure

```text
├── index.html          # SPA Shell & Global Layout
├── styles.css          # Design System & Design Tokens
├── script.js           # Custom SPA Router & Interactivity
├── views/              # Modular HTML View Fragments
│   ├── home.html       # The Hub
│   ├── data-engine.html # Empirical Engineering
│   ├── b2b.html        # Enterprise Solutions
│   ├── manifest.html   # Sovereign Capabilities
│   ├── personal-it.html # Private Advisory
│   ├── who-are-we.html  # Sovereign Pedigree
│   └── architecture.html # Interactive Canvas
├── scripts/
│   └── sync-route-pages.mjs # Regenerates GitHub Pages route shells
└── Tech Tools/         # Legacy/External Tool Suite (Linked)
```

## 🛠 Features
- **Architecture Canvas:** An interactive tool to visualize IT needs across Edge, Compute, Data, and Security layers.
- **Advanced SEO:** Integrated Schema.org JSON-LD using `ProfessionalService` and `SoftwareSourceCode` schemas.
- **Absolute Optimization:** Optimized for "Time to Interactive" and zero Layout Shift.

---
*Empirical Engineering. Absolute Resolution. © 2026 ThePrivilegedCompany.*
