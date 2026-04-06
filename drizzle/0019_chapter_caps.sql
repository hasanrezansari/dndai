-- Phase 7: chapter turn cap, system image budget, manual image cooldown anchor, visual preset
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "visual_rhythm_preset" text NOT NULL DEFAULT 'standard';
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "chapter_start_round" integer NOT NULL DEFAULT 1;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "chapter_index" integer NOT NULL DEFAULT 1;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "chapter_max_turns" integer NOT NULL DEFAULT 30;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "chapter_system_image_budget" integer NOT NULL DEFAULT 3;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "chapter_system_images_used" integer NOT NULL DEFAULT 0;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_manual_scene_image_at" timestamp with time zone;
