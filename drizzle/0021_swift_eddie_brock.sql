-- Session chapter / visual / spark_pool columns live in 0019 + 0020 (IF NOT EXISTS).
-- This migration only adds narrative_events.situation_anchor.
ALTER TABLE "narrative_events" ADD COLUMN IF NOT EXISTS "situation_anchor" text;
