ALTER TABLE "sessions" ADD COLUMN "world_summary" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "style_policy" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "visual_bible_seed" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE INDEX "players_session_id_idx" ON "players" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "memory_summaries_session_id_idx" ON "memory_summaries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "npc_states_session_id_idx" ON "npc_states" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scene_snapshots_session_id_idx" ON "scene_snapshots" USING btree ("session_id");
