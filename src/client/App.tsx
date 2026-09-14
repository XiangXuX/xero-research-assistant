import { useEffect, useState, type FormEvent } from "react";

import type {
  AnswerResponse,
  ErrorResponse,
  GatherResponse,
  HealthResponse,
  ResearchStateResponse,
  SourceDetails,
} from "../shared/contracts.js";

type ConnectionState = "checking" | "connected" | "unavailable";
type ActivityTone = "info" | "success" | "warning" | "error";
type ResearchAction = "gather" | "refresh";

interface ActivityEntry {
  id: number;
  occurredAt: string;
  label: string;
  detail: string;
  tone: ActivityTone;
}

let nextActivityId = 1;

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    const message = body.error || `Request failed with HTTP ${response.status}`;
    return new Error(body.code ? `${message} (${body.code})` : message);
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

function modelActivityDetail(result: AnswerResponse): string {
  if (!result.modelCall.occurred) {
    return result.modelCall.reason || "The model was not called.";
  }

  const model = `${result.modelCall.provider}/${result.modelCall.model}`;
  const duration = result.modelCall.durationMs
    ? ` in ${result.modelCall.durationMs.toLocaleString()} ms`
    : "";
  const tokens = result.modelCall.totalTokens
    ? `; ${result.modelCall.totalTokens.toLocaleString()} total tokens`
    : "";
  return `${model} completed${duration}; ${result.citations.length} citations validated${tokens}.`;
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [research, setResearch] = useState<ResearchStateResponse | null>(null);
  const [gatherResult, setGatherResult] = useState<GatherResponse | null>(null);
  const [researchAction, setResearchAction] = useState<ResearchAction>("gather");
  const [question, setQuestion] = useState("");
  const [answerResult, setAnswerResult] = useState<AnswerResponse | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDetails | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isGathering, setIsGathering] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addActivity(
    label: string,
    detail: string,
    tone: ActivityTone,
    occurredAt = new Date().toISOString(),
  ) {
    const entry: ActivityEntry = {
      id: nextActivityId++,
      occurredAt,
      label,
      detail,
      tone,
    };
    setActivities((current) => [entry, ...current].slice(0, 20));
  }

  async function loadResearch(signal?: AbortSignal): Promise<ResearchStateResponse> {
    const response = await fetch("/api/research", { signal });
    if (!response.ok) {
      throw await responseError(response);
    }
    const body = (await response.json()) as ResearchStateResponse;
    setResearch(body);
    return body;
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
        const loadedResearch = await loadResearch(controller.signal);
        addActivity(
          "Application ready",
          `${loadedResearch.storedSourceCount} stored sources loaded from SQLite.`,
          "success",
        );
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          const message =
            loadError instanceof Error ? loadError.message : "Could not load the application.";
          setConnection("unavailable");
          setError(message);
          addActivity("Application unavailable", message, "error");
        }
      }
    }

    void loadApplication();
    return () => controller.abort();
  }, []);

  async function gatherSources(action: ResearchAction) {
    const refresh = action === "refresh";
    setResearchAction(action);
    setIsGathering(true);
    setError(null);
    setGatherResult(null);
    addActivity(
      refresh ? "Refresh started" : "Gather started",
      refresh
        ? "Fetching and reprocessing every configured source."
        : "Gathering missing sources and reusing stored research.",
      "info",
    );

    try {
      const response = await fetch("/api/research/gather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!response.ok) {
        throw await responseError(response);
      }

      const result = (await response.json()) as GatherResponse;
      setGatherResult(result);
      setSelectedSource(null);
      await loadResearch();
      addActivity(
        refresh ? "Refresh completed" : "Gather completed",
        `${result.fetched} fetched, ${result.reused} reused, ${result.failed} failed.`,
        result.failed > 0 ? "warning" : "success",
        result.completedAt,
      );
    } catch (gatherError) {
      const message =
        gatherError instanceof Error ? gatherError.message : "Research gathering failed.";
      setError(message);
      addActivity(refresh ? "Refresh failed" : "Gather failed", message, "error");
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
      const source = (await response.json()) as SourceDetails;
      setSelectedSource(source);
      addActivity(
        "Stored source opened",
        `${source.title}; ${source.chunks.length} chunks available.`,
        "info",
      );
    } catch (sourceError) {
      const message = sourceError instanceof Error ? sourceError.message : "Could not load the source.";
      setError(message);
      addActivity("Source view failed", message, "error");
    }
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion) {
      return;
    }

    setIsAnswering(true);
    setError(null);
    setAnswerResult(null);
    addActivity("Question submitted", submittedQuestion, "info");

    try {
      const response = await fetch("/api/research/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submittedQuestion }),
      });
      if (!response.ok) {
        throw await responseError(response);
      }

      const result = (await response.json()) as AnswerResponse;
      setAnswerResult(result);
      addActivity(
        result.modelCall.occurred ? "Model call completed" : "Model call skipped",
        modelActivityDetail(result),
        result.status === "answered" ? "success" : "warning",
        result.modelCall.completedAt,
      );
    } catch (answerError) {
      const message =
        answerError instanceof Error ? answerError.message : "Question answering failed.";
      setError(message);
      addActivity("Answer failed", message, "error");
    } finally {
      setIsAnswering(false);
    }
  }

  const storedCount = research?.storedSourceCount ?? 0;
  const configuredCount = research?.configuredSourceCount ?? 4;
  const modelConfigured = research?.model.configured ?? false;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Evidence-grounded company research</p>
          <h1>Xero Research Assistant</h1>
          <p className="description">
            Gather public Xero pages, retain the useful evidence, and ask a real model
            questions grounded only in the retrieved passages.
          </p>
        </div>
        <div className="hero__meta">
          <div className={`status status--${connection}`} role="status">
            <span className="status__dot" aria-hidden="true" />
            API {connection}
          </div>
          <div
            className={`model-status model-status--${modelConfigured ? "configured" : "missing"}`}
          >
            Model {modelConfigured ? "configured" : "not configured"}
          </div>
          <p className="source-count">
            <strong>{storedCount}</strong> of {configuredCount} sources stored
          </p>
        </div>
      </section>

      {error ? (
        <div className="error error--global" role="alert">
          <div>
            <strong>Request failed</strong>
            <p>{error}</p>
          </div>
          <button className="button-secondary" type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="workspace" aria-labelledby="research-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Research sources</p>
            <h2 id="research-heading">Gather, reuse or refresh evidence</h2>
            <p>
              Gather reuses unchanged stored sources. Refresh explicitly fetches and
              reprocesses all configured pages; failed refreshes leave older evidence intact.
            </p>
          </div>
          <div className="button-group">
            <button
              className="button-secondary"
              type="button"
              onClick={() => void gatherSources("gather")}
              disabled={isGathering}
            >
              {isGathering && researchAction === "gather" ? "Gathering..." : "Gather / reuse"}
            </button>
            <button
              type="button"
              onClick={() => void gatherSources("refresh")}
              disabled={isGathering || storedCount === 0}
            >
              {isGathering && researchAction === "refresh" ? "Refreshing..." : "Refresh all"}
            </button>
          </div>
        </div>

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
                    <dd><code>{source.contentHash.slice(0, 12)}...</code></dd>
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
            <p>Run Gather / reuse to fetch the configured public Xero pages.</p>
          </div>
        )}
      </section>

      <section className="question-view" aria-labelledby="question-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Question</p>
            <h2 id="question-heading">Ask the stored research</h2>
            <p>
              The backend retrieves Top 5 evidence chunks, calls Gemini only for a
              strong match, and validates every citation before returning an answer.
            </p>
          </div>
        </div>

        <form className="question-form" onSubmit={(event) => void askQuestion(event)}>
          <label htmlFor="question">Question about Xero</label>
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
              disabled={isAnswering || storedCount === 0 || !question.trim()}
            >
              {isAnswering ? "Retrieving and answering..." : "Ask with evidence"}
            </button>
          </div>
          {storedCount === 0 ? (
            <p className="form-hint">Gather research before asking a question.</p>
          ) : null}
        </form>
      </section>

      <section className="answer-view" aria-labelledby="answer-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Answer</p>
            <h2 id="answer-heading">Grounded response</h2>
          </div>
        </div>

        {isAnswering ? (
          <div className="answer-placeholder" role="status">
            Retrieving evidence and waiting for the model...
          </div>
        ) : answerResult ? (
          <article
            className={`answer-card answer-card--${answerResult.status}`}
            aria-live="polite"
          >
            <div className="answer-card__statusline">
              <span className={`answer-status answer-status--${answerResult.status}`}>
                {answerResult.status === "answered" ? "Answered" : "Insufficient evidence"}
              </span>
              <span>
                Retrieval: {answerResult.retrieval.matchQuality} · {answerResult.retrieval.results.length}/
                {answerResult.retrieval.topK} chunks
              </span>
            </div>
            <p className="answer-text">{answerResult.answer}</p>
            <dl className="answer-metadata">
              <div>
                <dt>Model</dt>
                <dd>
                  {answerResult.modelCall.occurred
                    ? `${answerResult.modelCall.provider}/${answerResult.modelCall.model}`
                    : "Not called"}
                </dd>
              </div>
              <div>
                <dt>Model activity</dt>
                <dd>
                  {answerResult.modelCall.occurred
                    ? `${answerResult.modelCall.durationMs?.toLocaleString() ?? "—"} ms`
                    : answerResult.modelCall.reason}
                </dd>
              </div>
              <div>
                <dt>Citations</dt>
                <dd>{answerResult.citations.length} validated</dd>
              </div>
            </dl>
          </article>
        ) : (
          <div className="answer-placeholder">
            Submit a question to see the generated answer and model activity.
          </div>
        )}
      </section>

      <section className="supporting-view" aria-labelledby="supporting-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Supporting evidence</p>
            <h2 id="supporting-heading">Trace claims to stored text</h2>
            <p>Evidence metadata and text come from the backend after citation validation.</p>
          </div>
        </div>

        {answerResult?.citations.length ? (
          <div className="citation-list">
            {answerResult.citations.map((citation, index) => (
              <details className="citation" key={citation.evidenceId} open={index === 0}>
                <summary>
                  <strong>{citation.evidenceId}</strong>
                  <span>{citation.sourceTitle}</span>
                  <span>Chunk ID {citation.chunkId}</span>
                </summary>
                <div className="citation__body">
                  <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                    {citation.sourceUrl}
                  </a>
                  <small>Retrieved {formatDate(citation.retrievedAt)}</small>
                  <blockquote>{citation.supportingText}</blockquote>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>
              {answerResult?.insufficientEvidence
                ? "No evidence was accepted for this question."
                : "Validated supporting passages will appear here."}
            </p>
          </div>
        )}
      </section>

      <section className="activity-view" aria-labelledby="activity-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Activity log</p>
            <h2 id="activity-heading">Fetch, reuse and model activity</h2>
          </div>
        </div>

        {gatherResult ? (
          <div className="activity activity--latest" aria-live="polite">
            <div className="activity__summary">
              <strong>Latest {researchAction}</strong>
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
                  <span><strong>{result.key}</strong> {result.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {activities.length > 0 ? (
          <ol className="event-list" aria-live="polite">
            {activities.map((activity) => (
              <li className={`event event--${activity.tone}`} key={activity.id}>
                <time dateTime={activity.occurredAt}>{formatDate(activity.occurredAt)}</time>
                <div>
                  <strong>{activity.label}</strong>
                  <p>{activity.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state"><p>No activity recorded in this session yet.</p></div>
        )}
      </section>

      {selectedSource ? (
        <section className="evidence-view" aria-labelledby="evidence-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Stored source view</p>
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
              Close source
            </button>
          </div>
          <p className="source-view-meta">
            Retrieved {formatDate(selectedSource.retrievedAt)} · {selectedSource.chunks.length} stored chunks
          </p>
          <ol className="chunk-list">
            {selectedSource.chunks.map((chunk) => (
              <li key={chunk.id}>
                <span>Chunk {chunk.position + 1} · ID {chunk.id}</span>
                <p>{chunk.content}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
