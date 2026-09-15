import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeResearchDatabase } from "../database/index.js";
import { runEvaluation } from "../evaluation/run-evaluation.js";

const outputPath = path.resolve("evaluation/real-model-run.json");

try {
  const record = await runEvaluation({ mode: "real-model" });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  for (const result of record.cases) {
    console.log(
      `[evaluation] ${result.case}: ${result.assessment.passed ? "PASS" : "FAIL"}`,
    );
    console.log(`  ${result.actualOutput.answer}`);
  }
  console.log(`[evaluation] model calls observed: ${record.modelCallsObserved}`);
  console.log(
    `[evaluation] source retrieval dates unchanged: ${record.reuseVerification.sourceRetrievalDatesUnchanged}`,
  );
  console.log(`[evaluation] wrote ${outputPath}`);

  if (!record.allCasesPassed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
} finally {
  closeResearchDatabase();
}
