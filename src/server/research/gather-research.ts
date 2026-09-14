import { createHash } from "node:crypto";

import type {
  GatherResponse,
  GatherSourceResult,
  WorkflowEvent,
} from "../../shared/contracts.js";
import type { ResearchRepository } from "../database/research-repository.js";
import { chunkContent } from "./chunk-content.js";
import { extractPageContent } from "./extract-content.js";
import { fetchPageHtml } from "./fetch-page.js";
import { configuredSources, type ConfiguredSource } from "./sources.js";

export interface GatherResearchOptions {
  forceRefresh?: boolean;
  sources?: readonly ConfiguredSource[];
  repository?: Pick<ResearchRepository, "findByKey" | "saveSource">;
  fetchHtml?: typeof fetchPageHtml;
  extract?: typeof extractPageContent;
  chunk?: typeof chunkContent;
  now?: () => Date;
  logger?: Pick<Console, "info" | "error">;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown research processing error";
}

export async function gatherResearch(
  options: GatherResearchOptions = {},
): Promise<GatherResponse> {
  const sources = options.sources ?? configuredSources;
  const repository =
    options.repository ?? (await import("../database/index.js")).researchRepository;
  const fetchHtml = options.fetchHtml ?? fetchPageHtml;
  const extract = options.extract ?? extractPageContent;
  const chunk = options.chunk ?? chunkContent;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? console;
  const startedAt = now().toISOString();
  const results: GatherSourceResult[] = [];
  const events: WorkflowEvent[] = [];
  const forceRefresh = options.forceRefresh ?? false;

  for (const configuredSource of sources) {
    const existing = repository.findByKey(configuredSource.key);
    if (
      !forceRefresh &&
      existing &&
      existing.url === configuredSource.url &&
      existing.contentLength > 0 &&
      existing.chunkCount > 0
    ) {
      const result: GatherSourceResult = {
        key: existing.key,
        url: existing.url,
        status: "reused",
        title: existing.title,
        retrievedAt: existing.retrievedAt,
        contentHash: existing.contentHash,
        contentLength: existing.contentLength,
        chunkCount: existing.chunkCount,
        message: "Reused stored research; no network request or processing occurred.",
      };
      results.push(result);
      events.push({
        type: "SOURCE_REUSED",
        occurredAt: now().toISOString(),
        sourceKey: configuredSource.key,
        sourceUrl: configuredSource.url,
        detail: `${existing.chunkCount} stored chunks reused; no network request or processing occurred.`,
      });
      logger.info(`[research] reused ${configuredSource.key} (${existing.chunkCount} chunks)`);
      continue;
    }

    try {
      logger.info(`[research] fetching ${configuredSource.url}`);
      const html = await fetchHtml(configuredSource.url);
      events.push({
        type: "SOURCE_FETCHED",
        occurredAt: now().toISOString(),
        sourceKey: configuredSource.key,
        sourceUrl: configuredSource.url,
        detail: "Public page HTML fetched successfully.",
      });
      const extracted = extract(html, configuredSource.url);
      const chunks = chunk(extracted.content);
      const retrievedAt = now().toISOString();
      const contentHash = hashContent(extracted.content);
      const stored = repository.saveSource({
        key: configuredSource.key,
        url: configuredSource.url,
        title: extracted.title,
        retrievedAt,
        contentHash,
        content: extracted.content,
        chunks,
      });

      results.push({
        key: stored.key,
        url: stored.url,
        status: "fetched",
        title: stored.title,
        retrievedAt: stored.retrievedAt,
        contentHash: stored.contentHash,
        contentLength: stored.contentLength,
        chunkCount: stored.chunkCount,
        message: "Fetched, extracted, chunked, and saved successfully.",
      });
      events.push({
        type: "SOURCE_PROCESSED",
        occurredAt: now().toISOString(),
        sourceKey: configuredSource.key,
        sourceUrl: configuredSource.url,
        detail: `${stored.chunkCount} chunks extracted and saved atomically.`,
      });
      logger.info(`[research] stored ${configuredSource.key} (${stored.chunkCount} chunks)`);
    } catch (error) {
      const message = errorMessage(error);
      results.push({
        key: configuredSource.key,
        url: configuredSource.url,
        status: "failed",
        message,
      });
      events.push({
        type: forceRefresh ? "REFRESH_FAILED" : "GATHER_FAILED",
        occurredAt: now().toISOString(),
        sourceKey: configuredSource.key,
        sourceUrl: configuredSource.url,
        detail: `${message} Previously stored evidence, if any, was left unchanged.`,
      });
      logger.error(`[research] failed ${configuredSource.key}: ${message}`);
    }
  }

  return {
    startedAt,
    completedAt: now().toISOString(),
    fetched: results.filter((result) => result.status === "fetched").length,
    reused: results.filter((result) => result.status === "reused").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
    events,
  };
}
