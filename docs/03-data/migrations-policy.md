# Migrations Policy

- Forward-only migrations in production; reversible down plan documented per migration in dev.
- Never edit an applied migration's SQL unless the change is semantically identical
  (e.g. adding IF NOT EXISTS); if you do, sync the checksum in `_prisma_migrations`.
- `prisma migrate reset` destroys all data — dev only, and only with explicit human consent.

## pgvector / HNSW drift rule (learned 2026-07-02)

Prisma cannot model the HNSW index on `knowledge_chunks.embedding` (Unsupported vector
column), so it lives in raw SQL (`20260702235900_hnsw_embedding_index`). Consequence:
**every `prisma migrate dev` diff will propose `DROP INDEX "knowledge_chunks_embedding_hnsw_idx"`.**

Procedure for every new migration:
1. Generate with `prisma migrate dev --create-only`.
2. Open the generated `migration.sql` and DELETE any `DROP INDEX ... hnsw ...` lines.
3. Then apply with `prisma migrate dev`.

All raw-SQL index creations must use `CREATE INDEX IF NOT EXISTS` so replays stay idempotent.
