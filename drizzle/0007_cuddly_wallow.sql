CREATE TABLE "auth_bridge_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_bridge_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "hp" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "max_hp" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "ac" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "weak_points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "reveal_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "introduced_turn_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "world_summary" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "style_policy" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "visual_bible_seed" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "auth_bridge_tokens" ADD CONSTRAINT "auth_bridge_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_bridge_tokens_user_id_idx" ON "auth_bridge_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "npc_states" ADD CONSTRAINT "npc_states_introduced_turn_id_turns_id_fk" FOREIGN KEY ("introduced_turn_id") REFERENCES "public"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_summaries_session_id_idx" ON "memory_summaries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "npc_states_session_id_idx" ON "npc_states" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "players_session_id_idx" ON "players" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scene_snapshots_session_id_idx" ON "scene_snapshots" USING btree ("session_id");