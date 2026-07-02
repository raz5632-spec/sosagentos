-- HNSW index for semantic retrieval over knowledge chunks
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
