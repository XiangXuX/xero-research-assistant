import { afterEach, describe, expect, it } from "vitest";

import { openResearchDatabase } from "../src/server/database/database.js";
import { ResearchRepository } from "../src/server/database/research-repository.js";
import { demonstrateRefreshFailure } from "../src/server/research/demonstrate-refresh-failure.js";

const databases: ReturnType<typeof openResearchDatabase>[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

describe("safe refresh failure demonstration", () => {
  it("shows an HTTP 503 while preserving last-known-good evidence and retrieval time", async () => {
    const database = openResearchDatabase(":memory:");
    databases.push(database);
    const repository = new ResearchRepository(database);
    repository.saveSource({
      key: "pricing-plans",
      url: "https://www.xero.com/au/pricing-plans/",
      title: "Pricing Plans | Xero AU",
      retrievedAt: "2026-09-14T01:00:00.000Z",
      contentHash: "last-known-good-hash",
      content: "Xero offers Ignite and Grow pricing plans in Australia.",
      chunks: ["Xero offers Ignite and Grow pricing plans in Australia."],
    });

    const result = await demonstrateRefreshFailure({
      repository,
      now: () => new Date("2026-09-15T02:00:00.000Z"),
    });

    expect(result.status).toBe("failed_safely");
    expect(result.failureMessage).toContain("HTTP 503");
    expect(result.lastAttemptedAt).toBe("2026-09-15T02:00:00.000Z");
    expect(result.lastSuccessfullyRetrievedAt).toBe("2026-09-14T01:00:00.000Z");
    expect(result.liveNetworkRequestMade).toBe(false);
    expect(result.checks).toEqual({
      oldEvidenceRetained: true,
      oldEvidenceQueryable: true,
      retrievedAtUnchanged: true,
      contentHashUnchanged: true,
      chunkCountUnchanged: true,
      credentialExposed: false,
      answerGenerated: false,
    });
    expect(result.events).toEqual([
      expect.objectContaining({ type: "REFRESH_FAILED", sourceKey: "pricing-plans" }),
    ]);
    expect(repository.listSearchableChunks()[0]?.content).toContain("Ignite and Grow");
  });
});
