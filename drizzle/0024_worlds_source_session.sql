ALTER TABLE "worlds" ADD COLUMN "source_session_id" uuid;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worlds_source_session_id_uidx" ON "worlds" ("source_session_id");
