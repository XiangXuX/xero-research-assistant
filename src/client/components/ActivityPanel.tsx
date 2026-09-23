import type { GatherResponse } from "../../shared/contracts.js";
import { formatDate, type ActivityEntry, type ResearchAction } from "../lib/ui-types.js";

interface ActivityPanelProps {
  activities: ActivityEntry[];
  gatherResult: GatherResponse | null;
  action: ResearchAction;
}

export function ActivityPanel({ activities, gatherResult, action }: ActivityPanelProps) {
  return (
    <details className="activity-view">
      <summary>
        <span><strong>Session activity</strong><small>Fetch, reuse, retrieval and model events</small></span>
        <span>{activities.length} events</span>
      </summary>
      <div className="activity-view__body">
        {gatherResult ? (
          <div className="activity-summary">
            <strong>Latest {action}</strong>
            <span>{gatherResult.fetched} fetched</span>
            <span>{gatherResult.reused} reused</span>
            <span>{gatherResult.failed} failed</span>
          </div>
        ) : null}

        {activities.length ? (
          <ol className="event-list" aria-live="polite">
            {activities.map((activity) => (
              <li className={`event event--${activity.tone}`} key={activity.id}>
                <time dateTime={activity.occurredAt}>{formatDate(activity.occurredAt)}</time>
                <div><strong>{activity.label}</strong><p>{activity.detail}</p></div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No activity recorded in this session.</p>
        )}
      </div>
    </details>
  );
}
