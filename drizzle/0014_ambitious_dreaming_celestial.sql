CREATE TABLE "world_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"world_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "fork_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_likes" ADD CONSTRAINT "world_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_likes" ADD CONSTRAINT "world_likes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_likes_world_id_idx" ON "world_likes" USING btree ("world_id");--> statement-breakpoint
CREATE UNIQUE INDEX "world_likes_user_world_uidx" ON "world_likes" USING btree ("user_id","world_id");