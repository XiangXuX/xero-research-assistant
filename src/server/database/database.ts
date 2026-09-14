import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openResearchDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      source_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
      UNIQUE (source_id, position)
    );

    CREATE INDEX IF NOT EXISTS chunks_source_id_idx ON chunks(source_id);
  `);

  return database;
}

