import { Router } from "express";

import type {
  ErrorResponse,
  ResearchStateResponse,
  SourceDetails,
} from "../../shared/contracts.js";
import { appConfig } from "../config.js";
import { researchRepository } from "../database/index.js";
import { gatherResearch } from "../research/gather-research.js";
import { configuredSources } from "../research/sources.js";

export const researchRouter = Router();

researchRouter.get("/", (_request, response) => {
  const sources = researchRepository.listSources();
  const body: ResearchStateResponse = {
    configuredSourceCount: configuredSources.length,
    storedSourceCount: sources.length,
    databasePath: appConfig.researchDatabaseLabel,
    sources,
  };

  response.json(body);
});

researchRouter.post("/gather", async (_request, response, next) => {
  try {
    response.json(await gatherResearch());
  } catch (error) {
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
