# Nest & Quest

A standalone English/Bulgarian budgeting RPG in the company’s Games & Fun hub.
The landing page is `/dev/nest-quest/`; the game is `play.html`; a separate sample
adventure is `play.html?demo=1`. `privacy.html` explains saves and removal.

## The game

The game has two views on one route. Monthly budget opens first, with income,
spending, and category graphs for the selected month. Savings & net worth combines
a manual wealth summary, an interactive 3D village, Ember, and cash-based goal
cards. The illustrated Willowmere journey and its checkpoints remain available
in a closed disclosure below the cards. On phones, cash and investment actions
remain easy to reach; larger panels stack without opening another page.
Income and expense actions open a native entry dialog on desktop or a bottom
sheet on mobile. Expense entry needs only an amount and a category tap. Eleven
built-in categories can be extended with up to 30 named custom categories, each
with an icon and color. Date and note sit under optional details; new entries
default to today even when the history is filtered to another month. A fixed
mobile dock keeps both actions within reach. The money trail contains editable
history. The visible budget graph shows each category's
amount and share of that month's expenses, sorted largest first. Six categories
are visible initially; the rest expand on demand.

Choose up to 12 goals together, using suggestions or custom names and targets.
Suggestions are a new car (30,000), a wedding (50,000), a new home (100,000),
a safety fund (10,000), and a dream trip (2,000), in the adventure's chosen currency. Every suggestion
can be edited; the amounts are examples rather than financial recommendations.

Goal cash equals opening money plus all recorded income minus all recorded
expenses, minus investment purchases and plus investment sales. Every expense
category counts; investment trades remain separate transfers. Enter only cash belonging to this
fund, and do not include already recorded income in the opening amount. The
shared fund carries across months; the month selector filters summaries, category
graphs, and history without resetting the fund. Editing or deleting an entry
recalculates the fund and the adventure immediately. Changing goals keeps the
existing entries and fund balance.

Goal allocations divide the nonnegative fund in proportion to each target,
without counting the same money twice. For a car target of 30,000, wedding target
of 50,000, and home target of 100,000, a shared fund of 18,000 allocates 3,000,
5,000, and 10,000 respectively. Integer arithmetic distributes rounding cents
deterministically so allocated amounts sum exactly to the available fund.
Allocations stop at the combined target; any extra money appears as a surplus.
Negative funds retain their real balance while individual allocations stay at
zero. Progress, checkpoints, and Ember's form follow the combined funded ratio.

Cash progress prompts a response from Ember. In the illustrated journey, it changes
the map and path and moves
a route marker forward or back. Ember stays large beside the village. Six
checkpoints open at 0%, 10%, 25%, 50%, 75%, and 100% of the combined target: camp,
lantern village, bridge, forest, Princess Iris, and sanctuary. Spending below a
checkpoint closes it again. Ember grows from the young form into an adventurer
at 25%, then a guardian at 75%; falling below those amounts also reverses the form. Tapping
Ember gives a greeting. There are no separate care, experience, shop, or manual
quest-claim gates in the current interface.

Dated entries support built-in and custom expense categories, edits and confirmed
deletion, monthly CSV export, and JSON backup/restore. Used custom categories can
be renamed but cannot be removed while entries reference them. All calculations
use integer minor units. One adventure has one fixed currency (EUR, USD, GBP, or BGN),
without conversion. Negative and over-target funds retain their actual amount while the
progress bar stays between 0% and 100%. Spending prompts a gentle response,
without treating ordinary life costs as moral failure.

This is a manual personal tracker. The game does not access banks, move money,
send entries to AI/analytics, or verify the amounts someone enters.

Net worth equals cash plus the current marked value of holdings minus declared
debts. Stocks and crypto use manually entered quantities and unit prices in the
adventure's one currency; there are no quote requests or currency conversions.
Declaring something already owned adds its value without creating income or
changing cash. A new purchase records actual cash paid and the quantity acquired;
a sale records cash received and quantity sold. These linked transfers do not
enter monthly income, spending, or category totals. Current prices can be updated
independently of the amount originally paid.

Quantities and prices retain up to eight decimal places, including prices below
one cent. Each holding is rounded once to a displayed cent using exact integer
arithmetic; net worth sums those same displayed values. Goals use cash only,
so unrealized investment values never fill a goal. Optional debts record the
remaining amount owed and reduce net worth without recording a payment. Used
holdings stay in history; trade edits and removal recalculate cash and quantities
and reject changes that would leave a later sale uncovered. The collapsed
transfer list pages twelve records at a time.

The procedural Three.js village has twelve levels driven by net worth,
rather than the chosen target size. Level thresholds are
0, 100, 400, 900, 1,600, 2,500, 3,600, 4,900, 6,400, 8,100, 10,000, and 12,100
currency units. Each level adds a building and resident, from a meadow camp to
a hilltop castle. Villagers wander among gardens and market stalls; a waterwheel
turns beside the river and waterfall, and chimneys emit smoke.
Crossing a level builds or removes its additions, with a short visual response.
Drag horizontally to rotate the scene, zoom in or out, and reset the view.
Tapping a building focuses it and opens its reward card. A collapsed village
journal provides twelve keyboard-accessible blueprint buttons, including locked
rewards and their remaining amounts. Day and dusk change the lighting, lit
windows, and fireflies; this cosmetic choice does not affect finances. The next
reward and remaining amount stay visible.

Three.js loads only when the village approaches the viewport. Rendering uses
procedural geometry rather than purchased models or remote textures. Reduced
motion disables continuous animation; an unavailable WebGL renderer leaves the
illustrated fallback and budgeting controls available. Village state is derived
from the ledger, not stored separately. `src/village.js` mounts once and updates
its existing scene after ledger and language changes. Its lazy
`src/village-scene.js` renderer preserves geometry, camera position, and cosmetic
time across updates; `src/village-model.js` holds the pure level calculations.
Publication follows the separate validation and release procedure below.

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
- Save schema version 4 adds holdings, investment trades, and liabilities to
  the existing multiple goals, shared opening cash, and custom categories.
  Version 1 saves keep their entries, metadata, and revision
  and open with no goals. Version 2's single goal becomes a one-item goal list;
  its opening amount moves once into the shared fund. Version 3 adds empty wealth
  collections without changing its existing budget or goals. Migration does not change
  entries or the optimistic-lock revision, and does not rewrite the cloud on read.
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
preset amounts, multiple-goal allocation and rounding, fund arithmetic across
months and categories, neutral legacy transfers, reversible checkpoints and forms,
edits/deletion, negative and over-target balances, and lossless version 1/2 migration.
Category checks cover custom names, icons, colors, duplicates, and references.
Existing model and repository
checks cover amount/date validation, imports, CSV escaping, conditional save
conflicts, lost responses, read failures, and cloud removal.

Browser QA must verify the single-page entry loop, visible responses in both
directions, every checkpoint and form boundary, keyboard interaction, reduced
motion, and English/Bulgarian mobile and desktop layouts. Verify category taps,
amount entry, optional details, today's default date, native dialog focus, the
mobile dock, collapsed history, category graphs, multiple goals, and the village
at each level boundary. Recheck backups and local-save recovery after changing
the schema. The current build passed 84 automated checks, 116 English/Bulgarian
layout cases, 150 contrast checks, 150 scene assertions, and 10 real Cognito/S3
account assertions for version 4. The suite covers exact marks and transfers,
lossless migration, oversell rejection, unchanged monthly spending, escaped
renderers, and scene disposal when the active owner changes. Scene checks cover
all twelve levels, persistent updates, camera interaction, offscreen pause,
reduced motion, and WebGL fallback. Another 136 wealth-flow browser assertions
passed for holdings, transfers, debts, exact previews, recovery, and isolation.
Production verification is a separate release
gate: check the exact Pages revision, public bytes, and live account round trips.

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
