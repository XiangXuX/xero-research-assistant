import type { AnswerResponse } from "../../shared/contracts.js";
import { formatDate } from "../lib/ui-types.js";

interface AnswerWorkspaceProps {
  question: string;
  answer: AnswerResponse | null;
  isAnswering: boolean;
  storedSourceCount: number;
  onQuestionChange: (question: string) => void;
  onAsk: () => Promise<void>;
}

export function AnswerWorkspace({
  question,
  answer,
  isAnswering,
  storedSourceCount,
  onQuestionChange,
  onAsk,
}: AnswerWorkspaceProps) {
  return (
    <section className="qa-view" aria-labelledby="question-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Ask the research</p>
          <h2 id="question-heading">Grounded answer</h2>
          <p>Gemini is called only when retrieval finds strong enough stored evidence.</p>
        </div>
      </div>

      <form className="question-form" onSubmit={(event) => { event.preventDefault(); void onAsk(); }}>
        <label htmlFor="question">Question about Xero</label>
        <div className="question-form__controls">
          <textarea
            id="question"
            name="question"
            rows={3}
            maxLength={500}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="What pricing plans does Xero offer in Australia?"
          />
          <button type="submit" disabled={isAnswering || storedSourceCount === 0 || !question.trim()}>
            {isAnswering ? "Working..." : "Ask with evidence"}
          </button>
        </div>
        {storedSourceCount === 0 ? <p className="form-hint">Gather sources before asking.</p> : null}
      </form>

      {isAnswering ? (
        <div className="answer-placeholder" role="status">Retrieving evidence and waiting for Gemini...</div>
      ) : answer ? (
        <div className="answer-layout">
          <article className={`answer-card answer-card--${answer.status}`} aria-live="polite">
            <div className="answer-card__statusline">
              <span className={`answer-status answer-status--${answer.status}`}>
                {answer.status === "answered" ? "Answered" : "Insufficient evidence"}
              </span>
              <span>{answer.retrieval.results.length} retrieved · {answer.citations.length} cited</span>
            </div>
            <p className="answer-text">{answer.answer}</p>
            <dl className="answer-metadata">
              <div><dt>Model</dt><dd>{answer.modelCall.occurred ? `${answer.modelCall.provider}/${answer.modelCall.model}` : "Not called"}</dd></div>
              <div><dt>Latency</dt><dd>{answer.modelCall.occurred ? `${answer.modelCall.durationMs?.toLocaleString() ?? "—"} ms` : answer.modelCall.reason}</dd></div>
              <div><dt>Match</dt><dd>{answer.retrieval.matchQuality}</dd></div>
            </dl>
          </article>

          {answer.citations.length ? (
            <div className="citation-list">
              <h3>Supporting evidence</h3>
              {answer.citations.map((citation, index) => (
                <details className="citation" key={citation.evidenceId} open={index === 0}>
                  <summary><strong>{citation.evidenceId}</strong><span>{citation.sourceTitle}</span></summary>
                  <div className="citation__body">
                    <a href={citation.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
                    <small>Retrieved {formatDate(citation.retrievedAt)}</small>
                    <blockquote>{citation.supportingText}</blockquote>
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="answer-placeholder">Ask a question to see the answer and its supporting evidence.</div>
      )}
    </section>
  );
}
