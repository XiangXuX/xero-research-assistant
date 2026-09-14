import { closeResearchDatabase } from "../database/index.js";
import { answerQuestion } from "../model/answer-question.js";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run research:ask -- "What pricing plans does Xero offer?"');
  process.exitCode = 1;
  closeResearchDatabase();
} else {
  try {
    const result = await answerQuestion(question);
    console.log(`Question: ${result.question}`);
    console.log(`Status: ${result.status}`);
    console.log(`Answer: ${result.answer}`);
    console.log(
      `Retrieval: ${result.retrieval.matchQuality}; ${result.retrieval.results.length}/${result.retrieval.topK} chunks`,
    );
    console.log(
      result.modelCall.occurred
        ? `Model: ${result.modelCall.provider}/${result.modelCall.model}; ${result.modelCall.durationMs} ms`
        : `Model: not called; ${result.modelCall.reason}`,
    );

    for (const citation of result.citations) {
      console.log(`\n${citation.evidenceId} | chunk ${citation.chunkId}`);
      console.log(citation.sourceTitle);
      console.log(citation.sourceUrl);
      console.log(`Retrieved: ${citation.retrievedAt}`);
      console.log(citation.supportingText);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Question answering failed.");
    process.exitCode = 1;
  } finally {
    closeResearchDatabase();
  }
}
