ALTER TABLE "worlds" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "submitted_for_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "ugc_review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worlds_created_by_user_id_idx" ON "worlds" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "worlds_ugc_review_status_idx" ON "worlds" USING btree ("ugc_review_status");