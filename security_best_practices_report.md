# Public website security and QA review

Reviewed 2026-09-10. Scope: the main public SPA, its generated route shells, contact delivery code, and the associated Terraform trust boundary. These fixes are local and unpublished. Portal authentication, independent `/dev/` applications, and deployed AWS policies were not comprehensively audited.

## Result

Local security and usability fixes are complete and regression checks pass. Two infrastructure findings remain open. This is a focused source/browser review, not a penetration-test certification or an end-to-end delivery verification.

## Security findings

### SEC-01 · Medium · Open: anonymous inbox uploads lack server-enforced abuse controls

**Evidence:** [backend/iam.tf:144](backend/iam.tf#L144) grants guest `s3:PutObject` on `inbox/new/*`; [script.js:101](script.js#L101) obtains guest credentials directly. The repository contains no server-side size, schema, or submission-rate enforcement for this path.

**Impact:** an attacker can bypass the contact UI and write arbitrary objects into the inbox, creating spam and storage/request costs. Write-only permission limits reading but does not prevent repeated uploads or replacement of a known object key. This finding is based on checked-in configuration; deployed IAM was not queried or abuse-tested.

**Local mitigation:** field limits, whitespace validation, a submission guard, a shared 20-second request deadline, and UUID object keys improve ordinary usage. They are not an abuse boundary.

**Required resolution:** move submission behind a rate-limited endpoint that validates allowed fields, lengths, content type, and total body size before writing. Remove direct guest write access when the frontend is migrated. A constrained signed upload is another option, but its issuance endpoint also needs validation and abuse controls. AWS documents [POST policy size constraints](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html) and [replacement of existing keys on upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html).

This requires coordinated AWS and frontend deployment; no infrastructure was changed. The existing 90-day current-object expiry is not proof of complete erasure: the bucket has versioning and no noncurrent-version expiry in the inbox rule.

### SEC-02 · Medium · Open: security headers are not active on the observed live response

**Evidence:** `curl -sSI https://www.theprivilegedcompany.com/` returned HTTP 200 with `server: GitHub.com`, without `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` response headers. The checked-in [_headers:3](_headers#L3) configuration is not reflected in that response. The server's Date header was `Wed, 09 Sep 2026 21:57:10 GMT`.

**Impact:** the observed page lacks HTTP framing restrictions and MIME-sniffing protection. HTML meta tags cannot provide those protections. In particular, [MDN documents that frame-ancestors is unsupported in meta CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

**Local mitigation:** removed the ineffective meta directives so the markup no longer implies that those controls work. The remaining CSP still applies to scripts and other resource loads.

**Required resolution:** configure an edge/server that emits the intended response headers, including `Content-Security-Policy` with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`. Retain the public site's exact script hashes in any stricter HTTP script policy. Validate portal and independent-tool requirements separately before applying a site-wide policy. Then verify actual GET responses on the home page, contact page, and fallback routes. No host/DNS changes were made.

### SEC-03 · Low · Fixed locally: inline-script CSP was permissive and placed after boot scripts

**Evidence:** [index.html:5](index.html#L5), [404.html:5](404.html#L5), [scripts/sync-route-pages.mjs:70](scripts/sync-route-pages.mjs#L70).

The previous policy allowed arbitrary inline JavaScript and appeared below executable scripts. This weakened defense against an injection elsewhere; no exploitable injection was demonstrated.

The generator now computes SHA-256 allowances for existing inline blocks, removes `script-src 'unsafe-inline'`, and places the policy immediately after the charset declaration. All 12 shells are covered. Inline styles remain allowed because the current design uses fragment styles and dynamic styling. This is deliberate, not a fully strict CSP. See [MDN's CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP).

Run the generator after changing any inline script. Hash freshness and policy placement are regression-tested; the local browser loaded both languages/themes without console errors.

### SEC-04 · Low · Fixed locally: unbound contact form defaulted to GET

**Evidence:** [views/contact.html:19](views/contact.html#L19), [views/contact.html:93](views/contact.html#L93), [script.js:678](script.js#L678).

Opening the raw fragment or losing its JavaScript handler could otherwise submit entered personal details as URL query parameters. The form now declares POST and its submit button stays disabled until the handler is attached. The visible email address remains available. The normal SPA flow still uploads privately to S3; a successful upload does not send email.

## QA fixes

| ID | Fixed behavior | Evidence |
| --- | --- | --- |
| QA-01 | Prevent overlapping submissions; reject whitespace-only required fields; enforce visible field limits instead of silently truncating messages. | [script.js:583](script.js#L583), [views/contact.html:30](views/contact.html#L30) |
| QA-02 | Bound all contact network requests to one 20-second signal. Preserve input after failure and explain that the email fallback is a draft the visitor must send. A timeout does not prove the original upload failed. | [script.js:119](script.js#L119), [script.js:669](script.js#L669) |
| QA-03 | Match complete route paths; `/wrong/contact` now shows a noindex not-found page. Preserve legitimate trailing-slash and `index.html` routes. | [script.js:396](script.js#L396) |
| QA-04 | Preserve Ctrl/Cmd/Shift/Alt clicks, middle clicks, downloads, explicit targets, and hash navigation. Do not force email links into blank tabs. | [script.js:1715](script.js#L1715) |
| QA-05 | Failed route loads now show a translated, responsive error with a heading and retry button; loading has a 15-second deadline. | [script.js:434](script.js#L434) |
| QA-06 | Service tabs support arrows, Home/End, and a single keyboard tab stop. | [script.js:469](script.js#L469) |
| QA-07 | Cancel animation work when hidden, restart only one loop, follow live reduced-motion changes, and redraw static particles after resizing. | [script.js:1439](script.js#L1439) |
| QA-08 | Keep validation focus below the fixed header; improve placeholder contrast. | [styles.css:60](styles.css#L60), [views/contact.html:134](views/contact.html#L134) |
| QA-09 | Replace the pale light theme with amber backgrounds, peach surfaces, and burnt-orange controls. Core foreground and button color pairs meet 4.5:1 contrast. | [styles.css:36](styles.css#L36) |

## Validation and limits

- `node scripts/check-public-site.mjs`: passed. Exercises actual production handlers with mocked browser/network dependencies: routing races, offline fallback, link modifiers, form validation, duplicate sends, success/failure, shared timeout signal, signed-upload request shape, UUID keys, CSP hashes, cursor and animation lifecycle. Also checks privacy defaults and 20 palette contrast pairs. This does not validate AWS acceptance of signatures or permissions.
- Syntax checks for `script.js`, `translations.js`, and the route generator: passed.
- Route generator: completed; generated files and hash allowances checked.
- Browser: **88 checks**, all 11 public routes in EN/BG, light at 320/820 px and dark at 390/1440 px. No horizontal document overflow, duplicate visible H1s, or broken visible images found. Screenshots visually reviewed in the local browser.
- Browser interaction checks: required/invalid email validation, focus clearance under the header, keyboard service tabs, unknown-route noindex, and rejection of an HTML-like `service` query. No injected image appeared; service context stayed hidden. Console error output was empty during these checks.
- Trusted local route fragments supply HTML; the selected-service query uses an allowlist and text rendering. A targeted check of portal inbox rendering found `textContent` for brief fields; this was not a full portal audit.
- No real contact submissions, credential changes, AWS applies, deployments, commits, or pushes were performed. Mail-app launch behavior, long `mailto:` body compatibility, deployed inbox permissions/delivery, and other browser engines remain unverified. Palette contrast checks do not constitute a full WCAG audit.

Before release, resolve SEC-01/SEC-02, publish the complete regenerated shells and matching assets together, and verify real headers and an explicitly approved end-to-end brief delivery.
