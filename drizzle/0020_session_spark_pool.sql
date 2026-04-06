-- Phase 8: shared session Spark pool (guests contribute; spend draws pool before host wallet)
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "spark_pool_balance" integer NOT NULL DEFAULT 0;
