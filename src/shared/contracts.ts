export interface HealthResponse {
  status: "ok";
  service: "xero-research-api";
}

export type GatherStatus = "fetched" | "reused" | "failed";

export type WorkflowEventType =
  | "SOURCE_FETCHED"
  | "SOURCE_REUSED"
  | "SOURCE_PROCESSED"
  | "RETRIEVAL_COMPLETED"
  | "MODEL_CALL_STARTED"
  | "MODEL_CALL_COMPLETED"
  | "MODEL_CALL_SKIPPED"
  | "REFRESH_FAILED"
  | "GATHER_FAILED";

export interface WorkflowEvent {
  type: WorkflowEventType;
  occurredAt: string;
  detail: string;
  sourceKey?: string;
  sourceUrl?: string;
}

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

export interface RetrievedEvidence extends EvidenceChunk {
  evidenceId: string;
  sourceKey: string;
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  score: number;
  queryCoverage: number;
  matchedTerms: string[];
}

export interface RetrievalResponse {
  question: string;
  method: "bm25-keyword";
  searchedAt: string;
  totalChunksSearched: number;
  topK: number;
  queryTerms: string[];
  matchQuality: "strong" | "weak" | "none";
  results: RetrievedEvidence[];
}

export interface ModelStatus {
  provider: string;
  name: string;
  configured: boolean;
}

export interface ModelCallActivity {
  occurred: boolean;
  status: "not_called" | "succeeded";
  provider?: string;
  model?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reason?: string;
}

export interface AnswerCitation {
  evidenceId: string;
  chunkId: number;
  sourceId: number;
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  supportingText: string;
}

export interface AnswerResponse {
  question: string;
  status: "answered" | "insufficient_evidence";
  answer: string;
  citationIds: string[];
  citations: AnswerCitation[];
  insufficientEvidence: boolean;
  retrieval: RetrievalResponse;
  modelCall: ModelCallActivity;
  events: WorkflowEvent[];
}

export interface SourceDetails extends SourceSummary {
  content: string;
  chunks: EvidenceChunk[];
}

export interface ResearchStateResponse {
  configuredSourceCount: number;
  storedSourceCount: number;
  databasePath: string;
  model: ModelStatus;
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
  events: WorkflowEvent[];
}

export interface ErrorResponse {
  error: string;
  code?: string;
}
