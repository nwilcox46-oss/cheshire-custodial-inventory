# Cheshire Custodial Inventory

A **Cheshire Cat themed** custodial inventory tracker built as a zero-build, offline-capable Progressive Web App (PWA) in native dark mode.

## Features

- **Native Dark Mode & Cheshire Cat Whimsy**: Layered twilight obsidian surfaces with Cheshire rose-magenta, plum, and glowing golden eye accents, mobile-first bottom nav, desktop sidebar rail, and large touch-friendly `−` / `+` counting controls.
- **Multi-Building & Storage Area Rollups**: Create any number of buildings and nested storage closets/supply rooms. Counts entered inside storage areas automatically roll up and aggregate into overall building inventories and campus totals.
- **Pre-Loaded & Extensible Supply Catalog**: Starts ready with 7 core custodial items (*Lysol Jugs, Mop Heads, Toilet Bowl Cleaner, Toilet Paper, Tri-Fold Paper Towels, Microfiber Cloths, Bowl Acid*) with custom units, categories, low-stock thresholds, and par levels — plus full CRUD to add any new items.
- **Low-Stock Alerts & Automatic Restock List**: Flags **Vanished (`0`)**, **Fading Fast (Low)**, and **Below Par** items with both **By Building** and consolidated **Master Order Sheet** views, plus one-click Copy, CSV export, and Print layout.
- **Atomic Stock Transfers & Audit Log**: Move supplies between closets in the same building or across different buildings with automatic rollup recalculation and a filterable change history log.
- **Offline-First & Portable**: Saves to `localStorage`, precaches all assets with a Service Worker (`sw.js`), and supports full JSON backup export/import.

## Running Locally

Because the app uses native ES Modules (`<script type="module">`) and a Service Worker, serve it over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Running Automated Tests

```bash
node --test tests/store-and-selectors.test.mjs
```

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. All asset and manifest paths use relative `./` URLs so the PWA works out of the box at `https://<username>.github.io/<repo>/`.
