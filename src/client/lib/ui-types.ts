export type ConnectionState = "checking" | "connected" | "unavailable";
export type ActivityTone = "info" | "success" | "warning" | "error";
export type ResearchAction = "gather" | "refresh";

export interface ActivityEntry {
  id: number;
  occurredAt: string;
  label: string;
  detail: string;
  tone: ActivityTone;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
