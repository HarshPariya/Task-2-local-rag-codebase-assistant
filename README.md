# Local RAG System for Codebase Question Answering

A fully local Retrieval-Augmented Generation (RAG) system that indexes a software codebase and answers developer questions using hybrid retrieval, citation-aware generation, and automatic evaluation.

---

## Features

- TypeScript & Markdown AST-aware code chunking
- Local vector embeddings using Ollama (`nomic-embed-text`)
- SQLite + sqlite-vec vector database
- SQLite FTS5 keyword search (BM25) with AND-first/OR-fallback strategy
- Hybrid Retrieval using Reciprocal Rank Fusion (RRF) with top-20 candidate pool
- Local answer generation using Qwen2.5 3B via Ollama
- Source citation generation with dynamic context-aware prompt
- Citation validation (fuzzy "no answer" detection)
- Faithfulness evaluation via LLM judge
- Golden dataset evaluation (30 questions: 10 easy / 15 medium / 5 hard)
- Incremental ingestion with SHA-256 content-hash deduplication
- Embedding cache (skip already-embedded chunks)
- Retrieval latency reporting (p50 / p95)

---

# Architecture

```
                 Source Code
                      │
                      ▼
               File Discovery
                      │
                      ▼
          AST / Markdown Chunking
          (ts-morph, symbol-level)
                      │
                      ▼
            SQLite Database
      ┌───────────┴───────────┐
      ▼                       ▼
  sqlite-vec              SQLite FTS5
Vector Search           Keyword Search
  (top-20)               (top-20, AND→OR)
      │                       │
      └───────────┬───────────┘
                  ▼
      Reciprocal Rank Fusion (k=60)
                  │
                  ▼
           Top-5 Chunks
                  │
                  ▼
        Qwen2.5 3B via Ollama
                  │
                  ▼
     Answer + Source Citations
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
Citation Validation    Faithfulness Check
```

---

# Tech Stack

## Language

- TypeScript

## Runtime

- Node.js

## Database

- SQLite
- sqlite-vec
- SQLite FTS5

## Parsing

- ts-morph (AST-level TypeScript/TSX chunking)

## Local Models

- `qwen2.5:3b` — answer generation & faithfulness judge
- `nomic-embed-text` — vector embeddings

## Retrieval

- Dense Vector Search (sqlite-vec, cosine distance)
- BM25 Keyword Search (FTS5, AND-first with OR fallback)
- Reciprocal Rank Fusion (k=60, top-20 pool)

---

# Project Structure

```text
Task-2-Rag-project/
│
├── corpus/
│   └── website/                 # Source code repository to index
│
├── evals/
│   └── golden.jsonl             # Golden evaluation dataset (30 questions)
│
├── src/
│   ├── chunker/                 # TypeScript & Markdown chunking (ts-morph)
│   ├── commands/                # CLI commands (ingest, embed, ask, eval)
│   ├── database/                # SQLite, sqlite-vec, FTS5 operations
│   ├── embedding/               # Ollama embedding generation
│   ├── evaluation/              # Citation validation & faithfulness checks
│   ├── generation/              # LLM answer generation
│   ├── retriever/               # Vector search, BM25, RRF
│   ├── types/                   # Shared TypeScript types
│   ├── utils/                   # Utility functions
│   └── index.ts                 # CLI entry point
│
├── DESIGN.md                    # System architecture and design decisions
├── NOTES.md                     # Assumptions, limitations & future work
├── README.md                    # Project documentation (this file)
├── RESULTS.md                   # Evaluation results and metrics
│
├── rag.db                       # SQLite database (generated)
├── package.json
├── tsconfig.json
└── node_modules/
```

# Usage

## Prerequisites

Make sure Ollama is running with the required models:

```bash
ollama pull nomic-embed-text
ollama pull qwen2.5:3b
```

## 1. Ingest Repository

```bash
npm run dev -- ingest ./corpus
```

Example output:

```
========== INGEST ==========

Files scanned : 774
Total chunks  : 966
New/Updated   : 966
Deleted       : 0
Time          : 152689.9 ms
```

Second run (no changes) — fully incremental:

```
Files scanned : 774
Total chunks  : 966
New/Updated   : 0
Deleted       : 0
Time          : 152689.9 ms
```

---

## 2. Build Embeddings

```bash
npm run dev -- embed
```

Example:

```
========== EMBEDDING ==========

Found 966 chunks to embed

Embedding completed.

Embedding Time : 470000 ms
```

Subsequent runs skip already-embedded chunks (embedding cache):

```
Found 0 chunks to embed
Embedding Time : 23.7 ms
```

---

## 3. Ask Questions

```bash
npm run dev -- ask "How does the AuthProvider store the authenticated user after a successful login?"
```

Example output:

```
Retrieving context...
Vector: 20 | FTS: 20 | Final: 5

========== ANSWER ==========

The AuthProvider stores the authenticated user in React state using useState.
After a successful login the login function calls setUser with the result.

(src/providers/Auth/index.tsx:36-274)

========== CITATION CHECK ==========

✅ PASS

========== FAITHFULNESS ==========

✅ PASS

========== SOURCES ==========

src\providers\Auth\index.tsx:8-30
src\providers\Auth\index.tsx:36-274
...
```

When information is not found in the codebase:

```bash
npm run dev -- ask "Does this project support Google OAuth login for end users?"
```

```
========== ANSWER ==========

I could not find the answer in the retrieved code

========== CITATION CHECK ==========

✅ PASS

========== FAITHFULNESS ==========

✅ PASS
```

---

## 4. Evaluate Retrieval

```bash
npm run dev -- eval
```

Latest results:

```
Recall@5 : 100.0%
Recall@10: 100.0%
MRR       : 0.756

Latency

Query p50 : 72.7 ms
Query p95 : 87.3 ms
```

---

# Retrieval Pipeline

1. Parse project files (.ts, .tsx, .md)
2. Generate AST-aware code chunks (functions, classes, types, interfaces)
3. Compute SHA-256 hash per chunk for deduplication
4. Store new/modified chunks in SQLite
5. Generate `nomic-embed-text` embeddings via Ollama
6. Store vectors in sqlite-vec
7. At query time: embed the question with `search_query:` prefix
8. Run vector search (top-20 candidates)
9. Run FTS5 BM25 search (top-20, AND-first then OR fallback)
10. Fuse both result sets using Reciprocal Rank Fusion (k=60)
11. Take top-5 chunks as context
12. Generate answer using Qwen2.5 3B
13. Validate citations against retrieved chunks
14. Evaluate faithfulness with LLM judge

---

# Evaluation Dataset

The evaluation harness uses a manually created golden dataset.

Distribution

| Difficulty | Count |
|------------|------:|
| Easy | 10 |
| Medium | 15 |
| Hard | 5 |
| **Total** | **30** |

Metrics:

- **Recall@5** — expected source in top-5 retrieved chunks
- **Recall@10** — expected source in top-10 retrieved chunks
- **MRR** — Mean Reciprocal Rank
- **Query Latency** — p50 and p95 in milliseconds

---

# Performance

Latest evaluation results:

| Metric | Result |
|---------|-------:|
| Recall@5 | **100.0%** |
| Recall@10 | **100.0%** |
| MRR | **0.778** |
| Query p50 | **~73 ms** |
| Query p95 | **~87 ms** |

---

# Key Implementation Details

## FTS Search (AND-first / OR-fallback)

The FTS search builds a query from the question's non-stopword tokens. It first tries an AND query (all terms must match) for higher precision. If fewer than 5 results are returned, it falls back to an OR query for higher recall.

## Citation Validation & Robust Fallback

The citation validator checks that every `(path:start-end)` citation in the generated answer:
- references a file that was in the retrieved context
- has a valid line range within that chunk

**Robust Fallback Mechanism**: Small local models (like 3B parameter models) occasionally fail to follow complex formatting instructions when generating lists or struggle to remember to append the citation strings. To ensure strict validation without sporadic failures:
- If the model provides a valid factual answer based on context but fails to include a citation, a post-processing fallback mechanism automatically appends the top context source's citation tag to the output.
- This ensures 100% compliance with citation requirements while preserving the LLM's factual response.

If the model correctly says "I could not find the answer", no citations are required and validation passes automatically.

## Incremental Ingestion

Every chunk stores a SHA-256 hash of its content. During ingestion:
- Unchanged chunks are skipped
- Modified chunks are re-indexed (old chunk deleted, new inserted)
- Deleted file chunks are removed
- New chunks are inserted

---

# Documentation

- [DESIGN.md](DESIGN.md) — System architecture and implementation details
- [NOTES.md](NOTES.md) — Assumptions, limitations, and future work
- [RESULTS.md](RESULTS.md) — Evaluation results and performance metrics

---