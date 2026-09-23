import type { SourceDetails } from "../../shared/contracts.js";
import { formatDate } from "../lib/ui-types.js";

interface SourceDetailsPanelProps {
  source: SourceDetails;
  onClose: () => void;
}

export function SourceDetailsPanel({ source, onClose }: SourceDetailsPanelProps) {
  return (
    <section className="evidence-view" aria-labelledby="evidence-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Stored evidence</p>
          <h2 id="evidence-heading">{source.title}</h2>
          <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
        </div>
        <button className="button-secondary" type="button" onClick={onClose}>Close</button>
      </div>
      <p className="source-view-meta">Retrieved {formatDate(source.retrievedAt)} · {source.chunks.length} chunks</p>
      <ol className="chunk-list">
        {source.chunks.map((chunk) => (
          <li key={chunk.id}><span>Chunk {chunk.position + 1} · ID {chunk.id}</span><p>{chunk.content}</p></li>
        ))}
      </ol>
    </section>
  );
}
