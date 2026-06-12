# Spesti v3 — Smart Grocery Comparison Bulgaria

Compare grocery prices across 7 major supermarket chains in Bulgaria. Build a weekly shopping list, find the cheapest stores, and save money with smart trip planning.

## Stores Tracked

Kaufland, Lidl, Billa, Fantastico, CBA, T Market, Metro

## Features

- **Price Comparison** — 12,700+ products compared across all stores in real time
- **Smart Trip Planner** — Choose 1, 2, 3 stores or all — see exactly how much each option costs
- **Comparable Products** — When your item isn't at a store, Spesti suggests a similar alternative with honest pricing
- **Weekly Deals** — 1,700+ sale items auto-detected from product data, sorted by discount
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
- PWA-ready (installable on mobile)

## Data Source

Prices sourced from kolkostruva.bg (Bulgarian government price transparency portal). Updated weekly.

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
