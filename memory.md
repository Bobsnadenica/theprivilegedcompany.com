# Project memory

Last reviewed: **2026-09-06**. Source baseline: `77228f02` on the local checkout. This is a repository-backed handoff, not a guarantee of current production state. Read [README.md](README.md) for setup and the project map.

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

These are source-level findings, not fixes applied in this documentation task.

1. **Portal lists can silently omit objects after the first S3 page.** `portal/src/storage.js` calls `ListObjectsV2` once in both `listFiles()` and `listInbox()` and ignores continuation tokens. Implement pagination and verify a multi-page response before relying on large listings.
2. **Rapid route navigation can display stale content.** `script.js`'s async `router()` waits and fetches without a request sequence guard or abort controller. If an earlier route fetch resolves last, it can replace the newer route's DOM and metadata. Confirm with delayed responses, then guard stale navigations.
3. **Route matching accepts an arbitrary leading path.** `getRouteKey()` considers only the last nonempty segment after dropping `index.html` segments. For example, `/anything/contact` is treated as contact. Match the whole normalized path if only declared routes should resolve.
4. **Subproject documentation has drifted.** `portal/README.md` still describes `private/<identity-id>/`; implementation uses `users/<email>/`. `backend/README.md` omits the guest contact-inbox flow and suggests bucket contents may block destruction, whereas `force_destroy = true` is configured. These nested guides were left unchanged in this task; the root README now describes the code accurately.
5. **Routing metadata has multiple sources.** Route definitions and descriptions are duplicated in `script.js` and `scripts/sync-route-pages.mjs`; the services description already differs. Shell synchronization alone cannot catch that semantic drift. Consider sharing route metadata.
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

Not performed: browser visual/interaction QA, production checks, contact submission, authenticated portal actions, AWS/Terraform deployment or plan, dependency installation, subproject builds or full test suites. No application code was changed, published, committed or pushed during this review.
