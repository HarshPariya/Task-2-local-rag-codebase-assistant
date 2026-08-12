# Local RAG with Evaluation Harness - Design Document

## 1. Goal

Build a local Retrieval-Augmented Generation (RAG) system that can:

- Index a real-world Next.js codebase
- Answer questions with file and line citations
- Support hybrid retrieval (Vector + BM25)
- Evaluate retrieval quality using a golden dataset

---

## 2. Public Commands

The application will expose three CLI commands.

### Ingest

```
pnpm rag ingest ./corpus/website
```

Reads the repository, chunks files, creates embeddings, and stores data.

---

### Ask

```
pnpm rag ask "How does authentication work?"
```

Retrieves relevant chunks and generates an answer with citations.

---

### Eval

```
pnpm rag eval
```

Runs the golden evaluation dataset and reports metrics.

---

## 3. Architecture

```
Repository

↓

File Reader

↓

AST Chunker

↓

Embedding Generator

↓

SQLite Database

↓

Hybrid Retrieval

↓

LLM (Qwen)

↓

Answer + Citations

↓

Evaluation
```

---

## 4. Components

### Chunker

Uses ts-morph to split TypeScript files into semantic chunks.

Markdown files are split by headings.

---

### Embedding

Uses transformers.js with:

- Xenova/all-MiniLM-L6-v2 (local)

---

### Database

SQLite

Contains

- chunks
- embeddings
- metadata
- FTS5 index

---

### Retrieval

Hybrid Retrieval

- Vector Search
- BM25
- Reciprocal Rank Fusion

---

### Generator

Uses

llama-3.3-70b-versatile (via Groq API)

Generates answers using retrieved chunks.

---

### Evaluation

Runs 30 predefined questions.

Measures

- Recall@5
- Recall@10
- MRR
- Faithfulness
- Citation Validity
- Latency

---

## 5. Failure Modes

### Large Functions

Split into overlapping chunks.

---

### Duplicate Chunks

Remove duplicates using content hash.

---

### Missing Information

Return "Information not found in the repository."

---

## 6. Not Building

- Web UI
- Online APIs
- Cloud databases
- LangChain
- LlamaIndex

---

## 7. Open Questions

- Best chunk size for large functions
- Retrieval ordering
- Optimal RRF parameter