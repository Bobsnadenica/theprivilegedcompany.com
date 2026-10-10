# Price provider readiness

Checked **2026-10-03** against official provider documentation/terms and direct HTTP responses. This is a local implementation handoff, not confirmation of a licensed or deployed live-price service. No provider account, paid service, infrastructure, or outreach was created.

## Release status

`src/price-access.js` defaults to `{ crypto: false, stockEndpoint: '' }`. Unapproved providers return `providerRequired` without making a request. Keep both gates closed until the owner has a suitable agreement or written clarification. HTTP accessibility and CORS do not establish permission for public display.

Fictional sample mode works without network access or provider permission. The UI must clearly label its prices and exchange rates as samples. Manual holdings and prices remain usable; a failed refresh retains the saved values. The live-price feature remains unreleased pending provider access.

## Implemented client contract

```js
fetchHoldingPrices(holdings, currency, {
  signal,
  fetcher = globalThis.fetch,
  now = () => new Date(),
  access = PRICE_ACCESS,
  sample = false,
})
// => { updates: [{ id, expected, quote }], failures: { [holdingId]: errorKey } }
```

- Pass `wealthSummary(state).holdings` so validation uses current quantities after trades. `expected` binds each update to `holdingQuoteSignature` of the original local snapshot; the caller applies successful updates through `applyHoldingQuotes`.
- Network requests contain instrument identities and currencies only. Holding IDs, names, quantities, balances, and transaction history stay local. Provider secrets belong in a licensed server gateway, never frontend configuration or saves.
- Overall deadline: 10 seconds, with caller cancellation. Responses are bounded to 256 KiB. No retries; the app owns its cooldown. Identity mismatches, duplicate matches, invalid/nonpositive prices, stale data, and over-limit position values produce per-holding failures.
- Quote fields: `provider`, `price`, `sourcePrice`, `sourceCurrency`, `marketAt`, `fetchedAt`, `fxRate`, `fxDate`. Decimal conversion uses the wealth model's exact decimal helpers. Refreshing marks does not record income, spending, trades, or cash transfers.

## Candidate source and FX contracts

**CoinLore, after permission is resolved:** `GET https://api.coinlore.net/api/ticker/?id=90,80`. Batch unique numeric coin IDs; BTC is `90`, ETH is `80`. Catalogue: `https://api.coinlore.net/api/assets/`. Match ID and canonicalized safe symbol together, never symbol alone. Verified 200 responses with CORS `*`; ticker `price_usd` is a decimal string. It has no per-price source timestamp, so `marketAt` stays `null` and `fetchedAt` records retrieval time. Its [methodology](https://www.coinlore.com/methodology) describes typical 1–2 minute refreshes, with possible delays. Its [API documentation](https://www.coinlore.com/cryptocurrency-data-api) suggests approximately one request/second and no strict quota. These are reference prices, not guaranteed executable quotes.

**Licensed stock gateway:** a configured same-origin path or explicitly trusted HTTPS endpoint receives `POST { instruments: [{ id, symbol, currency }] }` and returns `{ quotes: [{ id, symbol, currency, price, marketAt }] }`. IDs are provider instrument IDs, not private holding IDs. Response identity must match all three requested fields. The gateway supplies the licensed source currency and actual quote timestamp/date; it must communicate any exchange delay in the UI/provider integration. Invalid, future, or over-seven-day-old source timestamps are rejected. No gateway has been provisioned.

**FX:** `GET https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP`, narrowed to needed currencies. The [official documentation](https://frankfurter.dev/) permits commercial API use subject to underlying provider terms, requires no key, and describes daily reference data rather than live trading rates. Verified 200/CORS `*`. Keep the returned observation date in `fxDate`; accept weekends/holidays, reject dates more than seven calendar days old or in the future. Same-currency quotes use rate `1` and the current UTC date.

Supported profile/source currencies are USD, EUR, GBP, and legacy BGN. BGN is converted through EUR at the official irrevocable **1 EUR = 1.95583 BGN** rate, not represented as a live FX quote. The ECB [confirms the conversion](https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260101~c830245e42.en.html) and [removed BGN from its current reference-rate list](https://www.ecb.europa.eu/services/using-our-site/technical-updates/html/ecb.technical_update251211.de.html). EUR↔BGN alone needs no FX request; other BGN conversions use the dated USD↔EUR reference.

## Permission findings

| Provider | Finding and primary evidence |
| --- | --- |
| CoinLore | API docs explicitly invite free business apps and dashboards. However, [general terms](https://www.coinlore.com/terms-of-use), updated December 21, 2025, restrict commercial copying/distribution without written consent and contain no clear API exception. Permission for this public valuation app is unresolved; ask for clarification rather than treating either page as conclusive. |
| Coinbase | [Market Data Terms](https://www.coinbase.com/legal/market_data), updated August 7, 2026, §2 limits use to personal/research/internal users; §3.2–3.3 require consent for outside display and currency/security valuation. Working keyless spot endpoints do not resolve this restriction. |
| Kraken | [EEA terms](https://www.kraken.com/legal/eea-terms), effective June 29, 2026, Part A §11.5 restrict distribution and third-party apps without written consent. Its [public ticker](https://docs.kraken.com/api-reference/market-data/get-ticker-information) works, but permission remains required. |
| CNBC | [Market-data terms](https://www.cnbc.com/market-data-terms-of-service/) restrict use to internal purposes and require permission for outside distribution. [Versant terms](https://www.versantmedia.com/terms) now govern CNBC. Do not integrate its undocumented working quote endpoint as a public feed. |
| CoinGecko | [Keyless API guidance](https://docs.coingecko.com/docs/keyless-public-api) excludes production workloads. [Pricing](https://www.coingecko.com/en/api/pricing) places commercial licensing on paid plans; obtain an appropriate agreement before public production use. |
| Stock providers | [Twelve Data terms](https://twelvedata.com/terms) restrict free commercial use/external display. [Alpha Vantage terms](https://www.alphavantage.co/terms_of_service/) restrict personal/noncommercial use; [support](https://www.alphavantage.co/support/) puts US real-time/delayed quotes on premium access. [Marketstack pricing](https://marketstack.com/pricing) makes free end-of-day data noncommercial. [FMP guidance](https://site.financialmodelingprep.com/de/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard) requires public-display licensing. |

No clearly permitted free public stock valuation feed was established among the checked sources. A delayed or closing-price feed with explicit public-app valuation rights would satisfy a lower-cost route; label its observation time and delay accurately. Do not substitute tokenized stock prices for ordinary shares.

## Unsent inquiry drafts

### CoinLore — consent / clarification

To: `contact@coinlore.com`

Subject: Clarification of free API rights for a public budgeting app

Hello CoinLore team,

We are building Nest & Quest, a free budgeting game at theprivilegedcompany.com. Users enter their own cryptocurrency quantities and click an Update prices button to estimate their holdings' value. We would request only selected coin IDs, display USD reference prices and derived portfolio totals, and provide clear CoinLore attribution. There is no trading, automated polling, bulk redistribution, or sale of API access.

Your API documentation invites business apps, while the general terms restrict commercial copying/distribution without written consent. Could you confirm in writing whether this use is permitted at no cost, including direct browser requests and retaining each user's last retrieved price locally or in their private account save? Please specify attribution, retention, rate limits, and any additional agreement required. We will keep the live integration disabled until this is resolved.

Thank you,
The Privileged Company

### Stock provider — no-cost delayed public-app rights

Suggested recipient: Twelve Data business/licensing team through its [official business pricing contact route](https://twelvedata.com/pricing-business).

Subject: No-cost delayed stock valuation data for a free public budgeting game

Hello,

We are building Nest & Quest, a free budgeting game at theprivilegedcompany.com. Users manually enter shares they own, then request a price update to estimate their personal portfolio value. A small initial set of US stocks/ETFs would be sufficient. End-of-day or delayed quotes are acceptable and would be clearly labelled with the source timestamp, currency, and delay.

Do you offer a no-cost allowance or written agreement that permits this public app to display quotes and derived user valuations, with a server-side key, attribution, and private retention of each user's last mark? Please specify instrument coverage, request limits, caching/retention, and display licensing obligations. We are not requesting trade execution or reselling data. Please do not activate a paid plan; any charges would need separate owner approval.

Thank you,
The Privileged Company

## Verification and remaining work

On 2026-10-03, `npm test` passed **115/115**, including **18 price-client tests** covering default-off/sample zero-network behavior, data minimization, identity guards including mixed-case symbols, exact FX direction/BGN, partial failures, stale dates, overflow, 429/no retries, malformed/oversized responses, cancellation/deadline, stale snapshots, and integration with existing holdings/trades. This is local test evidence, not licensed live-service or deployment evidence.

The local Vite build also passed, with 27 interactive browser assertions and 18 English/Bulgarian layout scans at 320/390/1440 pixels. The narrow-screen asset-type label correction was independently rechecked. Delayed-response cancellation, manual overrides, imported identities outside the chooser, partial failure, exact updated totals, and unchanged financial records passed. Evidence is in ignored `output/playwright/nq7-*`; these are fictional/local checks, with zero market-data requests. Generated deployable files were not synchronized, committed, or published.

Before enabling a provider: retain the actual permission/agreement privately, confirm approved attribution/retention/delay behavior, configure only the approved source, and add its exact origins to the HTML `connect-src` policy. The stock integration still needs its licensed gateway and an instrument picker/resolver binding a new position to an unambiguous exchange/instrument ID; today's stock entry remains manual, while the isolated sample includes a fictional linked share position. Verify real browser requests, failure cases, and authenticated save/reload, then run the normal release checks. Neither inquiry above has been sent.
