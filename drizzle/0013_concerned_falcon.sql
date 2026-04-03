CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"module_key" text,
	"campaign_mode_default" text,
	"default_max_players" integer,
	"snapshot_definition" jsonb,
	"published_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "world_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "world_revision" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "world_snapshot" jsonb;--> statement-breakpoint
CREATE INDEX "worlds_status_idx" ON "worlds" USING btree ("status");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE restrict ON UPDATE no action;