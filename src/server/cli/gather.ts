import "dotenv/config";

import { closeResearchDatabase } from "../database/index.js";
import { gatherResearch } from "../research/gather-research.js";

try {
  const result = await gatherResearch();
  console.log(JSON.stringify(result, null, 2));
  if (result.failed === result.results.length) {
    process.exitCode = 1;
  }
} finally {
  closeResearchDatabase();
}

