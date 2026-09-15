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
npm run research:refresh
npm run research:inspect
```

The first command fetches missing pages and later reuses unchanged stored research.
The refresh command explicitly fetches and reprocesses every configured source. The
inspect command opens the persisted database in a new process and prints every stored
source and chunk, providing a simple persistence and traceability check. These actions
are also available through the web interface.

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

Inspect retrieval independently from the terminal:

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
but only one question concept is covered, so the result is marked weak and generation
is skipped.

BM25 is appropriate for the initial 33-chunk corpus because it is deterministic,
inspectable, credential-free and incurs no model or embedding cost. Its main weakness
is vocabulary mismatch; if the corpus grows substantially or users rely on paraphrases,
a vector or hybrid lexical/vector retrieval stage would be a justified next step.

## Generate a grounded answer

The runtime model is separate from development assistants such as Codex. The default
provider is Google's `gemini-3.1-flash-lite`, selected for structured JSON output and
its current free tier. Create a key in
[Google AI Studio](https://aistudio.google.com/app/apikey), copy `.env.example` to
`.env`, and set `GEMINI_API_KEY` locally. ChatGPT subscriptions do not supply this API
credential.

```bash
npm run research:ask -- "What pricing plans does Xero offer in Australia?"
```

The same workflow is available from the web question form. Its Answer, Supporting
Evidence and Activity Log sections expose the result, validated source passages, and
whether a model call occurred.

For strong retrieval, the backend sends only the question and Top 5 evidence passages
to the `ModelProvider`. The prompt forbids outside knowledge and requires inline `[E#]`
markers plus a JSON citation list. A JSON Schema constrains generation; application
code then rejects malformed JSON, missing citations, unknown IDs, or disagreement
between inline markers and the citation list. Valid IDs are mapped server-side to the
stored title, URL, retrieval time and exact supporting text. Weak or absent retrieval
returns `insufficient_evidence` without a model call.

The API key never reaches React, logs or Git. The provider uses a 30-second timeout,
does not request provider-side storage, and reports token usage when available. Free
tier limits and policies may change; public Xero passages only are sent in this
exercise. See the official [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

## Offline verification

```bash
npm run typecheck
npm test
npm run build
```

The credential-free tests cover HTML noise removal, bounded chunk creation, database
persistence after reopening, configuration-driven source replacement, retrieval
ranking, Top K limits, traceable citations, invalid model JSON/IDs, weak-evidence
short-circuiting and provider HTTP failure. Tests use local HTML fixtures, in-memory
SQLite, injected fetch functions and a stub model provider; they do not access Xero or
Gemini. The real extraction, chunking, repository, retrieval, answer validation and
workflow-event code still runs. Only the two external boundaries are replaced, so this
is not a mock-only application. Compact run records are in `evaluation/`, including the
[successful real-model run](evaluation/step-4-live.json) and the
[credential-free Step 6 verification](evaluation/step-6-offline.json).

## Reuse, refresh and activity

Question answering and page gathering are separate backend paths. Asking a question
reads stored chunks from SQLite and may call Gemini, but it cannot invoke the page
fetcher or chunker. **Gather / reuse** skips network and processing for an unchanged,
successfully stored source. **Refresh all** explicitly fetches and atomically replaces
each source; a failed refresh leaves the last known-good evidence and retrieval time
unchanged.

The web Activity Log displays backend workflow events such as `SOURCE_REUSED`,
`SOURCE_FETCHED`, `SOURCE_PROCESSED`, `RETRIEVAL_COMPLETED`,
`MODEL_CALL_STARTED`, and `MODEL_CALL_COMPLETED`. This lets a reviewer compare reuse,
refresh and repeated-question runs without reading source code. Tests also assert that
an unchanged Gather makes zero fetch, extraction and chunking calls, while consecutive
supported questions make separate model calls.

## Failure handling

The Activity Log includes a **Demonstrate safe failure** action. It runs the production
refresh workflow for one stored source with an injected synthetic HTTP 503 response.
No live request or model call occurs. The result visibly separates the latest attempted
refresh time from the last successful retrieval time and confirms that the old URL,
content hash, chunks and `retrievedAt` remain unchanged and queryable.

Real refreshes follow the same ordering: fetch, extract and chunk first; only then call
`saveSource`. Source and chunk replacement occurs in one SQLite transaction, with a
rollback on persistence failure. We therefore never delete last-known-good evidence
before a replacement is ready. Provider errors expose a controlled status and message,
not request headers or API keys, and a failed refresh cannot create an answer. The
credential-free result is recorded in
[`evaluation/step-7-offline.json`](evaluation/step-7-offline.json).

## Evaluation

Step 8 separates deterministic automated testing from model-quality evaluation.
Unit tests check focused rules such as chunk bounds, BM25 ranking and citation
validation. Integration tests connect real internal components through in-memory
SQLite, for example fetch → extraction → chunking → persistence and retrieval →
model proposal → citation validation. Mock fetch and the stub model replace only
network boundaries, keeping the suite repeatable, credential-free and free of Xero or
Gemini cost.

Run the complete offline gate with:

```bash
npm test
npm run typecheck
npm run build
```

The current gate contains 21 tests across five files. It includes reuse, insufficient
evidence, failed-refresh preservation, invalid-citation rejection and correct-source
retrieval. The verified offline record is
[`evaluation/step-8-offline.json`](evaluation/step-8-offline.json).

After gathering real research and configuring `GEMINI_API_KEY`, run the four-case live
evaluation once:

```bash
npm run evaluation:live
```

This executes Supported, Multi-source, Insufficient evidence and Repeated/follow-up
cases through the real answer workflow and writes
`evaluation/real-model-run.json`. It records questions, expected behaviour, cited
evidence excerpts, actual outputs, assessments, model/configuration metadata, run
date and source retrieval dates. No secret value is recorded. The command fails if a
case does not meet its explicit checks; a human should additionally confirm that each
claim is actually entailed by its cited passage rather than merely sharing keywords.

## Current milestone

Steps 1–8 are implemented, including a successful real Gemini call, explicit refresh,
validated citations, expandable evidence, backend-produced activity events, a safe
repeatable HTTP 503 refresh-failure demonstration, 21 automated tests and a repeatable
four-case real-model evaluation runner.
