import { afterEach, describe, expect, it } from "vitest";

import { openResearchDatabase } from "../src/server/database/database.js";
import { ResearchRepository } from "../src/server/database/research-repository.js";
import { answerQuestion } from "../src/server/model/answer-question.js";
import { InvalidModelResponseError } from "../src/server/model/answer-validator.js";
import { GeminiModelProvider } from "../src/server/model/gemini-provider.js";
import type {
  ModelCompletion,
  ModelProvider,
  ModelRequest,
} from "../src/server/model/model-provider.js";
import { ModelProviderError } from "../src/server/model/model-provider.js";

const databases: ReturnType<typeof openResearchDatabase>[] = [];
const quietLogger = { info: () => undefined, error: () => undefined };

function repositoryWithEvidence(): ResearchRepository {
  const database = openResearchDatabase(":memory:");
  databases.push(database);
  const repository = new ResearchRepository(database);

  repository.saveSource({
    key: "pricing-plans",
    url: "https://www.xero.com/au/pricing-plans/",
    title: "Pricing Plans | Xero AU",
    retrievedAt: "2026-09-14T01:00:00.000Z",
    contentHash: "pricing-hash",
    content: "Australian pricing evidence.",
    chunks: [
      "Xero offers Ignite, Grow, Comprehensive, Ultimate and Ultra pricing plans.",
      "Prices are in AUD and include GST. Subscriptions renew monthly until cancelled.",
      "Plan features include invoicing, payroll, expenses and project tracking.",
    ],
  });
  repository.saveSource({
    key: "small-businesses",
    url: "https://www.xero.com/au/small-businesses/",
    title: "Xero for small businesses",
    retrievedAt: "2026-09-14T01:01:00.000Z",
    contentHash: "business-hash",
    content: "Small business evidence.",
    chunks: [
      "Xero helps small business owners manage invoices and cash flow.",
      "Businesses can collaborate online with accountants and bookkeepers.",
      "The accounting app supports business administration from anywhere.",
    ],
  });
  repository.saveSource({
    key: "archive-notes",
    url: "https://www.xero.com/au/archive-notes/",
    title: "Archive notes",
    retrievedAt: "2026-09-14T01:02:00.000Z",
    contentHash: "archive-hash",
    content: "Unrelated archived material.",
    chunks: ["DO_NOT_SEND_FULL_CORPUS_MARKER: historical office relocation notes."],
  });

  return repository;
}

class StubModelProvider implements ModelProvider {
  readonly provider = "stub-real-boundary";
  readonly model = "stub-model";
  readonly requests: ModelRequest[] = [];

  constructor(private readonly rawText: string) {}

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    this.requests.push(request);
    return {
      rawText: this.rawText,
      provider: this.provider,
      model: this.model,
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    };
  }
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

describe("grounded model workflow", () => {
  it("sends only retrieved Top K evidence and maps validated citations on the backend", async () => {
    const repository = repositoryWithEvidence();
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "Xero offers several Australian pricing plans [E1].",
        citations: ["E1"],
        insufficientEvidence: false,
      }),
    );

    const result = await answerQuestion(
      "What pricing plans does Xero offer in Australia?",
      { repository, provider, logger: quietLogger },
    );

    expect(result.status).toBe("answered");
    expect(result.modelCall).toMatchObject({
      occurred: true,
      status: "succeeded",
      inputTokens: 100,
      outputTokens: 40,
    });
    expect(result.citations[0]).toMatchObject({
      evidenceId: "E1",
      sourceTitle: "Pricing Plans | Xero AU",
      sourceUrl: "https://www.xero.com/au/pricing-plans/",
    });
    expect(result.citations[0]?.supportingText).toBe(result.retrieval.results[0]?.content);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.prompt).toContain("[E1]");
    expect(provider.requests[0]?.prompt).not.toContain("DO_NOT_SEND_FULL_CORPUS_MARKER");
    expect(result.retrieval.results.length).toBeLessThanOrEqual(5);
    expect(result.events.map((event) => event.type)).toEqual([
      "RETRIEVAL_COMPLETED",
      "MODEL_CALL_STARTED",
      "MODEL_CALL_COMPLETED",
    ]);
  });

  it("rejects a citation id that retrieval did not provide", async () => {
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "An unsupported claim [E99].",
        citations: ["E99"],
        insufficientEvidence: false,
      }),
    );

    await expect(
      answerQuestion("What pricing plans does Xero offer?", {
        repository: repositoryWithEvidence(),
        provider,
        logger: quietLogger,
      }),
    ).rejects.toThrow(InvalidModelResponseError);
  });

  it("fails visibly when the model does not return valid JSON", async () => {
    const provider = new StubModelProvider("This is not JSON.");

    await expect(
      answerQuestion("What pricing plans does Xero offer?", {
        repository: repositoryWithEvidence(),
        provider,
        logger: quietLogger,
      }),
    ).rejects.toThrow("The model output was not valid JSON");
  });

  it("rejects disagreement between inline markers and the citation list", async () => {
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "The claim cites the first passage [E1].",
        citations: ["E2"],
        insufficientEvidence: false,
      }),
    );

    await expect(
      answerQuestion("What pricing plans does Xero offer?", {
        repository: repositoryWithEvidence(),
        provider,
        logger: quietLogger,
      }),
    ).rejects.toThrow("Inline evidence markers must exactly match");
  });

  it("accepts multiple valid evidence ids in one inline citation group", async () => {
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "Xero offers Australian plans with monthly subscriptions [E1, E2].",
        citations: ["E1", "E2"],
        insufficientEvidence: false,
      }),
    );

    const result = await answerQuestion(
      "What pricing plans does Xero offer in Australia?",
      { repository: repositoryWithEvidence(), provider, logger: quietLogger },
    );

    expect(result.status).toBe("answered");
    expect(result.citations.map((citation) => citation.evidenceId)).toEqual(["E1", "E2"]);
  });

  it("skips the model when retrieval evidence is weak", async () => {
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "This response must never be used.",
        citations: [],
        insufficientEvidence: false,
      }),
    );

    const result = await answerQuestion("Does Xero offer bookkeeping on Mars?", {
      repository: repositoryWithEvidence(),
      provider,
      logger: quietLogger,
    });

    expect(result.status).toBe("insufficient_evidence");
    expect(result.insufficientEvidence).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.modelCall).toMatchObject({ occurred: false, status: "not_called" });
    expect(provider.requests).toHaveLength(0);
    expect(result.events.map((event) => event.type)).toEqual([
      "RETRIEVAL_COMPLETED",
      "MODEL_CALL_SKIPPED",
    ]);
  });

  it("answers consecutive questions from stored research and calls the model each time", async () => {
    const repository = repositoryWithEvidence();
    const provider = new StubModelProvider(
      JSON.stringify({
        answer: "The stored pricing evidence supports this answer [E1].",
        citations: ["E1"],
        insufficientEvidence: false,
      }),
    );

    const first = await answerQuestion(
      "What pricing plans does Xero offer in Australia?",
      { repository, provider, logger: quietLogger },
    );
    const second = await answerQuestion(
      "Are Xero prices in AUD and do they include GST?",
      { repository, provider, logger: quietLogger },
    );

    expect(first.modelCall.occurred).toBe(true);
    expect(second.modelCall.occurred).toBe(true);
    expect(provider.requests).toHaveLength(2);
    expect(first.events.some((event) => event.type === "MODEL_CALL_COMPLETED")).toBe(true);
    expect(second.events.some((event) => event.type === "MODEL_CALL_COMPLETED")).toBe(true);
  });

  it("turns a Gemini HTTP failure into a safe provider error", async () => {
    const provider = new GeminiModelProvider({
      apiKey: "test-key-that-must-not-appear-in-errors",
      model: "gemini-3.1-flash-lite",
      timeoutMs: 1_000,
      fetchImplementation: async () =>
        new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
    });

    try {
      await provider.complete({
        systemInstruction: "system",
        prompt: "prompt",
        responseSchema: { type: "object" },
      });
      throw new Error("Expected the provider call to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelProviderError);
      expect((error as Error).message).not.toContain(
        "test-key-that-must-not-appear-in-errors",
      );
    }
  });

  it("parses a completed Gemini structured response and reports token usage", async () => {
    let capturedRequest: RequestInit | undefined;
    const provider = new GeminiModelProvider({
      apiKey: "test-key",
      model: "gemini-3.1-flash-lite",
      timeoutMs: 1_000,
      fetchImplementation: async (_input, init) => {
        capturedRequest = init;
        return new Response(
          JSON.stringify({
            status: "completed",
            model: "gemini-3.1-flash-lite",
            steps: [
              {
                type: "model_output",
                content: [
                  {
                    type: "text",
                    text: '{"answer":"Supported [E1].","citations":["E1"],"insufficientEvidence":false}',
                  },
                ],
              },
            ],
            usage: {
              total_input_tokens: 120,
              total_output_tokens: 30,
              total_tokens: 150,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const completion = await provider.complete({
      systemInstruction: "Use evidence only.",
      prompt: "Evidence E1",
      responseSchema: { type: "object" },
    });

    expect(completion.rawText).toContain("Supported [E1]");
    expect(completion.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    });
    const requestBody = JSON.parse(String(capturedRequest?.body)) as {
      store: boolean;
      response_format: { mime_type: string };
    };
    expect(requestBody.store).toBe(false);
    expect(requestBody.response_format.mime_type).toBe("application/json");
  });
});
