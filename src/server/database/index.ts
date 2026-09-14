import { appConfig } from "../config.js";
import { openResearchDatabase } from "./database.js";
import { ResearchRepository } from "./research-repository.js";

export const researchDatabase = openResearchDatabase(appConfig.researchDatabasePath);
export const researchRepository = new ResearchRepository(researchDatabase);

export function closeResearchDatabase(): void {
  researchDatabase.close();
}

