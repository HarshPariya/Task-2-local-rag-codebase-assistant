# RESULTS

## Project Overview

This project implements a Retrieval-Augmented Generation (RAG) system for codebases using:

- TypeScript
- SQLite
- sqlite-vec
- transformers.js (local embeddings)
- Groq API (LLM inference)
- Hybrid Retrieval (Vector + BM25)
- Reciprocal Rank Fusion (RRF)

The system supports ingestion, embedding generation, hybrid retrieval, answer generation, citation validation, faithfulness evaluation, and benchmark evaluation.

---

# Evaluation Dataset

A manually created golden evaluation dataset was used.

Distribution:

| Difficulty | Questions |
|------------|----------:|
| Easy | 10 |
| Medium | 15 |
| Hard | 5 |
| **Total** | **30** |

---

# Retrieval Metrics

| Metric | Value |
|--------|------:|
| Recall@5 | **100.0%** |
| Recall@10 | **100.0%** |
| MRR | **0.778** |
| Citation Validity | **100.0%** |
| Faithfulness | **100.0%** |

---

# Query Latency

| Metric | Time |
|--------|------:|
| p50 | **72.7 ms** |
| p95 | **87.3 ms** |

---

# Corpus Statistics

| Item | Count |
|------|------:|
| Files Scanned | **774** |
| Chunks Generated | **966** |
| Embedded Chunks | **966** |

---

# Incremental Ingestion

The ingestion pipeline supports incremental indexing.

### First Run

```
Files scanned : 774
Total chunks  : 966
New/Updated   : 966
Deleted       : 0
```

Embedding:

```
Found 966 chunks to embed
Embedding Time : ~470 s
```

---

### Second Run (Unchanged Repository)

```
Files scanned : 774
Total chunks  : 966
New/Updated   : 0
Deleted       : 0
```

Embedding:

```
Found 0 chunks to embed
Embedding Time : 23.7 ms
```

This demonstrates:

- Incremental ingestion
- Content-hash deduplication
- Embedding cache

---

# Retrieval Pipeline

Question

↓

Vector Search (sqlite-vec) + BM25 Full Text Search

↓

Reciprocal Rank Fusion (top-20 candidates from each source)

↓

Top-5 Context

↓

Generation Model: llama-3.3-70b-versatile (Groq)

↓

Answer + Source Citations

↓

Citation Validation

↓

Faithfulness Check

---

# Example Query

Question

```
How does the AuthProvider store the authenticated user after a successful login?
```

Result:

```
The AuthProvider stores the authenticated user in a state variable using
React's useState hook. After a successful login, the login function
updates this state with the fetched user data.

(src/providers/Auth/index.tsx:36-274)
```

Citation Check

```
PASS
```

Faithfulness

```
PASS
```

---

# Metric Attribution

- **AST-aware chunking** improved **Recall@5 and Recall@10** by keeping semantic context intact. Instead of randomly splitting functions down the middle, keeping functions, classes, and interfaces as atomic retrieval units ensures full context is retrieved.
- **BM25 Index (FTS5) with AND-first/OR-fallback** improved **Recall and Faithfulness** for exact-match questions, specifically for unique identifiers, error strings, and config keys.
- **Reciprocal Rank Fusion (RRF)** improved **MRR** by combining dense (vector) and sparse (BM25) retrieval, surfacing chunks that matched both semantically and lexically.
- **Content Hash Deduplication** improved **Recall@5** by preventing near-duplicate flooding, keeping relevant unique chunks in the top-5 context window.
- **Expanded pool retrieval (top-20 pre-RRF)** improved **Recall@5** by giving RRF more candidates from both retrievers before cutting to the final top-5.

---

# Summary

The implemented RAG system successfully satisfies the project objectives.

Implemented features include:

- AST-based TypeScript chunking
- Markdown chunking
- SQLite vector database
- sqlite-vec embeddings
- Hybrid retrieval (Vector + BM25)
- Reciprocal Rank Fusion
- LLM answer generation (llama-3.3-70b-versatile via Groq)
- Citation validation
- Faithfulness evaluation
- Incremental ingestion
- Embedding cache
- Deduplication
- Evaluation harness (30 golden questions)