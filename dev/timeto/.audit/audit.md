# Time Left To — design audit and redesign notes

Date: 10 July 2026

## Scope

Combined UX, visual, responsive, and screenshot-based accessibility review of the access screen and the renewals/payments dashboard.

## User goal

See what needs attention next, understand urgency at a glance, and find a specific renewal or payment without scanning the entire page.

## Captured flow

1. Access screen — healthy but visually generic and low-context.
2. Renewals dashboard on desktop — functional, but every item had similar weight and the long feed had no quick navigation.
3. Renewals dashboard on mobile — usable cards, but the header collapsed into a narrow multi-line stack and summary pills competed for space.
4. Redesigned dashboard on desktop — clear next-deadline priority, overview metrics, three-column renewal layout, and compact controls.
5. Redesigned dashboard on mobile — stable single-column reflow with no horizontal page overflow.
6. Redesigned renewals content — readable card hierarchy, status labels, semantic progress bars, and full names without forced truncation.
7. Redesigned access screen — clearer context, stronger focus state, and a more deliberate private-dashboard presentation.

## Main findings

- The original page had strong urgency colors and useful groupings, but no overview of what mattered most.
- Renewals and payments shared one long page, increasing scanning effort.
- Search and urgency filters were missing.
- The original mobile header wrapped into a narrow stack and used valuable horizontal space for summary pills.
- Some muted text and tiny labels were visually weak.
- Screenshot evidence cannot confirm full keyboard, screen-reader, or WCAG compliance.

## Changes made

- Added a next-deadline hero and summary metrics.
- Added working Renewals and Payments views.
- Added working search and urgency filters.
- Rebuilt the responsive header and dashboard grid.
- Refined status color use, spacing, typography, focus states, and access-screen copy.
- Added semantic headings, button pressed states, labelled controls, progressbar semantics, and reduced-motion support.
- Added support for entries whose expiry is set to “never”.

## Evidence

- [01 — original access screen](01-lock-screen.png)
- [02 — original desktop dashboard](02-current-dashboard.png)
- [03 — original mobile dashboard](03-current-mobile.png)
- [04 — redesigned desktop dashboard](04-redesigned-dashboard.png)
- [05 — redesigned mobile overview](05-redesigned-mobile.png)
- [06 — redesigned mobile renewal cards](06-redesigned-mobile-content.png)
- [07 — redesigned access screen](07-redesigned-lock.png)

## Verification limits

The page was checked through browser rendering, DOM structure, the unlock flow, search, filters, view switching, payment calculations, console output, and responsive overflow. A dedicated assistive-technology pass and automated WCAG contrast audit were not run.
