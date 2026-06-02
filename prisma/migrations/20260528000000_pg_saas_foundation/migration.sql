-- Production SaaS foundation notes:
-- 1. Prisma owns the relational schema in schema.prisma.
-- 2. pgvector is an unsupported PostgreSQL extension in Prisma and must be enabled through SQL.
-- 3. Run this migration only after DATABASE_URL points at PostgreSQL.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF to_regclass('"AgentMemory"') IS NOT NULL THEN
    ALTER TABLE "AgentMemory"
      ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

    CREATE INDEX IF NOT EXISTS "AgentMemory_embedding_hnsw_idx"
      ON "AgentMemory"
      USING hnsw ("embedding" vector_cosine_ops)
      WHERE "embedding" IS NOT NULL;

    CREATE INDEX IF NOT EXISTS "AgentMemory_org_category_score_idx"
      ON "AgentMemory" ("organizationId", "category", "score");
  END IF;
END $$;
