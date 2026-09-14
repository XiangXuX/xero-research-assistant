import { afterEach, describe, expect, it } from "vitest";

import { openResearchDatabase } from "../src/server/database/database.js";
import { ResearchRepository } from "../src/server/database/research-repository.js";
import { retrieveEvidence } from "../src/server/retrieval/retrieve-evidence.js";

const databases: ReturnType<typeof openResearchDatabase>[] = [];

function repositoryWithEvidence(): ResearchRepository {
  const database = openResearchDatabase(":memory:");
  databases.push(database);
  const repository = new ResearchRepository(database);

  repository.saveSource({
    key: "accounting-software",
    url: "https://www.xero.com/au/accounting-software/",
    title: "Accounting software for Australian small businesses",
    retrievedAt: "2026-09-14T01:00:00.000Z",
    contentHash: "software-hash",
    content: "Accounting software and invoicing features.",
    chunks: [
      "Online accounting software includes invoice creation and bank reconciliation.",
      "Automate everyday bookkeeping tasks and collaborate with an adviser.",
    ],
  });
  repository.saveSource({
    key: "pricing-plans",
    url: "https://www.xero.com/au/pricing-plans/",
    title: "Pricing plans",
    retrievedAt: "2026-09-14T01:01:00.000Z",
    contentHash: "pricing-hash",
    content: "Australian pricing plan evidence.",
    chunks: [
      "Choose a pricing plan for your business. Starter, Standard and Premium plans are billed in Australian dollars.",
      "Optional payroll and expense features can affect subscription costs.",
    ],
  });
  repository.saveSource({
    key: "small-businesses",
    url: "https://www.xero.com/au/small-businesses/",
    title: "Xero for small businesses",
    retrievedAt: "2026-09-14T01:02:00.000Z",
    contentHash: "customer-hash",
    content: "Small business customer evidence.",
    chunks: [
      "Xero helps small business owners and their teams manage finances from anywhere.",
      "Business users can connect with accountants and bookkeepers.",
    ],
  });

  return repository;
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

describe("BM25 evidence retrieval", () => {
  it("ranks the pricing source first for an Australian pricing question", () => {
    const repository = repositoryWithEvidence();
    const result = retrieveEvidence(
      "What pricing plans does Xero offer in Australia?",
      repository.listSearchableChunks(),
      5,
      "2026-09-14T02:00:00.000Z",
    );

    expect(result.totalChunksSearched).toBe(6);
    expect(result.results.length).toBeLessThanOrEqual(5);
    expect(result.matchQuality).toBe("strong");
    expect(result.results[0]?.sourceKey).toBe("pricing-plans");
    expect(result.results[0]?.matchedTerms).toEqual(expect.arrayContaining(["price", "plan"]));
  });

  it("ranks the small-business source first for an intended-customer question", () => {
    const repository = repositoryWithEvidence();
    const result = retrieveEvidence(
      "What customers is Xero designed for?",
      repository.listSearchableChunks(),
    );

    expect(result.results[0]?.sourceKey).toBe("small-businesses");
    expect(result.matchQuality).toBe("strong");
    expect(result.results[0]?.matchedTerms).toEqual(
      expect.arrayContaining(["business", "user"]),
    );
  });

  it("marks partial word overlap as weak evidence for an unrelated question", () => {
    const repository = repositoryWithEvidence();
    const result = retrieveEvidence(
      "Does Xero provide Martian bookkeeping services?",
      repository.listSearchableChunks(),
    );

    expect(result.totalChunksSearched).toBe(6);
    expect(result.matchQuality).toBe("weak");
    expect(result.results[0]?.matchedTerms).toContain("bookkeeping");
    expect(result.results[0]?.queryCoverage).toBeLessThan(0.6);
  });

  it("returns only the requested Top K chunks with traceable metadata", () => {
    const repository = repositoryWithEvidence();
    const result = retrieveEvidence(
      "small business accounting invoice plan price",
      repository.listSearchableChunks(),
      3,
    );

    expect(result.results).toHaveLength(3);
    expect(result.results.map((evidence) => evidence.evidenceId)).toEqual(["E1", "E2", "E3"]);
    expect(result.results.every((evidence) => evidence.sourceTitle && evidence.sourceUrl)).toBe(true);
    expect(result.results[0]?.score).toBeGreaterThanOrEqual(result.results[1]?.score ?? 0);
  });
});
