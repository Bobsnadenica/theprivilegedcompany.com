# Покрив Плюс website migration preview

Static copy of the public PokrivPlus website, captured on 4 November 2026. The
preview preserves the Bulgarian copy, layout, brand assets, blog pages, contact
details, and current form destination while adding reduced-motion support,
keyboard-accessible mobile navigation, a favicon, and compressed WebP images.

The pages are marked `noindex` while hosted under `/dev/`. The client's Google
Ads tag was left out so preview visits do not enter their campaign analytics.

The contact form retains the live FormSubmit destination from the source site
(`info@pokrivplus.com`). This static GitHub Pages copy does not include the
source site's `api/contact.php`; the existing browser code falls back to
FormSubmit. Do not change the production domain until the client verifies the
mailbox, form delivery, privacy notice, analytics, and DNS plan.

## Pages

- `index.html` — home and service enquiry form
- `blog/index.html` — article index
- `blog/remont-na-pokrivi-ceni-i-faktori/index.html`
- `blog/kak-da-razpoznaete-priznatsi-na-povreden-pokriv/index.html`
