# Mist of Atlas: World of Fog product audit

Date: 2026-07-10

## Scope

Combined UX and accessibility review of the public landing page at desktop and mobile widths, including the atlas mode controls, fog-of-war demo, mobile navigation, and launch call to action. The Flutter client and AWS Lambda sources received a lightweight structural and syntax review.

## Verdict

The landing page has a distinctive, credible visual system and demonstrates the product idea unusually well. The main conversion path was weakened by two download links that pointed nowhere, while the automatic demo rotation and mobile-menu state created avoidable accessibility problems. Those issues are fixed in the current implementation.

## Flow steps

1. **Landing and value proposition — Healthy.** The headline, map treatment, and restrained fantasy visual language communicate the core idea quickly. The primary action now accurately offers launch updates instead of implying an unavailable store download.
2. **Atlas mode demo — Healthy.** Solo, Party, and Treasure remain directly selectable. Automatic rotation was removed so a user's selection remains stable and no changing content requires a pause control.
3. **Fog-of-war interaction — Improved.** Pointer and touch behavior remain intact, and the map can now be focused and explored with the arrow keys.
4. **Launch conversion — Healthy interim state.** The dead iOS and Android links were replaced with honest private-beta status and working email actions for launch news or beta access. Real store links should replace these once releases exist.
5. **Mobile navigation — Healthy.** The menu now exposes `aria-expanded`, hides closed links from assistive technology, changes its accessible label, closes with Escape, and restores focus.

## Additional improvements completed

- Added a skip link and consistent visible keyboard focus.
- Added a polite status announcement for location feedback.
- Corrected the social preview image to use the Mist of Atlas artwork and its real dimensions.
- Corrected the web-app manifest identity, scope, theme colors, icon purpose, and icon dimensions.
- Reworked the service worker so page navigations prefer fresh content, same-origin assets refresh in the background, unrelated external map requests are not intercepted, and offline fallbacks remain available.
- Made the privacy-policy contact address actionable.
- Standardized user-visible naming across the website, Flutter app metadata, mobile and desktop platform labels, documentation, and infrastructure descriptions to **Mist of Atlas: World of Fog**.

## Remaining opportunities

- Split `AppController` (2,214 lines), `MapScreen` (1,570 lines), and the Terraform root module (1,347 lines) into feature-sized units before the next major feature cycle.
- Add widget/integration coverage for onboarding, location permission states, offline restore, map-mode switching, authentication, and landmark upload. The current test file is a solid utility/model suite but contains no `testWidgets` flow tests.
- Replace the email launch actions with real App Store, Google Play, or first-party signup links when those destinations are ready.

## Evidence limits

The screenshots support visual, responsive, interaction, and likely accessibility findings; they do not establish full WCAG compliance. Flutter analysis and tests could not run because the Flutter SDK is not installed in this environment. All 19 Python Lambda files compiled successfully in memory, and the modified JavaScript and manifest passed syntax validation.

## Captures

- `01-current-hero-desktop.png` — initial desktop hero
- `02-current-party-mode.png` — initial Party state
- `03-current-download.png` — initial dead-link download step
- `04-current-mobile.png` — initial mobile hero
- `05-current-mobile-menu.png` — initial mobile menu
- `06-improved-hero-desktop.png` — improved desktop hero
- `07-improved-launch.png` — improved launch step
- `08-improved-mobile.png` — improved mobile hero
- `09-improved-mobile-menu.png` — improved mobile menu
