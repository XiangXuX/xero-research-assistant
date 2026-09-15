import { afterEach, describe, expect, it } from "vitest";

import { openResearchDatabase } from "../src/server/database/database.js";
import { ResearchRepository } from "../src/server/database/research-repository.js";
import { runEvaluation } from "../src/server/evaluation/run-evaluation.js";
import type {
  ModelCompletion,
  ModelProvider,
  ModelRequest,
} from "../src/server/model/model-provider.js";

const databases: ReturnType<typeof openResearchDatabase>[] = [];

class EvaluationStubProvider implements ModelProvider {
  readonly provider = "offline-stub";
  readonly model = "deterministic-evaluation-model";
  readonly requests: ModelRequest[] = [];

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    this.requests.push(request);
    const multiSource = request.prompt.includes("both small businesses and accountants");
    const citations = multiSource ? ["E1", "E2"] : ["E1"];
    const marker = multiSource ? "[E1, E2]" : "[E1]";
    return {
      rawText: JSON.stringify({
        answer: `Evidence-supported evaluation answer ${marker}.`,
        citations,
        insufficientEvidence: false,
      }),
      provider: this.provider,
      model: this.model,
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
    };
  }
}

function evaluationRepository(): ResearchRepository {
  const database = openResearchDatabase(":memory:");
  databases.push(database);
  const repository = new ResearchRepository(database);
  repository.saveSource({
    key: "pricing-plans",
    url: "https://www.xero.com/au/pricing-plans/",
    title: "Pricing Plans | Xero AU",
    retrievedAt: "2026-09-14T01:00:00.000Z",
    contentHash: "pricing-hash",
    content: "Prices are in AUD and include GST.",
    chunks: [
      "Australian Xero pricing plan information. Prices are in AUD and include GST.",
    ],
  });
  repository.saveSource({
    key: "small-businesses",
    url: "https://www.xero.com/au/small-businesses/",
    title: "Xero for small businesses",
    retrievedAt: "2026-09-14T01:01:00.000Z",
    contentHash: "small-business-hash",
    content: "Small businesses can manage invoices and cash flow.",
    chunks: [
      "Xero supports small businesses with invoices, cash flow and online collaboration with accountants and bookkeepers.",
    ],
  });
  repository.saveSource({
    key: "accounting-partners",
    url: "https://www.xero.com/au/accountants-bookkeepers/",
    title: "Xero for accountants and bookkeepers",
    retrievedAt: "2026-09-14T01:02:00.000Z",
    contentHash: "partner-hash",
    content: "Accountants and bookkeepers can manage practices and clients.",
    chunks: [
      "Xero supports accountants and bookkeepers with practice management, client collaboration and automated workflows for small business customers.",
    ],
  });
  return repository;
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

describe("repeatable evaluation", () => {
  it("runs all four cases offline while preserving stored source retrieval dates", async () => {
    const provider = new EvaluationStubProvider();
    const record = await runEvaluation({
      repository: evaluationRepository(),
      provider,
      mode: "offline-mock",
      now: () => new Date("2026-09-15T03:00:00.000Z"),
      logger: { info: () => undefined, error: () => undefined },
    });

    expect(record.cases.map((result) => result.case)).toEqual([
      "supported",
      "multi-source",
      "insufficient-evidence",
      "repeated-follow-up",
    ]);
    expect(record.cases.every((result) => result.assessment.passed)).toBe(true);
    expect(record.modelCallsObserved).toBe(3);
    expect(provider.requests).toHaveLength(3);
    expect(record.reuseVerification).toMatchObject({
      gatherWorkflowInvoked: false,
      sourceRetrievalDatesUnchanged: true,
      storedSourceCountBefore: 3,
      storedSourceCountAfter: 3,
    });
    expect(record.allCasesPassed).toBe(true);
  });
});
