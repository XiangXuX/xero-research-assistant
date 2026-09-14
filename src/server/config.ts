import "dotenv/config";

import path from "node:path";

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const configuredDatabasePath =
  process.env.RESEARCH_DB_PATH?.trim() || "data/research.db";
const configuredModelProvider = process.env.MODEL_PROVIDER?.trim() || "gemini";
const configuredModelName = process.env.MODEL_NAME?.trim() || "gemini-3.1-flash-lite";
const configuredGeminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";

export const appConfig = {
  port: readPositiveInteger(process.env.PORT, 3001),
  fetchTimeoutMs: readPositiveInteger(process.env.FETCH_TIMEOUT_MS, 45_000),
  researchDatabaseLabel: configuredDatabasePath,
  researchDatabasePath:
    configuredDatabasePath === ":memory:"
      ? configuredDatabasePath
      : path.resolve(process.cwd(), configuredDatabasePath),
  model: {
    provider: configuredModelProvider,
    name: configuredModelName,
    timeoutMs: readPositiveInteger(process.env.MODEL_TIMEOUT_MS, 30_000),
    apiKey: configuredGeminiApiKey,
    configured:
      configuredModelProvider === "gemini" && configuredGeminiApiKey.length > 0,
  },
};
