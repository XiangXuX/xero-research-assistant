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

## Retrieve evidence

Use the Step 3 form in the web application, or run a question from the terminal:

```bash
npm run research:retrieve -- "What pricing plans does Xero offer in Australia?"
```

The retrieval service reads the stored chunks, normalises useful question terms,
applies small transparent synonym expansions, and ranks lexical matches with BM25.
Source titles, keys and URLs receive a modest metadata boost. It returns at most the
Top 5 matched chunks with an evidence label, database chunk ID, source title, URL,
retrieval date, score, query coverage and matched terms. The raw score orders chunks
within one search; it is not a probability and should not be compared across unrelated
queries.

Query coverage produces a visible `strong`, `weak` or `none` match label. For example,
a question about Martian weather may overlap with Xero's phrase “cash-flow forecast”,
but only one question concept is covered, so the result is marked weak. The generation
step must treat weak retrieval as potentially insufficient evidence.

BM25 is appropriate for the initial 33-chunk corpus because it is deterministic,
inspectable, credential-free and incurs no model or embedding cost. Its main weakness
is vocabulary mismatch; if the corpus grows substantially or users rely on paraphrases,
a vector or hybrid lexical/vector retrieval stage would be a justified next step.

## Offline verification

```bash
npm run typecheck
npm test
npm run build
```

The credential-free tests cover HTML noise removal, bounded chunk creation, database
persistence after reopening, configuration-driven source replacement, retrieval
ranking, Top K limits, traceable metadata, and weak unrelated matches. They do not
access Xero or a model. Compact metadata-only records of verified live runs are in
`evaluation/`.

## Current milestone

Steps 1–3 are implemented: the web skeleton, gathering and persistence, source/chunk
inspection, visible reuse/failure results, and Top 5 BM25 retrieval. Real-model
grounded answer generation is the next milestone.
