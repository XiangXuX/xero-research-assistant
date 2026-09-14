import { closeResearchDatabase, researchRepository } from "../database/index.js";
import { retrieveEvidence } from "../retrieval/retrieve-evidence.js";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run research:retrieve -- "What pricing plans does Xero offer?"');
  process.exitCode = 1;
  closeResearchDatabase();
} else {
  try {
    const result = retrieveEvidence(question, researchRepository.listSearchableChunks());
    console.log(`Question: ${result.question}`);
    console.log(
      `Method: ${result.method} | searched ${result.totalChunksSearched} chunks | returned ${result.results.length}/${result.topK} | match ${result.matchQuality}`,
    );

    if (result.results.length === 0) {
      console.log("No chunks had lexical overlap with the question.");
    }

    for (const evidence of result.results) {
      console.log(
        `\n${evidence.evidenceId} | score ${evidence.score} | coverage ${Math.round(evidence.queryCoverage * 100)}% | chunk ${evidence.id}`,
      );
      console.log(`${evidence.sourceTitle} | stored chunk ${evidence.position + 1}`);
      console.log(evidence.sourceUrl);
      console.log(`Matched: ${evidence.matchedTerms.join(", ")}`);
      console.log(evidence.content);
    }
  } finally {
    closeResearchDatabase();
  }
}
