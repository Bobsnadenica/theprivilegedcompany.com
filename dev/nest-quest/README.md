# Nest & Quest

A standalone English/Bulgarian budgeting RPG in the company’s Games & Fun hub.
The landing page is `/dev/nest-quest/`; the game is `play.html`; a separate sample
adventure is `play.html?demo=1`. `privacy.html` explains saves and removal.

## The game

Ember is an original fox-dragon companion with three illustrated stages. A
six-chapter monthly expedition restores Willowmere, rescues Princess Iris, and
opens a sanctuary. Kind and daring choices produce different journal outcomes.
Logging days, daily care, and claimed chapters earn experience and fictional
coins. Coins buy decorations, with no real-money purchases.

Budgeting supports income, expenses, and explicit savings transfers; dated
entries; eleven spending categories; editable essential/flexible classification;
monthly goals and limits; edits and confirmed deletion; category charts; JSON
backup/restore; and monthly CSV export. All calculations use integer minor units.
One adventure has one currency (EUR, USD, GBP, or BGN), without conversion.

Unspent income is not treated as savings. Automatic flexible limits equal
income minus recorded essentials minus the savings goal, floored at zero.
Users may choose a manual limit. Above-plan spending or a negative available
balance brings rain and a recovery message; it does not remove chapters, health,
experience, or the companion. Daily rewards cannot be claimed twice on a date.
Correcting financial records never removes earned game rewards. A new month
starts a new expedition while companion growth, care, and the journal remain.

This is a manual personal tracker. The game does not access banks, move money,
send entries to AI/analytics, or verify the amounts someone enters.

## Development and publication

```sh
cd dev/nest-quest
npm ci
npm run check
npm run dev
```

Open `http://localhost:5173/dev/nest-quest/` (the existing bucket allows this
origin). Vite serves the existing public `/portal/config.js` during development.
Do not run two preview servers on the same port.

`src/` contains the three HTML entries, styles, UI, translations, story, model,
and optional account module. Vite builds into ignored `dist/`; `scripts/build.mjs`
copies the tested HTML, hashed assets, and artwork to this directory’s deployable
root. Those root files are deliberately committed for GitHub Pages. The AWS SDK
is a lazy self-hosted chunk; guest play makes no AWS requests.

`art-source/` preserves the original generated PNGs and exact prompts from the
built-in imagegen tool. `scripts/prepare-art.py` packages the character columns
and map as WebP with Pillow, preserving the character alpha. The deployed art
lives in `art/`, with packaging inputs in `public/art/`. No externally purchased
assets or new paid infrastructure are required.

Before release run the game checks, portal checks/build if its integration
changes, root `scripts/sync-route-pages.mjs`, root `scripts/check-public-site.mjs`,
and `git diff --check`. Commit the intended source and generated output. Wait for
GitHub Pages, compare changed public files to the tested bytes, and inspect the
live landing page and game at mobile and desktop widths.

## Saves and account boundaries

- Local adventures use `nestquest:local:v1` in localStorage. Demo adventures use
  a separate sessionStorage key. Corrupt or unsupported saves are preserved for
  original-file export until the player explicitly resets them.
- Accounts use the company’s existing Cognito SRP login, first-password challenge,
  public config, Identity Pool, and private bucket. Existing accounts are provided
  by the company; this game does not add self-registration.
- The game reads/writes only `users/<token-email>/.nestquest/save-v1.json`. It never
  reads portal Budget or lists personal files. The portal’s Files view hides this
  application document. Current deployed IAM permissions and CORS cover the key.
- Connecting reads the cloud copy, then asks the player to continue it or use the
  open device adventure. Both copies remain untouched until that choice.
- Active account device copies use sessionStorage, scoped to the authenticated
  subject. Reload restores the enabled account save; logout removes its device
  cache and returns to the separate guest adventure. Pending changes require a
  backup/discard decision before sign-out.
- Saves use ETag/If-Match or If-None-Match. A different device’s update pauses
  saving and preserves the pending device copy. The player can export, reconnect,
  compare, and choose. Lost success responses are recognized by save revision.
  Local tabs also refuse to overwrite a changed local save silently.
- Removing the current cloud save uses the existing account permission. S3
  versioning retains older versions; this action is not full historical erasure.
  Account or complete historical removal goes through the company contact route.

## Validation

Node checks cover decimal amounts, dates, monthly isolation, essential overrides,
explicit savings, quest prerequisites and idempotency, growth, non-punitive
corrections, care streaks, invalid imports, CSV escaping, conditional conflicts,
lost responses, read failures, and cloud removal.

Browser QA uses fictional entries and dedicated temporary accounts, without
email invitations. It covers real Cognito sign-in and first-password setup,
real S3 write/read and reload, account switching, logout isolation, and a real
two-device conditional-write conflict. Temporary accounts, identities, and all
their object versions are cleaned up after live release verification. Never put
test credentials, tokens, identity IDs, or personal budget records in this repo.

## Design research

Reviewed on 2026-09-30: [Habitica](https://habitica.com/static/home) for real-life
actions and RPG progression; [Finch](https://finchcare.com/) for a gentle companion
loop; and [Hunter Vault](https://huntervault.app/blog/how-to-gamify-your-finances/)
for savings quests and visible financial progress. The character, world artwork,
story, interface, and code here are original. No other product’s assets are reused.
