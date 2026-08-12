# NOTES

# Project Notes

## Assumptions

The implementation makes the following assumptions:

- The indexed repository primarily contains TypeScript, TSX, and Markdown files.
- Source files are syntactically valid and can be parsed by ts-morph.
- A Groq API key is configured in `.env` file
- Local embeddings via transformers.js (Xenova/all-MiniLM-L6-v2)
- SQLite and sqlite-vec are available in the execution environment.
- The repository is relatively static during ingestion.

---

# Current Limitations

## No Cross-Encoder Reranking

Retrieved documents are ranked using Reciprocal Rank Fusion (RRF) only.

A cross-encoder reranker could improve retrieval quality by re-ranking the final candidate documents.

---

## Larger Retrieval Pool

The system retrieves:

- Top **20** vector results
- Top **20** keyword results
- Final Top **5** chunks after RRF

A pool of 20 candidates from each source is used before RRF to improve recall. This is not dynamically adjusted per query.

---

## No Metadata Filtering

The retrieval pipeline does not currently filter by:

- file type
- directory
- programming language
- symbol type

Adding metadata filtering could improve retrieval precision.

---

## Local Model Performance

Embeddings are computed locally with transformers.js (no GPU required).

Generation quality depends on the Groq API model performance.

---

## No Conversation Memory

Each query is processed independently.

Previous questions and answers are not retained.

---

## Limited Language Support

The chunking implementation is optimized for:

- TypeScript
- TSX
- Markdown

Support for additional languages (Python, Java, Go, etc.) would require dedicated parsers.

---

# Evaluation Notes

Evaluation uses a manually created golden dataset containing:

- 10 Easy questions
- 15 Medium questions
- 5 Hard questions

Metrics reported:

- Recall@5
- Recall@10
- Mean Reciprocal Rank (MRR)
- Query latency

Hard questions also include negative examples where the expected answer is that the feature is not implemented.

---

# Design Insights

## Why RRF over Weighted Averaging
Reciprocal Rank Fusion (RRF) is explicitly implemented over a weighted average of the two scores for a fundamental mathematical reason. 

Cosine similarity (used in vector search) lives in roughly the [0,1] range and often has a highly compressed useful range (e.g. all relevant documents score between 0.75 and 0.85). Conversely, BM25 (used in FTS5) is unbounded and corpus-dependent; a score could be 5.0 or 50.0 depending on the term frequency and corpus size. 

Attempting to average them requires a normalisation constant that inevitably becomes wrong the moment the corpus changes or grows. RRF discards score magnitudes entirely and uses only rank position (e.g., `1 / (k + rank)`), making it scale-free and inherently robust across different corpora.

## Context Compression for Small Models
The generation step includes a `compressWhitespace` utility that strips out redundant blank lines (converting 3+ consecutive newlines into 2), significantly reducing the character count of large code chunks (like `AuthProvider`) without losing any syntax or semantic meaning. Additionally, the prompt uses clear, explicit instructions to help the model reliably extract answers from dense code context.

## Strict Citation Enforcing & Out-of-Context Handling
To prevent the model from malforming citations (e.g. omitting parentheses which breaks the regex validator), the generation prompt has strict instructions requiring the exact `(path:start-end)` format after factual claims. Additionally, for out-of-context queries (where the answer doesn't exist in the project, such as "Does this project support Google OAuth?"), the model is now instructed to respond with a natural, user-friendly phrase (`The provided context does not contain information to answer this question.`) rather than an error-like fallback string. The evaluation metrics gracefully catch this phrase to correctly pass tests for unsupported functionality.

## AND-first / OR-fallback FTS
The BM25 keyword search uses an AND-first strategy: all non-stopword tokens from the question must appear in the chunk. This improves precision significantly for multi-keyword queries (e.g., "GraphQL authentication mutations"). If the AND query returns fewer than 5 results, the search falls back to an OR query for maximum recall. A curated stopword list also filters domain-generic terms like `required`, `fields`, and `implemented` that appear ubiquitously in schema definitions and would pollute results.

## Fuzzy "No Answer" Detection
The citation validator and faithfulness judge both use `includes("context does not contain information to answer this question")` (case-insensitive) instead of an exact string match. This handles variations in model output — the model sometimes omits the trailing period or adds extra whitespace — without breaking the validation logic.

## The Judge-Leakage Experiment
When evaluating faithfulness, the judge (LLM) sees only the generated answer and the retrieved chunks — **never the expected answer**. 

If the judge is shown the expected target answer, it suffers from "judge-leakage." It grades much more generously because it anchors to the correct answer, effectively assuming the generated text meant the same thing even if it was vague or unsupported by the retrieved chunks. By restricting the judge's context exclusively to the retrieved chunks and the generated output, we force it to strictly verify if the claims are actually supported by the provided text, yielding a much harsher and more accurate faithfulness metric.

---

# Future Improvements

Potential future enhancements include:

- Cross-encoder reranking
- Multi-query retrieval
- Parent-child chunk retrieval
- Metadata-aware search
- Streaming answer generation
- Better chunk ranking
- Support for additional programming languages
- Incremental embedding updates across multiple repositories
- Hybrid sparse+dense weighting optimization

---

# Summary

The current implementation provides:

- Local Retrieval-Augmented Generation (RAG)
- Hybrid Retrieval (Vector + FTS5)
- Reciprocal Rank Fusion
- Citation Validation
- Faithfulness Checking
- Evaluation Harness
- Incremental Ingestion
- Embedding Cache
- Performance Metrics

The system is fully local and does not depend on external vector databases or cloud-hosted LLM services.