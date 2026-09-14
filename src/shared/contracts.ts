export interface HealthResponse {
  status: "ok";
  service: "xero-research-api";
}

export type GatherStatus = "fetched" | "reused" | "failed";

export interface SourceSummary {
  id: number;
  key: string;
  url: string;
  title: string;
  retrievedAt: string;
  contentHash: string;
  contentLength: number;
  chunkCount: number;
  preview: string;
}

export interface EvidenceChunk {
  id: number;
  sourceId: number;
  position: number;
  content: string;
}

export interface SourceDetails extends SourceSummary {
  content: string;
  chunks: EvidenceChunk[];
}

export interface ResearchStateResponse {
  configuredSourceCount: number;
  storedSourceCount: number;
  databasePath: string;
  sources: SourceSummary[];
}

export interface GatherSourceResult {
  key: string;
  url: string;
  status: GatherStatus;
  title?: string;
  retrievedAt?: string;
  contentHash?: string;
  contentLength?: number;
  chunkCount?: number;
  message: string;
}

export interface GatherResponse {
  startedAt: string;
  completedAt: string;
  fetched: number;
  reused: number;
  failed: number;
  results: GatherSourceResult[];
}

export interface ErrorResponse {
  error: string;
}
