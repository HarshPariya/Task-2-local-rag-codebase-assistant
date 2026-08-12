import Database from "better-sqlite3";
import { load } from "sqlite-vec";

export interface SearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  kind: string;
  content: string;
  distance?: number;
  rank?: number;
}

let db: Database.Database | null = null;

export function getDatabase() {
  if (db) return db;

  db = new Database("rag.db");

  load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      startLine INTEGER NOT NULL,
      endLine INTEGER NOT NULL,
      symbolName TEXT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      contentHash TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings
    USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
    USING fts5(
      id UNINDEXED,
      content
    );
  `);

  return db;
}

export function clearChunks() {
  const db = getDatabase();

  db.exec("DELETE FROM chunks;");
  db.exec("DELETE FROM chunk_embeddings;");
  db.exec("DELETE FROM chunks_fts;");
}

export function insertChunk(chunk: {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  kind: string;
  content: string;
  contentHash: string;
}) {
  const db = getDatabase();

  db.prepare(`
    INSERT OR REPLACE INTO chunks (
      id,
      path,
      startLine,
      endLine,
      symbolName,
      kind,
      content,
      contentHash
    )
    VALUES (
      @id,
      @path,
      @startLine,
      @endLine,
      @symbolName,
      @kind,
      @content,
      @contentHash
    )
  `).run(chunk);

  db.prepare(`
    DELETE FROM chunks_fts
    WHERE id = ?
  `).run(chunk.id);

  db.prepare(`
    INSERT INTO chunks_fts (
      id,
      content
    )
    VALUES (?, ?)
  `).run(chunk.id, chunk.content);
}

export function getAllChunks(): {
  id: string;
  content: string;
}[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT id, content
    FROM chunks
    ORDER BY path
  `).all() as {
    id: string;
    content: string;
  }[];
}

export function insertEmbedding(
  id: string,
  embedding: number[]
) {
  const db = getDatabase();

  // Delete old embedding first
  db.prepare(`
    DELETE FROM chunk_embeddings
    WHERE id = ?
  `).run(id);

  // Insert new embedding
  db.prepare(`
    INSERT INTO chunk_embeddings
    VALUES (?, ?)
  `).run(
    id,
    JSON.stringify(embedding)
  );
}

export function searchVectors(
  embedding: number[],
  limit = 5
): SearchResult[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT
      c.id,
      c.path,
      c.startLine,
      c.endLine,
      c.symbolName,
      c.kind,
      c.content,
      distance
    FROM chunk_embeddings
    JOIN chunks c
      ON c.id = chunk_embeddings.id
    WHERE embedding MATCH ?
      AND k = ?
    ORDER BY distance
  `).all(
    JSON.stringify(embedding),
    limit
  ) as SearchResult[];
}

export function searchFTS(
  query: string,
  limit = 5
): SearchResult[] {
  const db = getDatabase();

  const STOPWORDS = new Set([
    "how", "what", "where", "when", "does", "do", "is", "are",
    "the", "and", "for", "with", "from", "this", "that", "its",
    "was", "has", "have", "been", "will", "not", "but", "can",
    "get", "set", "use", "used", "into", "after", "than",
    "required", "fields", "field", "operations", "represented", "implemented",
    "method", "methods", "exist", "exists", "which", "how"
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));

  if (words.length === 0) return [];

  const sql = `
    SELECT
      c.id,
      c.path,
      c.startLine,
      c.endLine,
      c.symbolName,
      c.kind,
      c.content,
      bm25(chunks_fts) AS rank
    FROM chunks_fts
    JOIN chunks c ON c.id = chunks_fts.id
    WHERE chunks_fts MATCH ?
    ORDER BY rank
    LIMIT ${limit}
  `;

  // Try AND query first (high precision) - only if few words
  if (words.length >= 2) {
    try {
      const andKeywords = words.join(" AND ");
      const results = db.prepare(sql).all(andKeywords) as SearchResult[];
      // Only use AND results if we got a good number of results back
      if (results.length >= Math.min(5, limit)) {
        return results;
      }
    } catch {
      // AND query failed, fall through to OR
    }
  }

  // Fall back to OR (high recall)
  const orKeywords = words.join(" OR ");
  return db.prepare(sql).all(orKeywords) as SearchResult[];
}

export function getChunkById(id: string) {
  const db = getDatabase();

  return db.prepare(`
    SELECT *
    FROM chunks
    WHERE id = ?
  `).get(id);
}

export function hasChunk(id: string): boolean {
  const db = getDatabase();
  const row = db.prepare(`SELECT 1 FROM chunks WHERE id = ?`).get(id);
  return !!row;
}

export function getChunkHash(id: string): string | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT contentHash FROM chunks WHERE id = ?`).get(id) as { contentHash: string } | undefined;
  return row ? row.contentHash : null;
}

export function deleteChunk(id: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM chunks WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM chunk_embeddings WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM chunks_fts WHERE id = ?`).run(id);
}

export function embeddingExists(id: string): boolean {
  const db = getDatabase();
  const row = db.prepare(`SELECT 1 FROM chunk_embeddings WHERE id = ?`).get(id);
  return !!row;
}

export function getChunksWithoutEmbedding(): { id: string; content: string }[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT c.id, c.content
    FROM chunks c
    LEFT JOIN chunk_embeddings ce ON c.id = ce.id
    WHERE ce.id IS NULL
    ORDER BY c.path
  `).all() as { id: string; content: string }[];
}

export function getAllChunkIds(): string[] {
  const db = getDatabase();
  const rows = db.prepare(`SELECT id FROM chunks`).all() as { id: string }[];
  return rows.map(r => r.id);
}