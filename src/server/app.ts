import express from "express";

import type { HealthResponse } from "../shared/contracts.js";

export const app = express();

app.use(express.json());

app.get("/api/health", (_request, response) => {
  const body: HealthResponse = {
    status: "ok",
    service: "xero-research-api",
  };

  response.json(body);
});
