ALTER TABLE "narrative_events" ADD COLUMN "situation_anchor" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "visual_rhythm_preset" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chapter_start_round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chapter_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chapter_max_turns" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chapter_system_image_budget" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chapter_system_images_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_manual_scene_image_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "spark_pool_balance" integer DEFAULT 0 NOT NULL;