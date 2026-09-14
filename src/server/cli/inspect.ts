import "dotenv/config";

import { closeResearchDatabase, researchRepository } from "../database/index.js";

try {
  const sources = researchRepository.listSources();
  if (sources.length === 0) {
    console.log("No stored research. Run npm run research:gather first.");
  } else {
    console.table(
      sources.map((source) => ({
        id: source.id,
        key: source.key,
        title: source.title,
        retrievedAt: source.retrievedAt,
        characters: source.contentLength,
        chunks: source.chunkCount,
      })),
    );

    for (const source of sources) {
      const details = researchRepository.getSourceDetails(source.id);
      if (!details) {
        continue;
      }

      console.log(`\n${details.title}`);
      console.log(details.url);
      console.table(
        details.chunks.map((chunk) => ({
          position: chunk.position,
          characters: chunk.content.length,
          preview: chunk.content.replace(/\s+/g, " ").slice(0, 140),
        })),
      );
    }
  }
} finally {
  closeResearchDatabase();
}

