-- HNSW index for semantic retrieval over knowledge chunks.
-- IF NOT EXISTS keeps this idempotent across environments.
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
