import type {
  AnswerResponse,
  SourceSummary,
} from "../../shared/contracts.js";
import type { ResearchRepository } from "../database/research-repository.js";
import { answerQuestion } from "../model/answer-question.js";
import { createConfiguredModelProvider } from "../model/index.js";
import type { ModelProvider } from "../model/model-provider.js";

export type EvaluationCaseId =
  | "supported"
  | "multi-source"
  | "insufficient-evidence"
  | "repeated-follow-up";

interface EvaluationCaseDefinition {
  id: EvaluationCaseId;
  question: string;
  expectedBehaviour: string;
}

const evaluationCases: EvaluationCaseDefinition[] = [
  {
    id: "supported",
    question: "Are Xero prices in Australia stated in AUD and do they include GST?",
    expectedBehaviour:
      "Answer from the Australian pricing source with at least one validated citation.",
  },
  {
    id: "multi-source",
    question:
      "How does Xero support both small businesses and accountants or bookkeepers in Australia?",
    expectedBehaviour:
      "Integrate evidence from at least two distinct stored source URLs and cite both.",
  },
  {
    id: "insufficient-evidence",
    question: "Does Xero provide weather forecasts for Mars?",
    expectedBehaviour:
      "Return insufficient evidence without calling the model or accepting citations.",
  },
  {
    id: "repeated-follow-up",
    question: "What are Xero's pricing plans in Australia?",
    expectedBehaviour:
      "Answer from the already stored research, make a new model call, and perform no gather or refresh.",
  },
];

export interface EvaluationEvidence {
  evidenceId: string;
  chunkId: number;
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
  supportingTextExcerpt: string;
}

export interface EvaluationCaseResult {
  case: EvaluationCaseId;
  question: string;
  expectedBehaviour: string;
  relevantEvidence: EvaluationEvidence[];
  actualOutput: {
    status: AnswerResponse["status"];
    answer: string;
    insufficientEvidence: boolean;
    citationIds: string[];
    citedSourceCount: number;
    retrievalMatch: AnswerResponse["retrieval"]["matchQuality"];
    retrievedChunkCount: number;
    modelCall: AnswerResponse["modelCall"];
  };
  assessment: {
    passed: boolean;
    checks: string[];
  };
}

export interface RealModelEvaluationRecord {
  schemaVersion: 1;
  mode: "real-model" | "offline-mock";
  runDate: string;
  model: {
    provider: string;
    name: string;
  };
  modelConfiguration: {
    credentialEnvironmentVariable: "GEMINI_API_KEY";
    structuredJson: true;
    providerStorageRequested: false;
    retrievedEvidenceLimit: 5;
  };
  sourceRetrievalDates: Array<{
    key: string;
    title: string;
    url: string;
    retrievedAt: string;
  }>;
  cases: EvaluationCaseResult[];
  reuseVerification: {
    gatherWorkflowInvoked: false;
    sourceRetrievalDatesUnchanged: boolean;
    storedSourceCountBefore: number;
    storedSourceCountAfter: number;
  };
  modelCallsObserved: number;
  allCasesPassed: boolean;
}

export interface RunEvaluationOptions {
  repository?: Pick<ResearchRepository, "listSources" | "listSearchableChunks">;
  provider?: ModelProvider;
  mode?: RealModelEvaluationRecord["mode"];
  now?: () => Date;
  logger?: Pick<Console, "info" | "error">;
}

function sourceDates(sources: SourceSummary[]) {
  return sources.map((source) => ({
    key: source.key,
    title: source.title,
    url: source.url,
    retrievedAt: source.retrievedAt,
  }));
}

function evidenceExcerpt(content: string): string {
  return content.replace(/\s+/gu, " ").trim().slice(0, 280);
}

function assessCase(
  definition: EvaluationCaseDefinition,
  result: AnswerResponse,
): EvaluationCaseResult["assessment"] {
  const uniqueSources = new Set(result.citations.map((citation) => citation.sourceUrl));
  const checks: string[] = [];

  if (definition.id === "supported") {
    checks.push(result.status === "answered" ? "status answered" : "status was not answered");
    checks.push(result.citations.length > 0 ? "validated citation present" : "no citation present");
    checks.push(uniqueSources.size === 1 ? "one source supports the answer" : "answer did not use exactly one source");
    return {
      passed: result.status === "answered" && result.citations.length > 0 && uniqueSources.size === 1,
      checks,
    };
  }

  if (definition.id === "multi-source") {
    checks.push(result.status === "answered" ? "status answered" : "status was not answered");
    checks.push(
      uniqueSources.size >= 2
        ? `${uniqueSources.size} distinct sources cited`
        : "fewer than two distinct sources cited",
    );
    return {
      passed: result.status === "answered" && uniqueSources.size >= 2,
      checks,
    };
  }

  if (definition.id === "insufficient-evidence") {
    checks.push(
      result.status === "insufficient_evidence"
        ? "insufficient evidence returned"
        : "unsupported answer returned",
    );
    checks.push(!result.modelCall.occurred ? "model call skipped" : "model was called");
    checks.push(result.citations.length === 0 ? "no citations accepted" : "citations were accepted");
    return {
      passed:
        result.status === "insufficient_evidence" &&
        !result.modelCall.occurred &&
        result.citations.length === 0,
      checks,
    };
  }

  checks.push(result.status === "answered" ? "follow-up answered" : "follow-up not answered");
  checks.push(result.modelCall.occurred ? "new model call observed" : "model call not observed");
  checks.push(result.citations.length > 0 ? "validated citation present" : "no citation present");
  return {
    passed:
      result.status === "answered" &&
      result.modelCall.occurred &&
      result.citations.length > 0,
    checks,
  };
}

export async function runEvaluation(
  options: RunEvaluationOptions = {},
): Promise<RealModelEvaluationRecord> {
  const repository =
    options.repository ?? (await import("../database/index.js")).researchRepository;
  const provider = options.provider ?? createConfiguredModelProvider();
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? console;
  const before = repository.listSources();

  if (before.length < 3) {
    throw new Error("Gather at least three sources before running the evaluation.");
  }

  const cases: EvaluationCaseResult[] = [];
  for (const definition of evaluationCases) {
    logger.info(`[evaluation] running ${definition.id}`);
    const result = await answerQuestion(definition.question, {
      repository,
      provider,
      logger,
    });
    const uniqueSources = new Set(result.citations.map((citation) => citation.sourceUrl));

    cases.push({
      case: definition.id,
      question: definition.question,
      expectedBehaviour: definition.expectedBehaviour,
      relevantEvidence: result.citations.map((citation) => ({
        evidenceId: citation.evidenceId,
        chunkId: citation.chunkId,
        sourceTitle: citation.sourceTitle,
        sourceUrl: citation.sourceUrl,
        retrievedAt: citation.retrievedAt,
        supportingTextExcerpt: evidenceExcerpt(citation.supportingText),
      })),
      actualOutput: {
        status: result.status,
        answer: result.answer,
        insufficientEvidence: result.insufficientEvidence,
        citationIds: result.citationIds,
        citedSourceCount: uniqueSources.size,
        retrievalMatch: result.retrieval.matchQuality,
        retrievedChunkCount: result.retrieval.results.length,
        modelCall: result.modelCall,
      },
      assessment: assessCase(definition, result),
    });
  }

  const after = repository.listSources();
  const beforeDates = sourceDates(before);
  const afterDates = sourceDates(after);
  const sourceRetrievalDatesUnchanged =
    JSON.stringify(beforeDates) === JSON.stringify(afterDates);
  const repeatedCase = cases.find((result) => result.case === "repeated-follow-up");
  if (repeatedCase) {
    repeatedCase.assessment.checks.push(
      sourceRetrievalDatesUnchanged
        ? "stored source retrieval dates unchanged"
        : "stored source retrieval dates changed",
    );
    repeatedCase.assessment.passed =
      repeatedCase.assessment.passed && sourceRetrievalDatesUnchanged;
  }

  return {
    schemaVersion: 1,
    mode: options.mode ?? "real-model",
    runDate: now().toISOString(),
    model: {
      provider: provider.provider,
      name: provider.model,
    },
    modelConfiguration: {
      credentialEnvironmentVariable: "GEMINI_API_KEY",
      structuredJson: true,
      providerStorageRequested: false,
      retrievedEvidenceLimit: 5,
    },
    sourceRetrievalDates: beforeDates,
    cases,
    reuseVerification: {
      gatherWorkflowInvoked: false,
      sourceRetrievalDatesUnchanged,
      storedSourceCountBefore: before.length,
      storedSourceCountAfter: after.length,
    },
    modelCallsObserved: cases.filter((result) => result.actualOutput.modelCall.occurred).length,
    allCasesPassed: cases.every((result) => result.assessment.passed),
  };
}
