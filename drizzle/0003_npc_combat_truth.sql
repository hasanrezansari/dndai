ALTER TABLE "npc_states" ADD COLUMN "hp" integer NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "max_hp" integer NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "ac" integer NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "weak_points" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "reveal_level" text NOT NULL DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "npc_states" ADD COLUMN "introduced_turn_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_states" ADD CONSTRAINT "npc_states_introduced_turn_id_turns_id_fk" FOREIGN KEY ("introduced_turn_id") REFERENCES "public"."turns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
UPDATE "npc_states"
SET
  "ac" = COALESCE(
    CASE WHEN ("visual_profile"->>'ac') ~ '^-?\\d+$' THEN ("visual_profile"->>'ac')::integer END,
    CASE WHEN ("visual_profile"->>'AC') ~ '^-?\\d+$' THEN ("visual_profile"->>'AC')::integer END,
    CASE WHEN ("visual_profile"->>'armor_class') ~ '^-?\\d+$' THEN ("visual_profile"->>'armor_class')::integer END,
    "ac"
  ),
  "hp" = COALESCE(
    CASE WHEN ("visual_profile"->>'hp') ~ '^-?\\d+$' THEN ("visual_profile"->>'hp')::integer END,
    CASE WHEN ("visual_profile"->>'current_hp') ~ '^-?\\d+$' THEN ("visual_profile"->>'current_hp')::integer END,
    CASE WHEN ("visual_profile"->>'hit_points') ~ '^-?\\d+$' THEN ("visual_profile"->>'hit_points')::integer END,
    "hp"
  ),
  "max_hp" = COALESCE(
    CASE WHEN ("visual_profile"->>'max_hp') ~ '^-?\\d+$' THEN ("visual_profile"->>'max_hp')::integer END,
    CASE WHEN ("visual_profile"->>'max_hit_points') ~ '^-?\\d+$' THEN ("visual_profile"->>'max_hit_points')::integer END,
    "max_hp"
  );
