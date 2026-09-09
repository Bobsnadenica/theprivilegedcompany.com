# ThePrivilegedCompany website

The company website presents app and website development, automation, technical SEO, AI tools, cloud engineering, training, and private IT advisory. Its main call to action is “Start a brief.” This repository also contains a client budget and file portal, AWS infrastructure, and independent tools and experiments.

This guide was updated on **2026-09-08** for the public-site polish, based on commit `a5437d15` plus the local changes. See [memory.md](memory.md) for durable project context, review findings, and things to verify before future changes.

## Run the public website locally

From the repository root:

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://localhost:5173/`. The public website has no package installation or build step. Serve it over HTTP; opening HTML through `file://` does not support its routing and fragment loading correctly. The configured S3 CORS origins include `http://localhost:5173`, but not `http://127.0.0.1:5173`.

**The root `run.sh` is a Git publishing shortcut:** it stages everything, commits, and pushes. It does not start a development server.

The basic Python server serves existing route directories but does not reproduce GitHub Pages' custom 404 fallback. Contact submission uses the configured AWS backend even from localhost; there is no separate local inbox configured.

## Repository map

| Location | Responsibility |
| --- | --- |
| `index.html` | Shared shell, inline home content, navigation/footer, SEO metadata, diagnostics UI and embedded probe script |
| `script.js` | SPA routing, translations, theme controls, contact delivery, service selection, diagnostics, animations and architecture interactions |
| `styles.css` | Shared design tokens, layout, responsiveness, motion and accessibility styles |
| `translations.js` | English/Bulgarian language metadata and Bulgarian text/attribute translations |
| `views/` | Ten route fragments plus the not-found fragment; home is embedded in `index.html` |
| `scripts/sync-route-pages.mjs` | Generates ten static route shells from `index.html` with route-specific head metadata |
| `manifest/`, `contact/`, other route folders | Generated `index.html` files for direct static-host requests |
| `portal/` | Separate Vite app and committed browser build for Cognito login, budget tracking, personal files and the admin inbox |
| `backend/` | Terraform for the portal and public contact inbox: Cognito, IAM and S3 |
| `backend/shorturl/` | Independent Terraform stack and Lambda for short links |
| `dev/` | Tool hub and independent projects with their own runtimes/build conventions |
| `share/` | Static sharing entry pages |
| `assets/` | Company logos and showcase images |
| `.github/workflows/refresh-trading-dashboard.yml` | Trading snapshot refresh, validation and automated data commits |

## Public website architecture

The main site uses vanilla JavaScript ES modules, CSS and the History API. Links marked `data-link` navigate within the SPA. The home view is already in the shell; other pages are fetched from `views/` and inserted into `#dynamic-view`. The router then updates metadata, applies translations, and initializes page interactions.

| Route | Content |
| --- | --- |
| `/` | Home: “Build Anything” |
| `/manifest` | Services (not a PWA manifest) |
| `/who-are-we` | Company introduction |
| `/data-engine` | Data and intelligence |
| `/b2b` | Business engineering |
| `/personal-it` | Private IT advisory |
| `/architecture` | Interactive architecture planning |
| `/privacy` | Privacy information |
| `/terms` | Engagement terms |
| `/faq` | Frequently asked questions |
| `/contact` | Project brief form |

Unknown paths use `views/not-found.html`. On GitHub Pages, `404.html` redirects through `/?/…`, and the shell restores the requested URL before routing. The generated route pages contain the shared home shell, not prerendered route content; JavaScript still loads the relevant fragment.

The default design uses near-black backgrounds and orange accents; light mode uses warm ivory and copper. Fraunces is the display font and Manrope the body font, loaded from Google Fonts. Theme and language preferences use `tpc-theme` and `tpc-language` in localStorage. English is the language default; Bulgarian translations are keyed by normalized English copy, so copy edits may require translation updates.

Features include a canvas background, animated text/cursor interactions, a services-to-contact selection flow, architecture layer selection, and website diagnostics. Styles include keyboard focus indicators, a skip link, and reduced-motion handling. These are implementation features, not a claim of audited accessibility or performance.

## Contact briefs and client portal

The public form obtains temporary guest credentials from Cognito Identity and signs an S3 upload using WebCrypto/SigV4. It writes JSON to `inbox/new/` in the configured bucket. Successful submission does **not** send email. Failed delivery opens a `mailto:` fallback addressed to `contactus@theprivilegedcompany.com`.

The portal authenticates through a Cognito User Pool, including first-login password changes, then obtains temporary credentials through an Identity Pool. Its AWS SDK is bundled locally. IAM scopes personal files to `users/<email>/`; inbox permissions are gated by the configured admin email principal tag. Admins read new briefs and archive them by copying to `inbox/done/` and deleting the original.

Budget is the portal's default screen: income/expenses, custom categories, monthly or all-time totals, separate category pie charts, editing/deletion and CSV export. EUR, USD, GBP and BGN remain separate. The private ledger lives at `users/<email>/.budget/ledger-v1.json`, with conditional writes to protect concurrent device edits. Saving requires connectivity; failed saves retain the current form. See the [portal guide](portal/README.md) for storage behavior and validation limits.

The Terraform defaults use `eu-west-1` and `theprivilegedcompany-bucket`. `portal/config.js` is generated from Terraform and contains public client identifiers. The public site's `inboxConfig` is separately hardcoded in `script.js`; keep the two aligned when infrastructure changes.

For portal work:

```sh
cd portal
npm ci
cp config.js src/config.js  # local Vite development config
npm run dev
```

To rebuild the portal from that directory:

```sh
npm run build
```

Vite uses `portal/src/` as its root and emits `portal/index.html` and `portal/assets/`. Those build artifacts are committed for static hosting. See [portal/README.md](portal/README.md) and [backend/README.md](backend/README.md) for additional setup; known outdated statements in those documents are recorded in [memory.md](memory.md).

## Hosting and change workflow

The repository is organized for GitHub Pages at `www.theprivilegedcompany.com`, with `CNAME` and `.nojekyll`. Actual Pages settings and current production deployment were not inspected during this review. `_headers` and `_redirects` are configurations for compatible alternative hosts; they do not configure GitHub Pages response headers.

After changing the shared shell or generator metadata:

```sh
node scripts/sync-route-pages.mjs
```

Commit the regenerated route pages alongside their source changes. Edit `index.html` rather than individual generated shells. When adding a route, update the router, its fragment, the generator's route metadata, navigation as appropriate, and `sitemap.xml`. Metadata is duplicated between the router and generator, so check both. Shared asset version strings occur in `index.html` and `script.js`; keep references aligned when changing them and regenerate the shells.

For public-site changes, check direct route loading, navigation and Back/Forward, both languages, both themes, mobile layout, keyboard access, and reduced-motion behavior. There is no root package/test runner. Run each subproject's own checks when working in it.

`robots.txt` disallows `/dev/` except `/dev/bg/`. The root `sw.js` and `service-worker.js` unregister themselves and reload controlled windows; they are legacy service-worker retirement scripts, not an offline-cache implementation.

## Public-site polish (September 2026)

The current structure, service catalog, showcase links, fonts, themes, canvas, cursor, and diagnostics are retained. English and Bulgarian copy now uses clearer descriptions of the work, and Privacy/FAQ copy matches the S3 inbox implementation. All public route titles and descriptions have Bulgarian translations; the existing English-only Terms body remains unchanged.

Visual refinements cover type scale, line lengths, muted-text contrast, shared surface/control tokens, service cards, focus states, form labels, and mobile spacing. Architecture cards support Enter/Space and expose their selection with `aria-pressed`. Text scrambling respects reduced-motion preferences. The public asset version is `20260907a`.

Local browser checks and before/after screenshots are recorded in the ignored `output/playwright/` directory. The project memory records validation and outstanding content questions. These changes have not been deployed.

## Independent projects

This is an orientation list, not a full review of every app:

| Project | Purpose / setup reference |
| --- | --- |
| `dev/Tech Tools/`, `dev/converter/`, `dev/shorturl/` | Browser utilities, converters, and short-link UI; short-link infrastructure has a [separate guide](backend/shorturl/README.md) |
| `dev/Archive/` | Searchable links sourced from `Links.txt`; [guide](dev/Archive/README.md) |
| `dev/Trading/` | Static Asset Intel dashboard with Python-generated data; [guide](dev/Trading/README.md) |
| `dev/bg/` | Bulgarian open-data atlas using React/TypeScript/Vite and local data snapshots; [guide](dev/bg/README.md) |
| `dev/Cylinder/` | React/TypeScript tank-volume calculator; [guide](dev/Cylinder/README.md) |
| `dev/Candycrush/` | Sugarbox: The Hollow Orchard, an ASCII idle RPG; [guide](dev/Candycrush/README.md) |
| `dev/Russian-roulette/` | React/Three.js bluffing game; static solo demo plus Node/Socket.IO multiplayer; [guide](dev/Russian-roulette/README.md) |
| `dev/Mist_of_Atlas/game/FogMap/` | Mist of Atlas: World of Fog, a Flutter exploration app with its own AWS stack; [guide](dev/Mist_of_Atlas/game/FogMap/README.md) |
| `dev/aipost247/` | Python Facebook posting application; [guide](dev/aipost247/README.md) |
| `dev/cena/` | Spesti grocery-price comparison; [guide](dev/cena/README.md) |
| Other `dev/` folders | Additional games, experiments, personal pages and diagnostics tools |

The trading workflow is scheduled for 22:20 UTC daily, also supports manual runs and scoped pushes to `main`, validates output, and commits changed `dev/Trading/data/analysis.json`. Other projects are not covered by that workflow.
