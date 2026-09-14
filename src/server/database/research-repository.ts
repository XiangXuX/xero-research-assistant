import type { DatabaseSync } from "node:sqlite";

import type {
  EvidenceChunk,
  SourceDetails,
  SourceSummary,
} from "../../shared/contracts.js";

interface SourceRow {
  id: number;
  source_key: string;
  url: string;
  title: string;
  retrieved_at: string;
  content_hash: string;
  content: string;
  chunk_count: number;
}

interface ChunkRow {
  id: number;
  source_id: number;
  position: number;
  content: string;
}

interface SearchableChunkRow extends ChunkRow {
  source_key: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface SearchableChunk {
  id: number;
  sourceId: number;
  position: number;
  content: string;
  sourceKey: string;
  sourceTitle: string;
  sourceUrl: string;
  retrievedAt: string;
}

export interface PersistedResearch {
  key: string;
  url: string;
  title: string;
  retrievedAt: string;
  contentHash: string;
  content: string;
  chunks: string[];
}

function toSummary(row: SourceRow): SourceSummary {
  return {
    id: row.id,
    key: row.source_key,
    url: row.url,
    title: row.title,
    retrievedAt: row.retrieved_at,
    contentHash: row.content_hash,
    contentLength: row.content.length,
    chunkCount: row.chunk_count,
    preview: row.content.slice(0, 320),
  };
}

export class ResearchRepository {
  constructor(private readonly database: DatabaseSync) {}

  findByKey(key: string): SourceSummary | undefined {
    const row = this.database
      .prepare(`
        SELECT s.*, COUNT(c.id) AS chunk_count
        FROM sources s
        LEFT JOIN chunks c ON c.source_id = s.id
        WHERE s.source_key = ?
        GROUP BY s.id
      `)
      .get(key) as unknown as SourceRow | undefined;

    return row ? toSummary(row) : undefined;
  }

  listSources(): SourceSummary[] {
    const rows = this.database
      .prepare(`
        SELECT s.*, COUNT(c.id) AS chunk_count
        FROM sources s
        LEFT JOIN chunks c ON c.source_id = s.id
        GROUP BY s.id
        ORDER BY s.id
      `)
      .all() as unknown as SourceRow[];

    return rows.map(toSummary);
  }

  getSourceDetails(sourceId: number): SourceDetails | undefined {
    const source = this.database
      .prepare(`
        SELECT s.*, COUNT(c.id) AS chunk_count
        FROM sources s
        LEFT JOIN chunks c ON c.source_id = s.id
        WHERE s.id = ?
        GROUP BY s.id
      `)
      .get(sourceId) as unknown as SourceRow | undefined;

    if (!source) {
      return undefined;
    }

    const chunks = this.database
      .prepare(`
        SELECT id, source_id, position, content
        FROM chunks
        WHERE source_id = ?
        ORDER BY position
      `)
      .all(sourceId) as unknown as ChunkRow[];

    return {
      ...toSummary(source),
      content: source.content,
      chunks: chunks.map(
        (chunk): EvidenceChunk => ({
          id: chunk.id,
          sourceId: chunk.source_id,
          position: chunk.position,
          content: chunk.content,
        }),
      ),
    };
  }

  listSearchableChunks(): SearchableChunk[] {
    const rows = this.database
      .prepare(`
        SELECT
          c.id,
          c.source_id,
          c.position,
          c.content,
          s.source_key,
          s.title,
          s.url,
          s.retrieved_at
        FROM chunks c
        INNER JOIN sources s ON s.id = c.source_id
        ORDER BY c.id
      `)
      .all() as unknown as SearchableChunkRow[];

    return rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      position: row.position,
      content: row.content,
      sourceKey: row.source_key,
      sourceTitle: row.title,
      sourceUrl: row.url,
      retrievedAt: row.retrieved_at,
    }));
  }

  saveSource(research: PersistedResearch): SourceSummary {
    this.database.exec("BEGIN IMMEDIATE;");

    try {
      const existing = this.database
        .prepare("SELECT id FROM sources WHERE source_key = ?")
        .get(research.key) as unknown as { id: number } | undefined;

      let sourceId: number;
      if (existing) {
        sourceId = existing.id;
        this.database
          .prepare(`
            UPDATE sources
            SET url = ?, title = ?, retrieved_at = ?, content_hash = ?, content = ?
            WHERE id = ?
          `)
          .run(
            research.url,
            research.title,
            research.retrievedAt,
            research.contentHash,
            research.content,
            sourceId,
          );
        this.database.prepare("DELETE FROM chunks WHERE source_id = ?").run(sourceId);
      } else {
        const result = this.database
          .prepare(`
            INSERT INTO sources (source_key, url, title, retrieved_at, content_hash, content)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            research.key,
            research.url,
            research.title,
            research.retrievedAt,
            research.contentHash,
            research.content,
          );
        sourceId = Number(result.lastInsertRowid);
      }

      const insertChunk = this.database.prepare(`
        INSERT INTO chunks (source_id, position, content)
        VALUES (?, ?, ?)
      `);

      research.chunks.forEach((content, position) => {
        insertChunk.run(sourceId, position, content);
      });

      const stored = this.findByKey(research.key);
      if (!stored) {
        throw new Error(`Saved source ${research.key} could not be read back.`);
      }

      this.database.exec("COMMIT;");
      return stored;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
