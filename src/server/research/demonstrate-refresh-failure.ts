import type { RefreshFailureDemoResponse } from "../../shared/contracts.js";
import type { ResearchRepository } from "../database/research-repository.js";
import { gatherResearch } from "./gather-research.js";

export interface DemonstrateRefreshFailureOptions {
  repository?: Pick<
    ResearchRepository,
    "listSources" | "findByKey" | "listSearchableChunks" | "saveSource"
  >;
  now?: () => Date;
}

export class FailureDemoUnavailableError extends Error {
  constructor() {
    super("Gather research before running the refresh failure demonstration.");
    this.name = "FailureDemoUnavailableError";
  }
}

export async function demonstrateRefreshFailure(
  options: DemonstrateRefreshFailureOptions = {},
): Promise<RefreshFailureDemoResponse> {
  const repository =
    options.repository ?? (await import("../database/index.js")).researchRepository;
  const target = repository.listSources()[0];

  if (!target) {
    throw new FailureDemoUnavailableError();
  }

  const beforeChunks = repository
    .listSearchableChunks()
    .filter((chunk) => chunk.sourceId === target.id)
    .map((chunk) => ({ position: chunk.position, content: chunk.content }));

  const result = await gatherResearch({
    forceRefresh: true,
    sources: [
      {
        key: target.key,
        url: target.url,
        topic: "Synthetic refresh failure demonstration",
      },
    ],
    repository,
    fetchHtml: async () => {
      throw new Error("Synthetic page returned HTTP 503 Service Unavailable");
    },
    now: options.now,
    logger: { info: () => undefined, error: () => undefined },
  });

  const after = repository.findByKey(target.key);
  if (!after) {
    throw new Error("The previously stored source was unexpectedly unavailable.");
  }

  const afterChunks = repository
    .listSearchableChunks()
    .filter((chunk) => chunk.sourceId === target.id)
    .map((chunk) => ({ position: chunk.position, content: chunk.content }));
  const oldEvidenceQueryable =
    afterChunks.length > 0 && JSON.stringify(beforeChunks) === JSON.stringify(afterChunks);

  return {
    status: "failed_safely",
    scenario: "synthetic_http_503",
    source: {
      key: target.key,
      title: target.title,
      url: target.url,
    },
    failureMessage:
      result.results[0]?.message ?? "Synthetic HTTP 503 Service Unavailable",
    lastAttemptedAt: result.completedAt,
    lastSuccessfullyRetrievedAt: after.retrievedAt,
    liveNetworkRequestMade: false,
    checks: {
      oldEvidenceRetained:
        after.url === target.url &&
        after.contentHash === target.contentHash &&
        oldEvidenceQueryable,
      oldEvidenceQueryable,
      retrievedAtUnchanged: after.retrievedAt === target.retrievedAt,
      contentHashUnchanged: after.contentHash === target.contentHash,
      chunkCountUnchanged: after.chunkCount === target.chunkCount,
      credentialExposed: false,
      answerGenerated: false,
    },
    events: result.events,
  };
}
