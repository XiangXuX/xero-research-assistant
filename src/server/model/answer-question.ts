import type {
  AnswerCitation,
  AnswerResponse,
  ModelCallActivity,
  WorkflowEvent,
} from "../../shared/contracts.js";
import type { ResearchRepository } from "../database/research-repository.js";
import { retrieveEvidence } from "../retrieval/retrieve-evidence.js";
import { parseAndValidateModelAnswer } from "./answer-validator.js";
import {
  ANSWER_SYSTEM_INSTRUCTION,
  answerResponseSchema,
  buildAnswerPrompt,
} from "./build-answer-prompt.js";
import { createConfiguredModelProvider } from "./index.js";
import type { ModelProvider } from "./model-provider.js";

export interface AnswerQuestionOptions {
  repository?: Pick<ResearchRepository, "listSearchableChunks">;
  provider?: ModelProvider;
  now?: () => Date;
  logger?: Pick<Console, "info" | "error">;
}

function durationBetween(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

export async function answerQuestion(
  question: string,
  options: AnswerQuestionOptions = {},
): Promise<AnswerResponse> {
  const repository =
    options.repository ?? (await import("../database/index.js")).researchRepository;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? console;
  const retrieval = retrieveEvidence(question, repository.listSearchableChunks());
  const events: WorkflowEvent[] = [
    {
      type: "RETRIEVAL_COMPLETED",
      occurredAt: retrieval.searchedAt,
      detail: `${retrieval.totalChunksSearched} stored chunks searched; ${retrieval.results.length} returned; match ${retrieval.matchQuality}.`,
    },
  ];

  if (retrieval.matchQuality !== "strong") {
    const modelCall: ModelCallActivity = {
      occurred: false,
      status: "not_called",
      reason: `Retrieval match was ${retrieval.matchQuality}; the model call was skipped to avoid an unsupported answer.`,
    };
    logger.info(`[model] skipped: ${modelCall.reason}`);
    events.push({
      type: "MODEL_CALL_SKIPPED",
      occurredAt: now().toISOString(),
      detail: modelCall.reason ?? "The model call was skipped.",
    });

    return {
      question: retrieval.question,
      status: "insufficient_evidence",
      answer:
        "The stored research does not provide enough relevant evidence to answer this question reliably.",
      citationIds: [],
      citations: [],
      insufficientEvidence: true,
      retrieval,
      modelCall,
      events,
    };
  }

  const provider = options.provider ?? createConfiguredModelProvider();
  const allowedEvidenceIds = retrieval.results.map((evidence) => evidence.evidenceId);
  const startedAt = now().toISOString();
  logger.info(
    `[model] calling ${provider.provider}/${provider.model} with ${retrieval.results.length} evidence chunks`,
  );
  events.push({
    type: "MODEL_CALL_STARTED",
    occurredAt: startedAt,
    detail: `${provider.provider}/${provider.model} called with ${retrieval.results.length} retrieved evidence chunks.`,
  });

  try {
    const completion = await provider.complete({
      systemInstruction: ANSWER_SYSTEM_INSTRUCTION,
      prompt: buildAnswerPrompt(retrieval.question, retrieval.results),
      responseSchema: answerResponseSchema(allowedEvidenceIds),
    });
    const parsed = parseAndValidateModelAnswer(completion.rawText, allowedEvidenceIds);
    const completedAt = now().toISOString();
    const citations = parsed.citations.map((evidenceId): AnswerCitation => {
      const evidence = retrieval.results.find((item) => item.evidenceId === evidenceId);
      if (!evidence) {
        throw new Error(`Validated evidence ${evidenceId} could not be mapped.`);
      }

      return {
        evidenceId,
        chunkId: evidence.id,
        sourceId: evidence.sourceId,
        sourceTitle: evidence.sourceTitle,
        sourceUrl: evidence.sourceUrl,
        retrievedAt: evidence.retrievedAt,
        supportingText: evidence.content,
      };
    });

    logger.info(
      `[model] completed ${completion.provider}/${completion.model}; ${citations.length} citations validated`,
    );
    events.push({
      type: "MODEL_CALL_COMPLETED",
      occurredAt: completedAt,
      detail: `${completion.provider}/${completion.model} completed in ${durationBetween(startedAt, completedAt)} ms; ${citations.length} citations validated${completion.usage?.totalTokens ? `; ${completion.usage.totalTokens} total tokens` : ""}.`,
    });

    return {
      question: retrieval.question,
      status: parsed.insufficientEvidence ? "insufficient_evidence" : "answered",
      answer: parsed.answer,
      citationIds: parsed.citations,
      citations,
      insufficientEvidence: parsed.insufficientEvidence,
      retrieval,
      modelCall: {
        occurred: true,
        status: "succeeded",
        provider: completion.provider,
        model: completion.model,
        startedAt,
        completedAt,
        durationMs: durationBetween(startedAt, completedAt),
        inputTokens: completion.usage?.inputTokens,
        outputTokens: completion.usage?.outputTokens,
        totalTokens: completion.usage?.totalTokens,
      },
      events,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown model workflow error";
    logger.error(`[model] failed ${provider.provider}/${provider.model}: ${detail}`);
    throw error;
  }
}
