-- DropIndex
DROP INDEX "knowledge_chunks_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT;
