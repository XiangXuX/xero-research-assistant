import type { ResearchStateResponse } from "../../shared/contracts.js";
import { formatDate, type ResearchAction } from "../lib/ui-types.js";

interface ResearchLibraryProps {
  research: ResearchStateResponse | null;
  isGathering: boolean;
  action: ResearchAction;
  onGather: (action: ResearchAction) => Promise<void>;
  onViewSource: (sourceId: number) => Promise<void>;
}

export function ResearchLibrary({
  research,
  isGathering,
  action,
  onGather,
  onViewSource,
}: ResearchLibraryProps) {
  const storedCount = research?.storedSourceCount ?? 0;

  return (
    <section className="workspace" aria-labelledby="research-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Research library</p>
          <h2 id="research-heading">Stored sources</h2>
          <p>Gather fills missing sources. Refresh replaces them only after a successful fetch.</p>
        </div>
        <div className="button-group">
          <button
            className="button-secondary"
            type="button"
            onClick={() => void onGather("gather")}
            disabled={isGathering}
          >
            {isGathering && action === "gather" ? "Gathering..." : "Gather missing"}
          </button>
          <button
            type="button"
            onClick={() => void onGather("refresh")}
            disabled={isGathering || storedCount === 0}
          >
            {isGathering && action === "refresh" ? "Refreshing..." : "Refresh all"}
          </button>
        </div>
      </div>

      {research?.sources.length ? (
        <div className="source-grid">
          {research.sources.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-card__topline">
                <span>{source.key}</span><span>{source.chunkCount} chunks</span>
              </div>
              <h3>{source.title}</h3>
              <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
              <p className="source-card__preview">{source.preview}</p>
              <dl>
                <div><dt>Retrieved</dt><dd>{formatDate(source.retrievedAt)}</dd></div>
                <div><dt>Stored text</dt><dd>{source.contentLength.toLocaleString()} chars</dd></div>
              </dl>
              <button className="button-secondary" type="button" onClick={() => void onViewSource(source.id)}>
                Inspect evidence
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><h3>No sources stored</h3><p>Gather the configured public pages to begin.</p></div>
      )}
    </section>
  );
}
