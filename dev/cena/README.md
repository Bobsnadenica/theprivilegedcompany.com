# Spesti v3 — Smart Grocery Comparison Bulgaria

A grocery-planning prototype using a bundled price sample. Build a shopping list and explore estimated basket comparisons. Collection dates are not available in the bundled records, so these are not verified current store offers.

## Stores Tracked

Kaufland, Lidl, Billa, Fantastico, CBA, T Market, Metro

## Features

- **Price Comparison** — 12,700+ products in the bundled sample; not a live comparison
- **Smart Trip Planner** — Choose 1, 2, 3 stores or all — compare estimated costs in the sample
- **Comparable Products** — When your item isn't at a store, Spesti suggests a similar alternative using sample prices
- **Saved Promotions** — 1,700+ sale items auto-detected from product data, sorted by discount
- **Savings Calculator** — See how much you save vs buying everything at the most expensive store
- **Convenience Cost** — Know exactly how much extra you pay for fewer store trips

## Tabs

| Tab | Purpose |
|-----|---------|
| Количка (Cart) | Build your weekly shopping list with quantities |
| Намери (Search) | Browse and search 12,700+ products by category |
| Магазини (Stores) | Trip planner — optimize by 1, 2, 3 or all stores |
| Оферти (Deals) | Weekly deals sorted by discount, filterable by store |

## Tech Stack

- Single-file React app (no build step)
- Static JSON data files (products, deals, trends)
- Hosted on GitHub Pages
- Responsive web prototype with a web manifest; offline operation is not implemented

## Data Source

The original project notes attribute the imported sample to kolkostruva.bg. The bundled product records do not include observation dates or per-price source references. A live refresh schedule and current promotion validity have not been verified. The UI labels these limitations; do not promote this as a live price-comparison service until collection provenance, dates, validity and refresh checks are available.

## Deploy

Static site — just serve the files from any web server or GitHub Pages.

1. Set GitHub Pages source to this folder
2. Site goes live automatically

## Files

| File | Description |
|------|-------------|
| `index.html` | Full application (React + CSS + logic) |
| `products.json` | 12,700+ grocery products with prices per store |
| `deals.json` | Supplementary weekly deals data |
| `trends.json` | 8-week price history for trend sparklines |
| `store_locations.json` | Store GPS coordinates |
| `manifest.json` | PWA manifest for mobile install |
