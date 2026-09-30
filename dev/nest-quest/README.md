# Nest & Quest

A standalone English/Bulgarian budgeting RPG in the company’s Games & Fun hub.
The landing page is `/dev/nest-quest/`; the game is `play.html`; a separate sample
adventure is `play.html?demo=1`. `privacy.html` explains saves and removal.

## The game

The game has one Adventure page, led by a full Willowmere scene and a large,
interactive Ember. A compact goal display shows the fund, target, and progress.
Income and expense actions open a native entry dialog on desktop or a bottom
sheet on mobile. Expense entry needs only an amount and a tap on one of eleven
visual categories. Date and note sit under optional details; new entries default
to today even when the history is filtered to another month. A fixed mobile dock
keeps both actions within reach. Editable history and monthly totals are in the
collapsed money trail, keeping the main view focused on the adventure.

Choose a suggested goal or set a custom name and target. Suggestions are a new
car (30,000), a wedding (50,000), a new home (100,000), a safety fund (10,000),
and a dream trip (2,000), in the adventure's chosen currency. Every suggestion
can be edited; the amounts are examples rather than financial recommendations.

The fund equals opening money plus all recorded income minus all recorded
expenses. Every expense category counts. Enter only money belonging to this
fund, and do not include already recorded income in the opening amount. The
goal carries across months; the month selector filters summaries and history
without resetting the fund. Editing or deleting an entry recalculates the fund
and the adventure immediately. Changing the goal keeps the existing entries.

Every increase or decrease prompts an animated response from Ember, changes the
visible map and path, and moves a route marker forward or back. Ember remains
large in the foreground rather than moving between tiny map positions. Six
checkpoints open at 0%, 10%, 25%, 50%, 75%, and 100% of the target: camp, lantern village,
bridge, forest, Princess Iris, and sanctuary. Spending below a checkpoint closes
it again. Ember grows from the young form into an adventurer at 25%, then a
guardian at 75%; falling below those amounts also reverses the form. Tapping
Ember gives a greeting. There are no separate care, experience, shop, or manual
quest-claim gates in the current interface.

Dated entries support eleven expense categories, edits and confirmed deletion,
monthly CSV export, and JSON backup/restore. All calculations use integer minor
units. One adventure has one fixed currency (EUR, USD, GBP, or BGN), without
conversion. Negative and over-target funds retain their actual amount while the
progress bar stays between 0% and 100%. Spending prompts a gentle response,
without treating ordinary life costs as moral failure.

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
- Save schema version 2 adds the goal. Existing version 1 saves migrate without
  changing their entries, metadata, or revision; the player then chooses a goal.
  Earlier savings-transfer entries remain editable in history but are neutral
  to the fund, preventing the same money from being counted twice. Old plans,
  story choices, care dates, and rewards remain in the save for compatibility;
  they do not gate the current adventure.
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

Run the automated checks and browser QA for each release. Goal checks cover
preset amounts, fund arithmetic across months and categories, neutral legacy
transfers, reversible checkpoints and forms, edits/deletion, negative and
over-target balances, and lossless migration. Existing model and repository
checks cover amount/date validation, imports, CSV escaping, conditional save
conflicts, lost responses, read failures, and cloud removal.

Browser QA must verify the single-page entry loop, visible responses in both
directions, every checkpoint and form boundary, keyboard interaction, reduced
motion, and English/Bulgarian mobile and desktop layouts. Verify category taps,
amount entry, optional details, today's default date, native dialog focus, the
mobile dock, and collapsed history. Recheck backups and local-save recovery after
changing the schema. Local validation passed 37 core checks and 69 play-through
assertions covering exact amounts, category tiles and sheets, draft preservation,
reversible forms and goal completion, dated edits/deletion, backups, migration,
and reduced motion. Sixty EN/BG layout cases passed at 320, 390, 768, and
1440 pixels, including short viewports, entry sheets, expanded history, and
maximum goal values. Production verification is a separate release gate: check
the exact Pages revision, public bytes, and live account round trips.

Use fictional entries and dedicated temporary accounts for account QA, without
email invitations. Verify real Cognito sign-in and first-password setup, real S3
write/read and reload, account switching, logout isolation, and conditional-write
conflicts. Clean up temporary accounts, identities, and all their object versions
after live release verification. Never put test credentials, tokens, identity IDs,
or personal budget records in this repo.

## Design research

Reviewed on 2026-09-30: [Habitica](https://habitica.com/static/home) for real-life
actions and RPG progression; [Finch](https://finchcare.com/) for a gentle companion
loop; and [Hunter Vault](https://huntervault.app/blog/how-to-gamify-your-finances/)
for savings quests and visible financial progress. The character, world artwork,
story, interface, and code here are original. No other product’s assets are reused.
