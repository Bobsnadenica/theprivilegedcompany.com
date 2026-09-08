# Project memory

Last updated: **2026-09-08**. Initial review baseline: `77228f02`; public-site polish baseline: `a5437d15` plus local changes. This is a repository-backed handoff, not a guarantee of current production state. Read [README.md](README.md) for setup and the project map.

## Purpose and working agreement

The user asked to review the website project, get to know it, and keep `memory.md` and a README of what is known. The existing `README.md` is retained as the canonical readme instead of creating a second file differing only by case.

Keep these two files current when subsequent work changes architecture, setup, deployment, or important behavior. Update facts in place, date new findings, and distinguish verified implementation from assumptions and proposed work. Do not store credentials, tokens, Terraform state, customer briefs, or personal file contents here. This request establishes documentation, not a scheduled maintenance job.

## Durable context

- The public brand is ThePrivilegedCompany / TPC. “Build Anything” and “From idea to shipped.” are current homepage messages. Services target both businesses and individuals; the main conversion is a project brief.
- This is a multi-project repository. The main site is framework-free, but that does not describe the portal or all of `dev/`. There is no root `package.json` or unified test/build command.
- Root `index.html` is the source shell and embeds the home view. There is no `views/home.html`. Ten public routes fetch fragments; `views/not-found.html` handles unknown routes.
- `script.js` currently centralizes routing, UI, translations, contact signing/delivery, diagnostics, and animated canvas behavior. It imports `translations.js` as an ES module.
- `<base href="/">` makes fragment and asset URLs resolve from the domain root. Hosting under a different base path needs coordinated changes.
- Route directory HTML files are generated copies of the shell with distinct head metadata. Regenerate with `node scripts/sync-route-pages.mjs`; do not hand-maintain them.
- English and Bulgarian use normalized English source text as translation keys. `tpc-language` and `tpc-theme` persist choices. Dark is black/orange; light is ivory/copper; fonts are Fraunces and Manrope.
- `dev/Tech Tools/` is the actual tool-suite location. The service “Learn Any Tech Topic” currently opens that suite; most service cards lead to contact with service context.
- The diagnostics UI includes a copyable shell probe embedded in `index.html`. It was read as source, not executed during this review.
- Root service workers are retirement scripts. Independent apps under `dev/` have their own PWA/runtime behavior.

## Data and infrastructure boundaries

- Public contact: browser → guest Cognito Identity credentials → SigV4 S3 PUT → `inbox/new/*.json`. The form has a honeypot and truncates submitted details to 20,000 characters. On failure it opens a mail client; successful delivery has no email notification in the reviewed code.
- Portal: Cognito SRP login / new-password challenge → Identity Pool credentials → S3 personal files. Tokens are persisted by the Cognito client in localStorage. Files are scoped to `users/<email>/` using an email principal tag, not identity-ID prefixes.
- Admin inbox access is gated by `var.admin_email` in IAM. The existence of a Cognito `admin` group alone is not the inbox permission check. “Mark done” copies a brief to `inbox/done/` and deletes its original.
- `backend/portal-config.tf` generates `portal/config.js`. The public form's `script.js` configuration is separate and must be updated if pool/bucket/region changes.
- `backend/s3.tf` enables private access controls, AES256 encryption, versioning and an inbox expiration rule after 90 days. It also sets `force_destroy = true`; destroying/replacing this bucket can delete stored files and versions.
- The configured CORS localhost origin is `http://localhost:5173`. Using another origin needs matching configuration for actual S3 requests.
- `backend/shorturl/` is a separate stack: API Gateway, Node 22 Lambda and DynamoDB, with a custom `go` subdomain. Creation/stats use an `x-create-key`; its value does not belong in documentation. DNS setup is described as manual in its README.
- Terraform state is described as local in the backend guide. No state, private tfvars, cloud account, DNS settings or live resources were inspected.

## Review findings and follow-up work

These are source-level follow-ups. The public-site polish addresses copy and styling; backend and routing behavior findings remain open unless noted below.

1. **Portal lists can silently omit objects after the first S3 page.** `portal/src/storage.js` calls `ListObjectsV2` once in both `listFiles()` and `listInbox()` and ignores continuation tokens. Implement pagination and verify a multi-page response before relying on large listings.
2. **Rapid route navigation can display stale content.** `script.js`'s async `router()` waits and fetches without a request sequence guard or abort controller. If an earlier route fetch resolves last, it can replace the newer route's DOM and metadata. Confirm with delayed responses, then guard stale navigations.
3. **Route matching accepts an arbitrary leading path.** `getRouteKey()` considers only the last nonempty segment after dropping `index.html` segments. For example, `/anything/contact` is treated as contact. Match the whole normalized path if only declared routes should resolve.
4. **Subproject documentation has drifted.** `portal/README.md` still describes `private/<identity-id>/`; implementation uses `users/<email>/`. `backend/README.md` omits the guest contact-inbox flow and suggests bucket contents may block destruction, whereas `force_destroy = true` is configured. These nested guides were left unchanged in this task; the root README now describes the code accurately.
5. **Routing metadata has multiple sources.** Route definitions and descriptions are duplicated in `script.js` and `scripts/sync-route-pages.mjs`; the services-description mismatch was corrected in the September polish, but duplication remains. Shell synchronization alone cannot catch future semantic drift. Consider sharing route metadata.
6. **Inbox retention needs clarification if a strict deletion deadline is intended.** The bucket is versioned and the inbox lifecycle rule has current-object expiration but no noncurrent-version expiration. Archiving/deleting and the 90-day rule should not be described as guaranteed removal of all historical content.

## Conventions and practical cautions

- Root `run.sh` runs `git add .`, commit, and push. Never use it as a preview command.
- Public-site edits generally affect the root shell, CSS, JS, translation pack and/or a view fragment. Preserve generated-shell synchronization after shell edits.
- Portal edits belong in `portal/src/`; `npm run build` deletes/recreates portal assets and emits into `portal/`. Commit intended generated artifacts with source changes.
- Subprojects have independent scripts; for example `dev/bg`'s test command builds and synchronizes deploy output. Read the relevant package scripts before assuming tests are read-only.
- The repository is arranged for GitHub Pages branch/root publishing, but host/account settings have not been verified. Do not assume `_headers` or `_redirects` are active there.
- The homepage has inline scripts and a meta CSP; the portal's header configuration is separate. Check actual delivered headers before claiming production enforcement.
- Public marketing claims and subproject README feature/data counts were not independently validated. No measured performance or accessibility score is established by this review.

## Validation record

Completed on 2026-09-06:

- Read the root shell, router and supporting UI/contact logic, theme/translation implementation, route generator, deployment files, portal source and relevant Terraform.
- Mapped major `dev/` projects through their readmes and package files; this was orientation, not an exhaustive code review of those applications.
- Node syntax checks passed for `script.js`, `translations.js`, `scripts/sync-route-pages.mjs`, all three portal JS source modules (`main`, `cognito`, `storage`), and the short-link Lambda.
- Ran the route generator against a temporary copy of the shell and compared all ten outputs byte-for-byte with the committed route pages: no drift. All ten declared view fragments exist.
- Working tree was clean before the documentation edits.

The initial review did not include browser QA or application changes. The subsequent public-site polish and its validation are recorded below. Neither pass deployed, committed, or pushed changes.


## Public-site polish — 2026-09-08

User preference: preserve the existing page structure and service organization. Polish the current identity instead of redesigning the site: retain both themes, Fraunces/Manrope, canvas background, custom cursor, effects, diagnostics location, showcases, and all services. Keep portal/backend and independent tools outside this scope.

Implemented:

- Replaced inflated marketing descriptions with concrete English/Bulgarian copy. Kept “Build Anything,” “From idea to shipped.”, all 20 service heading identifiers, existing links, prices, and commercial terms.
- Updated Privacy and FAQ contact handling to describe private S3 inbox storage and the email-client fallback. No submission/backend behavior changed.
- Synchronized route descriptions between router and generator and completed Bulgarian translations for all 11 route titles/descriptions. The Terms body retains its existing `data-i18n-ignore` and remains English-only.
- Added shared radius, border and control-height tokens; refined type sizes, paragraph rhythm, surfaces, contrast and mobile controls. The contact heading has its own scale to fit Bulgarian in the desktop column.
- Added keyboard activation and selected/focus states for architecture cards. The text-scramble effect now respects reduced motion; normal motion and the custom cursor remain available.
- Regenerated all ten route shells. Shared asset version: `20260907a`.

Business facts still needing owner input (not invented or changed): the governing country/courts and liability-review placeholders in `views/terms.html`; the accuracy of existing Privacy assurances about isolated AI environments/private models; and the operating policy for deletion of historical inbox versions. The wording of existing legal commitments was preserved except for the requested factual contact-delivery correction.

Validation:

- Original and revised homepage/services/contact screenshots at 1440, 820 and 390 pixels, both themes; revised screenshots also cover Bulgarian. Files are local, ignored artifacts under `output/playwright/`.
- Initial route matrix: 11 routes × 3 viewports × 2 themes × 2 languages (132 page loads), with no JavaScript runtime errors. It identified the Bulgarian desktop contact-heading overflow, which was corrected. Follow-up checks covered all 12 contact viewport/theme/language combinations and five Bulgarian pages at 320 pixels (`qa-final.txt`). The 320-pixel audience-tab label needed a further spacing adjustment; `qa-small-mobile-recheck.txt` confirms both tabs fit with no document overflow.
- 34 browser interaction checks passed (`qa-interactions.txt`): all service destinations, audience tabs, Bulgarian contact context, language round trips, required-field/email validation, disabled styling, Back/Forward, theme persistence, four keyboard-operated architecture layers, skip link, diagnostics open/close, not-found/noindex behavior, normal/reduced motion and canvas/cursor preservation.
- No contact brief or other write request occurred during browser interaction checks. Non-GET/HEAD requests were blocked. Live AWS delivery and authenticated portal workflows were not tested.
- Route metadata parity and Bulgarian metadata coverage checks passed. Temporary generation confirmed all ten route shells match the shell source. JavaScript syntax and diff whitespace checks passed.
- The browser reports the pre-existing ignored `frame-ancestors` meta-CSP directive; response headers and live hosting configuration were outside this task. No performance score or comprehensive accessibility conformance claim is made.
