ALTER TABLE "sessions" ADD COLUMN "game_kind" text DEFAULT 'campaign' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "party_config" jsonb;