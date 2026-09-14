import { useEffect, useState, type FormEvent } from "react";

import type {
  ErrorResponse,
  GatherResponse,
  HealthResponse,
  ResearchStateResponse,
  RetrievalResponse,
  SourceDetails,
} from "../shared/contracts.js";

type ConnectionState = "checking" | "connected" | "unavailable";

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    return new Error(body.error || `Request failed with HTTP ${response.status}`);
  } catch {
    return new Error(`Request failed with HTTP ${response.status}`);
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [research, setResearch] = useState<ResearchStateResponse | null>(null);
  const [gatherResult, setGatherResult] = useState<GatherResponse | null>(null);
  const [question, setQuestion] = useState("");
  const [retrievalResult, setRetrievalResult] = useState<RetrievalResponse | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDetails | null>(null);
  const [isGathering, setIsGathering] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadResearch(signal?: AbortSignal) {
    const response = await fetch("/api/research", { signal });
    if (!response.ok) {
      throw await responseError(response);
    }
    setResearch((await response.json()) as ResearchStateResponse);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadApplication() {
      try {
        const response = await fetch("/api/health", { signal: controller.signal });
        if (!response.ok) {
          throw await responseError(response);
        }

        const body = (await response.json()) as HealthResponse;
        setConnection(body.status === "ok" ? "connected" : "unavailable");
        await loadResearch(controller.signal);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setConnection("unavailable");
          setError(
            loadError instanceof Error ? loadError.message : "Could not load the application.",
          );
        }
      }
    }

    void loadApplication();
    return () => controller.abort();
  }, []);

  async function gatherSources() {
    setIsGathering(true);
    setError(null);
    setGatherResult(null);

    try {
      const response = await fetch("/api/research/gather", { method: "POST" });
      if (!response.ok) {
        throw await responseError(response);
      }

      setGatherResult((await response.json()) as GatherResponse);
      await loadResearch();
    } catch (gatherError) {
      setError(gatherError instanceof Error ? gatherError.message : "Research gathering failed.");
    } finally {
      setIsGathering(false);
    }
  }

  async function viewSource(sourceId: number) {
    setError(null);
    try {
      const response = await fetch(`/api/research/sources/${sourceId}`);
      if (!response.ok) {
        throw await responseError(response);
      }
      setSelectedSource((await response.json()) as SourceDetails);
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Could not load the source.");
    }
  }

  async function retrieveForQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRetrieving(true);
    setError(null);
    setRetrievalResult(null);

    try {
      const response = await fetch("/api/research/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) {
        throw await responseError(response);
      }

      setRetrievalResult((await response.json()) as RetrievalResponse);
    } catch (retrievalError) {
      setError(
        retrievalError instanceof Error ? retrievalError.message : "Evidence retrieval failed.",
      );
    } finally {
      setIsRetrieving(false);
    }
  }

  const storedCount = research?.storedSourceCount ?? 0;
  const configuredCount = research?.configuredSourceCount ?? 4;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Evidence grounded company research</p>
          <h1>Xero Research Assistant</h1>
          <p className="description">
            Gather a small set of public Xero pages, retain the extracted evidence,
            and retrieve the most relevant stored passages for each question.
          </p>
        </div>
        <div className="hero__meta">
          <div className={`status status--${connection}`} role="status">
            <span className="status__dot" aria-hidden="true" />
            API {connection}
          </div>
          <p className="source-count">
            <strong>{storedCount}</strong> of {configuredCount} sources stored
          </p>
        </div>
      </section>

      <section className="retrieval-view" aria-labelledby="retrieval-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 3</p>
            <h2 id="retrieval-heading">Retrieve relevant evidence</h2>
            <p>
              BM25 keyword ranking searches stored chunks and returns at most five.
              No model is called at this stage.
            </p>
          </div>
        </div>

        <form className="question-form" onSubmit={(event) => void retrieveForQuestion(event)}>
          <label htmlFor="question">Question about the stored Xero research</label>
          <div className="question-form__controls">
            <textarea
              id="question"
              name="question"
              rows={3}
              maxLength={500}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What pricing plans does Xero offer in Australia?"
            />
            <button
              type="submit"
              disabled={isRetrieving || storedCount === 0 || !question.trim()}
            >
              {isRetrieving ? "Searching chunks..." : "Retrieve Top 5"}
            </button>
          </div>
          {storedCount === 0 ? (
            <p className="form-hint">Gather research before running retrieval.</p>
          ) : null}
        </form>

        {retrievalResult ? (
          <div className="retrieval-results" aria-live="polite">
            <div className="retrieval-summary">
              <strong>{retrievalResult.results.length} evidence chunks returned</strong>
              <span className={`match-quality match-quality--${retrievalResult.matchQuality}`}>
                {retrievalResult.matchQuality} match
              </span>
              <span>
                Searched {retrievalResult.totalChunksSearched} stored chunks using{" "}
                {retrievalResult.method}
              </span>
            </div>

            {retrievalResult.results.length > 0 ? (
              <ol className="retrieval-list">
                {retrievalResult.results.map((evidence) => (
                  <li key={evidence.id}>
                    <div className="retrieval-list__topline">
                      <strong>{evidence.evidenceId}</strong>
                      <span>Score {evidence.score.toFixed(4)}</span>
                      <span>Coverage {Math.round(evidence.queryCoverage * 100)}%</span>
                      <span>Chunk ID {evidence.id}</span>
                      <span>Stored chunk {evidence.position + 1}</span>
                    </div>
                    <h3>{evidence.sourceTitle}</h3>
                    <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                      {evidence.sourceUrl}
                    </a>
                    <p>{evidence.content}</p>
                    <small>Matched terms: {evidence.matchedTerms.join(", ")}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="no-match" role="status">
                <strong>No relevant stored evidence found.</strong>
                <p>
                  The question had no useful lexical overlap with the stored chunks;
                  no unrelated evidence was substituted.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="workspace" aria-labelledby="research-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Step 2</p>
            <h2 id="research-heading">Gather and retain evidence</h2>
            <p>
              The first run fetches configured pages. Later runs reuse the stored
              research without fetching or processing it again.
            </p>
          </div>
          <button type="button" onClick={() => void gatherSources()} disabled={isGathering}>
            {isGathering
              ? "Gathering sources..."
              : storedCount
                ? "Gather missing sources"
                : "Gather research"}
          </button>
        </div>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {gatherResult ? (
          <div className="activity" aria-live="polite">
            <div className="activity__summary">
              <strong>Latest gather</strong>
              <span>{gatherResult.fetched} fetched</span>
              <span>{gatherResult.reused} reused</span>
              <span>{gatherResult.failed} failed</span>
            </div>
            <ul>
              {gatherResult.results.map((result) => (
                <li key={result.key}>
                  <span className={`result-badge result-badge--${result.status}`}>
                    {result.status}
                  </span>
                  <span>
                    <strong>{result.key}</strong> {result.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {research && research.sources.length > 0 ? (
          <div className="source-grid">
            {research.sources.map((source) => (
              <article className="source-card" key={source.id}>
                <div className="source-card__topline">
                  <span>{source.key}</span>
                  <span>{source.chunkCount} chunks</span>
                </div>
                <h3>{source.title}</h3>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.url}
                </a>
                <p className="source-card__preview">{source.preview}</p>
                <dl>
                  <div>
                    <dt>Retrieved</dt>
                    <dd>{formatDate(source.retrievedAt)}</dd>
                  </div>
                  <div>
                    <dt>Stored text</dt>
                    <dd>{source.contentLength.toLocaleString()} characters</dd>
                  </div>
                  <div>
                    <dt>SHA 256</dt>
                    <dd>
                      <code>{source.contentHash.slice(0, 12)}...</code>
                    </dd>
                  </div>
                </dl>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void viewSource(source.id)}
                >
                  View stored chunks
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No research stored yet</h3>
            <p>Run Gather research to fetch the configured public Xero pages.</p>
          </div>
        )}
      </section>

      {selectedSource ? (
        <section className="evidence-view" aria-labelledby="evidence-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Stored evidence</p>
              <h2 id="evidence-heading">{selectedSource.title}</h2>
              <a href={selectedSource.url} target="_blank" rel="noreferrer">
                {selectedSource.url}
              </a>
            </div>
            <button
              className="button-secondary"
              type="button"
              onClick={() => setSelectedSource(null)}
            >
              Close evidence
            </button>
          </div>
          <ol className="chunk-list">
            {selectedSource.chunks.map((chunk) => (
              <li key={chunk.id}>
                <span>Chunk {chunk.position + 1}</span>
                <p>{chunk.content}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
