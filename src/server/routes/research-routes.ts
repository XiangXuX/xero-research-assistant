import { Router } from "express";

import type {
  ErrorResponse,
  RefreshFailureDemoResponse,
  ResearchStateResponse,
  SourceDetails,
} from "../../shared/contracts.js";
import { appConfig } from "../config.js";
import { researchRepository } from "../database/index.js";
import { answerQuestion } from "../model/answer-question.js";
import { InvalidModelResponseError } from "../model/answer-validator.js";
import {
  ModelConfigurationError,
  ModelProviderError,
} from "../model/model-provider.js";
import { gatherResearch } from "../research/gather-research.js";
import {
  demonstrateRefreshFailure,
  FailureDemoUnavailableError,
} from "../research/demonstrate-refresh-failure.js";
import { configuredSources } from "../research/sources.js";
import { retrieveEvidence } from "../retrieval/retrieve-evidence.js";

export const researchRouter = Router();

researchRouter.get("/", (_request, response) => {
  const sources = researchRepository.listSources();
  const body: ResearchStateResponse = {
    configuredSourceCount: configuredSources.length,
    storedSourceCount: sources.length,
    databasePath: appConfig.researchDatabaseLabel,
    model: {
      provider: appConfig.model.provider,
      name: appConfig.model.name,
      configured: appConfig.model.configured,
    },
    sources,
  };

  response.json(body);
});

researchRouter.post("/gather", async (request, response, next) => {
  try {
    response.json(await gatherResearch({ forceRefresh: request.body?.refresh === true }));
  } catch (error) {
    next(error);
  }
});

researchRouter.post("/demo/refresh-failure", async (_request, response, next) => {
  try {
    const body: RefreshFailureDemoResponse = await demonstrateRefreshFailure();
    response.json(body);
  } catch (error) {
    if (error instanceof FailureDemoUnavailableError) {
      const body: ErrorResponse = {
        error: error.message,
        code: "FAILURE_DEMO_REQUIRES_RESEARCH",
      };
      response.status(409).json(body);
      return;
    }

    next(error);
  }
});

researchRouter.post("/retrieve", (request, response) => {
  const question = typeof request.body?.question === "string" ? request.body.question.trim() : "";
  if (!question || question.length > 500) {
    const body: ErrorResponse = {
      error: "Question must contain between 1 and 500 characters.",
    };
    response.status(400).json(body);
    return;
  }

  const chunks = researchRepository.listSearchableChunks();
  response.json(retrieveEvidence(question, chunks));
});

researchRouter.post("/answer", async (request, response, next) => {
  const question = typeof request.body?.question === "string" ? request.body.question.trim() : "";
  if (!question || question.length > 500) {
    const body: ErrorResponse = {
      error: "Question must contain between 1 and 500 characters.",
      code: "INVALID_QUESTION",
    };
    response.status(400).json(body);
    return;
  }

  try {
    response.json(await answerQuestion(question));
  } catch (error) {
    if (error instanceof ModelConfigurationError) {
      const body: ErrorResponse = { error: error.message, code: "MODEL_NOT_CONFIGURED" };
      response.status(503).json(body);
      return;
    }
    if (error instanceof InvalidModelResponseError) {
      const body: ErrorResponse = {
        error: "The model returned invalid structured output. No answer was accepted.",
        code: "MODEL_INVALID_RESPONSE",
      };
      response.status(502).json(body);
      return;
    }
    if (error instanceof ModelProviderError) {
      const body: ErrorResponse = {
        error: error.message,
        code: "MODEL_PROVIDER_FAILURE",
      };
      response.status(502).json(body);
      return;
    }

    next(error);
  }
});

researchRouter.get("/sources/:sourceId", (request, response) => {
  const sourceId = Number(request.params.sourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    const body: ErrorResponse = { error: "Source id must be a positive integer." };
    response.status(400).json(body);
    return;
  }

  const source = researchRepository.getSourceDetails(sourceId);
  if (!source) {
    const body: ErrorResponse = { error: "Stored source was not found." };
    response.status(404).json(body);
    return;
  }

  const body: SourceDetails = source;
  response.json(body);
});
