import { useEffect, useState } from "react";

import type {
  AnswerResponse,
  GatherResponse,
  HealthResponse,
  ResearchStateResponse,
  SourceDetails,
  WorkflowEvent,
} from "../shared/contracts.js";
import { ActivityPanel } from "./components/ActivityPanel.js";
import { AnswerWorkspace } from "./components/AnswerWorkspace.js";
import { ResearchLibrary } from "./components/ResearchLibrary.js";
import { SourceDetailsPanel } from "./components/SourceDetailsPanel.js";
import { requestJson } from "./lib/api.js";
import type {
  ActivityEntry,
  ActivityTone,
  ConnectionState,
  ResearchAction,
} from "./lib/ui-types.js";

let nextActivityId = 1;

function eventTone(event: WorkflowEvent): ActivityTone {
  if (event.type.endsWith("FAILED")) return "error";
  if (event.type === "MODEL_CALL_SKIPPED") return "warning";
  if (event.type.endsWith("COMPLETED") || event.type === "SOURCE_PROCESSED") return "success";
  return "info";
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

  function addWorkflowEvents(events: WorkflowEvent[]) {
    const entries = events.map((event): ActivityEntry => ({
      id: nextActivityId++,
      occurredAt: event.occurredAt,
      label: event.type,
      detail: event.sourceKey ? `${event.sourceKey}: ${event.detail}` : event.detail,
      tone: eventTone(event),
    }));
    setActivities((current) => [...entries.reverse(), ...current].slice(0, 20));
  }

  async function loadResearch(signal?: AbortSignal): Promise<ResearchStateResponse> {
    const result = await requestJson<ResearchStateResponse>("/api/research", { signal });
    setResearch(result);
    return result;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function initialise() {
      try {
        const health = await requestJson<HealthResponse>("/api/health", {
          signal: controller.signal,
        });
        setConnection(health.status === "ok" ? "connected" : "unavailable");
        const loadedResearch = await loadResearch(controller.signal);
        addActivity(
          "Application ready",
          `${loadedResearch.storedSourceCount} stored sources loaded from SQLite.`,
          "success",
        );
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        const message =
          loadError instanceof Error ? loadError.message : "Could not load the application.";
        setConnection("unavailable");
        setError(message);
        addActivity("Application unavailable", message, "error");
      }
    }

    void initialise();
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
      refresh ? "Refreshing every configured source." : "Gathering missing sources.",
      "info",
    );

    try {
      const result = await requestJson<GatherResponse>("/api/research/gather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      setGatherResult(result);
      setSelectedSource(null);
      await loadResearch();
      addWorkflowEvents(result.events);
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
      const source = await requestJson<SourceDetails>(`/api/research/sources/${sourceId}`);
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

  async function askQuestion() {
    const submittedQuestion = question.trim();
    if (!submittedQuestion) return;

    setIsAnswering(true);
    setError(null);
    setAnswerResult(null);
    addActivity("Question submitted", submittedQuestion, "info");

    try {
      const result = await requestJson<AnswerResponse>("/api/research/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submittedQuestion }),
      });
      setAnswerResult(result);
      addWorkflowEvents(result.events);
    } catch (answerError) {
      const message = answerError instanceof Error ? answerError.message : "Question answering failed.";
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
      <header className="hero">
        <div>
          <p className="eyebrow">Evidence-grounded research</p>
          <h1>Xero Research Assistant</h1>
          <p className="description">
            Collect public Xero pages once, search the stored evidence, and generate
            answers whose citations can be checked against the original text.
          </p>
        </div>
        <div className="hero__meta">
          <div className={`status status--${connection}`} role="status">
            <span className="status__dot" aria-hidden="true" />
            API {connection}
          </div>
          <div className={`model-status model-status--${modelConfigured ? "configured" : "missing"}`}>
            Model {modelConfigured ? "ready" : "not configured"}
          </div>
          <p className="source-count"><strong>{storedCount}</strong> / {configuredCount} sources</p>
        </div>
      </header>

      {error ? (
        <div className="error error--global" role="alert">
          <div><strong>Request failed</strong><p>{error}</p></div>
          <button className="button-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      ) : null}

      <ResearchLibrary
        research={research}
        isGathering={isGathering}
        action={researchAction}
        onGather={gatherSources}
        onViewSource={viewSource}
      />

      <AnswerWorkspace
        question={question}
        answer={answerResult}
        isAnswering={isAnswering}
        storedSourceCount={storedCount}
        onQuestionChange={setQuestion}
        onAsk={askQuestion}
      />

      {selectedSource ? (
        <SourceDetailsPanel source={selectedSource} onClose={() => setSelectedSource(null)} />
      ) : null}

      <ActivityPanel activities={activities} gatherResult={gatherResult} action={researchAction} />
    </main>
  );
}
