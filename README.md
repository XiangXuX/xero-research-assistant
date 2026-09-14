# Xero Research Assistant

A small TypeScript web application that gathers public Xero research, retains the
extracted evidence, and will answer questions using traceable supporting passages.

## Requirements and setup

- Node.js 22.13 or newer (the project uses Node's built-in SQLite module)
- npm

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the Express API at
`http://localhost:3001`.

## Gather and inspect research

Use the **Gather research** button in the web application, or run:

```bash
npm run research:gather
npm run research:inspect
```

The first command fetches and processes the configured pages. A later gather reuses
each unchanged configured source without a network request or reprocessing. The
second command opens the persisted database in a new process and prints every stored
source and chunk, providing a simple persistence and traceability check.

The four initial Australian sources cover the product, pricing, small-business users,
and accounting partners. They are configured in
`src/server/research/sources.ts`. To replace a page, keep its stable `key` and change
its URL; to add a page, add a unique key and URL while keeping the total between three
and five.

The local database path is controlled by `RESEARCH_DB_PATH` and defaults to
`data/research.db`. Database files and `.env` are ignored by Git. The repository
contains processing code and a synthetic HTML test fixture, not downloaded Xero
content.

## Offline verification

```bash
npm run typecheck
npm test
npm run build
```

The credential-free tests cover HTML noise removal, bounded chunk creation, database
persistence after reopening, and configuration-driven source replacement. They do
not access Xero or a model. A compact metadata-only record of the verified live and
repeat runs is in `evaluation/step-2-live-run.json`.

## Current milestone

Step 2 is implemented: configuration, fetching, extraction, chunking, SQLite
persistence, source/chunk inspection, and visible fetched/reused/failed results.
Retrieval and real-model grounded answers are the next milestone.
