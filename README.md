# DataForge · Analytics Studio

> **From raw data to real clarity.** A free, browser-first data analytics workspace powered by SvelteKit + DuckDB-Wasm.

![License: MIT](https://img.shields.io/badge/license-MIT-9b87fc) ![SvelteKit](https://img.shields.io/badge/SvelteKit-5-ff3e00) ![DuckDB](https://img.shields.io/badge/Analytics-DuckDB--Wasm-f4db40)

## Overview

DataForge helps analysts inspect a dataset, discover quality issues, write SQL and produce interactive charts without configuring a data warehouse or uploading data to a server. The full dataset is processed **in your browser**, and is removed when the page is reloaded.

### Features implemented

- Upload **CSV, TSV, JSON, Parquet or Excel (.xlsx)** files, up to 60 MB.
- Explore a built-in **240-row retail dataset** without uploading a file.
- View total rows, column schema, data completeness, missing and unique-value counts.
- Search a 10-row preview; use SQL for querying the full dataset.
- Execute DuckDB SQL with a syntax-editable query editor and inspect results.
- Create bar, line and doughnut charts using SUM, AVG or COUNT aggregations.
- Export charts as PNG, query results as CSV, and workspace configuration as JSON.
- Remove duplicate rows or rows with missing values (in-memory only).
- Persist saved **chart configurations** in browser localStorage (not raw data).
- Responsive dark interface animated with GSAP (reduced-motion support).
- Hono API health endpoint at `/api/health`.
- Drizzle ORM schema scaffold for **future authenticated Cloudflare D1 storage**, intentionally not exposed as a public writable endpoint.

## Tech stack

| Layer | Technology |
|---|---|
| App | SvelteKit 2, Svelte 5, TypeScript, Vite |
| Analytics | DuckDB-Wasm (client-side WebAssembly) |
| File import | read-excel-file (.xlsx), DuckDB CSV/TSV/JSON/Parquet |
| Visualization | Chart.js |
| Motion & UI | GSAP, Lucide Svelte, custom CSS |
| API | Hono + SvelteKit RequestHandler |
| Future database integration | Drizzle ORM + Cloudflare D1 |
| Hosting | Vercel Hobby, or Cloudflare Workers Free |
| Tests | Playwright + svelte-check |

## Local development

Requires Node.js 22+.

```bash
git clone https://github.com/Darren0099/DataForge.git
cd DataForge
npm install
npm run dev
```

Visit the address printed by Vite (typically http://localhost:5173).

Run validation:

```bash
npm run check
npm run build
npx playwright install chromium
npm test
```

## How to use

1. Select **Explore sample data** or **Import a dataset**.
2. Open **Overview** to inspect row counts and missing values.
3. Open **SQL Playground** and query the in-memory table named `dataset`. Example:

```sql
SELECT region, SUM(revenue) AS total_revenue, COUNT(*) AS orders
FROM dataset
GROUP BY region
ORDER BY total_revenue DESC;
```

4. In **Visualizations**, choose grouping, aggregation and chart type. Save settings or export PNG.
5. Use **Data Quality** to inspect fields and optionally clean duplicate/incomplete rows.

**Note on exports:** The dataset export action is capped at the first 1,000 records, and the initial table preview displays 10 records. SQL results also display a maximum of 1,000 rows to avoid freezing the interface. Re-import the original file to undo in-memory cleanups.

## Deployment

### Vercel

Connect this GitHub repository in Vercel as a **SvelteKit** project. Build command: `npm run build`. The default SvelteKit adapter is `@sveltejs/adapter-vercel`. No environment variables are required.

### Cloudflare Workers

The repository includes `wrangler.jsonc` and `@sveltejs/adapter-cloudflare`. Use Node.js 22+ and a connected Workers Builds Git repository:

- Build command: `DEPLOY_TARGET=cloudflare npm run build`
- Deploy command: `npx wrangler deploy`
- Worker name: `dataforge-analytics`

Cloudflare Workers Free resource limits apply. No D1 database is required for this release because the application runs analytics entirely in the browser. The Drizzle schema is **not** a provisioned database or live user-account feature.

## Security & privacy

- File bytes and SQL calculations remain in the browser's DuckDB-Wasm engine.
- No file upload API is exposed.
- The app requests DuckDB-Wasm runtime assets from the public jsDelivr CDN; downloading a runtime is **not** the same as uploading a dataset.
- The workspace JSON contains configuration, dataset name, column names, and SQL text, **not** the raw dataset.
- Browser localStorage stores chart preferences only. Avoid putting sensitive data into chart names or SQL exports.
- Local SQL queries execute against the user's temporary in-browser DuckDB database, not a remote production database.

## Roadmap

Future (not part of the current MVP): authentication, encrypted cloud workspaces, D1/R2 integrations, large-data streaming, scheduled reports, cross-project dashboards and collaborative sharing.

## License

MIT · Built by [Darren0099](https://github.com/Darren0099).
