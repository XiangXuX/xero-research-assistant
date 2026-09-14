import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openResearchDatabase } from "../src/server/database/database.js";
import { ResearchRepository } from "../src/server/database/research-repository.js";
import { chunkContent } from "../src/server/research/chunk-content.js";
import { extractPageContent } from "../src/server/research/extract-content.js";
import { gatherResearch } from "../src/server/research/gather-research.js";

const fixturePath = path.resolve("tests/fixtures/xero-sample.html");

describe("research processing", () => {
  it("extracts useful page text and removes common page chrome", () => {
    const html = readFileSync(fixturePath, "utf8");
    const extracted = extractPageContent(html, "https://www.xero.com/au/example/");

    expect(extracted.title).toBe("Xero accounting software for small businesses");
    expect(extracted.content).toContain("Online accounting software for small businesses");
    expect(extracted.content).toContain("Create and send invoices.");
    expect(extracted.content).not.toContain("Accept every cookie");
    expect(extracted.content).not.toContain("trackingToken");
    expect(extracted.content).not.toContain("Products Pricing Log in Menu");
  });

  it("creates bounded, ordered chunks from extracted paragraphs", () => {
    const html = readFileSync(fixturePath, "utf8");
    const { content } = extractPageContent(html, "https://www.xero.com/au/example/");
    const chunks = chunkContent(content, {
      maxCharacters: 260,
      overlapCharacters: 60,
    });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 260)).toBe(true);
    expect(chunks.join(" ")).toContain("Collaborate with an adviser");
  });

  it("persists sources across reopen and atomically replaces their chunks", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "xero-research-test-"));
    const databasePath = path.join(temporaryDirectory, "research.db");

    try {
      const firstDatabase = openResearchDatabase(databasePath);
      const firstRepository = new ResearchRepository(firstDatabase);

      const initial = firstRepository.saveSource({
        key: "pricing-plans",
        url: "https://www.xero.com/au/pricing-plans/",
        title: "Initial pricing page",
        retrievedAt: "2026-09-14T01:00:00.000Z",
        contentHash: "initial-hash",
        content: "Initial stored page content that is long enough for this repository test.",
        chunks: ["Initial chunk one", "Initial chunk two"],
      });

      const replacement = firstRepository.saveSource({
        key: "pricing-plans",
        url: "https://www.xero.com/au/pricing-plans-updated/",
        title: "Replacement pricing page",
        retrievedAt: "2026-09-14T02:00:00.000Z",
        contentHash: "replacement-hash",
        content: "Replacement content stored after a configuration URL change.",
        chunks: ["Only the replacement chunk remains"],
      });

      expect(replacement.id).toBe(initial.id);
      expect(replacement.chunkCount).toBe(1);
      firstDatabase.close();

      const reopenedDatabase = openResearchDatabase(databasePath);
      const reopenedRepository = new ResearchRepository(reopenedDatabase);
      const stored = reopenedRepository.getSourceDetails(initial.id);

      expect(stored?.url).toBe("https://www.xero.com/au/pricing-plans-updated/");
      expect(stored?.contentHash).toBe("replacement-hash");
      expect(stored?.chunks.map((chunk) => chunk.content)).toEqual([
        "Only the replacement chunk remains",
      ]);
      reopenedDatabase.close();
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("keeps older stored evidence when a replacement page fetch fails", async () => {
    const database = openResearchDatabase(":memory:");
    const repository = new ResearchRepository(database);
    const original = repository.saveSource({
      key: "pricing-plans",
      url: "https://www.xero.com/au/pricing-plans/",
      title: "Previously successful pricing page",
      retrievedAt: "2026-09-13T01:00:00.000Z",
      contentHash: "known-good-hash",
      content: "Previously stored evidence must survive an external refresh failure.",
      chunks: ["Previously stored evidence"],
    });

    try {
      const result = await gatherResearch({
        sources: [
          {
            key: "pricing-plans",
            url: "https://www.xero.com/au/unavailable-pricing-page/",
            topic: "Synthetic unavailable replacement",
          },
        ],
        repository,
        fetchHtml: async () => {
          throw new Error("Page returned HTTP 503 Service Unavailable");
        },
        logger: { info: () => undefined, error: () => undefined },
      });

      expect(result.failed).toBe(1);
      expect(result.results[0]?.message).toContain("HTTP 503");

      const stillStored = repository.getSourceDetails(original.id);
      expect(stillStored?.url).toBe("https://www.xero.com/au/pricing-plans/");
      expect(stillStored?.retrievedAt).toBe("2026-09-13T01:00:00.000Z");
      expect(stillStored?.contentHash).toBe("known-good-hash");
      expect(stillStored?.chunks[0]?.content).toBe("Previously stored evidence");
    } finally {
      database.close();
    }
  });

  it("explicitly refreshes and replaces an unchanged configured source", async () => {
    const database = openResearchDatabase(":memory:");
    const repository = new ResearchRepository(database);
    const url = "https://www.xero.com/au/pricing-plans/";
    repository.saveSource({
      key: "pricing-plans",
      url,
      title: "Previously stored pricing page",
      retrievedAt: "2026-09-13T01:00:00.000Z",
      contentHash: "old-hash",
      content: "Previously stored pricing evidence.",
      chunks: ["Previously stored pricing evidence."],
    });
    let fetchCalls = 0;

    try {
      const result = await gatherResearch({
        forceRefresh: true,
        sources: [{ key: "pricing-plans", url, topic: "Australian pricing" }],
        repository,
        fetchHtml: async () => {
          fetchCalls += 1;
          return readFileSync(fixturePath, "utf8");
        },
        now: () => new Date("2026-09-14T03:00:00.000Z"),
        logger: { info: () => undefined, error: () => undefined },
      });

      expect(fetchCalls).toBe(1);
      expect(result.fetched).toBe(1);
      expect(result.reused).toBe(0);
      expect(repository.findByKey("pricing-plans")).toMatchObject({
        title: "Xero accounting software for small businesses",
        retrievedAt: "2026-09-14T03:00:00.000Z",
      });
    } finally {
      database.close();
    }
  });
});
