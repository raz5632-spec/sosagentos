# ADR: Local hash embeddings for v1 semantic retrieval

**Date:** 2026-07-02 · **Status:** accepted · **Task:** KNO-002

## Context
Anthropic does not offer an embeddings API, and no OpenAI/Gemini/Voyage key exists yet.
KNO-002 needs vectors in `knowledge_chunks.embedding` (pgvector, 1536-dim, HNSW).

## Decision
Introduce an `EmbeddingProvider` interface in `packages/ai`. v1 ships
`HashingEmbeddingProvider`: tokenized feature hashing into 1536 dims, L2-normalized.
This yields deterministic bag-of-words cosine similarity — good enough for keyword-ish
retrieval and for exercising the full pgvector path (storage, HNSW index, `<=>` queries).

## Consequences
- Retrieval quality is lexical, not semantic; synonyms won't match.
- Swapping in a real provider (Voyage/OpenAI/Gemini) = one adapter class + re-embedding
  job (`scripts/` TBD); the schema, index, and search endpoint stay unchanged.
- Provider identity is recorded per chunk in `metadata_json.embedding_provider`, so mixed
  states are detectable and re-embedding is targeted.

## Alternatives rejected
- Blocking KNO-002 on an external key: stalls the critical path for a config detail.
- Gemini embeddings now: adds a provider account before the Model Router needs one.
