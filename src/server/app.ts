import express from "express";

import type { ErrorResponse, HealthResponse } from "../shared/contracts.js";
import { researchRouter } from "./routes/research-routes.js";

export const app = express();

app.use(express.json());

app.get("/api/health", (_request, response) => {
  const body: HealthResponse = {
    status: "ok",
    service: "xero-research-api",
  };

  response.json(body);
});

app.use("/api/research", researchRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const body: ErrorResponse = { error: "The server could not complete the request." };
  response.status(500).json(body);
});
