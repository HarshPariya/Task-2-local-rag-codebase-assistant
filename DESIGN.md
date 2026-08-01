# DESIGN

# Local RAG System Design

## Overview

This project implements a fully local Retrieval-Augmented Generation (RAG) system for answering questions about a software codebase.

The pipeline consists of four major stages:

1. Ingestion
2. Embedding
3. Retrieval
4. Answer Generation

The entire system runs locally using SQLite, sqlite-vec, and Ollama without relying on external vector databases or hosted LLM APIs.

---

# Project Scope and Constraints

## Public Interfaces and Types
The system provides a single CLI interface with the following commands:
- `npm run dev -- ingest <path>`: Ingests a local directory and stores chunks into SQLite.
- `npm run dev -- embed`: Computes Ollama embeddings for any newly ingested chunks.
- `npm run dev -- ask "<question>"`: Retrieves context and generates a cited answer.
- `npm run dev -- eval`: Runs the golden evaluation set.

The core data type is the `Chunk` interface:
```typescript
interface Chunk {
  id: string;
  content: string;
  path: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  kind: 'function' | 'class' | 'type' | 'markdown-section' | 'other';
  contentHash: string;
}
```

## The Three Most Likely Failure Modes (And Our Plan for Each)
1. **Ollama Timeout or Connection Refusal**: The local model may take too long or not be running. *Plan*: Implement robust try-catch blocks around fetch calls to the Ollama endpoint and fail loudly with a user-friendly error asking them to verify Ollama is running the correct models.
2. **Context Window Overflow**: A query might retrieve several massive functions (e.g. 600+ lines), blowing out the context window. *Plan*: The AST chunker explicitly splits functions larger than 300 lines with a 50-line overlap, ensuring no single chunk dominates or exceeds context limits. A `MIN_CHUNK_SIZE` (400 chars) prevents merging too aggressively.
3. **Database Locks**: Since both FTS and vector insertion run iteratively, SQLite might hit `SQLITE_BUSY` locks if running concurrently. *Plan*: We use synchronous batch execution (transactional inserts) and do not support concurrent ingestion processes.

## What We Are Deliberately NOT Building, and Why
- **Web UI / Chatbot Interface**: We are strictly building a CLI tool. RAG systems are often judged on their frontend "feel" rather than actual performance metrics. By omitting a UI, we force the focus entirely onto the evaluation harness and retrieval accuracy.
- **Cross-Encoder Reranking**: We rely solely on RRF for merging vector and keyword results. Cross-encoders add significant latency (often 500ms+), which violates our goal of keeping query latency around 100ms. 
- **Multi-turn Conversation Memory**: The tool acts as a single-shot QA system. Conversation memory requires managing context history which obfuscates the pure retrieval metrics we are trying to measure against our golden set.

## Open Questions
- What is the optimum `k` value for the RRF formula in this specific codebase? Currently, we use the standard `k = 60`, but it could be tuned.
- Should we incorporate a structural hierarchy graph (e.g., this function calls that function) directly into the chunk metadata for parent-child retrieval?

---

# System Architecture

```
                Source Code
                     │
                     ▼
              File Discovery
                     │
                     ▼
          AST / Markdown Chunking
                     │
                     ▼
          SQLite Storage (chunks)
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
     FTS5 Index         Vector Embeddings
                              │
                              ▼
                        sqlite-vec
                              │
                              ▼
                     User Question
                              │
                              ▼
                     Query Embedding
                              │
          ┌──────────┴──────────┐
          ▼                     ▼
      Vector Search       BM25 Search
          │                     │
          └──────────┬──────────┘
                     ▼
          Reciprocal Rank Fusion
                     │
                     ▼
               Top-5 Chunks
                     │
                     ▼
              Qwen2.5 3B (Ollama)
                     │
                     ▼
      Answer + Source Citations
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
 Citation Validation     Faithfulness Check
```

---

# Ingestion

The ingestion pipeline scans the repository recursively.

Supported files include:

- TypeScript (.ts)
- TSX (.tsx)
- Markdown (.md)

TypeScript files are parsed using **ts-morph**.

Markdown files are split by headings.

Each chunk stores:

- file path
- line numbers
- symbol name
- chunk type
- content
- SHA-256 content hash

---

# Chunking Strategy

## TypeScript

Chunks are created for:

- Functions
- Classes
- Methods
- Interfaces
- Type aliases
- Exported variables
- Arrow functions

Each chunk preserves exact source line numbers for citation generation.

---

## Markdown

Markdown files are chunked by heading hierarchy.

Each section becomes one retrievable document.

---

# Embedding Pipeline

Embeddings are generated using:

```
nomic-embed-text
```

through Ollama.

Two embedding modes are used:

Document embedding

```
search_document:
```

Query embedding

```
search_query:
```

Embeddings are stored in sqlite-vec.

---

# Incremental Indexing

Every chunk stores a SHA-256 hash.

During ingestion:

- unchanged chunks are skipped
- modified chunks are updated
- deleted chunks are removed
- new chunks are inserted

This prevents unnecessary re-indexing.

---

# Embedding Cache

Embeddings are generated only for chunks that do not already have an embedding.

This significantly reduces processing time during repeated indexing.

---

# Retrieval

The system combines two retrieval methods.

## Vector Search

Semantic similarity search using sqlite-vec.

Advantages:

- semantic matching
- robust against wording differences

---

## Full Text Search

SQLite FTS5 provides keyword search using BM25 ranking.

Advantages:

- exact symbol lookup
- identifier matching
- code keyword retrieval

---

# Hybrid Retrieval

Results from both retrievers are combined using

**Reciprocal Rank Fusion (RRF, k=60).**

The retrieval pool uses top-20 candidates from each source (vector and FTS) before fusion, which gives RRF more candidates to work with and significantly improves Recall@5.

Benefits:

- combines semantic and lexical retrieval
- improves Recall@K
- reduces retrieval failures
- scale-free (works regardless of score magnitude)

---

# FTS Search Strategy

The BM25 keyword search applies an **AND-first / OR-fallback** strategy:

1. Extract non-stopword tokens from the question
2. Try an AND query (all terms must appear) — higher precision
3. If fewer than 5 results, fall back to an OR query — higher recall

A curated stopword list filters common English words and domain-generic terms (e.g. `required`, `fields`, `implemented`) that would match too many irrelevant chunks.

---

# Answer Generation

The retrieved Top-5 chunks are formatted into a prompt and sent to:

```
Qwen2.5 3B Instruct
```

running locally through Ollama.

The prompt enforces:

- use only retrieved context
- no hallucinations
- mandatory citations
- refusal when information is absent

---

# Citation Validation

Every generated citation is checked against the retrieved chunks.

The validator confirms that:

- the file path matches a retrieved chunk (path-normalized, backslash-insensitive)
- the cited line range falls within that chunk's line range

If the model correctly responds with "The provided context does not contain information to answer this question.", this is recognized via a fuzzy match (`includes("context does not contain information to answer this question")`) and validation passes automatically without requiring any citations.

Invalid citations cause the citation check to fail.

---

# Faithfulness Evaluation

A second LLM pass (Qwen2.5 3B) evaluates whether the generated answer is fully supported by the retrieved context.

If the model correctly says it cannot find the answer, faithfulness is automatically set to PASS without calling the LLM judge (fuzzy match on "context does not contain information to answer this question").

Output:

- PASS (YES)
- FAIL (NO)

This provides an automatic hallucination check.

---

# Evaluation

Evaluation is performed using a manually curated golden dataset.

Metrics include:

- Recall@5
- Recall@10
- Mean Reciprocal Rank (MRR)
- Query latency

---

# Design Decisions

| Decision | Reason |
|-----------|--------|
| SQLite | Lightweight local database, no server required |
| sqlite-vec | Local vector search without external vector DB |
| FTS5 | Fast lexical retrieval built into SQLite |
| AND-first/OR-fallback FTS | Higher precision with graceful recall fallback |
| Top-20 RRF pool | More candidates = better fusion quality |
| Reciprocal Rank Fusion | Combines vector + keyword, scale-free ranking |
| Ollama | Fully local inference, no cloud API |
| Qwen2.5 3B | High-quality local instruction model |
| nomic-embed-text | High-quality local embedding model |
| ts-morph | Accurate TypeScript AST parsing |
| SHA-256 hashes | Incremental ingestion and embedding cache |
| Fuzzy "no answer" detection | Handles model output variations (missing period, etc.) |

---

# Future Improvements

Potential future enhancements include:

- Cross-encoder reranking
- Multi-query retrieval
- Metadata-aware filtering
- Parent-child chunk retrieval
- Streaming responses
- Conversation memory
- Hybrid sparse+dense weighting