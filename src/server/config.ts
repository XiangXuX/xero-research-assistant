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

export const appConfig = {
  port: readPositiveInteger(process.env.PORT, 3001),
  fetchTimeoutMs: readPositiveInteger(process.env.FETCH_TIMEOUT_MS, 45_000),
  researchDatabaseLabel: configuredDatabasePath,
  researchDatabasePath:
    configuredDatabasePath === ":memory:"
      ? configuredDatabasePath
      : path.resolve(process.cwd(), configuredDatabasePath),
};
